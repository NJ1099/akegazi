/* store.js — 데이터 모델 + localStorage + import/export (네임스페이스 TP.store)
 *
 * 스키마
 *   Trip { id, title, days: [Day] }
 *   Day  { id, date:'YYYY-MM-DD', label, stops: [Stop], wx?:cached }
 *   Stop {
 *     id, type:'airport|transport|attraction|food|cafe|lodging|activity',
 *     title, subtitle, address, lat, lon,
 *     time:'HH:MM'|'', durationLabel,
 *     indoor: true|false|null,           // null = 미상
 *     openHours, closingDays:[0..6], closingNote,
 *     reservation:'none|recommended|required|done', reservationNote,
 *     fixed:bool, photoSpot:bool, note, cost
 *   }
 */
(function (TP) {
  "use strict";
  var uid = TP.util.uid;
  var KEY = "akegazi.trip.v1";

  var STATE = { trip: null };
  var listeners = [];

  function emptyTrip() {
    return { id: uid(), title: "나의 여행", days: [] };
  }

  function defaultStop(partial) {
    return Object.assign({
      id: uid(), type: "attraction", title: "", subtitle: "", address: "",
      lat: null, lon: null, time: "", durationLabel: "",
      indoor: null, openHours: "", closingDays: [], closingNote: "",
      reservation: "none", reservationNote: "", fixed: false, photoSpot: false,
      note: "", cost: ""
    }, partial || {});
  }
  function defaultDay(partial) {
    return Object.assign({ id: uid(), date: "", label: "", stops: [] }, partial || {});
  }

  /* ---- 영속화 ---- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { STATE.trip = migrate(JSON.parse(raw)); return; }
    } catch (e) { /* corrupt → 새로 시작 */ }
    STATE.trip = emptyTrip();
  }
  var save = TP.util.debounce(function () {
    try { localStorage.setItem(KEY, JSON.stringify(STATE.trip)); } catch (e) {}
  }, 250);

  function migrate(trip) {
    if (!trip || typeof trip !== "object") return emptyTrip();
    if (!trip.id) trip.id = uid();
    if (!trip.title) trip.title = "나의 여행";
    if (!Array.isArray(trip.days)) trip.days = [];
    trip.days.forEach(function (d) {
      if (!d.id) d.id = uid();
      if (!Array.isArray(d.stops)) d.stops = [];
      d.stops = d.stops.map(function (s) { return defaultStop(s); });
    });
    return trip;
  }

  /* ---- 구독 / 알림 ---- */
  function subscribe(fn) { listeners.push(fn); }
  function notify() { save(); listeners.forEach(function (fn) { try { fn(STATE.trip); } catch (e) {} }); }

  /* ---- 셀렉터 ---- */
  function trip() { return STATE.trip; }
  function day(id) { return STATE.trip.days.filter(function (d) { return d.id === id; })[0] || null; }
  function dayAt(idx) { return STATE.trip.days[idx] || null; }
  function dayIndex(id) {
    for (var i = 0; i < STATE.trip.days.length; i++) if (STATE.trip.days[i].id === id) return i;
    return -1;
  }
  function stop(dayId, stopId) {
    var d = day(dayId); if (!d) return null;
    return d.stops.filter(function (s) { return s.id === stopId; })[0] || null;
  }

  /* ---- 변경(mutations) ---- */
  function setTitle(t) { STATE.trip.title = t; notify(); }

  function addDay(partial) {
    var days = STATE.trip.days;
    var date = (partial && partial.date) || nextDate();
    var d = defaultDay(Object.assign({ date: date }, partial));
    days.push(d);
    days.sort(byDate);
    notify();
    return d;
  }
  function nextDate() {
    var days = STATE.trip.days;
    if (!days.length) return TP.util.todayISO();
    var last = days.map(function (d) { return d.date; }).filter(Boolean).sort().pop();
    return last ? TP.util.addDaysISO(last, 1) : TP.util.todayISO();
  }
  function byDate(a, b) {
    if (!a.date) return 1; if (!b.date) return -1;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  }
  function updateDay(id, patch) {
    var d = day(id); if (!d) return;
    Object.assign(d, patch);
    if ("date" in patch) STATE.trip.days.sort(byDate);
    notify();
  }
  function removeDay(id) {
    STATE.trip.days = STATE.trip.days.filter(function (d) { return d.id !== id; });
    notify();
  }

  function addStop(dayId, partial) {
    var d = day(dayId); if (!d) return null;
    var s = defaultStop(partial);
    d.stops.push(s);
    notify();
    return s;
  }
  function updateStop(dayId, stopId, patch) {
    var s = stop(dayId, stopId); if (!s) return;
    Object.assign(s, patch);
    notify();
  }
  function removeStop(dayId, stopId) {
    var d = day(dayId); if (!d) return;
    d.stops = d.stops.filter(function (s) { return s.id !== stopId; });
    notify();
  }
  /* 순서 재배열: 새 stop id 배열로 교체 */
  function reorderStops(dayId, orderedIds) {
    var d = day(dayId); if (!d) return;
    var map = {};
    d.stops.forEach(function (s) { map[s.id] = s; });
    var next = [];
    orderedIds.forEach(function (id) { if (map[id]) { next.push(map[id]); delete map[id]; } });
    d.stops.forEach(function (s) { if (map[s.id]) next.push(s); }); // 누락분 보존
    d.stops = next;
    notify();
  }
  /* 인접 이동 (드래그 대체용) */
  function moveStop(dayId, from, to) {
    var d = day(dayId); if (!d) return;
    if (to < 0 || to >= d.stops.length) return;
    var arr = d.stops;
    var item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
    notify();
  }

  /* ---- 가져오기 / 내보내기 ---- */
  function exportJSON() { return JSON.stringify(STATE.trip, null, 2); }
  function importJSON(text) {
    var parsed = JSON.parse(text);          // throw 시 호출부에서 처리
    STATE.trip = migrate(parsed);
    notify();
  }
  function replaceTrip(t) { STATE.trip = migrate(t); notify(); }
  function reset() { STATE.trip = emptyTrip(); notify(); }

  TP.store = {
    load: load, subscribe: subscribe,
    trip: trip, day: day, dayAt: dayAt, dayIndex: dayIndex, stop: stop,
    setTitle: setTitle,
    addDay: addDay, updateDay: updateDay, removeDay: removeDay,
    addStop: addStop, updateStop: updateStop, removeStop: removeStop,
    reorderStops: reorderStops, moveStop: moveStop,
    exportJSON: exportJSON, importJSON: importJSON, replaceTrip: replaceTrip, reset: reset,
    defaultStop: defaultStop, defaultDay: defaultDay
  };
})(window.TP = window.TP || {});
