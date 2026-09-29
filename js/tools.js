/* tools.js — 여행 도구: 쓴 돈·정산 / 준비물 체크리스트 (네임스페이스 TP.tools)
 *
 *   - 쓴 돈: 예산(예상)과 따로 실제로 쓴 돈을 적는다. 일행이 둘 이상이면 "누가 누구에게 얼마"를 낸다.
 *   - 준비물: 처음 열면 기본 목록(여권·eSIM·환전 …)을 깔아 주고, 체크·추가·삭제만 한다.
 *   화면은 여행 화면의 두 줄(tripRows)에서 들어간다 — 여행 화면에 섹션을 더 늘리지 않으려고 따로 뺐다.
 */
(function (TP) {
  "use strict";
  var U = TP.util, el = U.el, store = TP.store, M = TP.money;

  /* ---------- 여행 화면의 입구 두 줄 ---------- */
  function tripRows(trip) {
    var cur = trip.currency || "JPY";
    var spent = totalSpent(trip);
    var done = trip.packing.filter(function (p) { return p.done; }).length;
    return el("div.list-card", null, [
      el("button.list-row", { onclick: function () { location.hash = "#/trip/" + trip.id + "/money"; } }, [
        el("span.list-row__icon", { text: "💸" }),
        el("span.list-row__main", null, [
          el("span.list-row__title", { text: "쓴 돈" }),
          el("span.list-row__sub", { text: trip.expenses.length ? trip.expenses.length + "건 기록" + (trip.members.length > 1 ? " · 일행 " + trip.members.length + "명 정산" : "") : "쓴 돈을 적으면 일행 정산까지" })
        ]),
        el("span.list-row__tail", { text: spent > 0 ? M.format(spent, cur) : "›" })
      ]),
      el("button.list-row", { onclick: function () { location.hash = "#/trip/" + trip.id + "/pack"; } }, [
        el("span.list-row__icon", { text: "🎒" }),
        el("span.list-row__main", null, [
          el("span.list-row__title", { text: "준비물" }),
          el("span.list-row__sub", { text: trip.packing.length ? done + " / " + trip.packing.length + " 챙김" : "여권·eSIM·환전 체크리스트" })
        ]),
        el("span.list-row__tail", { text: (trip.packing.length && done === trip.packing.length) ? "✓" : "›" })
      ])
    ]);
  }

  /* ---------- 쓴 돈 ---------- */
  function totalSpent(trip) { return trip.expenses.reduce(function (a, x) { return a + x.amount; }, 0); }

  /* 정산 — 각자 (낸 돈 − 나눠 낼 몫)을 구해, 받을 사람과 줄 사람을 큰 금액부터 짝짓는다(송금 횟수 최소에 가깝게).
   * 낸 사람이 일행 명단에 없으면(이름을 지웠거나 비워 둠) 그 기록은 정산에서 뺀다. */
  function settle(trip) {
    var members = trip.members, bal = {}, skipped = 0;
    members.forEach(function (m) { bal[m] = 0; });
    trip.expenses.forEach(function (x) {
      if (!x.payer || !(x.payer in bal)) { skipped++; return; }
      var split = x.split.filter(function (m) { return m in bal; });
      if (!split.length) split = members.slice();
      var share = x.amount / split.length;
      bal[x.payer] += x.amount;
      split.forEach(function (m) { bal[m] -= share; });
    });
    var dec = M.cfg(trip.currency).dec, eps = Math.pow(10, -dec) / 2;
    var cred = [], debt = [];
    members.forEach(function (m) {
      if (bal[m] > eps) cred.push({ m: m, v: bal[m] });
      else if (bal[m] < -eps) debt.push({ m: m, v: -bal[m] });
    });
    cred.sort(function (a, b) { return b.v - a.v; });
    debt.sort(function (a, b) { return b.v - a.v; });
    var out = [], i = 0, j = 0;
    while (i < debt.length && j < cred.length) {
      var v = Math.min(debt[i].v, cred[j].v);
      if (v > eps) out.push({ from: debt[i].m, to: cred[j].m, amount: v });
      debt[i].v -= v; cred[j].v -= v;
      if (debt[i].v <= eps) i++;
      if (cred[j].v <= eps) j++;
    }
    return { transfers: out, skipped: skipped };
  }

  function renderMoney(view, trip) {
    var cur = trip.currency || "JPY", home = trip.homeCurrency || "";
    var spent = totalSpent(trip);
    var planned = TP.render.tripBudget(trip).total;

    view.appendChild(el("div.trip-head", null, [
      el("div.trip-head__title", { text: "쓴 돈", style: { cursor: "default" } }),
      el("div.trip-head__meta", null, [el("span", { text: trip.title || "여행" })])
    ]));

    // 합계 — 예상 예산이 있으면 얼마나 썼는지 막대로
    var conv = M.formatConv(spent, cur, home);
    var sum = el("div.budget", null, [
      el("div.budget__top", null, [
        el("span.budget__label", { text: "지금까지" }),
        el("div.budget__amt", null, [el("span.budget__total", { text: M.format(spent, cur) }), conv ? el("span.budget__conv", { text: conv }) : null])
      ])
    ]);
    if (planned > 0) {
      var pct = Math.min(100, spent / planned * 100);
      sum.appendChild(el("div.budget__row", null, [
        el("span.budget__rowlabel", { text: "예상 " + M.format(planned, cur) }),
        el("span.budget__track", null, [el("span.budget__fill" + (spent > planned ? ".budget__fill--over" : ""), { style: { width: Math.max(2, pct) + "%" } })]),
        el("span.budget__rowval", { text: Math.round(spent / planned * 100) + "%" })
      ]));
    }
    view.appendChild(sum);

    // 일행
    view.appendChild(el("div.section-title", null, [
      el("span", { text: "일행" + (trip.members.length ? " " + trip.members.length : "") }),
      el("button.link-btn", { onclick: addMemberPrompt }, ["+ 추가"])
    ]));
    if (trip.members.length) {
      view.appendChild(el("div.chips.member-chips", null, trip.members.map(function (m) {
        return el("span.chip.chip--custom", null, [m, el("button.chip__x", {
          "aria-label": m + " 빼기", title: "빼기",
          onclick: function () { if (confirm("‘" + m + "’ 을(를) 일행에서 뺄까요? (적어 둔 기록은 남아요)")) store.removeMember(m); }
        }, ["✕"])]);
      })));
    } else {
      view.appendChild(el("button.list-card.list-card--empty", { onclick: addMemberPrompt }, ["👥  같이 가는 사람을 넣으면 누가 누구에게 얼마 줄지 계산해 드려요"]));
    }

    // 정산
    if (trip.members.length > 1 && trip.expenses.length) {
      var st = settle(trip);
      view.appendChild(el("div.section-title", null, [el("span", { text: "정산" })]));
      var rows = st.transfers.map(function (t) {
        var c2 = M.formatConv(t.amount, cur, home);
        return el("div.list-row", null, [
          el("span.list-row__icon", { text: "💱" }),
          el("span.list-row__main", null, [
            el("span.list-row__title", { text: t.from + " → " + t.to }),
            c2 ? el("span.list-row__sub", { text: c2 }) : null
          ]),
          el("span.list-row__tail", { text: M.format(t.amount, cur) })
        ]);
      });
      if (!rows.length) rows.push(el("div.list-row", null, [el("span.list-row__main", null, [el("span.list-row__title", { text: "주고받을 돈이 없어요 👍" })])]));
      if (st.skipped) rows.push(el("div.list-row", null, [el("span.list-row__main", null, [el("span.list-row__sub", { text: "낸 사람을 정하지 않은 기록 " + st.skipped + "건은 정산에서 뺐어요" })])]));
      view.appendChild(el("div.list-card", null, rows));
    }

    // 기록 — 날짜별(최근 날짜 먼저), 날짜 없는 건 맨 아래
    view.appendChild(el("div.section-title", null, [el("span", { text: "기록" })]));
    if (!trip.expenses.length) {
      view.appendChild(el("button.list-card.list-card--empty", { onclick: function () { openExpense(trip); } }, ["🧾  아래 ‘쓴 돈 기록’으로 하나씩 적어 보세요"]));
    } else {
      var groups = {}, keys = [];
      trip.expenses.forEach(function (x) { var k = x.date || ""; if (!groups[k]) { groups[k] = []; keys.push(k); } groups[k].push(x); });
      keys.sort(function (a, b) { return !a ? 1 : !b ? -1 : (a < b ? 1 : a > b ? -1 : 0); });
      keys.forEach(function (k) {
        var list = groups[k];
        var dayTotal = list.reduce(function (a, x) { return a + x.amount; }, 0);
        view.appendChild(el("div.money-date", null, [el("span", { text: k ? U.fmtDate(k) : "날짜 없음" }), el("span", { text: M.format(dayTotal, cur) })]));
        view.appendChild(el("div.list-card", null, list.slice().reverse().map(function (x) {
          var sub = [];
          if (trip.members.length > 1) {
            if (x.payer) sub.push(x.payer + " 냄");
            var n = x.split.filter(function (m) { return trip.members.indexOf(m) >= 0; }).length || trip.members.length;
            sub.push(n + "명이 나눔");
          }
          return el("button.list-row", { onclick: function () { openExpense(trip, x); } }, [
            el("span.list-row__main", null, [
              el("span.list-row__title", { text: x.title || "지출" }),
              sub.length ? el("span.list-row__sub", { text: sub.join(" · ") }) : null
            ]),
            el("span.list-row__tail.list-row__tail--ink", { text: M.format(x.amount, cur) })
          ]);
        })));
      });
    }

    view.appendChild(el("div.cta-bar", null, [
      el("button.btn.btn--block.btn--lg", { onclick: function () { openExpense(trip); } }, ["쓴 돈 기록"])
    ]));
  }

  function addMemberPrompt() {
    var t = store.activeTrip(); if (!t) return;
    var name = (window.prompt(t.members.length ? "일행 이름" : "일행 이름 (나부터 넣어 주세요 · 예: 나)") || "").trim();
    if (!name) return;
    if (!store.addMember(name)) U.toast(t.members.length >= 12 ? "일행은 12명까지예요" : "이미 있는 이름이에요");
  }

  /* 기록 창 — 금액·내용이 필수, 일행이 둘 이상일 때만 "누가 냈나 / 누구랑 나눴나"가 나온다 */
  function openExpense(trip, existing) {
    var cur = trip.currency || "JPY", home = trip.homeCurrency || "";
    var today = U.todayISO();
    var inTrip = trip.days.some(function (d) { return d.date === today; });
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { date: inTrip ? today : "", title: "", amount: null, payer: trip.members[0] || "", split: [] };
    var many = trip.members.length > 1;
    if (many && !f.split.length) f.split = trip.members.slice();

    TP.editor.modal(function (box, close) {
      box.appendChild(el("div.modal__title", { text: existing ? "기록 고치기" : "쓴 돈 기록" }));
      var c = M.cfg(cur);
      var amt = el("input.input.input--big", { type: "number", min: "0", step: "any", inputmode: "decimal", value: f.amount != null ? f.amount : "", placeholder: c.sym.trim() + " 0", "aria-label": "금액 (" + c.name + ")" });
      var conv = el("div.money-conv");
      function drawConv() { var v = parseFloat(amt.value); conv.textContent = (isFinite(v) && v > 0) ? M.formatConv(v, cur, home) : ""; }
      amt.addEventListener("input", function () { var v = parseFloat(amt.value); f.amount = (isFinite(v) && v > 0) ? v : null; drawConv(); });
      drawConv();
      box.appendChild(el("div.field", null, [el("label", { text: "얼마 썼나요?" }), amt, conv]));

      box.appendChild(el("div.field", null, [el("label", { text: "어디에?" }),
        el("input.input", { value: f.title, placeholder: "예: 저녁 라멘, 택시, 기념품", maxlength: "60", oninput: function () { f.title = this.value; } })]));

      var dateSel = el("select.select", { "aria-label": "날짜", onchange: function () { f.date = this.value; } },
        [el("option", { value: "", text: "날짜 없음" })].concat(trip.days.map(function (d, i) {
          return el("option", { value: d.date, text: "Day " + (i + 1) + (d.date ? " · " + U.fmtDate(d.date) : "") });
        })));
      dateSel.value = f.date || "";
      box.appendChild(el("div.field", null, [el("label", { text: "언제?" }), dateSel]));

      if (many) {
        var payWrap = el("div.chips");
        trip.members.forEach(function (m) {
          payWrap.appendChild(el("button.chip" + (f.payer === m ? ".is-on" : ""), { type: "button", onclick: function () {
            f.payer = m; U.$$(".chip", payWrap).forEach(function (x) { x.classList.remove("is-on"); }); this.classList.add("is-on");
          } }, [m]));
        });
        box.appendChild(el("div.field", null, [el("label", { text: "누가 냈나요?" }), payWrap]));
        var splitWrap = el("div.chips");
        trip.members.forEach(function (m) {
          splitWrap.appendChild(el("button.chip" + (f.split.indexOf(m) >= 0 ? ".is-on" : ""), { type: "button", onclick: function () {
            var i = f.split.indexOf(m);
            if (i >= 0) { f.split.splice(i, 1); this.classList.remove("is-on"); } else { f.split.push(m); this.classList.add("is-on"); }
          } }, [m]));
        });
        box.appendChild(el("div.field", null, [el("label", null, ["누구랑 나눴나요?", el("span.hint", { text: "  고른 사람끼리 똑같이 나눠요" })]), splitWrap]));
      }

      box.appendChild(el("div.modal__actions", null, [
        el("button.btn.btn--block", { onclick: function () {
          if (!(f.amount > 0)) { U.toast("금액을 입력하세요"); amt.focus(); return; }
          if (many && !f.split.length) { U.toast("나눈 사람을 한 명 이상 고르세요"); return; }
          var data = { date: f.date, title: (f.title || "").trim(), amount: f.amount, payer: f.payer, split: many ? f.split : [] };
          if (existing) store.updateExpense(existing.id, data); else store.addExpense(data);
          close(); U.toast(existing ? "고쳤어요" : "기록했어요");
        } }, [existing ? "저장" : "기록"]),
        el("button.btn.btn--block.btn--ghost", { onclick: close }, ["취소"])
      ]));
      if (existing) {
        box.appendChild(el("button.btn.btn--block.btn--danger.modal__delete", { onclick: function () {
          if (!confirm("이 기록을 지울까요?")) return;
          store.removeExpense(existing.id); close(); U.toast("지웠어요");
        } }, ["이 기록 삭제"]));
      }
    });
  }

  /* ---------- 준비물 ---------- */
  function dDayText(trip) {
    var ds = trip.days.map(function (d) { return d.date; }).filter(Boolean).sort();
    if (!ds.length) return "";
    var today = U.todayISO();
    if (today > ds[ds.length - 1]) return "다녀온 여행";
    if (today >= ds[0]) return "여행 중";
    return "출발 D-" + U.daysBetween(today, ds[0]);
  }
  var packFocus = false;   // 추가한 직후 다시 그려져도 입력칸에 커서를 돌려준다(연달아 적기)
  function renderPack(view, trip) {
    store.ensurePacking();
    var list = trip.packing;
    var done = list.filter(function (p) { return p.done; }).length;
    var dd = dDayText(trip);
    view.appendChild(el("div.trip-head", null, [
      el("div.trip-head__title", { text: "준비물", style: { cursor: "default" } }),
      el("div.trip-head__meta", null, [el("span", { text: (dd ? dd + " · " : "") + done + " / " + list.length + " 챙김" })])
    ]));
    if (list.length) {
      view.appendChild(el("div.list-card", null, list.map(function (p) {
        return el("div.pack-row" + (p.done ? ".is-done" : ""), null, [
          el("button.pack-row__check", { "aria-pressed": p.done ? "true" : "false", "aria-label": p.text + (p.done ? " 챙김 취소" : " 챙김"), onclick: function () { store.togglePack(p.id); } }, [
            el("span.pack-row__box", { text: p.done ? "✓" : "" }),
            el("span.pack-row__text", { text: p.text })
          ]),
          el("button.pack-row__del", { "aria-label": p.text + " 삭제", title: "삭제", onclick: function () { store.removePack(p.id); } }, ["✕"])
        ]);
      })));
    }
    var inp = el("input.input", { placeholder: "더 챙길 것 (예: 우산, 수영복)", maxlength: "80", "aria-label": "준비물 추가" });
    function add() { var v = inp.value.trim(); if (!v) { inp.focus(); return; } packFocus = true; store.addPack(v); }
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); add(); } });
    view.appendChild(el("div.pack-add", null, [inp, el("button.btn.btn--sm", { onclick: add }, ["추가"])]));
    if (packFocus) { packFocus = false; setTimeout(function () { try { inp.focus(); } catch (e) {} }, 0); }
  }

  TP.tools = { tripRows: tripRows, renderMoney: renderMoney, renderPack: renderPack, settle: settle, openExpense: openExpense };
})(window.TP = window.TP || {});
