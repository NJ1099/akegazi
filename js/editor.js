/* editor.js — 장소/날짜 추가·편집 모달 (네임스페이스 TP.editor) */
(function (TP) {
  "use strict";
  var el = TP.util.el, U = TP.util, store = TP.store;

  var TYPES = [
    ["attraction", "🗼 가고 싶은 곳"], ["food", "🍴 먹고 싶은 곳"], ["cafe", "☕ 카페"],
    ["activity", "🎡 체험"], ["lodging", "🏨 숙소"], ["transport", "🚆 이동"], ["airport", "✈️ 공항"]
  ];
  var TYPE_SHORT = { attraction: "🗼 관광", food: "🍴 맛집", cafe: "☕ 카페", activity: "🎡 체험", lodging: "🏨 숙소", transport: "🚆 이동", airport: "✈️ 공항" };
  var NAME_Q = { lodging: "어디서 묵나요?", food: "어디서 먹나요?", cafe: "어느 카페인가요?", airport: "어느 공항인가요?", transport: "어떻게 이동하나요?" };
  var RESV = [["none", "불필요"], ["recommended", "권장"], ["required", "필수"], ["done", "완료"]];

  /* ---------- 공용 모달 ---------- */
  function modal(buildContent, onClose) {
    var root = document.getElementById("modalRoot");
    var prevFocus = document.activeElement;
    var prevOverflow = document.body.style.overflow;
    var closed = false;
    var box = el("div.modal", { role: "dialog", "aria-modal": "true", tabindex: "-1" });
    var back = el("div.modal-back", {
      onclick: function (e) { if (e.target === back) close(); }
    }, [box]);
    box.appendChild(el("div.modal__grip"));

    function focusables() {
      return U.$$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', box);
    }
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;            // 배경 스크롤 복원
      if (typeof onClose === "function") { try { onClose(); } catch (e) {} }
      if (back.parentNode) back.parentNode.removeChild(back);
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} } // 트리거로 포커스 복원
    }
    function onKey(e) {
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab") return;                            // Tab 포커스 트랩
      var f = focusables();
      if (!f.length) { e.preventDefault(); box.focus(); return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";                  // 배경 스크롤 잠금
    buildContent(box, close);
    root.appendChild(back);
    var title = box.querySelector(".modal__title");           // 제목을 aria-labelledby로 연결
    if (title) { if (!title.id) title.id = U.uid(); box.setAttribute("aria-labelledby", title.id); }
    (focusables()[0] || box).focus();                         // 첫 입력에 포커스
    return close;
  }

  function field(labelText, control, hint) {
    return el("div.field", null, [
      el("label", null, [labelText, hint ? el("span.hint", { text: "  " + hint }) : null]),
      control
    ]);
  }

  /* ---------- 장소 모달 ---------- */
  /* opts.type: 새 장소의 기본 종류(여행 화면의 '숙소 추가'는 dayId 없이 lodging 으로 연다 —
   * 숙박 기간을 고르면 그 날짜들이 Day 로 만들어지고 체크인 날에 숙소가 들어간다). */
  /* opts.wish: 보관함(날짜 미정) 장소로 연다 — dayId 없이. 저장할 때 「언제 갈까요?」에서 날짜를 고르면 그 날로 옮겨진다. */
  function openStopModal(dayId, stopId, opts) {
    opts = opts || {};
    var wishMode = !!opts.wish;
    if (wishMode) dayId = null;
    var existing = wishMode ? (stopId ? store.wishStop(stopId) : null) : ((stopId && dayId) ? store.stop(dayId, stopId) : null);
    var f = Object.assign(store.defaultStop(), existing ? JSON.parse(JSON.stringify(existing)) : (opts.type ? { type: opts.type } : {}));
    var pickMap = null;
    var trip = store.activeTrip();
    var cur = (trip && trip.currency) || "JPY";
    var homeCur = (trip && trip.homeCurrency) || "";    // 내 통화(양방향 입력·환산용)
    var dayObj = store.day(dayId);
    var prevStop = null;                                         // 교통비 추정용: 직전 장소
    if (dayObj) {
      // 동선 기준(숙소 출발 칸 포함) — 타임라인·예산과 같은 "직전 장소"를 봐야 구간 요금이 어긋나지 않는다
      var route = store.routeOf(trip, dayObj).filter(function (s) { return s.virtual !== "end"; });
      if (existing) { var ei = route.indexOf(existing); prevStop = ei > 0 ? route[ei - 1] : null; }
      else { prevStop = route.length ? route[route.length - 1] : null; }
    }

    modal(function (box, close) {
      box.appendChild(el("div.modal__title", null, [wishMode ? (existing ? "보관함 장소" : "보관함에 담기") : existing ? "장소 편집" : (f.type === "lodging" && !dayId ? "숙소 추가" : "장소 추가"), TP.help.btn("stop")]));

      // 이름 (입력하면 위치 자동 검색)
      var results = el("div.geo-results");
      var titleInput = el("input.input", { value: f.title, placeholder: "예: 도쿄타워, 이치란 라멘", autocomplete: "off", oninput: function () { f.title = this.value; } });
      var pickedLabel = el("div.geo-picked", { html: "" });

      // 종류 칩 — 한 줄 가로 스크롤(7개가 세 줄로 접히던 것을 한 줄로)
      var typeWrap = el("div.chips.chips--scroll", { role: "group", "aria-label": "종류" });
      TYPES.forEach(function (t) {
        var c = el("button.chip" + (f.type === t[0] ? ".is-on" : ""), {
          type: "button", "aria-pressed": f.type === t[0] ? "true" : "false",
          onclick: function () {
            f.type = t[0];
            U.$$(".chip", typeWrap).forEach(function (x) { x.classList.remove("is-on"); x.setAttribute("aria-pressed", "false"); });
            this.classList.add("is-on"); this.setAttribute("aria-pressed", "true"); syncType();
          }
        }, [TYPE_SHORT[t[0]] || t[1]]);
        typeWrap.appendChild(c);
      });
      box.appendChild(el("div.field", null, [typeWrap]));
      var nameLabel = el("label", { text: NAME_Q[f.type] || "어디에 가나요?" });
      box.appendChild(el("div.field", null, [nameLabel, el("div", null, [titleInput, results, pickedLabel])]));

      // ----- 숙박 기간 (숙소 타입에서만) — 체크인 + 몇 박 → 그 날짜들이 Day 로 만들어진다 -----
      var dayDate = (dayObj && dayObj.date) || "";
      var firstDate = trip ? (trip.days.map(function (d) { return d.date; }).filter(Boolean).sort()[0] || "") : "";
      if (!f.checkIn) f.checkIn = dayDate || firstDate || U.todayISO();
      var nights = f.checkOut ? Math.max(1, U.daysBetween(f.checkIn, f.checkOut)) : 1;
      var ciInput = el("input.input", { type: "date", value: f.checkIn, "aria-label": "체크인 날짜",
        oninput: function () { f.checkIn = this.value; syncStay(); } });
      var nightNo = el("span.stepper__val");
      var stayLine = el("div.stay-line", { role: "status", "aria-live": "polite" });
      function stepBtn(label, delta, aria) {
        return el("button.stepper__btn", { type: "button", "aria-label": aria,
          onclick: function () { nights = Math.max(1, Math.min(30, nights + delta)); syncStay(); } }, [label]);
      }
      function syncStay() {
        nightNo.textContent = nights + "박";
        if (!f.checkIn) { stayLine.textContent = "체크인 날짜를 골라 주세요"; return; }
        var out = U.addDaysISO(f.checkIn, nights);
        var missing = U.dateList(f.checkIn, out).filter(function (dt) {
          return !(trip && trip.days.some(function (d) { return d.date === dt; }));
        }).length;
        stayLine.textContent = U.fmtDate(f.checkIn) + " → " + U.fmtDate(out) + " · " + nights + "박 " + (nights + 1) + "일"
          + (missing ? " · 날짜 " + missing + "개가 일정에 추가돼요" : "");
      }
      var stayBox = field("며칠 묵나요?", el("div", null, [
        el("div.stay-row", null, [
          wrapLabeled("체크인", ciInput),
          wrapLabeled("숙박", el("div.stepper", null, [stepBtn("−", -1, "하루 줄이기"), nightNo, stepBtn("+", 1, "하루 늘리기")]))
        ]),
        stayLine
      ]));
      box.appendChild(stayBox);
      syncStay();

      // ----- 날짜 이동 (편집 모드 + 날짜가 2개 이상일 때만) -----
      // "이건 2일차로 미루자"를 삭제→재입력 없이. 저장 시 대상 날짜의 맨 뒤로 옮긴다.
      var timeField = null, costLabel = null;
      var adv = el("div.more__body");     // '더 입력하기' 안쪽 — 자주 안 쓰는 항목은 여기로 접는다
      var moveSel = null, moveField = null;
      var WISH = "__wish";
      if (trip && (wishMode || existing)) {
        moveSel = el("select.select", { "aria-label": wishMode ? "언제 갈지" : "이 장소를 옮길 날짜" });
        if (wishMode) moveSel.appendChild(el("option", { value: WISH, text: "📌 아직 몰라요 · 보관함에 두기" }));
        trip.days.forEach(function (d, i) {
          var label = "Day " + (i + 1) + (d.date ? " · " + U.fmtDate(d.date) : "") + (d.label ? " · " + d.label : "");
          var opt = el("option", { value: d.id, text: label });
          if (d.id === dayId) opt.selected = true;
          moveSel.appendChild(opt);
        });
        if (!wishMode) moveSel.appendChild(el("option", { value: WISH, text: "📌 보관함으로 (날짜 미정)" }));
        if (wishMode) {
          moveSel.value = WISH;
          moveField = field("언제 갈까요?", moveSel);           // 보관함에선 이게 핵심이라 이름 바로 아래에 보인다
          box.appendChild(moveField);
        } else {
          moveField = field("날짜 옮기기", moveSel, "다른 날로 옮기면 입력한 내용 그대로 그 날 맨 뒤에 붙어요");
          adv.appendChild(moveField);
        }
      }

      // ----- 공항 시각 (공항 타입에서만 표시) -----
      var arriveInput = timeInput(f.arriveTime, function (v) { f.arriveTime = v; });
      var departInput = timeInput(f.departTime, function (v) { f.departTime = v; });
      var airportBox = field("✈️ 공항 시각", el("div.row", null, [
        wrapLabeled("도착(착륙) 시각", arriveInput),
        wrapLabeled("출발(이륙) 시각", departInput)
      ]), "도착편=도착시각, 출발편=출발시각 — 그날 동선 ETA·비행기 마감 체크에 사용");
      box.appendChild(airportBox);
      function syncType() {
        airportBox.style.display = (f.type === "airport") ? "" : "none";
        stayBox.style.display = (f.type === "lodging") ? "" : "none";
        nameLabel.textContent = NAME_Q[f.type] || "어디에 가나요?";
        if (timeField) timeField.style.display = (f.type === "lodging") ? "none" : "";   // 숙소는 날짜가 곧 일정 — 시각 칸은 접는다
        if (costLabel) costLabel.textContent = (f.type === "lodging") ? "숙박비는 얼마인가요?" : "얼마 쓰나요?";
        if (moveField) moveField.style.display = (f.type === "lodging") ? "none" : "";   // 숙소는 체크인이 날짜를 정한다
        if (stayInput) stayInput.placeholder = "기본 " + TP.geo.defaultDwell(f.type) + "분";
      }
      syncType();

      // 현지명/부제
      adv.appendChild(field("현지명 · 부제",
        el("input.input", { value: f.subtitle, placeholder: "예: 東京タワー / Tokyo Tower", oninput: function () { f.subtitle = this.value; } })));

      // ----- 위치 (이름 입력 → 자동 검색 결과는 이름칸 아래 results에 표시) -----
      function showPicked() {
        pickedLabel.innerHTML = "";
        if (TP.geo.hasCoord(f)) {
          pickedLabel.appendChild(el("span.geo-picked__txt", { text: "📍 " + (f.address || "위치 설정됨") }));
          pickedLabel.appendChild(el("button.link-btn.geo-picked__re", { type: "button", onclick: function () { searchSeq++; doSearch(); } }, ["다시 찾기"]));
          pickedLabel.style.display = "flex";
        } else { pickedLabel.style.display = "none"; }
      }
      showPicked();
      var searchSeq = 0;
      function doSearch() {
        var q = (titleInput.value || "").trim();
        if (q.length < 2) { results.innerHTML = ""; return; }
        var mySeq = ++searchSeq;
        results.innerHTML = "";
        results.appendChild(el("div.geo-result", null, [el("span.spin"), "  검색 중…"]));
        TP.geo.geocode(q).then(function (list) {
          if (mySeq !== searchSeq) return;   // 더 최신 검색이 시작됨 → stale 결과 무시
          results.innerHTML = "";
          revealResults();
          // 구글을 못 쓰는 상태(하루 한도 소진 등)면 무료 검색 결과라는 걸 알린다 — 한글 가게 이름은 거의 못 찾는다
          var degraded = TP.gmaps && TP.gmaps.hasKey() && TP.gmaps.isBroken("places");
          if (degraded) results.appendChild(el("div.geo-note", { text: "오늘 구글 검색 한도를 다 써서 무료 검색으로 찾고 있어요. 영어·현지어 이름이나 ‘지도에서 직접 선택’이 더 잘 맞아요." }));
          if (!list.length) { results.appendChild(el("div.geo-result", { text: degraded ? "무료 검색에서 못 찾았어요." : "결과가 없어요. 이름을 더 구체적으로 적어보세요." })); return; }
          list.forEach(function (r) {
            results.appendChild(el("button.geo-result", {
              type: "button",
              onclick: function () {
                f.lat = r.lat; f.lon = r.lon;
                f.address = r.address;
                if (!f.title) { f.title = r.name; titleInput.value = r.name; }
                if (addrInput) addrInput.value = f.address;
                var samePlace = !!(r.placeId && r.placeId === f.placeId);
                f.placeId = r.placeId || "";
                if (!samePlace) f.openPeriods = [];               // 다른 곳을 골랐으면 옛 영업 구간은 버린다
                if (r.hours && !((f.openHours || "").trim())) { f.openHours = r.hours; if (openHoursInput) openHoursInput.value = r.hours; }   // OSM 영업시간(있으면)
                results.innerHTML = ""; openedTitle = (titleInput.value || "").trim(); showPicked();
                if (pickMap && pickMap.setView) pickMap.setView(r.lat, r.lon);
                U.toast("위치를 설정했어요");
                if (r.placeId) fillHours(r.placeId, !samePlace);
              }
            }, [el("div.name", { text: r.name }), el("div.addr", { text: r.address })]));
          });
        }).catch(function () {
          if (mySeq !== searchSeq) return;
          results.innerHTML = ""; results.appendChild(el("div.geo-result", { text: "검색에 실패했어요. 잠시 후 다시 시도하세요." }));
        });
      }
      /* 고른 장소의 영업시간 — 구글 Place Details 로 한 곳만 받아 영업시간·휴무 요일을 채운다.
       * 사람이 적어 둔 값은 덮지 않는다(다른 장소로 바꿨을 때만 영업시간 줄을 새로 쓴다). */
      function fillHours(pid, replace) {
        TP.geo.placeHours(pid).then(function (h) {
          if (!h || f.placeId !== pid) return;                 // 그 사이 다른 장소를 골랐으면 버린다
          f.openPeriods = h.periods || [];
          var wrote = [];
          if (h.text && (replace || !(f.openHours || "").trim())) { f.openHours = h.text; if (openHoursInput) openHoursInput.value = h.text; wrote.push("영업시간"); }
          var closed = TP.geo.closedWeekdays(f.openPeriods);
          if (closed.length && (replace || !f.closingDays.length)) { f.closingDays = closed.slice(); syncClosingChips(); wrote.push("휴무 요일"); }
          if (wrote.length) U.toast(wrote.join("·") + "을 채웠어요");
        });
      }
      function revealResults() {
        try { results.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
      }
      // 위치가 이미 있어도 '이름을 바꿨으면' 검색한다. 예전엔 좌표가 있으면 자동검색을 통째로 건너뛰어
      // 수정 화면에서 이름을 고쳐도 결과가 안 나왔다(사용자 제보 2026-09-28). 처음 열었을 때 이름 그대로면 조용히 둔다.
      var openedTitle = (f.title || "").trim();
      var liveSearch = U.debounce(function () {
        var q = (titleInput.value || "").trim();
        if (q.length < 2) { searchSeq++; results.innerHTML = ""; return; }
        if (!TP.geo.hasCoord(f) || q !== openedTitle) doSearch();
      }, 700);   // 글자마다가 아니라 타이핑을 멈춘 뒤 한 번 — 구글 검색은 하루 30회 한도라 아껴 쓴다
      titleInput.addEventListener("input", liveSearch);                                       // 이름 입력 → 자동 검색
      titleInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });

      // 지도에서 선택 토글 (직접 검색 버튼 포함)
      var mapBox = el("div.modal__pickmap", { style: { display: "none" } });
      var mapToggle = el("button.btn.btn--ghost.btn--sm", {
        type: "button",
        onclick: function () {
          if (mapBox.style.display === "none") {
            mapBox.style.display = "block";
            this.textContent = "지도 접기";
            if (!pickMap) {
              pickMap = TP.maps.picker(mapBox, TP.geo.hasCoord(f) ? f : null, function (p) {
                // 검색으로 채운 주소가 남아 있는데 지도에서 전혀 다른 지점을 찍으면 좌표와 주소가 어긋난다.
                // 미세 조정(200m 이내)은 주소를 유지하고, 그보다 멀리 옮기면 옛 주소를 지운다.
                if (f.address && TP.geo.hasCoord(f) && TP.geo.haversine(f, p) > 200) f.address = "";
                f.lat = p.lat; f.lon = p.lon;
                if (addrInput) addrInput.value = f.address;
                showPicked();
              });
            }
          } else { mapBox.style.display = "none"; this.textContent = "지도에서 직접 선택"; }
        }
      }, ["지도에서 직접 선택"]);
      var reSearchBtn = el("button.btn.btn--ghost.btn--sm", { type: "button", style: { marginLeft: "8px" }, onclick: function () { searchSeq++; doSearch(); } }, ["🔎 이름으로 다시 찾기"]);

      adv.appendChild(field("위치", el("div", null, [el("div", null, [mapToggle, reSearchBtn]), mapBox]),
        "이름으로 자동 검색되며, 안 맞으면 지도에서 직접 찍거나 다시 검색하세요"));

      // 주소
      var addrInput = el("input.input", { value: f.address, placeholder: "주소 (선택)", oninput: function () { f.address = this.value; } });
      adv.appendChild(field("주소", addrInput));

      // 시간 / 체류시간 / 소요시간
      var stayInput = el("input.input", {
        type: "number", min: "0", value: (f.stayMin != null ? f.stayMin : ""),
        placeholder: "기본 " + TP.geo.defaultDwell(f.type) + "분",
        oninput: function () { var v = parseInt(this.value, 10); f.stayMin = (isFinite(v) && v >= 0) ? v : null; }
      });
      var costCtl = moneySimple(cur, homeCur, f.costAmount, function (v) { f.costAmount = v; });
      timeField = wrapLabeled("몇 시에?", timeInput(f.time, function (v) { f.time = v; }));
      costLabel = el("label", { style: { display: "block", fontSize: "12px", fontWeight: "800", color: "var(--text-2)", marginBottom: "6px" }, text: "얼마 쓰나요?" });
      box.appendChild(el("div.field", null, [el("div.row", null, [timeField, el("div", null, [costLabel, costCtl])])]));
      syncType();

      // ----- 여기부터 '더 입력하기'(접힘) — 한 화면에 20칸이 펼쳐져 있던 것을 필수만 남겼다 -----
      var more = el("details.more", null, [
        el("summary.more__sum", null, ["더 입력하기", el("span.more__hint", { text: "위치 · 교통 · 영업시간 · 휴무 · 예약 · 메모" })]),
        adv
      ]);
      adv.appendChild(field("머무는 시간(분)", stayInput, "일정 예상시각 계산에 써요 (비우면 종류별 기본값)"));
      adv.appendChild(field("소요시간 표시",
        el("input.input", { value: f.durationLabel, placeholder: "예: 약 60~90분", oninput: function () { f.durationLabel = this.value; } })));

      // ----- 이동수단 (이전 → 여기): 첫 장소가 아니면 -----
      if (prevStop) {
        var MODES = [["transit", "🚌 대중교통"], ["taxi", "🚕 택시"], ["walk", "🚶 도보"], ["none", "안 함"]];
        // 직접 입력한 요금은 "직전 장소 → 여기" 구간의 값이므로, 어느 구간이었는지 함께 기록한다.
        var fareCtl = moneyDual(cur, homeCur, f.fareAmount, function (v) {
          f.fareAmount = v;
          f.fareFrom = (v == null) ? "" : prevStop.id;
        });
        var fareInput = fareCtl.destInput;                       // 예상요금 placeholder 갱신용
        var modeWrap = el("div.chips");
        function legKm() { return (TP.geo.hasCoord(prevStop) && TP.geo.hasCoord(f)) ? TP.geo.haversine(prevStop, f) / 1000 : null; }
        function updFare() {
          var m = f.arriveBy;
          if (!m) fareInput.placeholder = "이동수단을 고르면 예상요금";
          else if (m === "walk" || m === "none") fareInput.placeholder = "무료";
          else fareInput.placeholder = "예상 " + TP.money.format(TP.money.estimateFare(legKm(), m, cur), cur);
        }
        MODES.forEach(function (mo) {
          modeWrap.appendChild(el("button.chip" + (f.arriveBy === mo[0] ? ".is-on" : ""), {
            type: "button",
            onclick: function () { f.arriveBy = mo[0]; U.$$(".chip", modeWrap).forEach(function (x) { x.classList.remove("is-on"); }); this.classList.add("is-on"); updFare(); }
          }, [mo[1]]));
        });
        updFare();
        // 순서가 바뀌어 직전 장소가 달라졌으면, 적어 둔 금액이 지금 구간의 값이 아님을 알린다.
        var staleFare = (typeof f.fareAmount === "number" && f.fareFrom && f.fareFrom !== prevStop.id);
        var staleNote = staleFare ? el("div.hint.hint--warn", {
          text: "순서가 바뀌어 직전 장소가 ‘" + (prevStop.title || "이전 장소") + "’ 으로 달라졌어요. 적어 둔 금액은 예전 구간 기준이라 예산에는 예상값이 쓰이고 있어요 — 확인 후 저장하면 지금 구간으로 반영돼요."
        }) : null;
        adv.appendChild(field("이전 장소 → 여기 이동수단",
          el("div", null, [modeWrap, el("div", { style: { marginTop: "8px" } }, [
            el("label", { style: { display: "block", fontSize: "12px", fontWeight: "800", color: "var(--text-2)", marginBottom: "6px" }, text: "교통비 (비우면 예상값)" }),
            fareCtl, staleNote
          ])]),
          (homeCur && homeCur !== cur) ? "한쪽에 적으면 다른 통화로 자동 환산돼요. 직접 입력하면 그 값으로 합산돼요" : "거리 기반 예상요금이며, 직접 입력하면 그 값으로 합산돼요"));
      }

      // ----- 경비 (금액 양방향 + 분류 + 결제수단) -----
      var payWrap = el("div.chips");
      [["credit", "💳 신용카드"], ["debit", "💳 체크카드"], ["cash", "💵 현금"], ["", "없음"]].forEach(function (po) {
        payWrap.appendChild(el("button.chip" + ((f.payment || "") === po[0] ? ".is-on" : ""), {
          type: "button",
          onclick: function () { f.payment = po[0]; U.$$(".chip", payWrap).forEach(function (x) { x.classList.remove("is-on"); }); this.classList.add("is-on"); }
        }, [po[1]]));
      });
      // 분류 칩(빌트인 + 사용자 커스텀) — '직접 추가'로 개인 분류 등록, 커스텀은 ✕로 삭제
      var catWrap = el("div.chips");
      var defCat = TP.render.inferCategory(f);
      function renderCatChips() {
        catWrap.innerHTML = "";
        TP.render.allCats().forEach(function (c) {
          var isCustom = TP.render.BUILTIN_CATS.every(function (b) { return b[0] !== c[0]; });
          var on = ((f.costCategory || defCat) === c[0]);
          var chip = el("button.chip" + (on ? ".is-on" : "") + (isCustom ? ".chip--custom" : ""), {
            type: "button",
            onclick: function () { f.costCategory = c[0]; renderCatChips(); }
          }, [c[1]]);
          if (isCustom) {
            chip.appendChild(el("span.chip__x", {
              role: "button", "aria-label": c[1] + " 분류 삭제", title: "이 분류 삭제",
              onclick: function (e) {
                e.stopPropagation(); e.preventDefault();
                if (!window.confirm("‘" + c[1] + "’ 분류를 삭제할까요? (이미 이 분류로 적은 경비는 ‘기타’로 표시돼요)")) return;
                if (f.costCategory === c[0]) f.costCategory = "";
                store.removeCustomCat(c[0]); renderCatChips();
              }
            }, ["✕"]));
          }
          catWrap.appendChild(chip);
        });
        catWrap.appendChild(el("button.chip.chip--add", {
          type: "button",
          onclick: function () {
            var name = (window.prompt("새 분류 이름을 입력하세요 (이모지 포함 가능, 예: 🚕 교통, 🎁 기념품)") || "").trim();
            if (!name) return;
            var c = store.addCustomCat(name);
            if (c) f.costCategory = c.k;
            renderCatChips();
          }
        }, ["➕ 직접 추가"]));
      }
      renderCatChips();
      adv.appendChild(field("경비 분류", catWrap));
      adv.appendChild(field("결제수단", payWrap));

      // 영업시간 (이름으로 검색해 선택하면 구글 영업시간 자동 채움)
      var openHoursInput = el("input.input", { value: f.openHours, placeholder: "예: 11:00~23:00 (L.O.22:00)", oninput: function () { f.openHours = this.value; } });
      // 영업시간 칸을 직접 고치면 구글 영업 구간(도착 시각 검사용)은 그대로 둔다 — 글자는 메모일 수 있다
      adv.appendChild(field("영업시간", openHoursInput, "이름으로 검색해 선택하면 구글 영업시간이 자동으로 채워져요 (직접 수정 가능)"));

      // 휴무 요일
      var wdWrap = el("div.chips");
      U.WEEKDAYS.forEach(function (w, idx) {
        var on = f.closingDays.indexOf(idx) >= 0;
        wdWrap.appendChild(el("button.chip" + (on ? ".is-on" : ""), {
          type: "button", dataset: { wd: String(idx) },
          onclick: function () {
            var i = f.closingDays.indexOf(idx);
            if (i >= 0) { f.closingDays.splice(i, 1); this.classList.remove("is-on"); }
            else { f.closingDays.push(idx); this.classList.add("is-on"); }
          }
        }, [w]));
      });
      function syncClosingChips() {
        U.$$(".chip", wdWrap).forEach(function (c) { c.classList.toggle("is-on", f.closingDays.indexOf(+c.dataset.wd) >= 0); });
      }
      adv.appendChild(field("휴무 요일", wdWrap, "이 요일에 방문 일정이 잡히면 자동 경고"));
      adv.appendChild(field("휴무 비고",
        el("input.input", { value: f.closingNote, placeholder: "예: 부정기 휴무 / 연중무휴 / 24시간", oninput: function () { f.closingNote = this.value; } })));

      // 예약
      var resvWrap = el("div.chips");
      RESV.forEach(function (r) {
        resvWrap.appendChild(el("button.chip" + (f.reservation === r[0] ? ".is-on" : ""), {
          type: "button",
          onclick: function () { f.reservation = r[0]; U.$$(".chip", resvWrap).forEach(function (x) { x.classList.remove("is-on"); }); this.classList.add("is-on"); }
        }, ["예약 " + r[1]]));
      });
      adv.appendChild(field("예약", resvWrap));
      adv.appendChild(field("예약 비고",
        el("input.input", { value: f.reservationNote, placeholder: "예: 6/14 18:00 예약 완료", oninput: function () { f.reservationNote = this.value; } })));

      // 실내/야외 + 토글들
      var indoorWrap = el("div.chips");
      [["true", "실내", true], ["false", "야외", false], ["null", "미정", null]].forEach(function (o) {
        var on = f.indoor === o[2];
        indoorWrap.appendChild(el("button.chip" + (on ? ".is-on" : ""), {
          type: "button",
          onclick: function () { f.indoor = o[2]; U.$$(".chip", indoorWrap).forEach(function (x) { x.classList.remove("is-on"); }); this.classList.add("is-on"); }
        }, [o[1]]));
      });
      adv.appendChild(field("실내 / 야외", indoorWrap, "비 오는 날 실내 위주 추천에 사용돼요"));

      adv.appendChild(toggleRow("고정 일정", "시간이 정해진 일정(동선 최적화 시 자리 고정)", f.fixed, function (v) { f.fixed = v; }));
      adv.appendChild(toggleRow("인증포인트 / 포토스팟", "사진 찍기 좋은 곳으로 표시", f.photoSpot, function (v) { f.photoSpot = v; }));

      // 메모
      adv.appendChild(field("메모 · 팁",
        el("textarea.textarea", { placeholder: "예: 첫 도보 필수 인증샷. 도착 즉시 입장.", oninput: function () { f.note = this.value; } }, [f.note])));
      box.appendChild(more);

      // 액션
      box.appendChild(el("div.modal__actions", null, [
        el("button.btn.btn--block", {
          onclick: function () {
            if (!f.title.trim()) { U.toast("장소 이름을 입력하세요"); titleInput.focus(); return; }
            // 편집창에서 금액을 확인하고 저장했다면, 그 값을 "지금 구간"의 요금으로 인정한다.
            if (prevStop && typeof f.fareAmount === "number") f.fareFrom = prevStop.id;
            var moved = "", target = dayId;
            var dest = moveSel ? moveSel.value : dayId;          // 날짜 id 또는 WISH(보관함)
            if (f.type === "lodging") {
              // 숙박 기간의 날짜들을 보장하고(없는 날만 생성 — 줄여도 기존 날짜는 지우지 않는다), 숙소는 체크인 날에 둔다
              if (!f.checkIn) { U.toast("체크인 날짜를 고르세요"); ciInput.focus(); return; }
              f.checkOut = U.addDaysISO(f.checkIn, nights);
              var dmap = store.ensureDays(U.dateList(f.checkIn, f.checkOut));
              target = dmap[f.checkIn] || dayId;
              dest = target;                                     // 숙소는 체크인 날이 곧 자리다
              moved = nights + "박 " + (nights + 1) + "일 숙소를 넣었어요";
            } else { f.checkIn = ""; f.checkOut = ""; }
            if (wishMode) {
              // 보관함 장소: 날짜를 골랐으면 그 날 맨 뒤로, 아니면 보관함에 그대로
              if (existing) {
                store.updateWish(stopId, f);
                if (dest && dest !== WISH && store.moveWishToDay(stopId, dest)) moved = moved || ("Day " + (store.dayIndex(dest) + 1) + "(으)로 보냈어요");
              } else if (dest && dest !== WISH) {
                store.addStop(dest, f); moved = moved || ("Day " + (store.dayIndex(dest) + 1) + "에 넣었어요");
              } else if (!store.addWish(f)) { U.toast("보관함이 가득 찼어요"); return; }
              close();
              U.toast(moved || (existing ? "수정했어요" : "보관함에 담았어요"));
              return;
            }
            if (!target) { U.toast("날짜를 먼저 추가하세요"); return; }
            if (existing && dest === WISH) {                       // 날짜에서 보관함으로 되돌리기
              store.updateStop(dayId, stopId, f);
              store.moveStopToWish(dayId, stopId);
              close(); U.toast("보관함으로 옮겼어요"); return;
            }
            if (existing) {
              store.updateStop(dayId, stopId, f);
              var toDay = (f.type === "lodging") ? target : (moveSel && moveSel.value);
              if (toDay && toDay !== dayId) {
                var toIdx = store.dayIndex(toDay);
                if (toDay !== WISH && store.moveStopToDay(dayId, stopId, toDay) && f.type !== "lodging") moved = "Day " + (toIdx + 1) + "(으)로 옮겼어요";
              }
            } else store.addStop(target, f);
            close();
            U.toast(moved || (existing ? "수정했어요" : "추가했어요"));
            if (opts.onSaved) opts.onSaved(target);
          }
        }, [existing ? "저장" : "추가"]),
        el("button.btn.btn--block.btn--ghost", { onclick: close }, ["취소"])
      ]));

      if (existing) {
        box.appendChild(el("button.btn.btn--block.btn--danger.modal__delete", {
          onclick: function () {
            if (!window.confirm("‘" + (f.title || "이 장소") + "’ 을(를) 삭제할까요?")) return;
            if (wishMode) store.removeWish(stopId); else store.removeStop(dayId, stopId);
            close(); U.toast("삭제했어요");
          }
        }, ["이 장소 삭제"]));
      }
    }, function () {
      if (pickMap) { TP.maps.destroy(pickMap); pickMap = null; }   // 모달 종료 시 picker 지도 정리(누수 방지)
    });
  }

  function wrapLabeled(label, control) {
    return el("div", null, [el("label", { style: { display: "block", fontSize: "12px", fontWeight: "800", color: "var(--text-2)", marginBottom: "6px" }, text: label }), control]);
  }
  // HH:MM 수동 입력(시간 휠 없이 직접 타이핑). 1300 → 13:00 자동 콜론. 커서 위치 보존 + blur 시 보정.
  function timeInput(val, onset) {
    var inp = el("input.input.input--time", { value: val || "", placeholder: "예: 13:00", inputmode: "numeric", maxlength: "5", autocomplete: "off", "aria-label": "시각 (HH:MM)" });
    inp.addEventListener("input", function () {
      var raw = inp.value, caret = inp.selectionStart, atEnd = (caret === raw.length);
      var v = raw.replace(/[^0-9:]/g, "");
      var digits = v.replace(/:/g, "");
      if (digits.length > 4) digits = digits.slice(0, 4);
      // 끝에서 타이핑 중 + 콜론 없음 + 3자리↑ → 자동 콜론(중간을 고치는 중엔 건드리지 않아 자유 편집 가능)
      if (atEnd && v.indexOf(":") < 0 && digits.length >= 3) v = digits.slice(0, 2) + ":" + digits.slice(2);
      if (v !== raw) {
        inp.value = v;
        if (!atEnd) { var np = Math.min(caret, v.length); try { inp.setSelectionRange(np, np); } catch (e) {} }
      }
      onset(inp.value);
    });
    inp.addEventListener("blur", function () {                 // 입력을 마치면 가능한 범위에서 HH:MM 로 정리
      var n = normalizeHM(inp.value);
      if (n !== inp.value) { inp.value = n; onset(n); }
    });
    return inp;
  }
  // "9","930","9:5" → "09:30"/"09:05" 보정. 불완전/비정상이면 원본 유지(사용자 자유 입력 존중).
  function normalizeHM(s) {
    s = String(s || "").trim();
    if (!s) return "";
    var h, mi, m = /^(\d{1,2}):(\d{1,2})$/.exec(s);
    if (m) { h = m[1]; mi = m[2]; }
    else { var d = s.replace(/\D/g, ""); if (d.length === 3) { h = d.slice(0, 1); mi = d.slice(1); } else if (d.length === 4) { h = d.slice(0, 2); mi = d.slice(2); } else return s; }
    var hn = parseInt(h, 10), mn = parseInt(mi, 10);
    if (!isFinite(hn) || !isFinite(mn) || hn > 23 || mn > 59) return s;
    return (hn < 10 ? "0" + hn : "" + hn) + ":" + (mn < 10 ? "0" + mn : "" + mn);
  }

  // 숫자 통화 자리수 반올림(표시용)
  function fmtNum(v, cur) {
    if (v == null || !isFinite(v)) return "";
    var dec = TP.money.cfg(cur).dec;
    return dec ? Number(v.toFixed(dec)) : Math.round(v);
  }
  // 양방향 통화 입력: dest(여행통화) ↔ home(내통화). 저장값은 항상 dest(여행통화) 기준 → 예산/공유 호환.
  // 반환 노드에 .destInput(여행통화 input)을 달아 placeholder 등 후처리 가능하게 한다.
  function moneyDual(destCur, homeCur, initialDest, onset) {
    var dInput = el("input.input", { type: "number", min: "0", step: "any", inputmode: "decimal", value: (initialDest != null ? initialDest : ""), placeholder: "예: 3000" });
    function emit() { var v = parseFloat(dInput.value); onset((isFinite(v) && v >= 0) ? v : null); }
    if (!homeCur || homeCur === destCur) {                      // 내통화 미설정/동일 → 단일 입력
      dInput.addEventListener("input", emit);
      var single = wrapLabeled(TP.money.cfg(destCur).sym + " " + TP.money.cfg(destCur).name, dInput);
      single.destInput = dInput;
      return single;
    }
    var hInput = el("input.input", { type: "number", min: "0", step: "any", inputmode: "decimal", placeholder: "예: 30000" });
    var lock = false;
    function fromD() { if (lock) return; lock = true; var v = parseFloat(dInput.value); hInput.value = isFinite(v) ? fmtNum(TP.money.convert(v, destCur, homeCur), homeCur) : ""; lock = false; }
    function fromH() { if (lock) return; lock = true; var v = parseFloat(hInput.value); dInput.value = isFinite(v) ? fmtNum(TP.money.convert(v, homeCur, destCur), destCur) : ""; lock = false; }
    dInput.addEventListener("input", function () { fromD(); emit(); });
    hInput.addEventListener("input", function () { fromH(); emit(); });   // 내통화로 적으면 여행통화(저장값)로 환산
    // 실시간 환율이 도착하면 환산값을 갱신한다. 단 사용자가 그 칸에 입력 중이면 건드리지 않는다
    // (응답이 늦게 오면 타이핑하던 숫자가 갑자기 바뀌어 버린다).
    TP.money.ensureRate(destCur, homeCur).then(function () {
      if (!document.body.contains(dInput)) return;
      if (document.activeElement === hInput || document.activeElement === dInput) return;
      fromD();
    });
    fromD();
    var node = el("div.money-dual", null, [
      wrapLabeled(TP.money.cfg(destCur).sym + " " + TP.money.cfg(destCur).name + " · 저장 기준", dInput),
      el("div.money-dual__eq", { text: "⇄" }),
      wrapLabeled(TP.money.cfg(homeCur).sym + " " + TP.money.cfg(homeCur).name, hInput)
    ]);
    node.destInput = dInput;
    return node;
  }
  // 금액 한 칸(여행 통화) + 아래 작은 글씨로 내 통화 환산 — 두 칸 양방향 입력은 교통비에만 남긴다
  function moneySimple(destCur, homeCur, initialDest, onset) {
    var c = TP.money.cfg(destCur);
    var inp = el("input.input", { type: "number", min: "0", step: "any", inputmode: "decimal", value: (initialDest != null ? initialDest : ""), placeholder: c.sym.trim() + " 0", "aria-label": "금액 (" + c.name + ")" });
    var conv = el("div.money-conv", { "aria-live": "polite" });
    function draw() {
      var v = parseFloat(inp.value);
      conv.textContent = (isFinite(v) && v > 0 && homeCur && homeCur !== destCur) ? (TP.money.formatConv(v, destCur, homeCur) || "") : "";
    }
    inp.addEventListener("input", function () { var v = parseFloat(inp.value); onset((isFinite(v) && v >= 0) ? v : null); draw(); });
    if (homeCur && homeCur !== destCur) TP.money.ensureRate(destCur, homeCur).then(function () { if (document.body.contains(inp)) draw(); });
    draw();
    return el("div", null, [inp, conv]);
  }
  function toggleRow(label, desc, value, onChange) {
    var input = el("input", { type: "checkbox", onchange: function () { onChange(this.checked); } });
    if (value) input.checked = true;
    return el("div.toggle-row", null, [
      el("div", null, [el("div.toggle-row__label", { text: label }), el("div.toggle-row__desc", { text: desc })]),
      el("label.switch", null, [input, el("span")])
    ]);
  }

  /* ---------- 날짜(Day) 모달 ---------- */
  function openDayModal(dayId) {
    var existing = dayId ? store.day(dayId) : null;
    var f = { date: existing ? existing.date : "", label: existing ? existing.label : "" };
    modal(function (box, close) {
      box.appendChild(el("div.modal__title", { text: existing ? "날짜 편집" : "날짜 추가" }));
      box.appendChild(el("div.modal__sub", { text: "여행 일자와 그날의 테마(선택)를 정하세요." }));
      box.appendChild(field("날짜",
        el("input.input", { type: "date", value: f.date, oninput: function () { f.date = this.value; } })));
      box.appendChild(field("코스 이름 (선택)",
        el("input.input", { value: f.label, placeholder: "예: 디즈니씨 코스 / 신주쿠의 밤", oninput: function () { f.label = this.value; } })));
      box.appendChild(el("div.modal__actions", null, [
        el("button.btn.btn--block", {
          onclick: function () {
            if (!f.date) { U.toast("날짜를 선택하세요"); return; }
            if (existing) store.updateDay(dayId, f);
            else { var d = store.addDay(f); }
            close();
          }
        }, [existing ? "저장" : "추가"]),
        el("button.btn.btn--block.btn--ghost", { onclick: close }, ["취소"])
      ]));
      if (existing) {
        box.appendChild(el("button.btn.btn--block.btn--danger.modal__delete", {
          onclick: function () {
            if (existing.stops.length && !confirm("이 날의 장소 " + existing.stops.length + "곳도 함께 삭제됩니다. 계속할까요?")) return;
            store.removeDay(dayId); close(); location.hash = "#/trip/" + store.activeId();
          }
        }, ["이 날짜 삭제"]));
      }
    });
  }

  /* ---------- 여행(Trip) 생성/편집 모달 ---------- */
  function dateRangeList(start, end) {
    var out = [];
    var s = TP.util.parseDate(start); if (!s) return out;
    var e = TP.util.parseDate(end) || s;
    if (e < s) { var ts = start; start = end; end = ts; s = TP.util.parseDate(start); e = TP.util.parseDate(end); }  // 뒤바뀐 입력 보정
    var iso = start, guard = 0;
    while (guard++ < 90) {                                   // 최대 90일 방어
      out.push(iso);
      if (TP.util.parseDate(iso) >= e) break;
      iso = TP.util.addDaysISO(iso, 1);
    }
    return out;
  }
  // 새 여행(활성)에 날짜들 + 도착/출발 공항(고정) 자동 생성. 생성한 날짜 수 반환.
  function generateDaysAndFlights(f) {
    var dates = dateRangeList(f.start, f.end);
    if (!dates.length) return 0;
    var dayIds = [];
    dates.forEach(function (dt) { var d = store.addDay({ date: dt }); if (d) dayIds.push(d.id); });
    var legs = [];   // 공항 좌표 비동기 지오코딩 대상
    if (f.arriveTime && dayIds.length) {
      var a = store.addStop(dayIds[0], { type: "airport", title: (f.region ? f.region + " 도착" : "도착 공항"), arriveTime: f.arriveTime, time: f.arriveTime, fixed: true, indoor: true });
      if (a) legs.push({ dayId: dayIds[0], id: a.id });
    }
    if (f.departTime && dayIds.length) {
      var b = store.addStop(dayIds[dayIds.length - 1], { type: "airport", title: (f.region ? f.region + " 출발" : "출발 공항"), departTime: f.departTime, fixed: true, indoor: true });
      if (b) legs.push({ dayId: dayIds[dayIds.length - 1], id: b.id });
    }
    // 공항 좌표를 구글 검색으로 채워, 교통비 거리계산이 정상 동작하도록(좌표 없으면 기본요금만 나옴)
    if (legs.length && f.region) {
      TP.geo.geocode(f.region + " 공항").then(function (list) {
        var r = (list && list[0]) || null;
        if (r && r.lat != null && r.lon != null) {
          legs.forEach(function (lg) { store.updateStop(lg.dayId, lg.id, { lat: r.lat, lon: r.lon, address: r.address || "" }); });
        }
      }).catch(function () {});
    }
    return dates.length;
  }

  function openTripModal(tripId) {
    var existing = tripId ? store.trip(tripId) : null;
    var dates = existing ? existing.days.map(function (d) { return d.date; }).filter(Boolean).sort() : [];
    var f = {
      title: existing ? existing.title : "", region: existing ? existing.region : "",
      currency: existing ? (existing.currency || "JPY") : "JPY",
      homeCurrency: existing ? (existing.homeCurrency || "") : "KRW",
      start: dates[0] || "", end: dates[dates.length - 1] || "",
      arriveTime: "", departTime: ""
    };
    var userPickedCur = !!existing;   // 기존 여행은 사용자가 정한 통화로 간주(자동추천 덮어쓰기 방지)

    modal(function (box, close) {
      box.appendChild(el("div.modal__title", null, [existing ? "여행 정보 편집" : "새 여행", TP.help.btn("trip")]));
      box.appendChild(el("div.modal__sub", { text: existing ? "이름·지역·통화를 수정해요." : "어디로 가는지만 적어도 돼요. 날짜는 숙소를 고르면 자동으로 채워져요." }));

      var titleInput = el("input.input", { value: f.title, placeholder: "예: 후쿠오카 가족여행", oninput: function () { f.title = this.value; } });
      box.appendChild(field("여행 이름", titleInput, "비워 두면 ‘지역 + 여행’"));

      // 통화가 26개라 칩으로는 화면을 덮는다 → 선택 목록. 고르면 현재 환율 한 줄을 바로 보여 준다.
      function curOption(code) { var c = TP.money.cfg(code); return el("option", { value: code, text: c.sym.trim() + "  " + c.name + " (" + code + ")" }); }
      var curSelect = el("select.select", { "aria-label": "통화", onchange: function () { f.currency = this.value; userPickedCur = true; showRate(); } },
        TP.money.ORDER.map(curOption));
      curSelect.value = f.currency;
      var homeSelect = el("select.select", { "aria-label": "내 통화", onchange: function () { f.homeCurrency = this.value; showRate(); } },
        [el("option", { value: "", text: "없음 (환산 안 함)" })].concat(TP.money.ORDER.map(curOption)));
      homeSelect.value = f.homeCurrency || "";
      var rateLine = el("div.rate-line", { role: "status", "aria-live": "polite" });
      var rateEpoch = 0;
      function showRate() {
        var from = f.currency, to = f.homeCurrency, my = ++rateEpoch;
        if (!to || from === to) { rateLine.textContent = ""; return; }
        function draw(tag) { if (my !== rateEpoch) return; rateLine.textContent = TP.money.rateLabel(from, to) + tag; }
        draw(TP.money.getCachedRate(from, to) != null ? " · 실시간" : " · 근사치(조회 중…)");
        TP.money.ensureRate(from, to).then(function () {
          draw(TP.money.getCachedRate(from, to) != null ? " · 실시간" : " · 근사치(오프라인)");
        });
      }
      var regionInput = el("input.input", {
        value: f.region, placeholder: "예: 방콕 / 오사카 / 다낭",
        oninput: function () { f.region = this.value; if (!userPickedCur) { var rec = TP.money.currencyForRegion(f.region); if (rec) { f.currency = rec; curSelect.value = rec; showRate(); } } }
      });
      // 순서: 지역 → 이름 (지역만 적으면 이름은 'OO 여행'으로 채워진다)
      box.insertBefore(field("어디로 가나요?", regionInput), titleInput.parentNode);
      var tripAdv = el("div.more__body");
      tripAdv.appendChild(field("통화", curSelect, "지역을 넣으면 자동으로 골라져요"));
      tripAdv.appendChild(field("내 통화 (환산 표시)", el("div", null, [homeSelect, rateLine])));
      showRate();

      if (!existing) {
        box.appendChild(field("언제 가나요? (선택)", el("div.row", null, [
          wrapLabeled("가는 날", el("input.input", { type: "date", value: f.start, oninput: function () { f.start = this.value; } })),
          wrapLabeled("오는 날", el("input.input", { type: "date", value: f.end, oninput: function () { f.end = this.value; } }))
        ])));
        tripAdv.appendChild(field("✈️ 비행기 시각", el("div.row", null, [
          wrapLabeled("도착 시각(첫날)", timeInput(f.arriveTime, function (v) { f.arriveTime = v; })),
          wrapLabeled("출발 시각(마지막날)", timeInput(f.departTime, function (v) { f.departTime = v; }))
        ]), "넣으면 첫날 도착공항·마지막날 출발공항을 고정 일정으로 자동 추가(편집 가능)"));
      }
      box.appendChild(el("details.more", { open: !!existing }, [
        el("summary.more__sum", null, ["더 설정하기", el("span.more__hint", { text: existing ? "통화 · 환율" : "통화 · 환율 · 비행기 시각" })]),
        tripAdv
      ]));

      box.appendChild(el("div.modal__actions", null, [
        el("button.btn.btn--block", {
          onclick: function () {
            if (!f.title.trim() && !f.region.trim()) { U.toast("여행 이름이나 지역을 입력하세요"); titleInput.focus(); return; }
            var title = f.title.trim() || (f.region.trim() + " 여행");
            if (existing) {
              store.updateTrip(existing.id, { title: title, region: f.region.trim(), currency: f.currency, homeCurrency: f.homeCurrency });
              close(); U.toast("여행 정보를 수정했어요"); return;
            }
            var t = store.addTrip({ title: title, region: f.region.trim(), currency: f.currency, homeCurrency: f.homeCurrency });
            var made = generateDaysAndFlights(f);
            close();
            location.hash = "#/trip/" + t.id;
            U.toast(made > 0 ? (made + "일 일정을 만들었어요") : "여행을 만들었어요");
          }
        }, [existing ? "저장" : "만들기"]),
        el("button.btn.btn--block.btn--ghost", { onclick: close }, ["취소"])
      ]));
    });
  }

  TP.editor = { openStopModal: openStopModal, openDayModal: openDayModal, openTripModal: openTripModal, modal: modal };
})(window.TP = window.TP || {});
