/* money.js — 통화 · 금액 포맷 · 예상 교통요금 · 지역→통화 추천 (네임스페이스 TP.money)
 *
 *   - 실제 요금 API가 없어 교통요금은 거리(haversine km) 기반 '예상'이다(사용자가 직접 수정 가능).
 *   - 금액(경비/교통비)은 여행별 통화(trip.currency)로 표시한다.
 */
(function (TP) {
  "use strict";

  /* 통화별 설정 + 거친 요금 모델(현지 평균 추정치 — 대중교통 1회 / 택시 기본+km당, 사용자가 직접 수정 가능)
   * 🔴 여기 없는 통화는 store.js 가 저장할 때 JPY 로 바꿔 버린다(방콕 여행 예산이 ¥ 로 보이던 원인).
   *    통화를 추가하면 USD_VAL(오프라인 폴백 환율)과 currencyForRegion 도 함께 채울 것. */
  function C(code, sym, name, dec, step, tr, tx) {
    return { code: code, sym: sym, name: name, dec: dec, step: step,
      transit: { base: tr[0], perKm: tr[1], min: tr[0], max: tr[2] }, taxi: { base: tx[0], perKm: tx[1], min: tx[0], max: tx[2] } };
  }
  var CUR = {
    KRW: C("KRW", "₩",    "원",           0, 100,  [1400, 60, 3500],   [4800, 800, 120000]),
    JPY: C("JPY", "¥",    "엔",           0, 10,   [180, 22, 1200],    [500, 250, 30000]),
    USD: C("USD", "$",    "달러",         2, 0.25, [2.5, 0.25, 6],     [3.5, 1.8, 250]),
    EUR: C("EUR", "€",    "유로",         2, 0.1,  [2.5, 0.25, 6],     [4, 1.9, 250]),
    THB: C("THB", "฿",    "바트",         0, 1,    [17, 3, 70],        [35, 7, 2500]),
    VND: C("VND", "₫",    "동",           0, 1000, [7000, 1000, 30000], [12000, 17000, 2000000]),
    TWD: C("TWD", "NT$",  "대만달러",     0, 5,    [20, 2, 65],        [85, 25, 3000]),
    HKD: C("HKD", "HK$",  "홍콩달러",     0, 1,    [5, 1, 60],         [29, 10, 1500]),
    MOP: C("MOP", "MOP$", "파타카",       0, 1,    [6, 0, 6],          [21, 8, 500]),
    CNY: C("CNY", "CN¥",  "위안",         0, 1,    [2, 0.5, 10],       [13, 2.5, 800]),
    PHP: C("PHP", "₱",    "페소",         0, 5,    [15, 1.5, 60],      [45, 15, 3000]),
    SGD: C("SGD", "S$",   "싱가포르달러", 2, 0.1,  [1.1, 0.08, 2.5],   [4.4, 0.8, 120]),
    MYR: C("MYR", "RM",   "링깃",         2, 0.1,  [1.2, 0.2, 6],      [4, 1.2, 200]),
    IDR: C("IDR", "Rp",   "루피아",       0, 500,  [3500, 500, 20000], [7500, 5000, 1000000]),
    MNT: C("MNT", "₮",    "투그릭",       0, 100,  [500, 0, 1000],     [2000, 2000, 200000]),
    GBP: C("GBP", "£",    "파운드",       2, 0.1,  [2.8, 0.2, 8],      [3.8, 2.2, 300]),
    CHF: C("CHF", "CHF ", "스위스프랑",   2, 0.1,  [3, 0.4, 12],       [7, 4, 400]),
    CZK: C("CZK", "Kč ",  "코루나",       0, 1,    [30, 1, 50],        [60, 36, 2500]),
    HUF: C("HUF", "Ft ",  "포린트",       0, 10,   [450, 10, 1000],    [1100, 440, 40000]),
    TRY: C("TRY", "₺",    "리라",         0, 1,    [27, 1, 60],        [45, 40, 3000]),
    AUD: C("AUD", "A$",   "호주달러",     2, 0.1,  [3.5, 0.2, 8],      [4.5, 2.3, 300]),
    NZD: C("NZD", "NZ$",  "뉴질랜드달러", 2, 0.1,  [2.5, 0.3, 10],     [4, 3.2, 300]),
    CAD: C("CAD", "C$",   "캐나다달러",   2, 0.1,  [3.35, 0.1, 7],     [4.4, 2.1, 300]),
    MXN: C("MXN", "MX$",  "멕시코페소",   0, 1,    [10, 1, 40],        [50, 15, 2000]),
    AED: C("AED", "AED ", "디르함",       2, 0.5,  [3, 0.5, 8.5],      [12, 2.2, 500]),
    INR: C("INR", "₹",    "루피",         0, 5,    [10, 2, 60],        [30, 20, 5000])
  };
  // 고르기 목록 순서(한국 여행자가 많이 가는 순)
  var ORDER = ["KRW", "JPY", "USD", "EUR", "THB", "VND", "TWD", "HKD", "MOP", "CNY", "PHP", "SGD", "MYR", "IDR", "MNT",
    "GBP", "CHF", "CZK", "HUF", "TRY", "AUD", "NZD", "CAD", "MXN", "AED", "INR"];

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
  var rateCache = {};   // "JPY>KRW" → 1 from당 to 환율 (실측만 저장)
  var fetching = {};
  var failedAt = {};    // 조회 실패 시각(ms) — 폭주 없이 재시도하기 위한 기록
  var RETRY_MS = 30000;
  function nowMs() { return new Date().getTime(); }
  // 폴백 근사(1단위의 USD 가치) — 오프라인·API 실패 때만 쓴다. open.er-api.com 2026-09-27 값.
  var USD_VAL = {
    USD: 1, KRW: 0.000737, JPY: 0.00635, EUR: 1.14, THB: 0.03, VND: 0.0000385, TWD: 0.0315, HKD: 0.127, MOP: 0.124,
    CNY: 0.149, PHP: 0.016, SGD: 0.783, MYR: 0.245, IDR: 0.0000559, MNT: 0.000279, GBP: 1.32, CHF: 1.21, CZK: 0.0468,
    HUF: 0.00312, TRY: 0.0204, AUD: 0.702, NZD: 0.567, CAD: 0.707, MXN: 0.0565, AED: 0.272, INR: 0.0104
  };
  function rateKey(a, b) { return a + ">" + b; }
  function fallbackRate(from, to) { return (USD_VAL[from] && USD_VAL[to]) ? USD_VAL[from] / USD_VAL[to] : null; }
  function rate(from, to) {                 // 즉시값: 실값 캐시 우선, 없으면 폴백 근사
    if (from === to) return 1;
    var v = rateCache[rateKey(from, to)];
    return (v != null) ? v : fallbackRate(from, to);
  }
  function getCachedRate(from, to) {        // 실측 캐시만(미조회면 null) — 갱신 필요 판단용
    if (from === to) return 1;
    var v = rateCache[rateKey(from, to)];
    return (v != null) ? v : null;
  }
  /* 환율 상태: "ok"=실측 확보 / "provisional"=조회 실패 직후(폴백 근사 사용 중, 재시도 대기) / "none"=미조회
   * 실패한 조회를 캐시에 넣어버리면 네트워크가 복구돼도 세션 내내 근사치에 갇힌다. 그렇다고 실패마다
   * 즉시 재시도하면 렌더 루프가 된다. 그래서 실패는 시각만 기록하고 RETRY_MS 뒤에 다시 열어 준다. */
  function rateStatus(from, to) {
    if (from === to) return "ok";
    var k = rateKey(from, to);
    if (rateCache[k] != null) return "ok";
    if (failedAt[k] != null && (nowMs() - failedAt[k]) < RETRY_MS) return "provisional";
    return "none";
  }
  function resetRateFailures() { failedAt = {}; }   // 온라인 복귀 시 즉시 재조회 허용
  function ensureRate(from, to) {           // 실 환율 비동기 로드 → 캐시(실패는 캐시하지 않음)
    if (from === to) return Promise.resolve(1);
    var k = rateKey(from, to);
    if (rateCache[k] != null) return Promise.resolve(rateCache[k]);
    if (fetching[k]) return fetching[k];
    if (failedAt[k] != null && (nowMs() - failedAt[k]) < RETRY_MS) return Promise.resolve(fallbackRate(from, to));
    var url = "https://open.er-api.com/v6/latest/" + encodeURIComponent(from);
    fetching[k] = TP.util.fetchJSON(url, { timeout: 8000 }).then(function (j) {
      var r = j && j.rates && j.rates[to];
      if (typeof r === "number" && isFinite(r) && r > 0) { rateCache[k] = r; delete failedAt[k]; }
      else failedAt[k] = nowMs();                                  // 응답은 왔지만 해당 통화가 없음 → 실패로 취급
      delete fetching[k]; return rate(from, to);
    }).catch(function () { failedAt[k] = nowMs(); delete fetching[k]; return fallbackRate(from, to); });
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

  // "฿1 ≈ ₩41" — 환율 한 줄. 1단위로 보면 0 이 되는 방향(₫→₩ · ₩→¥ · ₩→$)은
  // 결과가 10 이상 되도록 단위를 10배씩 키운다(₫1,000 ≈ ₩52 · ₩100 ≈ ¥12).
  function rateLabel(from, to) {
    if (!to || from === to) return "";
    var one = convert(1, from, to);
    if (one == null || !(one > 0)) return "";
    var unit = 1;
    while (one * unit < 10 && unit < 1e6) unit *= 10;
    return format(unit, from) + " ≈ " + format(one * unit, to);
  }

  // 지역 텍스트 → 추천 통화 코드(모르면 null)
  function currencyForRegion(region) {
    var r = (region || "").toLowerCase();
    // 구체적인 나라를 먼저 본다(아래 기존 규칙의 "나라"·"빈" 같은 짧은 말이 먼저 걸리지 않게)
    var MORE = [
      ["THB", /태국|방콕|치앙마이|푸켓|파타야|끄라비|코사무이|후아힌|thailand|bangkok|chiang ?mai|phuket|pattaya|krabi|samui/],
      ["VND", /베트남|하노이|호치민|다낭|나트랑|냐짱|푸꾸옥|호이안|달랏|사파|하롱|vietnam|hanoi|ho ?chi ?minh|saigon|da ?nang|nha ?trang|phu ?quoc|hoi ?an|dalat/],
      ["TWD", /대만|타이베이|타이페이|타이중|가오슝|타이난|화롄|taiwan|taipei|taichung|kaohsiung|tainan/],
      ["MOP", /마카오|macau|macao/],
      ["HKD", /홍콩|hong ?kong/],
      ["CNY", /중국|베이징|북경|상하이|상해|칭다오|청도|장가계|시안|청두|하얼빈|광저우|선전|심천|china|beijing|shanghai|qingdao|zhangjiajie|chengdu|guangzhou|shenzhen/],
      ["PHP", /필리핀|세부|보라카이|마닐라|보홀|팔라완|클락|philippines|cebu|boracay|manila|bohol|palawan/],
      ["SGD", /싱가포르|싱가폴|singapore/],
      ["MYR", /말레이시아|쿠알라룸푸르|코타키나발루|페낭|랑카위|malaysia|kuala ?lumpur|kota ?kinabalu|penang|langkawi/],
      ["IDR", /인도네시아|발리|자카르타|롬복|indonesia|bali|jakarta|lombok/],
      ["MNT", /몽골|울란바토르|mongolia|ulaanbaatar/],
      ["GBP", /영국|런던|에든버러|맨체스터|리버풀|uk\b|england|london|edinburgh|manchester|liverpool/],
      ["CHF", /스위스|취리히|인터라켄|제네바|루체른|체르마트|switzerland|zurich|interlaken|geneva|lucerne|zermatt/],
      ["CZK", /체코|프라하|체스키|czech|prague/],
      ["HUF", /헝가리|부다페스트|hungary|budapest/],
      ["TRY", /튀르키예|터키|이스탄불|카파도키아|안탈리아|turkey|türkiye|istanbul|cappadocia|antalya/],
      ["AUD", /호주|시드니|멜버른|브리즈번|골드코스트|케언즈|퍼스|australia|sydney|melbourne|brisbane|gold ?coast|cairns|perth/],
      ["NZD", /뉴질랜드|오클랜드|퀸스타운|크라이스트처치|new ?zealand|auckland|queenstown|christchurch/],
      ["CAD", /캐나다|밴쿠버|토론토|몬트리올|캘거리|밴프|canada|vancouver|toronto|montreal|calgary|banff/],
      ["MXN", /멕시코|칸쿤|mexico|cancun/],
      ["AED", /두바이|아부다비|아랍에미리트|uae|dubai|abu ?dhabi/],
      ["INR", /인도|뉴델리|델리|뭄바이|india|delhi|mumbai/]   // "인도네시아"는 위 IDR 이 먼저 잡는다
    ];
    for (var i = 0; i < MORE.length; i++) if (MORE[i][1].test(r)) return MORE[i][0];
    if (/일본|도쿄|토쿄|오사카|후쿠오카|교토|쿄토|삿포로|홋카이도|오키나와|나고야|고베|요코하마|나라|벳푸|유후인|구마모토|가고시마|japan|tokyo|osaka|fukuoka|kyoto|sapporo|hokkaido|okinawa|nagoya|nara/.test(r)) return "JPY";
    if (/한국|서울|부산|제주|대구|인천|강릉|경주|광주|대전|울산|수원|전주|여수|korea|seoul|busan|jeju|incheon/.test(r)) return "KRW";
    if (/미국|뉴욕|엘에이|로스앤젤레스|하와이|괌|사이판|샌프란|라스베이거스|라스베가스|시애틀|보스턴|시카고|usa|america|new ?york|hawaii|guam|saipan|seattle|vegas|chicago|boston/.test(r)) return "USD";
    if (/유럽|파리|로마|스페인|독일|이탈리아|프랑스|네덜란드|포르투갈|체코|오스트리아|바르셀로나|뮌헨|빈|프라하|마드리드|리스본|베네치아|europe|paris|rome|spain|germany|italy|france|amsterdam|portugal|barcelona|munich|vienna|prague|madrid|lisbon/.test(r)) return "EUR";
    return null;
  }

  TP.money = {
    CUR: CUR, ORDER: ORDER, cfg: cfg, symbol: symbol,
    format: format, estimateFare: estimateFare, currencyForRegion: currencyForRegion, rateLabel: rateLabel,
    rate: rate, getCachedRate: getCachedRate, ensureRate: ensureRate, convert: convert, formatConv: formatConv,
    rateStatus: rateStatus, resetRateFailures: resetRateFailures
  };
})(window.TP = window.TP || {});
