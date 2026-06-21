/* weather.js — Open-Meteo 무료 날씨 + 우천 시 실내 추천 (네임스페이스 TP.weather)
 * 키 불필요. 미래 16일 이내는 forecast, 과거는 archive API 사용.
 */
(function (TP) {
  "use strict";
  var fetchJSON = TP.util.fetchJSON, hasCoord = TP.geo.hasCoord;

  var RAIN_MM = 3;      // 일 강수량 임계
  var RAIN_POP = 60;    // 강수확률(%) 임계
  var mem = {};         // 세션 캐시
  var LS_KEY = "akegazi.wx.v1";
  var TTL = 2 * 3600 * 1000;

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
    if (mem[key]) return Promise.resolve(mem[key]);
    var cached = lsCache[key];
    if (cached && (Date.now() - cached._t) < TTL) { mem[key] = cached.v; return Promise.resolve(cached.v); }

    var off = TP.util.daysFromToday(date);
    if (off == null) return Promise.resolve({ available: false, reason: "날짜 오류" });

    var host, isArchive = false;
    if (off >= 0 && off <= 15) host = "https://api.open-meteo.com/v1/forecast";
    else if (off < 0) { host = "https://archive-api.open-meteo.com/v1/archive"; isArchive = true; }
    else return finish(key, { available: false, reason: "여행일이 16일 이후라 예보가 아직 없어요" });

    var daily = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum" +
                (isArchive ? "" : ",precipitation_probability_max");
    var url = host + "?latitude=" + lat + "&longitude=" + lon +
              "&daily=" + daily + "&timezone=auto&start_date=" + date + "&end_date=" + date;

    return fetchJSON(url, { timeout: 9000 }).then(function (j) {
      var d = j && j.daily;
      if (!d || !d.time || !d.time.length) return finish(key, { available: false, reason: "데이터 없음" });
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
    }).catch(function () { return { available: false, reason: "날씨를 불러오지 못했어요" }; });

    function num(a) { return (a && a.length != null) ? a[0] : a; }
  }
  function finish(key, v) {
    mem[key] = v;
    lsCache[key] = { _t: Date.now(), v: v };
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
