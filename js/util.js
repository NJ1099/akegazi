/* util.js — 공통 헬퍼 (네임스페이스 TP.util) */
(function (TP) {
  "use strict";

  var WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* 안전한 엘리먼트 생성기.
     el('div.foo', {onclick:fn}, ['텍스트', el('span', ...)]) */
  function el(spec, props, children) {
    var parts = spec.split(/(?=[.#])/);
    var tag = parts[0] || "div";
    var node = document.createElement(tag);
    for (var i = 1; i < parts.length; i++) {
      var p = parts[i];
      if (p[0] === ".") node.classList.add(p.slice(1));
      else if (p[0] === "#") node.id = p.slice(1);
    }
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === "class") node.className += (node.className ? " " : "") + v;
        else if (k === "html") {
          // html 프롭은 신뢰된 정적 리터럴(이모지 등) 전용. 사용자/외부 데이터는 반드시 text: 사용.
          // 회귀 가드: < 또는 >가 포함된 값은 textContent로 강등해 XSS를 차단한다.
          if (typeof v === "string" && !/[<>]/.test(v)) node.innerHTML = v;
          else node.textContent = String(v);
        }
        else if (k === "text") node.textContent = v;
        else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
        else if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (k === "dataset") Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (v === true) node.setAttribute(k, "");
        else node.setAttribute(k, v);
      });
    }
    appendChildren(node, children);
    return node;
  }
  function appendChildren(node, children) {
    if (children == null) return;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
    });
  }

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function uid() {
    return "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  /* 날짜 유틸 (입력은 'YYYY-MM-DD', 로컬 타임존 무관 파싱) */
  function parseDate(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) { var dd = new Date(s); return isNaN(dd) ? null : dd; }
    var y = +m[1], mo = +m[2] - 1, da = +m[3];
    var d = new Date(y, mo, da);
    if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== da) return null; // 범위 초과(롤오버) 거부
    return d;
  }
  function weekdayKo(s) { var d = parseDate(s); return d ? WEEKDAYS[d.getDay()] : ""; }
  function weekdayIdx(s) { var d = parseDate(s); return d ? d.getDay() : -1; }
  function fmtDate(s) {
    var d = parseDate(s);
    if (!d) return s || "";
    return (d.getMonth() + 1) + "/" + d.getDate() + " (" + WEEKDAYS[d.getDay()] + ")";
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function addDaysISO(s, n) {
    var d = parseDate(s) || new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function daysFromToday(s) {
    var d = parseDate(s); if (!d) return null;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  /* 타임아웃 포함 fetch JSON */
  function fetchJSON(url, opts) {
    opts = opts || {};
    var ctl = ("AbortController" in window) ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, opts.timeout || 9000);
    return fetch(url, { signal: ctl ? ctl.signal : undefined, headers: opts.headers })
      .then(function (r) {
        clearTimeout(to);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .catch(function (e) { clearTimeout(to); throw e; });
  }

  /* 토스트 */
  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("is-show"); }, 2200);
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  TP.util = {
    $: $, $$: $$, el: el, esc: esc, uid: uid, debounce: debounce,
    parseDate: parseDate, weekdayKo: weekdayKo, weekdayIdx: weekdayIdx,
    fmtDate: fmtDate, todayISO: todayISO, addDaysISO: addDaysISO,
    daysFromToday: daysFromToday, pad: pad, fetchJSON: fetchJSON,
    toast: toast, clamp: clamp, WEEKDAYS: WEEKDAYS
  };
})(window.TP = window.TP || {});
