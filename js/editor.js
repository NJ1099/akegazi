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
  function modal(buildContent) {
    var root = document.getElementById("modalRoot");
    var box = el("div.modal");
    var back = el("div.modal-back", {
      onclick: function (e) { if (e.target === back) close(); }
    }, [box]);
    box.appendChild(el("div.modal__grip"));
    function close() {
      document.removeEventListener("keydown", onKey);
      if (back.parentNode) back.parentNode.removeChild(back);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    buildContent(box, close);
    root.appendChild(back);
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
          onclick: function () { f.type = t[0]; U.$$(".chip", typeWrap).forEach(function (x) { x.classList.remove("is-on"); }); this.classList.add("is-on"); }
        }, [t[1]]);
        typeWrap.appendChild(c);
      });
      box.appendChild(field("종류", typeWrap));

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
      function doSearch() {
        var q = searchInput.value.trim();
        if (!q) { searchInput.focus(); return; }
        results.innerHTML = "";
        results.appendChild(el("div.geo-result", null, [el("span.spin"), "  검색 중…"]));
        TP.geo.geocode(q).then(function (list) {
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
          results.innerHTML = ""; results.appendChild(el("div.geo-result", { text: "검색에 실패했어요. 잠시 후 다시 시도하세요." }));
        });
      }
      searchInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });
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

      // 시간 / 소요시간
      box.appendChild(field("",
        el("div.row", null, [
          wrapLabeled("도착 시간", el("input.input", { type: "time", value: f.time, oninput: function () { f.time = this.value; } })),
          wrapLabeled("소요시간 표시", el("input.input", { value: f.durationLabel, placeholder: "예: 약 60~90분", oninput: function () { f.durationLabel = this.value; } }))
        ])));

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
          onclick: function () { store.removeStop(dayId, stopId); close(); U.toast("삭제했어요"); }
        }, ["이 장소 삭제"]));
      }
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
            store.removeDay(dayId); close(); location.hash = "#/";
          }
        }, ["이 날짜 삭제"]));
      }
    });
  }

  TP.editor = { openStopModal: openStopModal, openDayModal: openDayModal, modal: modal };
})(window.TP = window.TP || {});
