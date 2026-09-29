/* render.js — 타임라인/카드/배지/날씨 배너 렌더 (네임스페이스 TP.render) */
(function (TP) {
  "use strict";
  var el = TP.util.el, esc = TP.util.esc, U = TP.util;

  var TYPE_ICON = {
    airport: "✈️", transport: "🚆", lodging: "🏨",
    attraction: "🗼", activity: "🎡", food: "🍴", cafe: "☕"
  };
  var TYPE_LABEL = {
    airport: "공항", transport: "이동", lodging: "숙소",
    attraction: "가고 싶은 곳", activity: "체험", food: "먹고 싶은 곳", cafe: "카페"
  };
  function typeIcon(s) { return s.icon || TYPE_ICON[s.type] || "📍"; }

  /* ---- 배지 생성 ---- */
  function badge(text, cls) { return el("span.badge" + (cls ? "." + cls : ""), { text: text }); }

  function badgesFor(stop, day, rainy) {
    var out = [];
    if (stop.fixed) out.push(badge("고정", "badge--violet"));

    // 예약
    switch (stop.reservation) {
      case "required": out.push(badge("예약필수", "badge--red")); break;
      case "done": out.push(badge("예약완료 ★" + (stop.reservationNote ? " " + stop.reservationNote : ""), "badge--pink")); break;
      case "recommended": out.push(badge("예약 권장", "badge--amber")); break;
      case "none":
        if (stop.type === "food" || stop.type === "cafe") out.push(badge("예약 불필요", ""));
        break;
    }

    // 실내/야외 (우천 대응)
    if (stop.indoor === true) out.push(badge("비와도 OK", "badge--cyan"));
    else if (stop.indoor === false) {
      // 날씨는 타임라인보다 늦게 도착한다. 이 배지 하나 때문에 타임라인을 통째로 다시 만들지 않도록
      // 표시를 달아 두고, 예보가 오면 markRainy()가 이 노드들만 바꾼다.
      var ob = badge(rainy ? "야외 · 우천주의" : "야외", rainy ? "badge--amber" : "");
      ob.dataset.outdoor = "1";
      out.push(ob);
    }

    // 영업/휴무
    var ci = closingInfo(stop, day);
    if (ci.label) out.push(badge(ci.label, ci.cls));

    if (stop.photoSpot) out.push(badge("인증포인트", "badge--pink"));
    return out;
  }

  /* 휴무 정보 + 당일 충돌 여부 */
  function closingInfo(stop, day) {
    var note = (stop.closingNote || "").trim();
    var wd = day ? U.weekdayIdx(day.date) : -1;
    var conflict = Array.isArray(stop.closingDays) && wd >= 0 && stop.closingDays.indexOf(wd) >= 0;

    var label = note, cls = "badge--amber";
    if (!label && stop.closingDays && stop.closingDays.length) {
      label = stop.closingDays.map(function (d) { return U.WEEKDAYS[d]; }).join("·") + " 휴무";
    }
    if (label && /무휴|연중|24시간|24시/.test(label)) cls = "badge--green";
    return { label: label, cls: cls, conflict: conflict };
  }

  /* ---- Stop 카드 ---- */
  /* arriveMin: 이 장소 도착 시각(분 · 입력값 또는 추정). 영업시간 검사에 쓴다 — 모르면 null */
  function stopCard(day, stop, prevStop, ctx, idx, arriveMin) {
    var ci = closingInfo(stop, day);
    var card = el("div.stop", { dataset: { stop: stop.id } });
    if (stop.fixed) card.classList.add("is-fixed");
    if (ci.conflict) card.classList.add("is-conflict");

    // 헤드
    var titles = el("div.stop__titles", null, [
      el("div.stop__title", { text: stop.title || "(제목 없음)" }),
      stop.subtitle ? el("div.stop__sub", { text: stop.subtitle }) : null
    ]);
    var dragHandle = (ctx && ctx.canReorder) ? el("div.stop__drag", {
      title: "드래그 또는 ↑↓ 키로 순서 변경", role: "button", tabindex: "0",
      "aria-label": (stop.title || "장소") + " 순서 변경",
      onclick: function (e) { e.stopPropagation(); },
      onkeydown: function (e) {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault(); e.stopPropagation();
          TP.store.moveStop(day.id, idx, e.key === "ArrowUp" ? idx - 1 : idx + 1);
        }
      }
    }, ["⠿"]) : null;
    var head = el("div.stop__head", null, [
      dragHandle,
      el("div.stop__icon", { text: typeIcon(stop) }),
      titles,
      stop.durationLabel ? el("div.stop__dur", null, ["⏱ " + stop.durationLabel]) : null,
      el("button.stop__del", {
        title: "삭제", "aria-label": (stop.title || "장소") + " 삭제",
        onclick: function (e) { e.stopPropagation(); if (window.confirm("‘" + (stop.title || "이 장소") + "’ 을(를) 삭제할까요?")) TP.store.removeStop(day.id, stop.id); }
      }, ["✕"])
    ]);
    card.appendChild(head);

    // 이동수단 (이전 → 여기): 첫 장소가 아니면 빠른 선택 칩 + 교통비
    if (prevStop) {
      var cur = (ctx && ctx.currency) || "JPY";
      var estimable = TP.geo.hasCoord(prevStop) && TP.geo.hasCoord(stop);
      var effMode = stop.arriveBy || (estimable ? "transit" : "");   // 표시/하이라이트용 유효 모드(예산과 일치)
      var leg = el("div.leg");
      [["transit", "🚌"], ["taxi", "🚕"], ["walk", "🚶"], ["none", "✕"]].forEach(function (mo) {
        leg.appendChild(el("button.leg__chip" + (effMode === mo[0] ? ".is-on" : ""), {
          title: { transit: "대중교통", taxi: "택시", walk: "도보", none: "이동 안 함" }[mo[0]],
          "aria-label": "이동수단 " + mo[0],
          onclick: function (e) { e.stopPropagation(); TP.store.updateStop(day.id, stop.id, { arriveBy: mo[0], fareAmount: null }); }
        }, [mo[1]]));
      });
      var fareText;
      if (effMode === "walk") fareText = "도보";
      else if (effMode === "none") fareText = "이동 안 함";
      else if (!effMode) fareText = "이동수단 선택";
      else fareText = TP.money.format(legFare(prevStop, stop, cur), cur) + (typeof stop.fareAmount === "number" ? "" : " 예상");
      leg.appendChild(el("span.leg__fare", { text: fareText }));
      card.appendChild(leg);
    }

    // 공항 시각 (도착/출발)
    if (stop.type === "airport" && (stop.arriveTime || stop.departTime)) {
      var apBits = [];
      if (stop.arriveTime) apBits.push("도착 " + stop.arriveTime);
      if (stop.departTime) apBits.push("출발 " + stop.departTime);
      card.appendChild(el("div.stop__addr", null, [
        el("span.pin", { html: "✈️" }), el("span", { text: apBits.join("  ·  ") })
      ]));
    }
    // 숙박 기간
    if (stop.type === "lodging" && stop.checkIn && stop.checkOut) {
      var nn = U.daysBetween(stop.checkIn, stop.checkOut);
      card.appendChild(el("div.stop__addr", null, [
        el("span.pin", { html: "🛏" }), el("span", { text: U.fmtDate(stop.checkIn) + " → " + U.fmtDate(stop.checkOut) + " · " + nn + "박" })
      ]));
    }
    // 주소
    if (stop.address) {
      card.appendChild(el("div.stop__addr", null, [
        el("span.pin", { html: "📍" }), el("span", { text: stop.address })
      ]));
    }
    // 영업시간
    if (stop.openHours) {
      card.appendChild(el("div.stop__addr", null, [
        el("span.pin", { html: "🕐" }), el("span", { text: stop.openHours })
      ]));
    }
    // 경비 (카테고리 + 금액 + 결제수단 + 환산)
    if (typeof stop.costAmount === "number" && stop.costAmount > 0) {
      var ccur = (ctx && ctx.currency) || "JPY", hcur = (ctx && ctx.homeCurrency) || "";
      var payLabel = { credit: "신용", debit: "체크", cash: "현금" }[stop.payment];
      var conv = TP.money.formatConv(stop.costAmount, ccur, hcur);
      card.appendChild(el("div.stop__addr", null, [
        el("span.pin", { html: "💰" }),
        el("span", { text: catLabel(inferCategory(stop)) + " " + TP.money.format(stop.costAmount, ccur) + (payLabel ? " · " + payLabel : "") + (conv ? " (" + conv + ")" : "") })
      ]));
    }

    // 배지
    var badges = badgesFor(stop, day, ctx && ctx.rainy);
    if (badges.length) card.appendChild(el("div.badges", null, badges));

    // 노트
    if (stop.note) {
      card.appendChild(el("div.stop__note", null, [
        el("span.em", { html: "💡" }), el("span", { text: stop.note })
      ]));
    }

    // 영업시간 밖 도착 경고(구글 영업 구간이 있을 때만 · 휴무일이면 아래 휴무 경고가 대신한다)
    var hw = hoursWarning(stop, day, arriveMin);
    if (hw && !ci.conflict) {
      card.appendChild(el("div.stop__conflict", null, [el("span", { html: "🕐" }), el("span", { text: hw })]));
    }

    // 휴무 충돌 경고
    if (ci.conflict) {
      card.appendChild(el("div.stop__conflict", null, [
        el("span", { html: "⚠️" }),
        el("span", { text: "방문 예정일(" + U.weekdayKo(day.date) + "요일)이 휴무일과 겹쳐요. 영업 여부를 확인하세요." })
      ]));
    }

    // 액션
    var dirLabel = "길찾기";
    var actions = el("div.stop__actions", null, [
      el("button.stop__act", {
        title: prevStop ? "이전 장소 → 여기 길찾기" : "길찾기",
        onclick: function (e) { e.stopPropagation(); openDir(prevStop, stop); }
      }, [dirLabel]),
      el("button.stop__act", {
        onclick: function (e) { e.stopPropagation(); openMap(stop); }
      }, ["지도"])
    ]);
    card.appendChild(actions);

    // 카드 클릭/키보드 → 편집 (접근성: role/tabindex/Enter·Space)
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", (stop.title || "장소") + " 편집");
    function fireEdit() { if (ctx && ctx.onEdit) ctx.onEdit(stop.id); }
    card.addEventListener("click", fireEdit);
    card.addEventListener("keydown", function (e) {
      if (e.target !== card) return;            // 내부 길찾기/지도 버튼의 키 이벤트는 무시
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); fireEdit(); }
    });
    return card;
  }

  function hoursWarning(stop, day, arriveMin) {
    var ps = stop.openPeriods;
    if (!ps || !ps.length || arriveMin == null || !day || !day.date) return "";
    var G = TP.geo, wd = U.weekdayIdx(day.date);
    var open = G.isOpenAt(ps, wd, arriveMin);
    var today = G.hoursOn(ps, wd);
    if (open === false) {
      return G.minToHm(arriveMin) + " 도착 예정인데 그때는 문을 닫아요" + (today ? " (" + U.weekdayKo(day.date) + " " + today + ")" : " (이 요일 휴무)");
    }
    var close = G.closesAt(ps, wd, arriveMin);
    if (close != null && close - arriveMin < Math.min(60, TP.geo.defaultDwell(stop.type))) {
      return G.minToHm(close) + "에 닫아요 — " + G.minToHm(arriveMin) + " 도착이면 " + (close - arriveMin) + "분밖에 없어요";
    }
    return "";
  }
  function openDir(from, to) {
    if (!locOK(to)) { U.toast("도착지 위치를 먼저 입력하세요"); return; }
    var url = TP.geo.dirURL(from && locOK(from) ? from : null, to, "transit");
    window.open(url, "_blank", "noopener");
  }
  function openMap(s) {
    if (!locOK(s)) { U.toast("위치(주소/좌표)를 먼저 입력하세요"); return; }
    window.open(TP.geo.searchURL(s), "_blank", "noopener");
  }
  function locOK(s) { return s && (TP.geo.hasCoord(s) || (s.title || s.address)); }

  /* ---- 타임라인 ---- */
  function timeline(day, ctx) {
    var wrap = el("div.timeline");
    if (!day.stops.length) {
      return el("div.empty", null, [
        el("div.empty__emoji", { html: "🗒️" }),
        el("div.empty__title", { text: "아직 장소가 없어요" }),
        el("div.empty__desc", { text: "아래 ‘장소 추가’로 가고 싶은 곳·먹고 싶은 곳·숙소·공항을 넣어보세요." })
      ]);
    }
    ctx.canReorder = day.stops.length > 1;
    var route = ctx.route || day.stops;                      // 숙소 출발·귀가 가상 칸이 붙은 동선
    var sched = ctx.schedule || TP.geo.buildSchedule(route);
    var schedMap = {}; sched.items.forEach(function (it) { schedMap[it.id] = it; });
    route.forEach(function (s, ri) {
      var prev = ri > 0 ? route[ri - 1] : null;
      if (s.virtual) { wrap.appendChild(stayRow(s, prev, ctx)); return; }
      var i = day.stops.indexOf(s);
      var color = TP.maps.DOT[(ctx.dayIndex || 0) % TP.maps.DOT.length];
      var it = schedMap[s.id], timeText, est = false;
      var arriveMin = TP.geo.hmToMin(s.time);
      if (arriveMin == null && sched.active && it && it.etaArrive != null) arriveMin = it.etaArrive;
      if (s.time) { timeText = s.time; }                                                          // 사용자가 입력한 시각 우선
      else if (sched.active && it && it.etaArrive != null) { timeText = TP.geo.minToHm(it.etaArrive); est = true; }   // 비어 있으면 추정 ETA
      else timeText = dashTime(i);
      var item = el("div.tl-item", { dataset: { stop: s.id } }, [
        el("div.tl-item__time" + (est ? ".tl-item__time--est" : ""), { text: timeText, title: est ? "예상 도착(추정)" : null }),
        el("div.tl-item__dot", { style: { "--dot": color, background: color, boxShadow: "0 0 0 4px var(--bg-2), 0 0 12px " + color } }),
        stopCard(day, s, prev, ctx, i, arriveMin)
      ]);
      wrap.appendChild(item);
    });
    return wrap;
  }
  /* 숙소 출발/귀가 한 줄 — 카드가 아니라 얇은 줄(편집은 숙소 칸에서). 귀가 줄엔 마지막 장소→숙소 교통비와 길찾기. */
  function stayRow(s, prev, ctx) {
    var start = s.virtual === "start";
    var cur = (ctx && ctx.currency) || "JPY";
    var bits = [];
    if (!start && prev && TP.geo.hasCoord(prev) && TP.geo.hasCoord(s)) {
      var fare = legFare(prev, s, cur);
      if (fare > 0) bits.push("🚌 " + TP.money.format(fare, cur) + " 예상");
    }
    return el("div.tl-stay" + (start ? ".tl-stay--start" : ".tl-stay--end"), null, [
      el("span.tl-stay__icon", { text: "🏨" }),
      el("span.tl-stay__text", null, [
        el("span.tl-stay__role", { text: start ? "출발" : "숙소로" }),
        el("span.tl-stay__name", { text: s.title || "숙소" })
      ]),
      bits.length ? el("span.tl-stay__fare", { text: bits.join(" ") }) : null,
      (!start && prev) ? el("button.stop__act.tl-stay__go", { onclick: function (e) { e.stopPropagation(); openDir(prev, s); } }, ["길찾기"]) : null
    ]);
  }
  function dashTime(i) { return "·"; }

  /* ---- 날씨 배너 ---- */
  function weatherBanner(wx) {
    if (!wx || !wx.available) {
      return el("div.wx.wx--loading", null, [wx && wx.reason ? wx.reason : "날씨 불러오는 중…"]);
    }
    var rain = el("div.wx__rain", null, [
      el("div", null, [el("span.mm", { text: (wx.precip != null ? wx.precip : 0) + "mm" })]),
      wx.pop != null ? el("div.pop", { text: "강수확률 " + wx.pop + "%" }) : (wx.archive ? el("div.pop", { text: "실측" }) : null)
    ]);
    var band = el("div.wx" + (wx.rainy ? ".is-rainy" : ""), null, [
      el("div.wx__emoji", { text: wx.emoji }),
      el("div.wx__main", null, [
        el("div.wx__temp", null, [
          fmtT(wx.tmax) + "°", el("span.lo", { text: " / " + fmtT(wx.tmin) + "°" })
        ]),
        el("div.wx__desc", { text: wx.desc + (wx.rainy ? " · 실내 위주 추천" : "") })
      ]),
      rain
    ]);
    return band;
  }
  function fmtT(v) { return (v == null || isNaN(v)) ? "–" : Math.round(v); }

  function rainBanner(plan) {
    if (!plan || !plan.rainy) return null;
    return el("div.rain-banner", null, [
      el("span.em", { html: "🌧️" }),
      el("span", { text: plan.message })
    ]);
  }

  /* ---- 일정(시간) 배너 ---- */
  function fmtDur(min) {
    min = Math.max(0, Math.round(min || 0));
    var h = Math.floor(min / 60), m = min % 60;
    return h ? (m ? h + "시간 " + m + "분" : h + "시간") : m + "분";
  }
  function scheduleBanner(schedule) {
    if (!schedule || !schedule.active) return null;
    var G = TP.geo, dl = schedule.deadline;
    if (schedule.conflict) {     // 입력 시각이 동선 순서와 모순
      return el("div.sched-banner.sched-banner--warn", null, [
        el("span.em", { html: "⚠️" }),
        el("span", null, ["입력한 도착/고정 시각이 앞 일정보다 일러요. 시각이 동선 순서와 모순되니 확인하세요."])
      ]);
    }
    if (dl) {
      var flight = G.minToHm(dl.flightDepart), mustBe = G.minToHm(dl.mustBeBy);
      if (dl.travelUnknown) {    // 좌표 없는 구간 있어 ETA 신뢰 불가 → 거짓 안전 금지
        return el("div.sched-banner.sched-banner--warn", null, [
          el("span.em", { html: "⚠️" }),
          el("span", null, [
            el("b", { text: flight + " 출발편" }),
            " — 좌표 없는 장소가 있어 이동시간을 반영하지 못했어요. 도착 예상이 부정확하니 공항·장소 위치를 지정하세요 (권장 도착 " + mustBe + ")."
          ])
        ]);
      }
      if (dl.late) {
        return el("div.sched-banner.sched-banner--risk", null, [
          el("span.em", { html: "⚠️" }),
          el("span", null, [
            el("b", { text: flight + " 출발편" }),
            " — 지금 동선이면 공항 도착 예상 ", el("b", { text: G.minToHm(dl.etaArrive) }),
            ", 권장 도착 " + mustBe + "보다 ", el("b", { text: fmtDur(dl.overBy) }),
            " 늦어요. 일정을 줄이거나 순서를 조정하세요."
          ])
        ]);
      }
      if (dl.etaArrive != null) {
        return el("div.sched-banner", null, [
          el("span.em", { html: "✈️" }),
          el("span", null, [
            el("b", { text: flight + " 출발편" }),
            " — 공항 도착 예상 ", el("b", { text: G.minToHm(dl.etaArrive) }),
            " · 권장 " + mustBe + "까지 ", el("b", { text: fmtDur(dl.mustBeBy - dl.etaArrive) }), " 여유"
          ])
        ]);
      }
      return el("div.sched-banner", null, [
        el("span.em", { html: "✈️" }),
        el("span", null, [el("b", { text: flight + " 출발편" }), " — 늦어도 " + mustBe + "까지 공항 도착 권장(출발 2시간 전)"])
      ]);
    }
    if (schedule.startMin != null) {
      var end = null;
      for (var i = schedule.items.length - 1; i >= 0; i--) { if (schedule.items[i].etaDepart != null) { end = schedule.items[i].etaDepart; break; } }
      return el("div.sched-banner", null, [
        el("span.em", { html: "✈️" }),
        el("span", null, [
          "일정 시작 예상 ", el("b", { text: G.minToHm(schedule.startMin) }),
          end != null ? " · 마지막 일정 종료 예상 " : "", end != null ? el("b", { text: G.minToHm(end) }) : null
        ])
      ]);
    }
    return null;
  }

  /* ---- 경비 카테고리 (빌트인 + 사용자 커스텀) ---- */
  var BUILTIN_CATS = [["food", "🍴 식비"], ["ticket", "🎟 입장료"], ["lodging", "🏨 숙소"], ["shopping", "🛍 쇼핑"], ["etc", "🧾 기타"]];
  var BUILTIN_LABEL = {}; BUILTIN_CATS.forEach(function (c) { BUILTIN_LABEL[c[0]] = c[1]; });
  function customCats() { return (TP.store && TP.store.customCats) ? TP.store.customCats() : []; }
  function allCats() { return BUILTIN_CATS.concat(customCats().map(function (c) { return [c.k, c.l]; })); }   // [key,label][]
  function inferCategory(stop) {                          // 미지정 시 종류로 추정
    if (stop.costCategory) return stop.costCategory;
    switch (stop.type) {
      case "food": case "cafe": return "food";
      case "lodging": return "lodging";
      case "activity": case "attraction": return "ticket";
      default: return "etc";
    }
  }
  function catLabel(cat) {
    if (BUILTIN_LABEL[cat]) return BUILTIN_LABEL[cat];
    var cc = customCats();
    for (var i = 0; i < cc.length; i++) if (cc[i].k === cat) return cc[i].l;
    return "🧾 기타";
  }

  /* ---- 예산(경비 + 예상 교통비) ---- */
  /* 직접 입력한 교통비는 "직전 장소 → 여기" 한 구간의 값이다. 동선 최적화·드래그 정렬·날짜 이동으로
   * 직전 장소가 바뀌면 그 금액은 근거를 잃으므로(예: A→B 택시 5,000엔이 공항→B 요금으로 둔갑)
   * 예산·표시에서는 추정으로 되돌린다. 입력값 자체는 지우지 않아 편집창에서 다시 확인할 수 있다.
   * fareFrom 이 비어 있으면 구버전·공유 복원 데이터이므로 종전대로 신뢰한다. */
  function fareApplies(prev, s) {
    if (!s.fareFrom) return true;
    return !!prev && prev.id === s.fareFrom;
  }
  function legFare(prev, s, currency) {
    if (!s) return 0;
    if (typeof s.fareAmount === "number" && fareApplies(prev, s)) return s.fareAmount;   // 직접 입력 우선
    var mode = s.arriveBy;
    if (mode === "walk" || mode === "none") return 0;
    var estimable = prev && TP.geo.hasCoord(prev) && TP.geo.hasCoord(s);
    if (!mode) {                          // 미선택: 거리 알 때만 대중교통으로 추정(무좌표 유령요금 방지)
      if (!estimable) return 0;
      mode = "transit";
    }
    // 구글 실거리(Distance Matrix)가 있으면 우선
    var road = TP.geo.cachedRoad(prev, s, mode);
    if (road && typeof road.km === "number") {
      if (mode === "transit" && typeof road.fareValue === "number") {       // 구글이 준 실제 대중교통 요금
        var fc = road.fareCurrency || currency;
        return (fc === currency) ? road.fareValue : (TP.money.convert(road.fareValue, fc, currency) || road.fareValue);
      }
      return TP.money.estimateFare(road.km, mode, currency);
    }
    // 폴백: 직선거리 × 1.4(도로계수)
    var km = estimable ? TP.geo.haversine(prev, s) / 1000 * 1.4 : null;
    return TP.money.estimateFare(km, mode, currency);
  }
  /* route: 숙소 출발·귀가가 붙은 동선(store.routeOf). 없으면 장소 목록만 — 가상 칸은 경비가 비어 있어 교통비만 더해진다. */
  function dayBudget(day, currency, route) {
    var byPay = { credit: 0, debit: 0, cash: 0, other: 0 }, byCat = {}, dest = 0, transport = 0;
    var list = route || day.stops || [];
    list.forEach(function (s, i) {
      if (typeof s.costAmount === "number" && s.costAmount > 0) {
        dest += s.costAmount;
        var pm = (s.payment === "credit" || s.payment === "debit" || s.payment === "cash") ? s.payment : "other";
        byPay[pm] += s.costAmount;
        var cat = inferCategory(s); byCat[cat] = (byCat[cat] || 0) + s.costAmount;
      }
      if (i > 0) transport += legFare(list[i - 1], s, currency);
    });
    return { dest: dest, transport: transport, total: dest + transport, byPay: byPay, byCat: byCat };
  }
  function tripBudget(trip) {
    var cur = (trip && trip.currency) || "JPY";
    var agg = { dest: 0, transport: 0, total: 0, byPay: { credit: 0, debit: 0, cash: 0, other: 0 }, byCat: {} };
    (trip && trip.days || []).forEach(function (d) {
      var b = dayBudget(d, cur, TP.store.routeOf(trip, d));
      agg.dest += b.dest; agg.transport += b.transport; agg.total += b.total;
      ["credit", "debit", "cash", "other"].forEach(function (k) { agg.byPay[k] += b.byPay[k]; });
      Object.keys(b.byCat).forEach(function (k) { agg.byCat[k] = (agg.byCat[k] || 0) + b.byCat[k]; });
    });
    return agg;
  }
  /* 예산 항목을 큰 순으로 — [{key,label,value}] */
  function budgetItems(b) {
    var items = [], seen = {};
    allCats().forEach(function (c) {
      if (b.byCat[c[0]] > 0) { items.push({ key: c[0], label: c[1], value: b.byCat[c[0]] }); seen[c[0]] = 1; }
    });
    Object.keys(b.byCat).forEach(function (k) {   // 삭제된 커스텀 분류도 누락 없이
      if (!seen[k] && b.byCat[k] > 0) items.push({ key: k, label: catLabel(k), value: b.byCat[k] });
    });
    if (b.transport > 0) items.push({ key: "_transport", label: "🚌 교통(예상)", value: b.transport });
    items.sort(function (x, y) { return y.value - x.value; });   // 큰 지출이 위로
    return items;
  }

  /* 분류별 지출 막대 —
   * 읽는 사람이 하는 일은 "어디에 얼마 썼나"(크기 비교)라서 한 가지 색의 가로 막대로 그린다.
   * 분류마다 다른 색을 주는 누적 막대도 만들어 봤지만, 분류가 5개를 넘으면 색각이상에서 구분이
   * 무너진다(dataviz validator 실측: 6색 all-pairs 에서 ΔE 1.6 — 통과 한계는 5색). 게다가 지출이
   * 없는 분류는 통째로 빠져 아무 색끼리나 이웃이 되므로 "인접만 검증"으로도 안전을 보장할 수 없다.
   * 한 색이면 그 문제가 사라지고, 값은 각 줄에 직접 적혀 툴팁에 기대지 않는다. */
  function budgetChart(items, currency) {
    if (!items.length) return null;
    var M = TP.money;
    var max = items.reduce(function (a, s) { return Math.max(a, s.value); }, 0);
    if (max <= 0) return null;
    return el("div.budget__chart", null, items.map(function (s) {
      return el("div.budget__row", null, [
        el("span.budget__rowlabel", { text: s.label }),
        el("span.budget__track", null, [
          el("span.budget__fill", { style: { width: Math.max(2, s.value / max * 100) + "%" } })
        ]),
        el("span.budget__rowval", { text: M.format(s.value, currency) })
      ]);
    }));
  }

  function budgetBanner(b, currency, label, homeCur) {
    if (!b || b.total <= 0) return null;
    var M = TP.money;
    var items = budgetItems(b);
    // 결제수단 줄
    var pay = [];
    if (b.byPay.credit > 0) pay.push("신용 " + M.format(b.byPay.credit, currency));
    if (b.byPay.debit > 0) pay.push("체크 " + M.format(b.byPay.debit, currency));
    if (b.byPay.cash > 0) pay.push("현금 " + M.format(b.byPay.cash, currency));
    var conv = M.formatConv(b.total, currency, homeCur);
    return el("div.budget", null, [
      el("div.budget__top", null, [
        el("span.budget__label", { text: label || "예산" }),
        el("div.budget__amt", null, [
          el("span.budget__total", { text: M.format(b.total, currency) }),
          conv ? el("span.budget__conv", { text: conv }) : null
        ])
      ]),
      budgetChart(items, currency),
      pay.length ? el("div.budget__pay", { text: "💳 결제: " + pay.join(" · ") }) : null
    ]);
  }

  /* 이미 그려진 타임라인의 '야외' 배지만 우천 상태로 바꾼다(전체 재빌드 대신).
   * 비 예보인 날 타임라인이 두 번 만들어지던 것을 없앤다 — 차이가 이 배지 하나뿐이기 때문. */
  function markRainy(rootEl, rainy) {
    if (!rootEl) return;
    U.$$("[data-outdoor]", rootEl).forEach(function (b) {
      b.textContent = rainy ? "야외 · 우천주의" : "야외";
      b.classList.toggle("badge--amber", !!rainy);
    });
  }

  TP.render = {
    timeline: timeline, stopCard: stopCard, badgesFor: badgesFor, markRainy: markRainy,
    weatherBanner: weatherBanner, rainBanner: rainBanner, scheduleBanner: scheduleBanner,
    dayBudget: dayBudget, tripBudget: tripBudget, budgetBanner: budgetBanner,
    COST_CATS: BUILTIN_CATS, BUILTIN_CATS: BUILTIN_CATS, allCats: allCats,
    inferCategory: inferCategory, catLabel: catLabel,
    typeIcon: typeIcon, TYPE_ICON: TYPE_ICON, TYPE_LABEL: TYPE_LABEL,
    closingInfo: closingInfo
  };
})(window.TP = window.TP || {});
