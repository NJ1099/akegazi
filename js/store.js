/* store.js — 다중 여행 데이터 모델 + localStorage (네임스페이스 TP.store)
 *
 *   State { trips: [Trip], activeId }
 *   Trip  { id, title, region, currency, homeCurrency, days: [Day], wish: [Stop],   // wish = 날짜 안 정한 장소(보관함)
 *           members: [이름], expenses: [Expense], packing: [{ id, text, done }] }       // 쓴 돈·정산 / 준비물
 *   Expense { id, date, title, amount(여행 통화), payer(이름|""), split: [이름](비면 전원) }
 *   Day   { id, date:'YYYY-MM-DD', label, stops: [Stop] }
 *   Stop  { id, type, title, subtitle, address, lat, lon, time, durationLabel,
 *           arriveTime, departTime, stayMin,            // 공항 도착/출발 시각 + 체류시간(분)
 *           checkIn, checkOut,                          // 숙소 체크인/체크아웃 날짜(YYYY-MM-DD) — 숙박 기간
 *           arriveBy, fareAmount,                       // 이전→여기 이동수단 + 예상/입력 교통비
 *           costAmount, payment, costCategory,          // 경비 + 결제수단(credit/debit/cash) + 분류(food/ticket/lodging/shopping/etc)
 *           indoor, openHours, closingDays:[0..6], closingNote,
 *           placeId, openPeriods:[[여는 분, 닫는 분]],          // 구글 장소 id + 영업 구간(일요일 0시 기준 주간 분)
 *           reservation, reservationNote, fixed, photoSpot, note, cost }
 *
 * 날짜/장소 변경 API는 '활성 여행(activeTrip)'을 대상으로 동작한다.
 */
