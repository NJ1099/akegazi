/* app.js — 오케스트레이션 · 라우팅 · 날씨 로딩 · 동선 최적화 (네임스페이스 TP.app) */
(function (TP) {
  "use strict";
  var el = TP.util.el, U = TP.util, store = TP.store, R = TP.render, geo = TP.geo, W = TP.weather;

  var viewEl, titleEl, backEl;
  var epoch = 0;          // 비동기 콜백 staleness 가드
  var liveMap = null;     // 현재 Leaflet 인스턴스
  var dayMode = {};       // dayId -> 'timeline' | 'map'

  function init() {
    viewEl = U.$("#view"); titleEl = U.$("#appTitle"); backEl = U.$("#navBack");
    store.load();
    store.subscribe(function () { render(); });

    backEl.addEventListener("click", function () { location.hash = "#/"; });
    titleEl.addEventListener("click", function () { location.hash = "#/"; });
    U.$("#btnShare").addEventListener("click", function () { TP.share.shareTrip(); });
    U.$("#btnSample").addEventListener("click", loadSample);
    U.$("#btnMenu").addEventListener("click", function (e) { e.stopPropagation(); toggleMenu(this); });
    U.$("#fileInput").addEventListener("change", doImport);

    window.addEventListener("hashchange", render);
    render();
    TP.share.checkIncoming();   // 공유 링크(#trip=...)로 들어왔으면 불러오기 모달
  }

  /* ---------- 더보기(⋯) 메뉴 ---------- */
  function toggleMenu(anchor) {
    if (U.$("#appbarMenu")) { closeMenu(); return; }
    var menu = el("div.appbar-menu#appbarMenu", { role: "menu" }, [
      el("button.appbar-menu__item", { role: "menuitem", onclick: function () { closeMenu(); U.$("#fileInput").click(); } }, ["📥 가져오기 (JSON)"]),
      el("button.appbar-menu__item", { role: "menuitem", onclick: function () { closeMenu(); doExport(); } }, ["📤 내보내기 (JSON)"])
    ]);
    document.body.appendChild(menu);
    var r = anchor.getBoundingClientRect();
    menu.style.top = (r.bottom + 6) + "px";
    menu.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    anchor.setAttribute("aria-expanded", "true");
    setTimeout(function () { document.addEventListener("click", onDocClick, true); document.addEventListener("keydown", onMenuKey); }, 0);
  }
  function onDocClick(e) { var m = U.$("#appbarMenu"); if (m && !m.contains(e.target)) closeMenu(); }
  function onMenuKey(e) { if (e.key === "Escape") closeMenu(); }
  function closeMenu() {
    var m = U.$("#appbarMenu"); if (m) m.parentNode.removeChild(m);
    var b = U.$("#btnMenu"); if (b) b.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("keydown", onMenuKey);
  }

  /* ---------- 라우터 ---------- */
  function parseHash() {
    var h = (location.hash || "").replace(/^#/, "");
    var m = /^\/day\/(.+)$/.exec(h);
    if (m) return { name: "day", id: m[1] };
    return { name: "home" };
  }

  function render() {
    closeMenu();                       // 어떤 경로(뒤로가기 등)로 와도 ⋯메뉴/리스너 정리
    epoch++;
    if (liveMap) { TP.maps.destroy(liveMap); liveMap = null; }
    viewEl.innerHTML = "";
    var route = parseHash();
    if (route.name === "day") {
      var d = store.day(route.id);
      if (!d) { location.hash = "#/"; return; }
      renderDay(d);
    } else {
      renderHome();
    }
    window.scrollTo(0, 0);
  }

  /* ---------- 홈 ---------- */
  function renderHome() {
    backEl.hidden = true;
    titleEl.textContent = "어케가지";
    var trip = store.trip();

    var titleInput = el("input.trip-head__title", {
      value: trip.title, "aria-label": "여행 제목",
      onchange: function () { store.setTitle(this.value.trim() || "나의 여행"); }
    });
    var totalStops = trip.days.reduce(function (a, d) { return a + d.stops.length; }, 0);
    var range = dateRange(trip.days);
    var head = el("div.trip-head", null, [
      titleInput,
      el("div.trip-head__meta", null, [
        el("span", { text: range || "날짜를 추가해 일정을 시작하세요" }),
        trip.days.length ? el("span", { text: "· " + trip.days.length + "일 · " + totalStops + "곳" }) : null
      ])
    ]);
    viewEl.appendChild(head);

    if (!trip.days.length) {
      viewEl.appendChild(el("div.empty", null, [
        el("div.empty__emoji", { html: "🧳" }),
        el("div.empty__title", { text: "여행 일정을 시작해볼까요?" }),
        el("div.empty__desc", { text: "날짜를 추가하고 가고 싶은 곳·먹고 싶은 곳·숙소·공항을 넣으면, 동선 최적화 · 실시간 날씨 · 우천 시 실내 추천 · 휴무/예약 체크 · 구글맵 길찾기까지 자동으로 도와드려요." })
      ]));
      viewEl.appendChild(el("div", { style: { marginTop: "18px" } }, [
        el("button.btn.btn--block", { onclick: function () { TP.editor.openDayModal(); } }, ["+ 날짜 추가"]),
        el("button.btn.btn--block.btn--ghost", { style: { marginTop: "10px" }, onclick: loadSample }, ["✨ 예시(오사카 3일) 불러오기"])
      ]));
      return;
    }

    var myEpoch = epoch;
    trip.days.forEach(function (d, i) {
      var card = el("button.day-card", { onclick: function () { location.hash = "#/day/" + d.id; } }, [
        el("div.day-card__top", null, [
          el("div.day-card__no", { text: "Day " + (i + 1) }),
          el("div.day-card__date", { text: U.fmtDate(d.date) })
        ]),
        d.label ? el("div.day-card__label", { text: d.label }) : null,
        el("div.day-card__foot", null, [
          weatherChip(d, myEpoch),
          el("div.day-card__count", { text: d.stops.length + "곳" })
        ])
      ]);
      viewEl.appendChild(card);
    });

    viewEl.appendChild(el("button.btn.btn--block.btn--ghost", {
      style: { marginTop: "6px" }, onclick: function () { TP.editor.openDayModal(); }
    }, ["+ 날짜 추가"]));
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
      if (wx.rainy) {
        var p = chip.parentNode;
        if (p) p.appendChild(el("div.day-card__rainwarn", { text: "🌧️ 실내 위주" }));
      }
    });
    return chip;
  }

  /* ---------- Day 상세 ---------- */
  function renderDay(day) {
    backEl.hidden = false;
    var idx = store.dayIndex(day.id);
    titleEl.textContent = "Day " + (idx + 1);

    viewEl.appendChild(el("div.day-hero", null, [
      el("div.day-hero__eyebrow", { text: "DAY " + (idx + 1) }),
      el("div.day-hero__title", { text: day.label || U.fmtDate(day.date) }),
      el("div.day-hero__date", { text: U.fmtDate(day.date) + (day.label ? "" : "") })
    ]));

    // 날씨 + 우천 배너 (자리만 잡고 비동기 채움)
    var wxSlot = el("div");
    wxSlot.appendChild(R.weatherBanner(null));
    var rainSlot = el("div");
    viewEl.appendChild(wxSlot);
    viewEl.appendChild(rainSlot);

    // 세그먼트 토글
    var mode = dayMode[day.id] || "timeline";
    var seg = el("div.segmented", null, [
      el("button" + (mode === "timeline" ? ".is-active" : ""), { onclick: function () { dayMode[day.id] = "timeline"; render(); } }, ["🗓 타임라인"]),
      el("button" + (mode === "map" ? ".is-active" : ""), { onclick: function () { dayMode[day.id] = "map"; render(); } }, ["🗺 지도"])
    ]);
    viewEl.appendChild(seg);

    var bodySlot = el("div");
    viewEl.appendChild(bodySlot);

    // 본문 즉시 렌더 (날씨 응답 기다리지 않음)
    var myEpoch = epoch;
    if (mode === "map") renderDayMap(day, idx, bodySlot);
    else drawTimeline(day, idx, bodySlot, false);

    // 날씨 → 날씨 배너 + 우천 추천 배너 + (비 예보 시) 타임라인 우천주의 갱신
    W.getDayWeather(day).then(function (wx) {
      if (myEpoch !== epoch || !wxSlot.isConnected) return;
      wxSlot.innerHTML = ""; wxSlot.appendChild(R.weatherBanner(wx));
      rainSlot.innerHTML = "";
      var rb = R.rainBanner(W.indoorPlan(day, wx));
      if (rb) rainSlot.appendChild(rb);
      if (wx && wx.rainy && mode === "timeline") drawTimeline(day, idx, bodySlot, true);
    });

    // 액션 바
    viewEl.appendChild(el("div", { style: { marginTop: "16px", display: "flex", gap: "10px" } }, [
      el("button.btn.btn--ghost.btn--sm", { style: { flex: "1" }, onclick: function () { optimize(day); } }, ["🧭 동선 최적화"]),
      el("button.btn.btn--ghost.btn--sm", { style: { flex: "1" }, onclick: function () { allDirections(day); } }, ["🗺 전체 길찾기"])
    ]));

    viewEl.appendChild(el("button.btn.btn--block", {
      style: { marginTop: "10px" }, onclick: function () { TP.editor.openStopModal(day.id); }
    }, ["+ 장소 추가"]));
  }

  function drawTimeline(day, idx, target, rainy) {
    target.innerHTML = "";
    var ctx = { dayIndex: idx, rainy: !!rainy, onEdit: function (sid) { TP.editor.openStopModal(day.id, sid); } };
    target.appendChild(R.timeline(day, ctx));
  }

  function renderDayMap(day, idx, target) {
    target.innerHTML = "";
    var geoStops = day.stops.filter(geo.hasCoord);
    if (!geoStops.length) {
      target.appendChild(el("div.empty", null, [
        el("div.empty__emoji", { html: "🗺️" }),
        el("div.empty__title", { text: "지도에 표시할 위치가 없어요" }),
        el("div.empty__desc", { text: "장소 편집에서 위치를 검색하거나 지도에서 찍어 좌표를 넣으면 구글지도에 동선이 그려져요." })
      ]));
      return;
    }
    // 구글맵 키리스 임베드 (familiar + 고품질, API 키 불필요). 로드 실패 시 폴백.
    var embed = TP.maps.gmapEmbedURL(day.stops);
    var wrap = el("div.mapwrap");
    var ph = el("div.map-loading", null, [el("span.spin"), "  구글 지도 불러오는 중…"]);
    var iframe = el("iframe.day-map", { src: embed, title: "구글 지도", allowfullscreen: "", referrerpolicy: "no-referrer-when-downgrade" });
    var done = false;
    iframe.addEventListener("load", function () { done = true; if (ph.parentNode) ph.parentNode.removeChild(ph); });
    wrap.appendChild(iframe);
    wrap.appendChild(ph);
    target.appendChild(wrap);
    setTimeout(function () {
      if (done || !wrap.isConnected) return;                  // 6초 내 미로드 → 새 탭 안내 폴백
      wrap.innerHTML = "";
      wrap.appendChild(el("div.map-loading.map-loading--fail", null, [
        el("div", { text: "구글 지도를 불러오지 못했어요." }),
        el("button.btn.btn--sm", { onclick: function () { allDirections(day); } }, ["🗺 새 탭에서 길찾기 열기"])
      ]));
    }, 6000);

    // 범례 — 지도에 실제 표시되는 앞 EMBED_MAX곳만 번호 매김
    var color = TP.maps.DOT[idx % TP.maps.DOT.length];
    var shown = geoStops.slice(0, TP.maps.EMBED_MAX);
    var legend = el("div.map-legend");
    shown.forEach(function (s, i) {
      legend.appendChild(el("div.map-legend__item", null, [
        el("span.map-legend__dot", { style: { background: color } }),
        el("span", { text: (i + 1) + ". " + s.title })
      ]));
    });
    if (geoStops.length > shown.length) {
      legend.appendChild(el("div.map-legend__item", null, [
        el("span", { text: "외 " + (geoStops.length - shown.length) + "곳은 지도에 표시되지 않아요" })
      ]));
    }
    target.appendChild(legend);
  }

  /* ---------- 액션 ---------- */
  function optimize(day) {
    var res = geo.optimizeOrder(day.stops);
    if (!res.improved) {
      U.toast(res.reason === "too-few-coords"
        ? "동선 최적화는 좌표 있는 장소 3곳 이상에서 동작해요"
        : "이미 효율적인 동선이에요");
      return;
    }
    store.reorderStops(day.id, res.order);
    U.toast("동선 최적화: " + geo.fmtDist(res.before) + " → " + geo.fmtDist(res.after));
  }
  function allDirections(day) {
    var r = geo.multiDirURL(day.stops, "transit");
    if (!r || !r.url) { U.toast("좌표가 있는 장소가 2곳 이상 필요해요"); return; }
    if (r.dropped > 0) U.toast("경유지가 많아 앞 " + (r.total - r.dropped) + "곳만 길찾기에 포함돼요 (" + r.dropped + "곳 생략)");
    window.open(r.url, "_blank", "noopener");
  }

  /* ---------- 가져오기/내보내기/예시 ---------- */
  function doExport() {
    var data = store.exportJSON();
    var blob = new Blob([data], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (store.trip().title || "trip").replace(/[^\w가-힣ㄱ-ㅎ\- ]/g, "") + ".json";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
    U.toast("JSON으로 내보냈어요");
  }
  function doImport(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try { store.importJSON(reader.result); location.hash = "#/"; U.toast("불러왔어요"); }
      catch (err) { U.toast("JSON 형식이 올바르지 않아요"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }
  function loadSample() {
    var t = store.trip();
    if (t.days.length && !confirm("현재 일정을 예시(오사카 3일)로 교체합니다. 계속할까요?")) return;
    store.replaceTrip(TP.sample());
    location.hash = "#/";
    U.toast("오사카 예시 일정을 불러왔어요");
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
