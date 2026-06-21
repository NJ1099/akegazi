/* store.js — 다중 여행 데이터 모델 + localStorage (네임스페이스 TP.store)
 *
 *   State { trips: [Trip], activeId }
 *   Trip  { id, title, days: [Day] }
 *   Day   { id, date:'YYYY-MM-DD', label, stops: [Stop] }
 *   Stop  { id, type, title, subtitle, address, lat, lon, time, durationLabel,
 *           indoor, openHours, closingDays:[0..6], closingNote,
 *           reservation, reservationNote, fixed, photoSpot, note, cost }
 *
 * 날짜/장소 변경 API는 '활성 여행(activeTrip)'을 대상으로 동작한다.
 */
(function (TP) {
  "use strict";
  var uid = TP.util.uid;
  var KEY = "akegazi.trips.v1";
  var OLD_KEY = "akegazi.trip.v1";     // 구버전(단일 여행) 마이그레이션용

  var STATE = { trips: [], activeId: null };
  var listeners = [];

  function emptyTrip(partial) { return Object.assign({ id: uid(), title: "새 여행", days: [] }, partial || {}); }
  function defaultDay(partial) { return Object.assign({ id: uid(), date: "", label: "", stops: [] }, partial || {}); }
  function defaultStop(partial) {
    var s = Object.assign({
      id: uid(), type: "attraction", title: "", subtitle: "", address: "",
      lat: null, lon: null, time: "", durationLabel: "",
      indoor: null, openHours: "", closingDays: [], closingNote: "",
      reservation: "none", reservationNote: "", fixed: false, photoSpot: false,
      note: "", cost: ""
    }, partial || {});
    s.lat = (typeof s.lat === "number" && isFinite(s.lat) && s.lat >= -90 && s.lat <= 90) ? s.lat : null;
    s.lon = (typeof s.lon === "number" && isFinite(s.lon) && s.lon >= -180 && s.lon <= 180) ? s.lon : null;
    // 가져오기/공유 데이터 방어: closingDays는 0~6 정수 요일만
    s.closingDays = (Array.isArray(s.closingDays) ? s.closingDays : []).map(Number).filter(function (d) { return d >= 0 && d <= 6 && Math.floor(d) === d; });
    return s;
  }

  function migrateTrip(trip) {
    if (!trip || typeof trip !== "object") return emptyTrip();
    if (!trip.id) trip.id = uid();
    if (!trip.title) trip.title = "새 여행";
    if (!Array.isArray(trip.days)) trip.days = [];
    trip.days.forEach(function (d) {
      if (!d.id) d.id = uid();
      if (d.date && !TP.util.parseDate(d.date)) d.date = "";
      if (!Array.isArray(d.stops)) d.stops = [];
      d.stops = d.stops.map(function (s) { return defaultStop(s); });
    });
    return trip;
  }

  /* ---- 영속화 ---- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
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
  function persist() { try { localStorage.setItem(KEY, JSON.stringify({ trips: STATE.trips, activeId: STATE.activeId })); } catch (e) {} }
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
    var t = migrateTrip(Object.assign({ id: uid() }, data || {}));
    t.id = uid();                          // 공유/가져오기는 항상 새 id로 추가(중복 방지)
    STATE.trips.push(t); STATE.activeId = t.id; notify(); return t;
  }
  function updateTrip(id, patch) { var t = trip(id); if (!t) return; Object.assign(t, patch); notify(); }
  function removeTrip(id) {
    STATE.trips = STATE.trips.filter(function (t) { return t.id !== id; });
    if (STATE.activeId === id) STATE.activeId = (STATE.trips[0] && STATE.trips[0].id) || null;
    notify();
  }
  function reset() { STATE.trips = []; STATE.activeId = null; notify(); }

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

  /* ---- 가져오기/내보내기 (활성 여행) ---- */
  function exportJSON() { var t = _t(); return JSON.stringify(t || emptyTrip(), null, 2); }
  function importJSON(text) { addTripData(JSON.parse(text)); }   // 새 여행으로 추가

  TP.store = {
    load: load, subscribe: subscribe,
    trips: trips, trip: trip, activeId: activeId, activeTrip: activeTrip, setActive: setActive,
    addTrip: addTrip, addTripData: addTripData, updateTrip: updateTrip, removeTrip: removeTrip, reset: reset,
    setTitle: setTitle, day: day, dayAt: dayAt, dayIndex: dayIndex, stop: stop,
    addDay: addDay, updateDay: updateDay, removeDay: removeDay,
    addStop: addStop, updateStop: updateStop, removeStop: removeStop,
    reorderStops: reorderStops, moveStop: moveStop,
    exportJSON: exportJSON, importJSON: importJSON,
    defaultStop: defaultStop, defaultDay: defaultDay
  };
})(window.TP = window.TP || {});
