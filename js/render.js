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
    else if (stop.indoor === false) out.push(badge(rainy ? "야외 · 우천주의" : "야외", rainy ? "badge--amber" : ""));

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
  function stopCard(day, stop, prevStop, ctx) {
    var ci = closingInfo(stop, day);
    var card = el("div.stop", { dataset: { stop: stop.id } });
    if (stop.fixed) card.classList.add("is-fixed");
    if (ci.conflict) card.classList.add("is-conflict");

    // 헤드
    var titles = el("div.stop__titles", null, [
      el("div.stop__title", { text: stop.title || "(제목 없음)" }),
      stop.subtitle ? el("div.stop__sub", { text: stop.subtitle }) : null
    ]);
    var head = el("div.stop__head", null, [
      el("div.stop__icon", { text: typeIcon(stop) }),
      titles,
      stop.durationLabel ? el("div.stop__dur", null, ["⏱ " + stop.durationLabel]) : null
    ]);
    card.appendChild(head);

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

    // 배지
    var badges = badgesFor(stop, day, ctx && ctx.rainy);
    if (badges.length) card.appendChild(el("div.badges", null, badges));

    // 노트
    if (stop.note) {
      card.appendChild(el("div.stop__note", null, [
        el("span.em", { html: "💡" }), el("span", { text: stop.note })
      ]));
    }

    // 휴무 충돌 경고
    if (ci.conflict) {
      card.appendChild(el("div.stop__conflict", null, [
        el("span", { html: "⚠️" }),
        el("span", { text: "방문 예정일(" + U.weekdayKo(day.date) + "요일)이 휴무일과 겹쳐요. 영업 여부를 확인하세요." })
      ]));
    }

    // 액션
    var dirLabel = prevStop ? "길찾기 (이전→여기)" : "길찾기";
    var actions = el("div.stop__actions", null, [
      el("button.btn.btn--sm", {
        onclick: function (e) { e.stopPropagation(); openDir(prevStop, stop); }
      }, ["🧭 " + dirLabel]),
      el("button.btn.btn--sm.btn--ghost", {
        onclick: function (e) { e.stopPropagation(); openMap(stop); }
      }, ["📍 지도"])
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
    day.stops.forEach(function (s, i) {
      var color = TP.maps.DOT[(ctx.dayIndex || 0) % TP.maps.DOT.length];
      var item = el("div.tl-item", { dataset: { stop: s.id } }, [
        el("div.tl-item__time", { text: s.time || dashTime(i) }),
        el("div.tl-item__dot", { style: { "--dot": color, background: color, boxShadow: "0 0 0 4px var(--bg-2), 0 0 12px " + color } }),
        stopCard(day, s, i > 0 ? day.stops[i - 1] : null, ctx)
      ]);
      wrap.appendChild(item);
    });
    return wrap;
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

  TP.render = {
    timeline: timeline, stopCard: stopCard, badgesFor: badgesFor,
    weatherBanner: weatherBanner, rainBanner: rainBanner,
    typeIcon: typeIcon, TYPE_ICON: TYPE_ICON, TYPE_LABEL: TYPE_LABEL,
    closingInfo: closingInfo
  };
})(window.TP = window.TP || {});
