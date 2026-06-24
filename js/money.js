/* money.js — 통화 · 금액 포맷 · 예상 교통요금 · 지역→통화 추천 (네임스페이스 TP.money)
 *
 *   - 실제 요금 API가 없어 교통요금은 거리(haversine km) 기반 '예상'이다(사용자가 직접 수정 가능).
 *   - 금액(경비/교통비)은 여행별 통화(trip.currency)로 표시한다.
 */
(function (TP) {
  "use strict";

  // 통화별 설정 + 거친 요금 모델(현지 평균 추정치)
  var CUR = {
    JPY: { code: "JPY", sym: "¥", name: "엔",   dec: 0, step: 10,   transit: { base: 180,  perKm: 22, min: 180,  max: 1200 }, taxi: { base: 500,  perKm: 380,  min: 500,  max: 30000 } },
    KRW: { code: "KRW", sym: "₩", name: "원",   dec: 0, step: 100,  transit: { base: 1400, perKm: 60, min: 1400, max: 3500 }, taxi: { base: 4800, perKm: 1000, min: 4800, max: 120000 } },
    USD: { code: "USD", sym: "$", name: "달러", dec: 2, step: 0.25, transit: { base: 2.5,  perKm: 0.25, min: 2.5, max: 6 },  taxi: { base: 3.5,  perKm: 2.2,  min: 3.5,  max: 250 } },
    EUR: { code: "EUR", sym: "€", name: "유로", dec: 2, step: 0.1,  transit: { base: 2.5,  perKm: 0.25, min: 2.5, max: 6 },  taxi: { base: 4,    perKm: 2.2,  min: 4,     max: 250 } }
  };
  var ORDER = ["JPY", "KRW", "USD", "EUR"];

  function cfg(code) { return CUR[code] || CUR.JPY; }
  function symbol(code) { return cfg(code).sym; }

  function format(amount, code) {
    if (amount == null || isNaN(amount)) return "";
    var c = cfg(code);
    var n = c.dec ? Number(amount).toFixed(c.dec) : String(Math.round(amount));
    n = n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");   // 천단위 콤마
    return c.sym + n;
  }
  function roundStep(v, step) { return Math.round(v / step) * step; }

  // 거리(km) + 모드("transit"|"taxi"|"walk"|"none") → 예상 요금(통화 단위)
  function estimateFare(km, mode, code) {
    var c = cfg(code);
    if (mode === "walk" || mode === "none") return 0;
    if (!isFinite(km) || km <= 0) {                          // 거리 모름 → 모드 기본요금 1회
      return roundStep((mode === "taxi" ? c.taxi.base : c.transit.base), c.step);
    }
    if (mode === "taxi") {
      var tf = Math.max(c.taxi.min, c.taxi.base + c.taxi.perKm * km);
      if (c.taxi.max) tf = Math.min(c.taxi.max, tf);                 // 장거리 비현실적 요금 상한
      return roundStep(tf, c.step);
    }
    var f = c.transit.base + c.transit.perKm * km;           // 대중교통(버스·지하철)
    f = Math.max(c.transit.min, Math.min(c.transit.max, f));
    return roundStep(f, c.step);
  }

  /* ---------- 환율 환산 ---------- */
  var rateCache = {};   // "JPY>KRW" → 1 from당 to 환율
  var fetching = {};
  var USD_VAL = { USD: 1, JPY: 0.0067, KRW: 0.00074, EUR: 1.08 };   // 폴백 근사(1단위의 USD 가치)
  function rateKey(a, b) { return a + ">" + b; }
  function fallbackRate(from, to) { return (USD_VAL[from] && USD_VAL[to]) ? USD_VAL[from] / USD_VAL[to] : null; }
  function rate(from, to) {                 // 즉시값: 실값 캐시 우선, 없으면 폴백 근사
    if (from === to) return 1;
    var v = rateCache[rateKey(from, to)];
    return (v != null) ? v : fallbackRate(from, to);
  }
  function getCachedRate(from, to) {        // 실/폴백 캐시만(미조회면 null) — 갱신 필요 판단용
    if (from === to) return 1;
    var v = rateCache[rateKey(from, to)];
    return (v != null) ? v : null;
  }
  function ensureRate(from, to) {           // 실 환율 비동기 로드 → 캐시(실패 시 폴백 캐시)
    if (from === to) return Promise.resolve(1);
    var k = rateKey(from, to);
    if (rateCache[k] != null) return Promise.resolve(rateCache[k]);
    if (fetching[k]) return fetching[k];
    var url = "https://open.er-api.com/v6/latest/" + encodeURIComponent(from);
    fetching[k] = TP.util.fetchJSON(url, { timeout: 8000 }).then(function (j) {
      var r = j && j.rates && j.rates[to];
      rateCache[k] = (typeof r === "number" && isFinite(r) && r > 0) ? r : fallbackRate(from, to);
      delete fetching[k]; return rateCache[k];
    }).catch(function () { rateCache[k] = fallbackRate(from, to); delete fetching[k]; return rateCache[k]; });
    return fetching[k];
  }
  function convert(amount, from, to) {
    if (amount == null) return null;
    var r = rate(from, to);
    return (r != null) ? amount * r : null;
  }
  function formatConv(amount, from, to) {   // "≈ ₩28,500" (from==to이거나 불가면 "")
    if (!to || from === to || amount == null) return "";
    var c = convert(amount, from, to);
    return (c != null) ? "≈ " + format(c, to) : "";
  }

  // 지역 텍스트 → 추천 통화 코드(모르면 null)
  function currencyForRegion(region) {
    var r = (region || "").toLowerCase();
    if (/일본|도쿄|토쿄|오사카|후쿠오카|교토|쿄토|삿포로|홋카이도|오키나와|나고야|고베|요코하마|나라|벳푸|유후인|구마모토|가고시마|japan|tokyo|osaka|fukuoka|kyoto|sapporo|hokkaido|okinawa|nagoya|nara/.test(r)) return "JPY";
    if (/한국|서울|부산|제주|대구|인천|강릉|경주|광주|대전|울산|수원|전주|여수|korea|seoul|busan|jeju|incheon/.test(r)) return "KRW";
    if (/미국|뉴욕|엘에이|로스앤젤레스|하와이|괌|사이판|샌프란|라스베이거스|라스베가스|시애틀|보스턴|시카고|usa|america|new ?york|hawaii|guam|saipan|seattle|vegas|chicago|boston/.test(r)) return "USD";
    if (/유럽|파리|로마|스페인|독일|이탈리아|프랑스|네덜란드|포르투갈|체코|오스트리아|바르셀로나|뮌헨|빈|프라하|마드리드|리스본|베네치아|europe|paris|rome|spain|germany|italy|france|amsterdam|portugal|barcelona|munich|vienna|prague|madrid|lisbon/.test(r)) return "EUR";
    return null;
  }

  TP.money = {
    CUR: CUR, ORDER: ORDER, cfg: cfg, symbol: symbol,
    format: format, estimateFare: estimateFare, currencyForRegion: currencyForRegion,
    rate: rate, getCachedRate: getCachedRate, ensureRate: ensureRate, convert: convert, formatConv: formatConv
  };
})(window.TP = window.TP || {});