(function (TP) {
  "use strict";
  var uid = TP.util.uid;
  var KEY = "akegazi.trips.v1";
  var OLD_KEY = "akegazi.trip.v1";     // 구버전(단일 여행) 마이그레이션용

  var STATE = { trips: [], activeId: null, customCats: [] };
  var listeners = [];

  /* ---- 사용자 커스텀 경비 분류(전역) ---- */
  var BUILTIN_CAT_KEYS = { food: 1, ticket: 1, lodging: 1, shopping: 1, etc: 1 };
  function validateCustomCats(arr) {
    var out = [], seen = {};
    (Array.isArray(arr) ? arr : []).forEach(function (c) {
      if (!c) return;
      var k = String(c.k || "").trim();
      var l = String(c.l || "").trim().slice(0, 24);
      if (!k || !l || seen[k] || BUILTIN_CAT_KEYS[k]) return;   // 빈값·중복·빌트인키 충돌 방지
      seen[k] = 1; out.push({ k: k, l: l });
    });
    return out.slice(0, 40);   // 과도한 개수 방어
  }

  /* 외부 데이터 방어용 텍스트 정규화 — 문자열이 아닌 값(배열·객체)도 문자열로 확정하고 길이를 자른다.
   * 자유 텍스트에 상한이 없으면 조작된 공유 링크가 수 MB 문자열로 저장소를 채울 수 있다. */
  function clampText(v, max) {
    if (v == null) return "";
    var s = (typeof v === "string") ? v : String(v);
    return (s.length > max) ? s.slice(0, max) : s;
  }
  function isISODate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !!TP.util.parseDate(s); }

  function emptyTrip(partial) { return Object.assign({ id: uid(), title: "새 여행", region: "", currency: "JPY", homeCurrency: "", days: [], wish: [], members: [], expenses: [], packing: [] }, partial || {}); }
  function defaultDay(partial) { return Object.assign({ id: uid(), date: "", label: "", stops: [] }, partial || {}); }
  function defaultStop(partial) {
    var s = Object.assign({
      id: uid(), type: "attraction", title: "", subtitle: "", address: "",
      lat: null, lon: null, time: "", durationLabel: "",
      arriveTime: "", departTime: "", stayMin: null,
      checkIn: "", checkOut: "",
      arriveBy: "", fareAmount: null, fareFrom: "", costAmount: null, payment: "", costCategory: "",
      indoor: null, openHours: "", closingDays: [], closingNote: "", placeId: "", openPeriods: [],
      reservation: "none", reservationNote: "", fixed: false, photoSpot: false,
      note: "", cost: ""
    }, partial || {});
    // 자유 텍스트: 타입·길이 확정(공유/가져오기로 들어온 비정상 값 방어)
    s.title = clampText(s.title, 120);
    s.subtitle = clampText(s.subtitle, 120);
    s.address = clampText(s.address, 200);
    s.durationLabel = clampText(s.durationLabel, 60);
    s.openHours = clampText(s.openHours, 300);
    s.closingNote = clampText(s.closingNote, 200);
    s.reservationNote = clampText(s.reservationNote, 200);
    s.note = clampText(s.note, 1000);
    s.cost = clampText(s.cost, 60);
    s.time = clampText(s.time, 5);
    s.arriveTime = clampText(s.arriveTime, 5);
    s.departTime = clampText(s.departTime, 5);
    // 숙박 기간: 엄격한 날짜만, 체크아웃은 체크인 다음 날 이후만(0박·역순은 체크아웃을 비운다)
    s.checkIn = isISODate(s.checkIn) ? s.checkIn : "";
    s.checkOut = (s.checkIn && isISODate(s.checkOut) && s.checkOut > s.checkIn) ? s.checkOut : "";
    s.lat = (typeof s.lat === "number" && isFinite(s.lat) && s.lat >= -90 && s.lat <= 90) ? s.lat : null;
    s.lon = (typeof s.lon === "number" && isFinite(s.lon) && s.lon >= -180 && s.lon <= 180) ? s.lon : null;
    // 체류시간(분): 0 이상 정수만, 아니면 null(타입별 기본값 사용)
    var sm = parseInt(s.stayMin, 10);
    s.stayMin = (isFinite(sm) && sm >= 0) ? sm : null;
    // 금액(교통비/경비): 0 이상 숫자만, 아니면 null
    var fa = parseFloat(s.fareAmount); s.fareAmount = (isFinite(fa) && fa >= 0) ? fa : null;
    // 직접 입력한 교통비가 "어느 구간의 요금인지"(직전 장소 id). 순서가 바뀌면 그 값은 근거를 잃는다.
    // 비어 있으면(구버전·공유 복원 데이터) 검사하지 않고 그대로 신뢰한다 — 하위호환.
    s.fareFrom = (typeof s.fareFrom === "string") ? s.fareFrom : "";
    var ca = parseFloat(s.costAmount); s.costAmount = (isFinite(ca) && ca >= 0) ? ca : null;
    if (["transit", "taxi", "walk", "none"].indexOf(s.arriveBy) < 0) s.arriveBy = "";
    if (["credit", "debit", "cash"].indexOf(s.payment) < 0) s.payment = "";
    // 분류: 빌트인 키 또는 커스텀 키(uc_*)만 허용(그 외/잘못된 값은 비움). 커스텀 정의 미로드여도 키는 보존.
    if (s.costCategory && !BUILTIN_CAT_KEYS[s.costCategory] && !/^uc_/.test(String(s.costCategory))) s.costCategory = "";
    // 가져오기/공유 데이터 방어: closingDays는 0~6 정수 요일만
    s.closingDays = (Array.isArray(s.closingDays) ? s.closingDays : []).map(Number).filter(function (d) { return d >= 0 && d <= 6 && Math.floor(d) === d; });
    s.placeId = (typeof s.placeId === "string" && s.placeId.length <= 300) ? s.placeId : "";
    // 영업 구간: [여는 분, 닫는 분] 정수 쌍만(0 ≤ 여는 < 닫는 ≤ 2주) — 공유 링크로 들어온 이상한 값은 버린다
    s.openPeriods = (Array.isArray(s.openPeriods) ? s.openPeriods : []).filter(function (p) {
      return Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]) && p[0] >= 0 && p[0] < 10080 && p[1] > p[0] && p[1] <= 20160;
    }).map(function (p) { return [Math.round(p[0]), Math.round(p[1])]; }).slice(0, 28);
    return s;
  }

  /* 외부에서 들어온 데이터(공유 링크·JSON 가져오기)의 규모 상한.
   * 상한이 없으면 조작된 링크 하나로 날짜 수천 개를 밀어 넣어 날씨 조회 폭주·localStorage 오염을
   * 유발할 수 있다(자기증폭형 DoS). 실제 여행 일정으로는 닿을 수 없는 넉넉한 값으로 자른다. */
  var MAX_DAYS = 90, MAX_STOPS = 100, MAX_WISH = 200, MAX_MEMBERS = 12, MAX_EXPENSES = 500, MAX_PACK = 100;

  function migrateTrip(trip) {
    if (!trip || typeof trip !== "object") return emptyTrip();
    if (!trip.id) trip.id = uid();
    trip.title = clampText(trip.title, 120) || "새 여행";     // 배열/객체가 와도 문자열로 확정(내보내기 크래시 방지)
    if (typeof trip.region !== "string") trip.region = ""; else trip.region = clampText(trip.region, 80);
    var validCur = TP.money && TP.money.CUR && TP.money.CUR[trip.currency];   // money.js의 통화표 기준
    if (!validCur) trip.currency = "JPY";
    if (typeof trip.homeCurrency !== "string" || (trip.homeCurrency && TP.money && TP.money.CUR && !TP.money.CUR[trip.homeCurrency])) trip.homeCurrency = "";
    if (!Array.isArray(trip.days)) trip.days = [];
    if (trip.days.length > MAX_DAYS) trip.days = trip.days.slice(0, MAX_DAYS);
    trip.days.forEach(function (d) {
      if (!d.id) d.id = uid();
      if (!isISODate(d.date)) d.date = "";                 // 엄격 YYYY-MM-DD 만 통과(날씨 URL 파라미터 주입 차단)
      d.label = clampText(d.label, 80);
      if (!Array.isArray(d.stops)) d.stops = [];
      if (d.stops.length > MAX_STOPS) d.stops = d.stops.slice(0, MAX_STOPS);
      d.stops = d.stops.map(function (s) { return defaultStop(s); });
    });
    // 보관함 — 날짜를 아직 안 정한 장소. 구버전 데이터엔 없다.
    trip.wish = (Array.isArray(trip.wish) ? trip.wish : []).slice(0, MAX_WISH).map(function (s) { return defaultStop(s); });
    // 일행 — 중복·빈 이름 제거
    var seenM = {};
    trip.members = (Array.isArray(trip.members) ? trip.members : []).map(function (m) { return clampText(m, 20).trim(); })
      .filter(function (m) { if (!m || seenM[m]) return false; seenM[m] = 1; return true; }).slice(0, MAX_MEMBERS);
    trip.expenses = (Array.isArray(trip.expenses) ? trip.expenses : []).slice(0, MAX_EXPENSES).map(normExpense).filter(Boolean);
    trip.packing = (Array.isArray(trip.packing) ? trip.packing : []).slice(0, MAX_PACK).map(function (p) {
      if (!p) return null;
      var text = clampText(p.text, 80).trim();
      return text ? { id: p.id || uid(), text: text, done: !!p.done } : null;
    }).filter(Boolean);
    return trip;
  }
  function normExpense(e) {
    if (!e || typeof e !== "object") return null;
    var amt = parseFloat(e.amount);
    if (!isFinite(amt) || amt <= 0) return null;
    return {
      id: e.id || uid(),
      date: isISODate(e.date) ? e.date : "",
      title: clampText(e.title, 60),
      amount: amt,
      payer: clampText(e.payer, 20),
      split: (Array.isArray(e.split) ? e.split : []).map(function (m) { return clampText(m, 20); }).filter(Boolean).slice(0, MAX_MEMBERS)
    };
  }

  /* ---- 영속화 ---- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        STATE.customCats = validateCustomCats(s.customCats);   // 트립 마이그레이션(defaultStop)보다 먼저 로드
        STATE.trips = (s.trips || []).map(migrateTrip);
        var aid = s.activeId;   // 저장된 activeId가 실제 존재하는 여행을 가리킬 때만 채택(stale 자가치유)
        STATE.activeId = (aid && STATE.trips.some(function (t) { return t.id === aid; })) ? aid : ((STATE.trips[0] && STATE.trips[0].id) || null);
        return;
      }
    } catch (e) {}
    try {
      var old = localStorage.getItem(OLD_KEY);     // 구버전 단일 여행 → trips[]로 승격
      if (old) {
        var t = migrateTrip(JSON.parse(old));
        STATE.trips = [t]; STATE.activeId = t.id; persist();
        return;
      }
    } catch (e) {}
    STATE.trips = []; STATE.activeId = null;
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify({ trips: STATE.trips, activeId: STATE.activeId, customCats: STATE.customCats })); } catch (e) {} }
  var save = TP.util.debounce(persist, 250);

  function subscribe(fn) { listeners.push(fn); }
  function notify() { save(); listeners.forEach(function (fn) { try { fn(STATE); } catch (e) {} }); }

  /* ---- 여행(trip) 셀렉터/변경 ---- */
  function trips() { return STATE.trips; }
  function trip(id) { return STATE.trips.filter(function (t) { return t.id === id; })[0] || null; }
  function activeId() { return STATE.activeId; }
  function activeTrip() { return trip(STATE.activeId); }
  function setActive(id) {
    if (id != null && !trip(id)) return;                 // 존재하지 않는 여행으로 전환 금지(dangling activeId 방지)
    if (STATE.activeId !== id) { STATE.activeId = id; persist(); }   // notify 없음(렌더 루프 방지)
  }

  function addTrip(partial) { var t = emptyTrip(partial); STATE.trips.push(t); STATE.activeId = t.id; notify(); return t; }
  function addTripData(data) {
    if (data && data.customCats) mergeCustomCats(data.customCats);   // 공유/가져오기 분류 병합(키 보존)
    var t = migrateTrip(Object.assign({ id: uid() }, data || {}));
    t.id = uid();                          // 공유/가져오기는 항상 새 id로 추가(중복 방지)
    delete t.customCats;                   // 분류는 전역으로 옮겼으므로 트립에는 남기지 않음
    STATE.trips.push(t); STATE.activeId = t.id; notify(); return t;
  }
  function updateTrip(id, patch) { var t = trip(id); if (!t) return; Object.assign(t, patch); notify(); }
  function removeTrip(id) {
    STATE.trips = STATE.trips.filter(function (t) { return t.id !== id; });
    if (STATE.activeId === id) STATE.activeId = (STATE.trips[0] && STATE.trips[0].id) || null;
    notify();
  }
  function reset() { STATE.trips = []; STATE.activeId = null; notify(); }

  /* ---- 커스텀 분류 API ---- */
  function customCats() { return STATE.customCats.slice(); }
  function addCustomCat(label) {
    var l = String(label || "").trim().slice(0, 24);
    if (!l) return null;
    var exist = STATE.customCats.filter(function (c) { return c.l.toLowerCase() === l.toLowerCase(); })[0];
    if (exist) return exist;                                   // 같은 이름이면 재사용
    if (STATE.customCats.length >= 40) return null;            // 상한
    var c = { k: "uc_" + uid(), l: l };
    STATE.customCats.push(c); notify(); return c;
  }
  function removeCustomCat(k) {
    var before = STATE.customCats.length;
    STATE.customCats = STATE.customCats.filter(function (c) { return c.k !== k; });
    if (STATE.customCats.length !== before) notify();
  }
  // 외부(공유/가져오기) 분류 병합 — 키 보존(장소의 costCategory 참조가 깨지지 않게)
  function mergeCustomCats(arr) {
    var have = {}; STATE.customCats.forEach(function (c) { have[c.k] = 1; });
    var added = 0;
    validateCustomCats(arr).forEach(function (c) { if (!have[c.k]) { STATE.customCats.push(c); have[c.k] = 1; added++; } });
    return added;
  }
  // 트립에서 실제 쓰인 커스텀 분류 정의만 추림(공유/내보내기 동봉용)
  function usedCustomCats(trip) {
    if (!trip) return [];
    var used = {};
    (trip.days || []).forEach(function (d) { (d.stops || []).forEach(function (s) { if (s.costCategory && !BUILTIN_CAT_KEYS[s.costCategory]) used[s.costCategory] = 1; }); });
    (trip.wish || []).forEach(function (s) { if (s.costCategory && !BUILTIN_CAT_KEYS[s.costCategory]) used[s.costCategory] = 1; });
    return STATE.customCats.filter(function (c) { return used[c.k]; });
  }

  /* ---- 활성 여행 스코프: 날짜/장소 ---- */
  function _t() { return activeTrip(); }
  function setTitle(title) { var t = _t(); if (t) { t.title = title; notify(); } }
  function byDate(a, b) { if (!a.date) return 1; if (!b.date) return -1; return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }

  function day(id) { var t = _t(); if (!t) return null; return t.days.filter(function (d) { return d.id === id; })[0] || null; }
  function dayIndex(id) { var t = _t(); if (!t) return -1; for (var i = 0; i < t.days.length; i++) if (t.days[i].id === id) return i; return -1; }
  function dayAt(idx) { var t = _t(); return t ? (t.days[idx] || null) : null; }
  function stop(dayId, stopId) { var d = day(dayId); if (!d) return null; return d.stops.filter(function (s) { return s.id === stopId; })[0] || null; }

  function nextDate() {
    var t = _t(); if (!t || !t.days.length) return TP.util.todayISO();
    var last = t.days.map(function (d) { return d.date; }).filter(Boolean).sort().pop();
    return last ? TP.util.addDaysISO(last, 1) : TP.util.todayISO();
  }
  function addDay(partial) {
    var t = _t(); if (!t) return null;
    var d = defaultDay(Object.assign({ date: (partial && partial.date) || nextDate() }, partial));
    t.days.push(d); t.days.sort(byDate); notify(); return d;
  }
  /* 날짜 목록을 보장한다 — 없는 날짜만 새로 만들고, 있는 날짜는 건드리지 않는다.
   * 숙소 기간(9/28~9/30)을 고르면 Day1~3 이 한 번에 생기는 흐름에 쓴다. 날짜를 지우지는 않으므로
   * 기간을 줄여도 이미 넣어 둔 일정이 사라지지 않는다. { 'YYYY-MM-DD': dayId } 를 돌려준다. */
  function ensureDays(dates) {
    var t = _t(); if (!t) return {};
    var map = {}, added = 0;
    t.days.forEach(function (d) { if (d.date && !map[d.date]) map[d.date] = d.id; });
    (dates || []).forEach(function (dt) {
      if (!isISODate(dt) || map[dt] || t.days.length >= MAX_DAYS) return;
      var d = defaultDay({ date: dt }); t.days.push(d); map[dt] = d.id; added++;
    });
    if (added) { t.days.sort(byDate); notify(); }
    return map;
  }
  /* 그 날짜에 묵는 숙소 — { stop, night(몇 번째 밤), nights(총 박수) } 또는 체크아웃 날이면 { stop, checkout:true } */
  function stayOn(trip, date) {
    if (!trip || !date) return null;
    var out = null;
    (trip.days || []).forEach(function (d) {
      (d.stops || []).forEach(function (s) {
        if (out && !out.checkout) return;                 // 묵는 숙소가 체크아웃보다 우선
        if (s.type !== "lodging" || !s.checkIn || !s.checkOut) return;
        var nights = TP.util.daysBetween(s.checkIn, s.checkOut);
        if (date >= s.checkIn && date < s.checkOut) out = { stop: s, night: TP.util.daysBetween(s.checkIn, date) + 1, nights: nights };
        else if (date === s.checkOut && !out) out = { stop: s, checkout: true, nights: nights };
      });
    });
    return out;
  }
  /* 그날의 실제 동선 — [어젯밤 숙소(출발)] + 장소들 + [오늘 밤 숙소(귀가)].
   * 숙소는 체크인 날의 장소 목록에 한 번만 들어 있어서, 둘째 날부터는 "호텔에서 나와 호텔로 돌아간다"가
   * 동선 최적화·예상 시각·교통비 어디에도 없었다. 날짜마다 숙박 기간으로 계산해 앞뒤에 가상 칸을 붙인다.
   *   출발 = 어젯밤 묵은 곳 (checkIn < 날짜 ≤ checkOut)
   *   귀가 = 오늘 밤 묵을 곳 (checkIn ≤ 날짜 < checkOut)
   * 중간에 숙소를 바꾸는 날은 둘이 달라진다(A 에서 나와 B 로). 겹치는 예약이 있으면 체크인이 늦은 쪽.
   * 가상 칸은 저장되지 않는다(id "vs:…", virtual: "start"|"end"). 경비는 비워 숙박비가 두 번 잡히지 않게 한다. */
  function routeOf(trip, day) {
    var stops = (day && day.stops) || [];
    var date = day && day.date;
    if (!trip || !date) return stops;
    var morning = null, tonight = null;
    (trip.days || []).forEach(function (d) {
      (d.stops || []).forEach(function (s) {
        if (s.type !== "lodging" || !s.checkIn || !s.checkOut) return;
        if (s.checkIn < date && date <= s.checkOut && (!morning || s.checkIn > morning.checkIn)) morning = s;
        if (s.checkIn <= date && date < s.checkOut && (!tonight || s.checkIn > tonight.checkIn)) tonight = s;
      });
    });
    if (!morning && !tonight) return stops;
    var out = stops.slice();
    if (morning && !(out[0] && out[0].id === morning.id)) out.unshift(virtualStay(morning, "start"));
    if (tonight && !(out.length && out[out.length - 1].id === tonight.id)) out.push(virtualStay(tonight, "end"));
    return out;
  }
  function virtualStay(s, role) {
    return Object.assign({}, s, {
      id: "vs:" + role + ":" + s.id, virtual: role, srcId: s.id,
      time: "", fixed: false, stayMin: 0,
      arriveBy: "", fareAmount: null, fareFrom: "", costAmount: null, note: ""
    });
  }
  function updateDay(id, patch) { var t = _t(); var d = day(id); if (!d || !t) return; Object.assign(d, patch); if ("date" in patch) t.days.sort(byDate); notify(); }
  function removeDay(id) { var t = _t(); if (!t) return; t.days = t.days.filter(function (d) { return d.id !== id; }); notify(); }

  function addStop(dayId, partial) { var d = day(dayId); if (!d) return null; var s = defaultStop(partial); d.stops.push(s); notify(); return s; }
  function updateStop(dayId, stopId, patch) { var s = stop(dayId, stopId); if (!s) return; Object.assign(s, patch); notify(); }
  function removeStop(dayId, stopId) { var d = day(dayId); if (!d) return; d.stops = d.stops.filter(function (s) { return s.id !== stopId; }); notify(); }
  function reorderStops(dayId, orderedIds) {
    var d = day(dayId); if (!d) return;
    var map = {}; d.stops.forEach(function (s) { map[s.id] = s; });
    var next = [];
    orderedIds.forEach(function (id) { if (map[id]) { next.push(map[id]); delete map[id]; } });
    d.stops.forEach(function (s) { if (map[s.id]) next.push(s); });
    d.stops = next; notify();
  }
  function moveStop(dayId, from, to) {
    var d = day(dayId); if (!d) return;
    if (to < 0 || to >= d.stops.length || from === to) return;
    var arr = d.stops, item = arr.splice(from, 1)[0]; arr.splice(to, 0, item); notify();
  }
  /* 장소를 같은 여행의 다른 날짜로 옮긴다(대상 날짜의 맨 뒤에 붙음).
   * 일정을 짜다 보면 "이건 2일차로 미루자"가 잦은데, 지금까지는 삭제 후 재입력뿐이었다.
   * 객체를 그대로 옮기므로 좌표·경비·영업시간 등 입력값이 하나도 유실되지 않는다. */
  function moveStopToDay(fromDayId, stopId, toDayId) {
    if (!fromDayId || !toDayId || fromDayId === toDayId) return false;
    var from = day(fromDayId), to = day(toDayId);
    if (!from || !to) return false;
    var idx = -1;
    for (var i = 0; i < from.stops.length; i++) { if (from.stops[i].id === stopId) { idx = i; break; } }
    if (idx < 0) return false;
    to.stops.push(from.stops.splice(idx, 1)[0]);
    notify();
    return true;
  }

  /* ---- 보관함(날짜 미정 장소) — 활성 여행 ----
   * 인스타에서 찾았거나 "언젠가 가 볼 곳"을 일단 모아 두고, 날짜가 정해지면 그 날로 보낸다.
   * 객체를 그대로 옮기므로 입력한 내용(좌표·영업시간·메모)이 하나도 사라지지 않는다. */
  function wishList() { var t = _t(); return t ? t.wish : []; }
  function wishStop(id) { return wishList().filter(function (s) { return s.id === id; })[0] || null; }
  function addWish(partial) {
    var t = _t(); if (!t) return null;
    if (t.wish.length >= MAX_WISH) return null;
    var s = defaultStop(partial); t.wish.push(s); notify(); return s;
  }
  function updateWish(id, patch) { var s = wishStop(id); if (!s) return; Object.assign(s, patch); notify(); }
  function removeWish(id) { var t = _t(); if (!t) return; t.wish = t.wish.filter(function (s) { return s.id !== id; }); notify(); }
  function moveWishToDay(id, dayId) {
    var t = _t(), d = day(dayId); if (!t || !d) return false;
    var idx = -1;
    for (var i = 0; i < t.wish.length; i++) if (t.wish[i].id === id) { idx = i; break; }
    if (idx < 0) return false;
    var s = t.wish.splice(idx, 1)[0];
    s.fareAmount = null; s.fareFrom = ""; s.arriveBy = "";    // 구간 요금은 새 자리에서 다시 정한다
    d.stops.push(s); notify(); return true;
  }
  function moveStopToWish(dayId, stopId) {
    var t = _t(), d = day(dayId); if (!t || !d) return false;
    var idx = -1;
    for (var i = 0; i < d.stops.length; i++) if (d.stops[i].id === stopId) { idx = i; break; }
    if (idx < 0) return false;
    var s = d.stops.splice(idx, 1)[0];
    s.fareAmount = null; s.fareFrom = ""; s.arriveBy = "";
    t.wish.push(s); notify(); return true;
  }

  /* ---- 쓴 돈(실제 지출) · 일행 — 활성 여행 ----
   * 예산(예상)과 따로 적는다. 금액은 여행 통화 기준. 일행이 둘 이상이면 정산(누가 누구에게 얼마)을 낸다. */
  function addMember(name) {
    var t = _t(); if (!t) return false;
    name = clampText(name, 20).trim();
    if (!name || t.members.indexOf(name) >= 0 || t.members.length >= MAX_MEMBERS) return false;
    t.members.push(name); notify(); return true;
  }
  function removeMember(name) {
    var t = _t(); if (!t) return;
    t.members = t.members.filter(function (m) { return m !== name; });
    // 그 사람이 낸/나눈 기록은 지우지 않는다 — 정산에서 "누가 냈는지 모름"으로 빠진다
    notify();
  }
  function addExpense(e) {
    var t = _t(); if (!t || t.expenses.length >= MAX_EXPENSES) return null;
    var x = normExpense(Object.assign({}, e, { id: uid() })); if (!x) return null;
    t.expenses.push(x); notify(); return x;
  }
  function updateExpense(id, e) {
    var t = _t(); if (!t) return;
    for (var i = 0; i < t.expenses.length; i++) if (t.expenses[i].id === id) {
      var x = normExpense(Object.assign({}, t.expenses[i], e, { id: id }));
      if (x) { t.expenses[i] = x; notify(); }
      return;
    }
  }
  function removeExpense(id) { var t = _t(); if (!t) return; t.expenses = t.expenses.filter(function (x) { return x.id !== id; }); notify(); }

  /* ---- 준비물 체크리스트 — 활성 여행 ---- */
  var DEFAULT_PACK = ["여권 (유효기간 6개월 이상)", "항공권·숙소 예약 확인", "환전·해외결제 카드", "eSIM·로밍·유심", "충전기·보조배터리·멀티어댑터", "여행자 보험", "상비약"];
  function ensurePacking() {
    var t = _t(); if (!t) return;
    if (t.packing.length || t.packingInit) return;
    t.packing = DEFAULT_PACK.map(function (text) { return { id: uid(), text: text, done: false }; });
    t.packingInit = true; save();            // 화면을 그리는 중에 부르므로 다시 그리지 않는다(notify 금지)
  }
  function addPack(text) {
    var t = _t(); if (!t) return;
    text = clampText(text, 80).trim();
    if (!text || t.packing.length >= MAX_PACK) return;
    t.packing.push({ id: uid(), text: text, done: false }); notify();
  }
  function togglePack(id) { var t = _t(); if (!t) return; t.packing.forEach(function (p) { if (p.id === id) p.done = !p.done; }); notify(); }
  function removePack(id) { var t = _t(); if (!t) return; t.packing = t.packing.filter(function (p) { return p.id !== id; }); t.packingInit = true; notify(); }

  /* ---- 가져오기/내보내기 (활성 여행) ---- */
  function exportJSON() {
    var t = _t(); if (!t) return JSON.stringify(emptyTrip(), null, 2);
    var used = usedCustomCats(t);
    var out = used.length ? Object.assign({}, t, { customCats: used }) : t;   // 쓰인 커스텀 분류 동봉
    return JSON.stringify(out, null, 2);
  }
  function importJSON(text) { addTripData(JSON.parse(text)); }   // 새 여행으로 추가

  TP.store = {
    load: load, subscribe: subscribe,
    trips: trips, trip: trip, activeId: activeId, activeTrip: activeTrip, setActive: setActive,
    addTrip: addTrip, addTripData: addTripData, updateTrip: updateTrip, removeTrip: removeTrip, reset: reset,
    customCats: customCats, addCustomCat: addCustomCat, removeCustomCat: removeCustomCat, usedCustomCats: usedCustomCats,
    setTitle: setTitle, day: day, dayAt: dayAt, dayIndex: dayIndex, stop: stop,
    addDay: addDay, ensureDays: ensureDays, stayOn: stayOn, routeOf: routeOf, updateDay: updateDay, removeDay: removeDay,
    addStop: addStop, updateStop: updateStop, removeStop: removeStop,
    reorderStops: reorderStops, moveStop: moveStop, moveStopToDay: moveStopToDay,
    wishList: wishList, wishStop: wishStop, addWish: addWish, updateWish: updateWish, removeWish: removeWish,
    moveWishToDay: moveWishToDay, moveStopToWish: moveStopToWish,
    addMember: addMember, removeMember: removeMember, addExpense: addExpense, updateExpense: updateExpense, removeExpense: removeExpense,
    ensurePacking: ensurePacking, addPack: addPack, togglePack: togglePack, removePack: removePack,
    exportJSON: exportJSON, importJSON: importJSON,
    defaultStop: defaultStop, defaultDay: defaultDay
  };
})(window.TP = window.TP || {});
