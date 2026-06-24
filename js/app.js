/* app.js — 오케스트레이션 · 3단계 라우팅(여행→날짜→장소) · 드래그 정렬 (네임스페이스 TP.app) */
(function (TP) {
  "use strict";
  var el = TP.util.el, U = TP.util, store = TP.store, geo = TP.geo, R = TP.render, W = TP.weather;

  var viewEl, titleEl, backEl, shareBtn, sampleBtn, menuBtn;
  var epoch = 0;
  var liveMap = null;
  var dayMode = {};

  function init() {
    viewEl = U.$("#view"); titleEl = U.$("#appTitle"); backEl = U.$("#navBack");
    shareBtn = U.$("#btnShare"); sampleBtn = U.$("#btnSample"); menuBtn = U.$("#btnMenu");
    store.load();
    store.subscribe(function () { render(); });

    backEl.addEventListener("click", goBack);
    titleEl.addEventListener("click", function () { location.hash = "#/"; });
    shareBtn.addEventListener("click", function () { TP.share.shareTrip(); });
    sampleBtn.addEventListener("click", loadSample);
    menuBtn.addEventListener("click", function (e) { e.stopPropagation(); toggleMenu(this); });
    U.$("#fileInput").addEventListener("change", doImport);

    window.addEventListener("hashchange", render);
    render();
    TP.share.checkIncoming();
  }

  /* ---------- 라우터 ---------- */
  function parseHash() {
    var h = (location.hash || "").replace(/^#/, "");
    var m = /^\/trip\/([^/]+)\/day\/(.+)$/.exec(h);
    if (m) return { name: "day", tripId: m[1], dayId: m[2] };
    m = /^\/trip\/([^/]+)$/.exec(h);
    if (m) return { name: "trip", tripId: m[1] };
    return { name: "home" };
  }
  function goBack() {
    var r = parseHash();
    if (r.name === "day") location.hash = "#/trip/" + r.tripId;
    else location.hash = "#/";
  }

  function render() {
    closeMenu();
    epoch++;
    if (liveMap) { TP.maps.destroy(liveMap); liveMap = null; }
    viewEl.innerHTML = "";
    var route = parseHash();

    if (route.name === "day") {
      store.setActive(route.tripId);
      if (!store.activeTrip()) { location.hash = "#/"; return; }
      var d = store.day(route.dayId);
      if (!d) { location.hash = "#/trip/" + route.tripId; return; }
      renderDay(d);
    } else if (route.name === "trip") {
      store.setActive(route.tripId);
      var t = store.trip(route.tripId);
      if (!t) { location.hash = "#/"; return; }
      renderTrip(t);
    } else {
      renderHome();
    }
    configureAppbar(route);
    window.scrollTo(0, 0);
  }

  function configureAppbar(route) {
    backEl.hidden = (route.name === "home");
    shareBtn.hidden = (route.name === "home");
    sampleBtn.hidden = (route.name !== "home");
    titleEl.textContent = "어케가지";
  }

  /* ---------- 홈: 여행 목록 ---------- */
  function renderHome() {
    var list = store.trips();
    viewEl.appendChild(el("div.trip-head", null, [
      el("div.trip-head__title", { text: "내 여행", style: { cursor: "default" } }),
      el("div.trip-head__meta", null, [el("span", { text: list.length ? list.length + "개의 여행" : "나라·일정별로 여행을 만들어 관리하세요" })])
    ]));

    if (!list.length) {
      viewEl.appendChild(el("div.empty", null, [
        el("div.empty__emoji", { html: "🧳" }),
        el("div.empty__title", { text: "첫 여행을 만들어볼까요?" }),
        el("div.empty__desc", { text: "여행을 추가하고 날짜·장소를 넣으면 동선 최적화 · 실시간 날씨 · 우천 시 실내 추천 · 휴무/예약 체크 · 구글맵 길찾기까지 도와드려요." })
      ]));
      viewEl.appendChild(el("div", { style: { marginTop: "18px" } }, [
        el("button.btn.btn--block", { onclick: newTrip }, ["+ 새 여행"]),
        el("button.btn.btn--block.btn--ghost", { style: { marginTop: "10px" }, onclick: loadSample }, ["✨ 예시(오사카 3일) 불러오기"])
      ]));
      return;
    }

    list.forEach(function (t) {
      var stopCount = t.days.reduce(function (a, d) { return a + d.stops.length; }, 0);
      var range = dateRange(t.days);
      var card = el("button.trip-card", { onclick: function () { location.hash = "#/trip/" + t.id; } }, [
        el("div.trip-card__main", null, [
          el("div.trip-card__title", { text: t.title || "이름 없는 여행" }),
          el("div.trip-card__meta", { text: (t.region ? "📍 " + t.region + " · " : "") + (range || "날짜 미정") + " · " + t.days.length + "일 · " + stopCount + "곳" })
        ]),
        el("span.trip-card__go", { html: "›" })
      ]);
      card.appendChild(el("button.card-del", {
        title: "여행 삭제", "aria-label": "여행 삭제",
        onclick: function (e) { e.stopPropagation(); if (confirm("‘" + (t.title || "이 여행") + "’ 을(를) 삭제할까요? 되돌릴 수 없습니다.")) store.removeTrip(t.id); }
      }, ["✕"]));
      viewEl.appendChild(card);
    });

    viewEl.appendChild(el("button.btn.btn--block", { style: { marginTop: "6px" }, onclick: newTrip }, ["+ 새 여행"]));
  }

  /* ---------- 여행: 날짜 목록 ---------- */
  function renderTrip(trip) {
    var titleInput = el("input.trip-head__title", {
      value: trip.title, "aria-label": "여행 이름",
      onchange: function () { store.setTitle(this.value.trim() || "새 여행"); }
    });
    var totalStops = trip.days.reduce(function (a, d) { return a + d.stops.length; }, 0);
    var range = dateRange(trip.days);
    viewEl.appendChild(el("div.trip-head", null, [
      el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
        titleInput,
        el("button.day-hero__edit", { title: "여행 정보(지역·통화) 편집", onclick: function () { TP.editor.openTripModal(trip.id); } }, ["✎"])
      ]),
      el("div.trip-head__meta", null, [
        trip.region ? el("span", { text: "📍 " + trip.region }) : null,
        el("span", { text: range || "날짜를 추가해 일정을 시작하세요" }),
        trip.days.length ? el("span", { text: "· " + trip.days.length + "일 · " + totalStops + "곳" }) : null,
        el("span", { text: "· " + TP.money.cfg(trip.currency).sym + " " + TP.money.cfg(trip.currency).name })
      ])
    ]));
    ensureFx(trip);
    var tripBud = R.budgetBanner(R.tripBudget(trip), trip.currency || "JPY", "여행 총 예산", trip.homeCurrency || "");
    if (tripBud) viewEl.appendChild(tripBud);

    if (!trip.days.length) {
      viewEl.appendChild(el("div.empty", null, [
        el("div.empty__emoji", { html: "🗓️" }),
        el("div.empty__title", { text: "이 여행에 날짜를 추가하세요" }),
        el("div.empty__desc", { text: "날짜를 추가하고 가고 싶은 곳·먹고 싶은 곳·숙소·공항을 넣어보세요." })
      ]));
      viewEl.appendChild(el("button.btn.btn--block", { style: { marginTop: "18px" }, onclick: function () { TP.editor.openDayModal(); } }, ["+ 날짜 추가"]));
      return;
    }

    var myEpoch = epoch;
    trip.days.forEach(function (d, i) {
      var card = el("button.day-card", { onclick: function () { location.hash = "#/trip/" + trip.id + "/day/" + d.id; } }, [
        el("div.day-card__top", null, [
          el("div.day-card__no", { text: "Day " + (i + 1) }),
          el("div.day-card__date", { text: U.fmtDate(d.date) })
        ]),
        d.label ? el("div.day-card__label", { text: d.label }) : null,
        el("div.day-card__foot", null, [weatherChip(d, myEpoch), el("div.day-card__count", { text: d.stops.length + "곳" })])
      ]);
      (function (dd, no) {
        card.appendChild(el("button.card-del", {
          title: "날짜 삭제", "aria-label": "Day " + no + " 삭제",
          onclick: function (e) { e.stopPropagation(); if (confirm("Day " + no + " 을(를) 삭제할까요?" + (dd.stops.length ? " (장소 " + dd.stops.length + "곳 포함)" : "") + " 되돌릴 수 없습니다.")) store.removeDay(dd.id); }
        }, ["✕"]));
      })(d, i + 1);
      viewEl.appendChild(card);
    });
    viewEl.appendChild(el("button.btn.btn--block.btn--ghost", { style: { marginTop: "6px" }, onclick: function () { TP.editor.openDayModal(); } }, ["+ 날짜 추가"]));
  }

  function weatherChip(day, myEpoch) {
    var chip = el("div.day-card__weather", null, ["⏳"]);
    W.getDayWeather(day).then(function (wx) {
      if (myEpoch !== epoch || !chip.isConnected) return;
      chip.innerHTML = "";
      if (!wx.available) { chip.appendChild(document.createTextNode("🌡️ –")); return; }
      chip.appendChild(document.createTextNode(wx.emoji + " "));
      chip.appendChild(el("span", { text: Math.round(wx.tmax) + "°/" + Math.round(wx.tmin) + "°" }));
      if (wx.precip != null && wx.precip > 0) chip.appendChild(el("span.mm", { text: " " + wx.precip + "mm" }));
      if (wx.rainy) { var p = chip.parentNode; if (p) p.appendChild(el("div.day-card__rainwarn", { text: "🌧️ 실내 위주" })); }
    });
    return chip;
  }

  /* ---------- 날짜: 장소 타임라인 ---------- */
  function renderDay(day) {
    var idx = store.dayIndex(day.id);
    ensureRoads(day);   // 구글 실거리 비동기 로드(교통비 정확도)
    viewEl.appendChild(el("div.day-hero", null, [
      el("div.day-hero__main", null, [
        el("div.day-hero__eyebrow", { text: "DAY " + (idx + 1) }),
        el("div.day-hero__title", { text: day.label || U.fmtDate(day.date) }),
        el("div.day-hero__date", { text: U.fmtDate(day.date) })
      ]),
      el("button.day-hero__edit", { title: "날짜·코스 편집", onclick: function () { TP.editor.openDayModal(day.id); } }, ["✎ 편집"])
    ]));

    var wxSlot = el("div"); wxSlot.appendChild(R.weatherBanner(null));
    var rainSlot = el("div");
    viewEl.appendChild(wxSlot); viewEl.appendChild(rainSlot);

    // 시간 일정(공항 도착/출발 기준 ETA·비행기 마감) 배너
    var schedule = geo.buildSchedule(day.stops);
    var schedSlot = el("div");
    var sb = R.scheduleBanner(schedule);
    if (sb) schedSlot.appendChild(sb);
    viewEl.appendChild(schedSlot);

    var mode = dayMode[day.id] || "timeline";
    viewEl.appendChild(el("div.segmented", null, [
      el("button" + (mode === "timeline" ? ".is-active" : ""), { onclick: function () { dayMode[day.id] = "timeline"; render(); } }, ["🗓 타임라인"]),
      el("button" + (mode === "map" ? ".is-active" : ""), { onclick: function () { dayMode[day.id] = "map"; render(); } }, ["🗺 지도"])
    ]));

    var bodySlot = el("div");
    viewEl.appendChild(bodySlot);

    var myEpoch = epoch;
    if (mode === "map") renderDayMap(day, idx, bodySlot);
    else drawTimeline(day, idx, bodySlot, false, schedule);

    W.getDayWeather(day).then(function (wx) {
      if (myEpoch !== epoch || !wxSlot.isConnected) return;
      wxSlot.innerHTML = ""; wxSlot.appendChild(R.weatherBanner(wx));
      rainSlot.innerHTML = "";
      var rb = R.rainBanner(W.indoorPlan(day, wx));
      if (rb) rainSlot.appendChild(rb);
      if (wx && wx.rainy && mode === "timeline") drawTimeline(day, idx, bodySlot, true, schedule);
    });

    var dtrip = store.activeTrip();
    var dcur = (dtrip && dtrip.currency) || "JPY", dhome = (dtrip && dtrip.homeCurrency) || "";
    ensureFx(dtrip);
    var dayBud = R.budgetBanner(R.dayBudget(day, dcur), dcur, "이 날 예산", dhome);
    if (dayBud) viewEl.appendChild(dayBud);

    viewEl.appendChild(el("div", { style: { marginTop: "16px", display: "flex", gap: "10px" } }, [
      el("button.btn.btn--ghost.btn--sm", { style: { flex: "1" }, onclick: function () { optimize(day); } }, ["🧭 동선 최적화"]),
      el("button.btn.btn--ghost.btn--sm", { style: { flex: "1" }, onclick: function () { allDirections(day); } }, ["🗺 전체 길찾기"])
    ]));
    viewEl.appendChild(el("button.btn.btn--block", { style: { marginTop: "10px" }, onclick: function () { TP.editor.openStopModal(day.id); } }, ["+ 장소 추가"]));
  }

  function drawTimeline(day, idx, target, rainy, schedule) {
    target.innerHTML = "";
    var _t = store.activeTrip();
    var ctx = { dayIndex: idx, rainy: !!rainy, schedule: schedule, currency: (_t && _t.currency) || "JPY", homeCurrency: (_t && _t.homeCurrency) || "", onEdit: function (sid) { TP.editor.openStopModal(day.id, sid); } };
    var tl = R.timeline(day, ctx);
    target.appendChild(tl);
    if (day.stops.length > 1) attachDragReorder(tl, day.id);
  }

  function renderDayMap(day, idx, target) {
    target.innerHTML = "";
    var geoStops = day.stops.filter(geo.hasCoord);
    if (!geoStops.length) {
      target.appendChild(el("div.empty", null, [
        el("div.empty__emoji", { html: "🗺️" }),
        el("div.empty__title", { text: "지도에 표시할 위치가 없어요" }),
        el("div.empty__desc", { text: "장소 편집에서 위치를 검색하거나 지도에서 찍어 좌표를 넣으면 동선이 번호 순서로 그려져요." })
      ]));
      return;
    }
    var wrap = el("div.mapwrap");
    var mapDiv = el("div.day-map");
    wrap.appendChild(mapDiv);
    target.appendChild(wrap);

    var color = TP.maps.DOT[idx % TP.maps.DOT.length];
    var legend = el("div.map-legend");
    geoStops.forEach(function (s, i) {
      legend.appendChild(el("div.map-legend__item", null, [
        el("span.map-legend__dot", { style: { background: color } }),
        el("span", { text: (i + 1) + ". " + (s.title || "장소") })
      ]));
    });
    target.appendChild(legend);

    var myEpoch = epoch;
    setTimeout(function () {
      if (myEpoch !== epoch || !mapDiv.isConnected) return;
      var map = TP.maps.renderRoute(mapDiv, day.stops, { color: color });
      if (myEpoch !== epoch) { TP.maps.destroy(map); return; }
      liveMap = map;
    }, 0);
  }

  /* ---------- 드래그 정렬 (포인터 기반: 터치+마우스) ----------
     document 레벨 리스너로 캡처 의존성 없이 견고하게 동작. */
  function attachDragReorder(listEl, dayId) {
    listEl.addEventListener("pointerdown", function (e) {
      var handle = e.target.closest && e.target.closest(".stop__drag");
      if (!handle) return;
      var item = handle.closest(".tl-item");
      if (!item) return;
      e.preventDefault();
      var myEpoch = epoch;                 // 재렌더 감지용 스냅샷
      item.classList.add("dragging");
      var moved = false;

      function cleanup() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      }
      function onMove(ev) {
        if (myEpoch !== epoch || !listEl.isConnected) return;   // 재렌더되면 무시
        moved = true;
        var after = afterElement(listEl, ev.clientY);
        if (after == null) { if (listEl.lastChild !== item) listEl.appendChild(item); }
        else if (after !== item) listEl.insertBefore(item, after);
      }
      function onUp() {
        cleanup();
        item.classList.remove("dragging");
        if (!moved || myEpoch !== epoch || !listEl.isConnected) return;   // detached/stale → 저장 안 함
        var ids = Array.prototype.map.call(listEl.querySelectorAll(".tl-item"), function (it) { return it.dataset.stop; });
        store.reorderStops(dayId, ids);   // notify → 재렌더
        // 드래그 직후 합성 click이 카드 편집을 열지 않도록 1회 삼킴
        var swallow = function (ev2) { ev2.stopPropagation(); ev2.preventDefault(); document.removeEventListener("click", swallow, true); };
        document.addEventListener("click", swallow, true);
        setTimeout(function () { document.removeEventListener("click", swallow, true); }, 350);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }
  function afterElement(listEl, y) {
    var els = Array.prototype.slice.call(listEl.querySelectorAll(".tl-item:not(.dragging)"));
    var closest = null, closestOffset = -Infinity;
    els.forEach(function (child) {
      var box = child.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closestOffset) { closestOffset = offset; closest = child; }
    });
    return closest;
  }

  /* ---------- 액션 ---------- */
  function optimize(day) {
    var res = geo.optimizeOrder(day.stops);
    if (!res.improved) { U.toast(res.reason === "too-few-coords" ? "동선 최적화는 좌표 있는 장소 3곳 이상에서 동작해요" : "이미 효율적인 동선이에요"); return; }
    store.reorderStops(day.id, res.order);
    U.toast("동선 최적화: " + geo.fmtDist(res.before) + " → " + geo.fmtDist(res.after));
  }
  function allDirections(day) {
    var r = geo.multiDirURL(day.stops, "transit");
    if (!r || !r.url) { U.toast("좌표가 있는 장소가 2곳 이상 필요해요"); return; }
    if (r.dropped > 0) U.toast("경유지가 많아 앞 " + (r.total - r.dropped) + "곳만 길찾기에 포함돼요 (" + r.dropped + "곳 생략)");
    window.open(r.url, "_blank", "noopener");
  }

  /* ---------- 여행 생성/예시/가져오기/내보내기/전체삭제 ---------- */
  function newTrip() { TP.editor.openTripModal(); }
  function loadSample() { var t = store.addTripData(TP.sample()); location.hash = "#/trip/" + t.id; U.toast("오사카 예시 여행을 추가했어요"); }
  function doExport() {
    var data = store.exportJSON();
    var blob = new Blob([data], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ((store.activeTrip() && store.activeTrip().title) || "trip").replace(/[^\w가-힣ㄱ-ㅎ\- ]/g, "") + ".json";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
    U.toast("JSON으로 내보냈어요");
  }
  function doImport(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try { store.importJSON(reader.result); location.hash = "#/trip/" + store.activeId(); U.toast("여행을 가져왔어요"); }
      catch (err) { U.toast("JSON 형식이 올바르지 않아요"); }
    };
    reader.readAsText(file); e.target.value = "";
  }
  function clearAll() {
    if (!store.trips().length) { U.toast("지울 여행이 없어요"); return; }
    if (!confirm("모든 여행을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?")) return;
    store.reset(); location.hash = "#/"; U.toast("전체 삭제했어요");
  }

  /* ---------- 더보기(⋯) 메뉴 (라우트별) ---------- */
  function toggleMenu(anchor) {
    if (U.$("#appbarMenu")) { closeMenu(); return; }
    var route = parseHash();
    var items = [];
    if (route.name === "home") {
      items.push(["📥 가져오기 (JSON)", function () { U.$("#fileInput").click(); }]);
      items.push(["🗑 전체 지우기", clearAll]);
    } else {
      items.push(["📤 내보내기 (JSON)", doExport]);
      if (route.name === "trip") items.push(["🗑 이 여행 삭제", function () { var t = store.activeTrip(); if (t && confirm("‘" + (t.title || "이 여행") + "’ 을(를) 삭제할까요? 되돌릴 수 없습니다.")) { store.removeTrip(t.id); location.hash = "#/"; } }]);
    }
    var menu = el("div.appbar-menu#appbarMenu", { role: "menu" }, items.map(function (it) {
      return el("button.appbar-menu__item", { role: "menuitem", onclick: function () { closeMenu(); it[1](); } }, [it[0]]);
    }));
    document.body.appendChild(menu);
    var rect = anchor.getBoundingClientRect();
    menu.style.top = (rect.bottom + 6) + "px";
    menu.style.right = Math.max(8, window.innerWidth - rect.right) + "px";
    anchor.setAttribute("aria-expanded", "true");
    setTimeout(function () { document.addEventListener("click", onDocClick, true); document.addEventListener("keydown", onMenuKey); }, 0);
  }
  function onDocClick(e) { var m = U.$("#appbarMenu"); if (m && !m.contains(e.target)) closeMenu(); }
  function onMenuKey(e) { if (e.key === "Escape") closeMenu(); }
  function closeMenu() {
    var m = U.$("#appbarMenu"); if (m) m.parentNode.removeChild(m);
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("keydown", onMenuKey);
  }

  /* ---------- 구글 실거리 로드(교통비 정확도 → 재렌더로 반영) ---------- */
  function ensureRoads(day) {
    if (!day || !TP.gmaps || !TP.gmaps.hasKey()) return;
    var stops = day.stops, myEpoch = epoch, pending = [];
    for (var i = 1; i < stops.length; i++) {
      var s = stops[i], prev = stops[i - 1];
      if (s.arriveBy === "walk" || s.arriveBy === "none") continue;
      if (typeof s.fareAmount === "number") continue;          // 직접 입력이면 거리 불필요
      if (!geo.hasCoord(prev) || !geo.hasCoord(s)) continue;
      var mode = (s.arriveBy === "taxi") ? "taxi" : "transit";
      if (geo.cachedRoad(prev, s, mode) === undefined) pending.push(geo.ensureRoad(prev, s, mode));
    }
    if (pending.length) Promise.all(pending).then(function () { if (myEpoch === epoch) render(); });
  }

  /* ---------- 환율 로드(필요 시 1회 → 재렌더로 실값 반영) ---------- */
  function ensureFx(trip) {
    if (!trip) return;
    var hc = trip.homeCurrency;
    if (!hc || hc === trip.currency) return;
    if (TP.money.getCachedRate(trip.currency, hc) != null) return;   // 이미 조회됨
    var myEpoch = epoch;
    TP.money.ensureRate(trip.currency, hc).then(function () { if (myEpoch === epoch) render(); });
  }

  /* ---------- 유틸 ---------- */
  function dateRange(days) {
    var ds = days.map(function (d) { return d.date; }).filter(Boolean).sort();
    if (!ds.length) return "";
    if (ds.length === 1) return U.fmtDate(ds[0]);
    return U.fmtDate(ds[0]) + " ~ " + U.fmtDate(ds[ds.length - 1]);
  }

  TP.app = { init: init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window.TP = window.TP || {});
