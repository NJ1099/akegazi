/* editor.js — 장소/날짜 추가·편집 모달 (네임스페이스 TP.editor) */
(function (TP) {
  "use strict";
  var el = TP.util.el, U = TP.util, store = TP.store;

  var TYPES = [
    ["attraction", "🗼 가고 싶은 곳"], ["food", "🍴 먹고 싶은 곳"], ["cafe", "☕ 카페"],
    ["activity", "🎡 체험"], ["lodging", "🏨 숙소"], ["transport", "🚆 이동"], ["airport", "✈️ 공항"]
  ];
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
  function openStopModal(dayId, stopId) {
    var existing = stopId ? store.stop(dayId, stopId) : null;
    var f = Object.assign(store.defaultStop(), existing ? JSON.parse(JSON.stringify(existing)) : {});
    var pickMap = null;
    var trip = store.activeTrip();
    var cur = (trip && trip.currency) || "JPY";
    var dayObj = store.day(dayId);
    var prevStop = null;                                         // 교통비 추정용: 직전 장소
    if (dayObj) {
      if (existing) { var ei = dayObj.stops.indexOf(existing); prevStop = ei > 0 ? dayObj.stops[ei - 1] : null; }
      else { prevStop = dayObj.stops.length ? dayObj.stops[dayObj.stops.length - 1] : null; }
    }

    modal(function (box, close) {
      box.appendChild(el("div.modal__title", { text: existing ? "장소 편집" : "장소 추가" }));
      box.appendChild(el("div.modal__sub", { text: "가고 싶은 곳 · 먹고 싶은 곳 · 숙소 · 공항 무엇이든 추가하세요." }));

      // 이름
      var titleInput = el("input.input", { value: f.title, placeholder: "예: 도쿄타워", oninput: function () { f.title = this.value; } });
      box.appendChild(field("장소 이름", titleInput));

      // 타입 칩
      var typeWrap = el("div.chips");
      TYPES.forEach(function (t) {
        var c = el("button.chip" + (f.type === t[0] ? ".is-on" : ""), {
          type: "button",
          onclick: function () { f.type = t[0]; U.$$(".chip", typeWrap).forEach(function (x) { x.classList.remove("is-on"); }); this.classList.add("is-on"); syncType(); }
        }, [t[1]]);
        typeWrap.appendChild(c);
      });
      box.appendChild(field("종류", typeWrap));

      // ----- 공항 시각 (공항 타입에서만 표시) -----
      var arriveInput = el("input.input", { type: "time", value: f.arriveTime || "", oninput: function () { f.arriveTime = this.value; } });
      var departInput = el("input.input", { type: "time", value: f.departTime || "", oninput: function () { f.departTime = this.value; } });
      var airportBox = field("✈️ 공항 시각", el("div.row", null, [
        wrapLabeled("도착(착륙) 시각", arriveInput),
        wrapLabeled("출발(이륙) 시각", departInput)
      ]), "도착편=도착시각, 출발편=출발시각 — 그날 동선 ETA·비행기 마감 체크에 사용");
      box.appendChild(airportBox);
      function syncType() {
        airportBox.style.display = (f.type === "airport") ? "" : "none";
        if (stayInput) stayInput.placeholder = "기본 " + TP.geo.defaultDwell(f.type) + "분";
      }
      syncType();

      // 현지명/부제
      box.appendChild(field("현지명 · 부제 (선택)",
        el("input.input", { value: f.subtitle, placeholder: "예: 東京タワー / Tokyo Tower", oninput: function () { f.subtitle = this.value; } })));

      // ----- 위치 (지오코딩) -----
      var searchInput = el("input.input", { value: "", placeholder: "장소/주소 검색 (예: 도쿄타워, Narita Airport)" });
      var pickedLabel = el("div.geo-picked", { html: "" });
      var results = el("div.geo-results");
      function showPicked() {
        if (TP.geo.hasCoord(f)) {
          pickedLabel.textContent = "📍 좌표 설정됨 (" + f.lat.toFixed(4) + ", " + f.lon.toFixed(4) + ")" + (f.address ? " · " + f.address : "");
          pickedLabel.style.display = "flex";
        } else { pickedLabel.style.display = "none"; }
      }
      showPicked();
      var searchSeq = 0;
      function doSearch() {
        var q = searchInput.value.trim();
        if (!q) { searchInput.focus(); return; }
        var mySeq = ++searchSeq;
        results.innerHTML = "";
        results.appendChild(el("div.geo-result", null, [el("span.spin"), "  검색 중…"]));
        TP.geo.geocode(q).then(function (list) {
          if (mySeq !== searchSeq) return;   // 더 최신 검색이 시작됨 → stale 결과 무시
          results.innerHTML = "";
          if (!list.length) { results.appendChild(el("div.geo-result", { text: "결과가 없어요. 주소를 더 구체적으로 입력해보세요." })); return; }
          list.forEach(function (r) {
            results.appendChild(el("button.geo-result", {
              type: "button",
              onclick: function () {
                f.lat = r.lat; f.lon = r.lon;
                if (!f.address) f.address = r.address;
                if (!f.title) { f.title = r.name; titleInput.value = r.name; }
                addrInput.value = f.address;
                results.innerHTML = ""; showPicked();
                if (pickMap && pickMap.setView) pickMap.setView(r.lat, r.lon);
                U.toast("위치를 설정했어요");
              }
            }, [el("div.name", { text: r.name }), el("div.addr", { text: r.address })]));
          });
        }).catch(function () {
          if (mySeq !== searchSeq) return;
          results.innerHTML = ""; results.appendChild(el("div.geo-result", { text: "검색에 실패했어요. 잠시 후 다시 시도하세요." }));
        });
      }
      searchInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });
      var liveSearch = U.debounce(function () {
        if (searchInput.value.trim().length >= 2) doSearch();
        else { searchSeq++; results.innerHTML = ""; }   // 짧은/빈 질의: 진행 중 검색 무효화 + 이전 결과 제거
      }, 380);
      searchInput.addEventListener("input", liveSearch);   // 입력 즉시 구글 검색(디바운스)
      var searchRow = el("div.row", null, [searchInput, el("button.btn.btn--ghost", { type: "button", style: { flex: "0 0 auto" }, onclick: doSearch }, ["검색"])]);

      // 지도에서 선택 토글
      var mapBox = el("div.modal__pickmap", { style: { display: "none" } });
      var mapToggle = el("button.btn.btn--ghost.btn--sm", {
        type: "button",
        onclick: function () {
          if (mapBox.style.display === "none") {
            mapBox.style.display = "block";
            this.textContent = "지도 접기";
            if (!pickMap) {
              pickMap = TP.maps.picker(mapBox, TP.geo.hasCoord(f) ? f : null, function (p) {
                f.lat = p.lat; f.lon = p.lon; showPicked();
              });
            }
          } else { mapBox.style.display = "none"; this.textContent = "지도에서 직접 선택"; }
        }
      }, ["지도에서 직접 선택"]);

      box.appendChild(field("위치", el("div", null, [searchRow, results, pickedLabel, el("div", { style: { marginTop: "8px" } }, [mapToggle]), mapBox]),
        "검색해서 고르거나, 지도에서 직접 찍으세요"));

      // 주소
      var addrInput = el("input.input", { value: f.address, placeholder: "주소 (선택)", oninput: function () { f.address = this.value; } });
      box.appendChild(field("주소 (선택)", addrInput));

      // 시간 / 체류시간 / 소요시간
      var stayInput = el("input.input", {
        type: "number", min: "0", value: (f.stayMin != null ? f.stayMin : ""),
        placeholder: "기본 " + TP.geo.defaultDwell(f.type) + "분",
        oninput: function () { var v = parseInt(this.value, 10); f.stayMin = (isFinite(v) && v >= 0) ? v : null; }
      });
      box.appendChild(field("",
        el("div.row", null, [
          wrapLabeled("도착 시간", el("input.input", { type: "time", value: f.time, oninput: function () { f.time = this.value; } })),
          wrapLabeled("체류 시간(분)", stayInput)
        ]), "체류 시간은 일정 ETA 계산에 사용돼요 (비우면 종류별 기본값)"));
      box.appendChild(field("소요시간 표시 (선택)",
        el("input.input", { value: f.durationLabel, placeholder: "예: 약 60~90분", oninput: function () { f.durationLabel = this.value; } })));

      // ----- 이동수단 (이전 → 여기): 첫 장소가 아니면 -----
      if (prevStop) {
        var MODES = [["transit", "🚌 대중교통"], ["taxi", "🚕 택시"], ["walk", "🚶 도보"], ["none", "안 함"]];
        var fareInput = el("input.input", {
          type: "number", min: "0", value: (f.fareAmount != null ? f.fareAmount : ""),
          oninput: function () { var v = parseFloat(this.value); f.fareAmount = (isFinite(v) && v >= 0) ? v : null; }
        });
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
        box.appendChild(field("이전 장소 → 여기 이동수단",
          el("div", null, [modeWrap, el("div", { style: { marginTop: "8px" } }, [wrapLabeled("교통비 (" + TP.money.symbol(cur) + ", 비우면 예상값)", fareInput)])]),
          "거리 기반 예상요금이며, 직접 입력하면 그 값으로 합산돼요"));
      }

      // ----- 경비 (결제수단 + 금액) -----
      var costInput = el("input.input", {
        type: "number", min: "0", value: (f.costAmount != null ? f.costAmount : ""), placeholder: "예: 3000",
        oninput: function () { var v = parseFloat(this.value); f.costAmount = (isFinite(v) && v >= 0) ? v : null; }
      });
      var payWrap = el("div.chips");
      [["credit", "💳 신용카드"], ["debit", "💳 체크카드"], ["cash", "💵 현금"], ["", "없음"]].forEach(function (po) {
        payWrap.appendChild(el("button.chip" + ((f.payment || "") === po[0] ? ".is-on" : ""), {
          type: "button",
          onclick: function () { f.payment = po[0]; U.$$(".chip", payWrap).forEach(function (x) { x.classList.remove("is-on"); }); this.classList.add("is-on"); }
        }, [po[1]]));
      });
      var catWrap = el("div.chips");
      var defCat = TP.render.inferCategory(f);
      TP.render.COST_CATS.forEach(function (c) {
        catWrap.appendChild(el("button.chip" + (((f.costCategory || defCat) === c[0]) ? ".is-on" : ""), {
          type: "button",
          onclick: function () { f.costCategory = c[0]; U.$$(".chip", catWrap).forEach(function (x) { x.classList.remove("is-on"); }); this.classList.add("is-on"); }
        }, [c[1]]));
      });
      box.appendChild(field("💳 경비 (선택)",
        el("div", null, [
          wrapLabeled("금액 (" + TP.money.symbol(cur) + ")", costInput),
          el("div", { style: { marginTop: "8px" } }, [wrapLabeled("분류", catWrap)]),
          el("div", { style: { marginTop: "8px" } }, [wrapLabeled("결제수단", payWrap)])
        ]),
        "분류·결제수단별 + 환산까지 예산에 반영돼요"));

      // 영업시간
      box.appendChild(field("영업시간 (선택)",
        el("input.input", { value: f.openHours, placeholder: "예: 11:00~23:00 (L.O.22:00)", oninput: function () { f.openHours = this.value; } })));

      // 휴무 요일
      var wdWrap = el("div.chips");
      U.WEEKDAYS.forEach(function (w, idx) {
        var on = f.closingDays.indexOf(idx) >= 0;
        wdWrap.appendChild(el("button.chip" + (on ? ".is-on" : ""), {
          type: "button",
          onclick: function () {
            var i = f.closingDays.indexOf(idx);
            if (i >= 0) { f.closingDays.splice(i, 1); this.classList.remove("is-on"); }
            else { f.closingDays.push(idx); this.classList.add("is-on"); }
          }
        }, [w]));
      });
      box.appendChild(field("휴무 요일 (선택)", wdWrap, "이 요일에 방문 일정이 잡히면 자동 경고"));
      box.appendChild(field("휴무 비고 (선택)",
        el("input.input", { value: f.closingNote, placeholder: "예: 부정기 휴무 / 연중무휴 / 24시간", oninput: function () { f.closingNote = this.value; } })));

      // 예약
      var resvWrap = el("div.chips");
      RESV.forEach(function (r) {
        resvWrap.appendChild(el("button.chip" + (f.reservation === r[0] ? ".is-on" : ""), {
          type: "button",
          onclick: function () { f.reservation = r[0]; U.$$(".chip", resvWrap).forEach(function (x) { x.classList.remove("is-on"); }); this.classList.add("is-on"); }
        }, ["예약 " + r[1]]));
      });
      box.appendChild(field("예약", resvWrap));
      box.appendChild(field("예약 비고 (선택)",
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
      box.appendChild(field("실내 / 야외", indoorWrap, "비 오는 날 실내 위주 추천에 사용돼요"));

      box.appendChild(toggleRow("고정 일정", "시간이 정해진 일정(동선 최적화 시 자리 고정)", f.fixed, function (v) { f.fixed = v; }));
      box.appendChild(toggleRow("인증포인트 / 포토스팟", "사진 찍기 좋은 곳으로 표시", f.photoSpot, function (v) { f.photoSpot = v; }));

      // 메모
      box.appendChild(field("메모 · 팁 (선택)",
        el("textarea.textarea", { placeholder: "예: 첫 도보 필수 인증샷. 도착 즉시 입장.", oninput: function () { f.note = this.value; } }, [f.note])));

      // 액션
      box.appendChild(el("div.modal__actions", null, [
        el("button.btn.btn--block", {
          onclick: function () {
            if (!f.title.trim()) { U.toast("장소 이름을 입력하세요"); titleInput.focus(); return; }
            if (existing) store.updateStop(dayId, stopId, f);
            else store.addStop(dayId, f);
            close();
            U.toast(existing ? "수정했어요" : "추가했어요");
          }
        }, [existing ? "저장" : "추가"]),
        el("button.btn.btn--block.btn--ghost", { onclick: close }, ["취소"])
      ]));

      if (existing) {
        box.appendChild(el("button.btn.btn--block.btn--danger.modal__delete", {
          onclick: function () { if (!window.confirm("‘" + (f.title || "이 장소") + "’ 을(를) 삭제할까요?")) return; store.removeStop(dayId, stopId); close(); U.toast("삭제했어요"); }
        }, ["이 장소 삭제"]));
      }
    }, function () {
      if (pickMap) { TP.maps.destroy(pickMap); pickMap = null; }   // 모달 종료 시 picker 지도 정리(누수 방지)
    });
  }

  function wrapLabeled(label, control) {
    return el("div", null, [el("label", { style: { display: "block", fontSize: "12px", fontWeight: "800", color: "var(--text-2)", marginBottom: "6px" }, text: label }), control]);
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
    if (f.arriveTime && dayIds.length) {
      store.addStop(dayIds[0], { type: "airport", title: (f.region ? f.region + " 도착" : "도착 공항"), arriveTime: f.arriveTime, time: f.arriveTime, fixed: true, indoor: true });
    }
    if (f.departTime && dayIds.length) {
      store.addStop(dayIds[dayIds.length - 1], { type: "airport", title: (f.region ? f.region + " 출발" : "출발 공항"), departTime: f.departTime, fixed: true, indoor: true });
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
      box.appendChild(el("div.modal__title", { text: existing ? "여행 정보 편집" : "새 여행" }));
      box.appendChild(el("div.modal__sub", { text: existing ? "이름·지역·통화를 수정해요. 날짜·공항은 일정에서 편집하세요." : "지역·기간을 넣으면 날짜와 도착/출발 공항(고정)을 자동으로 만들어 드려요." }));

      var titleInput = el("input.input", { value: f.title, placeholder: "예: 후쿠오카 가족여행", oninput: function () { f.title = this.value; } });
      box.appendChild(field("여행 이름", titleInput));

      var curWrap = el("div.chips");
      function renderCurChips() {
        curWrap.innerHTML = "";
        TP.money.ORDER.forEach(function (code) {
          var c = TP.money.cfg(code);
          curWrap.appendChild(el("button.chip" + (f.currency === code ? ".is-on" : ""), {
            type: "button", onclick: function () { f.currency = code; userPickedCur = true; renderCurChips(); }
          }, [c.sym + " " + c.name]));
        });
      }
      var regionInput = el("input.input", {
        value: f.region, placeholder: "예: 후쿠오카 / 오사카 / 서울",
        oninput: function () { f.region = this.value; if (!userPickedCur) { var rec = TP.money.currencyForRegion(f.region); if (rec) { f.currency = rec; renderCurChips(); } } }
      });
      box.appendChild(field("지역", regionInput, "지역을 넣으면 통화를 자동 추천해요"));
      renderCurChips();
      box.appendChild(field("통화", curWrap));

      var homeWrap = el("div.chips");
      function renderHomeChips() {
        homeWrap.innerHTML = "";
        homeWrap.appendChild(el("button.chip" + (!f.homeCurrency ? ".is-on" : ""), { type: "button", onclick: function () { f.homeCurrency = ""; renderHomeChips(); } }, ["없음"]));
        TP.money.ORDER.forEach(function (code) {
          var c = TP.money.cfg(code);
          homeWrap.appendChild(el("button.chip" + (f.homeCurrency === code ? ".is-on" : ""), { type: "button", onclick: function () { f.homeCurrency = code; renderHomeChips(); } }, [c.sym + " " + c.name]));
        });
      }
      renderHomeChips();
      box.appendChild(field("내 통화 (환산 표시)", homeWrap, "통화와 다르면 금액 옆에 ≈ 환산값을 보여줘요(실시간 환율)"));

      if (!existing) {
        box.appendChild(field("", el("div.row", null, [
          wrapLabeled("시작일", el("input.input", { type: "date", value: f.start, oninput: function () { f.start = this.value; } })),
          wrapLabeled("종료일", el("input.input", { type: "date", value: f.end, oninput: function () { f.end = this.value; } }))
        ]), "이 기간의 날짜들이 자동으로 만들어져요"));
        box.appendChild(field("✈️ 비행기 (선택)", el("div.row", null, [
          wrapLabeled("도착 시각(첫날)", el("input.input", { type: "time", value: f.arriveTime, oninput: function () { f.arriveTime = this.value; } })),
          wrapLabeled("출발 시각(마지막날)", el("input.input", { type: "time", value: f.departTime, oninput: function () { f.departTime = this.value; } }))
        ]), "넣으면 첫날 도착공항·마지막날 출발공항을 고정 일정으로 자동 추가(편집 가능)"));
      }

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
