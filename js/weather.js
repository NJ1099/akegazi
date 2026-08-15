/* weather.js — Open-Meteo 무료 날씨 + 우천 시 실내 추천 (네임스페이스 TP.weather)
 * 키 불필요. 미래 16일 이내는 forecast, 과거는 archive API 사용.
 */
(function (TP) {
  "use strict";
  var fetchJSON = TP.util.fetchJSON, hasCoord = TP.geo.hasCoord;

  var RAIN_MM = 3;      // 일 강수량 임계
  var RAIN_POP = 60;    // 강수확률(%) 임계
  var mem = {};         // 세션 캐시
  var inflight = {};    // 진행 중 요청(같은 날짜·좌표의 중복 발사 방지)
  var LS_KEY = "akegazi.wx.v1";
  var TTL = 2 * 3600 * 1000;
  var FAIL_TTL = 90 * 1000;   // 실패는 90초만 기억 — 회선이 돌아오면 곧 다시 시도한다

  var lsCache = (function () { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } })();
  function saveLS() { try { localStorage.setItem(LS_KEY, JSON.stringify(lsCache)); } catch (e) {} }

  /* WMO weather code → 이모지/설명 */
  var CODES = {
    0: ["☀️", "맑음"], 1: ["🌤️", "대체로 맑음"], 2: ["⛅", "구름 조금"], 3: ["☁️", "흐림"],
    45: ["🌫️", "안개"], 48: ["🌫️", "서리 안개"],
    51: ["🌦️", "약한 이슬비"], 53: ["🌦️", "이슬비"], 55: ["🌧️", "짙은 이슬비"],
    56: ["🌧️", "어는 이슬비"], 57: ["🌧️", "어는 이슬비"],
    61: ["🌧️", "약한 비"], 63: ["🌧️", "비"], 65: ["🌧️", "강한 비"],
    66: ["🌧️", "어는 비"], 67: ["🌧️", "어는 비"],
    71: ["🌨️", "약한 눈"], 73: ["🌨️", "눈"], 75: ["❄️", "강한 눈"], 77: ["🌨️", "싸락눈"],
    80: ["🌦️", "소나기"], 81: ["🌧️", "소나기"], 82: ["⛈️", "강한 소나기"],
    85: ["🌨️", "눈 소나기"], 86: ["🌨️", "강한 눈 소나기"],
    95: ["⛈️", "뇌우"], 96: ["⛈️", "우박 동반 뇌우"], 99: ["⛈️", "강한 우박 뇌우"]
  };
  function codeMeta(c) { return CODES[c] || ["🌡️", "—"]; }

  /* 하루치 날씨 조회 */
  function getWeather(lat, lon, date) {
    if (typeof lat !== "number" || typeof lon !== "number" || !date) {
      return Promise.resolve({ available: false, reason: "위치 정보 필요" });
    }
    var key = date + "|" + lat.toFixed(2) + "|" + lon.toFixed(2);
    if (mem[key] && (Date.now() - mem[key]._t) < (mem[key]._ttl || TTL)) return Promise.resolve(mem[key].v);
    var cached = lsCache[key];
    if (cached && (Date.now() - cached._t) < TTL) { mem[key] = cached; return Promise.resolve(cached.v); }
    // 같은 날짜·좌표를 이미 조회 중이면 그 약속을 함께 쓴다. 캐시는 "완료된" 응답만 담기 때문에,
    // 이게 없으면 여행 화면이 다시 그려질 때마다 아직 도착하지 않은 요청들이 통째로 재발사된다.
    if (inflight[key]) return inflight[key];

    var off = TP.util.daysFromToday(date);
    if (off == null) return Promise.resolve({ available: false, reason: "날짜 오류" });

    // 최근 과거(어제~5일 전)는 archive(ERA5, 약 5일 지연)에 데이터가 비므로 forecast로 조회.
    // forecast 엔드포인트는 start_date만으로 최근 과거 단일일을 정상 반환한다(past_days 병용 시 400).
    var host, isArchive = false;
    if (off >= -5 && off <= 15) host = "https://api.open-meteo.com/v1/forecast";
    else if (off < -5) { host = "https://archive-api.open-meteo.com/v1/archive"; isArchive = true; }
    else return Promise.resolve({ available: false, reason: "여행일이 16일 이후라 예보가 아직 없어요" }); // 캐시 안 함

    var daily = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum" +
                (isArchive ? "" : ",precipitation_probability_max");
    var url = host + "?latitude=" + lat + "&longitude=" + lon +
              "&daily=" + daily + "&timezone=auto&start_date=" + date + "&end_date=" + date;

    var p = fetchJSON(url, { timeout: 9000 }).then(function (j) {
      var d = j && j.daily;
      if (!d || !d.time || !d.time.length) return finish(key, { available: false, reason: "데이터 없음" }, FAIL_TTL);
      var code = num(d.weather_code), tmax = num(d.temperature_2m_max), tmin = num(d.temperature_2m_min);
      var precip = num(d.precipitation_sum), pop = d.precipitation_probability_max ? num(d.precipitation_probability_max) : null;
      var m = codeMeta(code);
      var rainy = (precip != null && precip >= RAIN_MM) || (pop != null && pop >= RAIN_POP) ||
                  (code >= 51 && code <= 67) || (code >= 80 && code <= 99);
      var v = {
        available: true, code: code, emoji: m[0], desc: m[1],
        tmax: tmax, tmin: tmin, precip: precip, pop: pop, rainy: rainy, archive: isArchive
      };
      return finish(key, v);
    }).catch(function () {
      // 실패도 짧게 기억한다. 안 그러면 기내·지하철·해외 로밍처럼 계속 실패하는 상황에서
      // 화면을 옮길 때마다 9초짜리 요청이 날짜 수만큼 새로 뜬다.
      return finish(key, { available: false, reason: "날씨를 불러오지 못했어요" }, FAIL_TTL);
    });
    p.then(function () { delete inflight[key]; }, function () { delete inflight[key]; });
    inflight[key] = p;
    return p;

    function num(a) { return (a && a.length != null) ? a[0] : a; }
  }
  /* ttl 을 주면 그 시간만 유효한 단명 캐시(실패 응답용). 실패는 localStorage 로 넘기지 않는다. */
  function finish(key, v, ttl) {
    var entry = { _t: Date.now(), v: v };
    if (ttl) { entry._ttl = ttl; mem[key] = entry; return v; }
    mem[key] = entry;
    lsCache[key] = entry;
    saveLS();
    return v;
  }

  /* Day의 대표 좌표 (좌표 있는 첫 stop, 없으면 중심점) */
  function dayCoord(day) {
    var geo = day.stops.filter(hasCoord);
    if (!geo.length) return null;
    var first = geo.filter(function (s) { return s.type !== "airport"; })[0] || geo[0];
    return { lat: first.lat, lon: first.lon };
  }

  function getDayWeather(day) {
    var c = dayCoord(day);
    if (!c) return Promise.resolve({ available: false, reason: "장소 위치를 입력하면 날씨가 표시돼요" });
    return getWeather(c.lat, c.lon, day.date);
  }

  /* 우천 시 실내 추천 분석 */
  function indoorPlan(day, wx) {
    if (!wx || !wx.rainy) return { rainy: false };
    var outdoor = [], indoor = [];
    day.stops.forEach(function (s) {
      if (s.indoor === true) indoor.push(s);
      else if (s.indoor === false) outdoor.push(s);
    });
    var msg;
    if (outdoor.length) {
      msg = "비 예보예요. 야외 일정 " + outdoor.length + "곳은 우천에 약하니, 실내 위주로 동선을 조정하거나 순서를 바꿔보세요.";
    } else if (indoor.length) {
      msg = "비 예보지만 오늘 일정은 대부분 실내라 영향이 적어요. 이동 시 우산만 챙기세요.";
    } else {
      msg = "비 예보예요. 각 장소의 '실내/야외'를 표시해두면 실내 위주 추천을 받을 수 있어요.";
    }
    return { rainy: true, outdoor: outdoor, indoor: indoor, message: msg };
  }

  TP.weather = {
    getWeather: getWeather, getDayWeather: getDayWeather,
    dayCoord: dayCoord, indoorPlan: indoorPlan, codeMeta: codeMeta,
    RAIN_MM: RAIN_MM, RAIN_POP: RAIN_POP
  };
})(window.TP = window.TP || {});
