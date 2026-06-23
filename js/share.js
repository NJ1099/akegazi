/* share.js — 일정 공유(링크 인코딩) + 공유 링크 열기 시 불러오기 (네임스페이스 TP.share)
 * 서버 없이 트립 데이터를 URL 해시(#trip=...)에 압축 담아 카톡/텔레그램 등으로 공유.
 */
(function (TP) {
  "use strict";
  var U = TP.util, el = U.el;

  /* 짧은 키 ↔ 풀 키 */
  var KMAP = {
    y: "type", n: "title", u: "subtitle", a: "address", la: "lat", lo: "lon",
    tm: "time", dl: "durationLabel", at: "arriveTime", dp: "departTime", sm: "stayMin",
    in: "indoor", oh: "openHours", cd: "closingDays",
    cn: "closingNote", rs: "reservation", rn: "reservationNote", fx: "fixed",
    ph: "photoSpot", nt: "note", co: "cost"
  };

  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  function compactStop(s) {
    var c = {};
    if (s.type && s.type !== "attraction") c.y = s.type;
    if (s.title) c.n = s.title;
    if (s.subtitle) c.u = s.subtitle;
    if (s.address) c.a = s.address;
    if (typeof s.lat === "number") c.la = round6(s.lat);
    if (typeof s.lon === "number") c.lo = round6(s.lon);
    if (s.time) c.tm = s.time;
    if (s.durationLabel) c.dl = s.durationLabel;
    if (s.arriveTime) c.at = s.arriveTime;
    if (s.departTime) c.dp = s.departTime;
    if (typeof s.stayMin === "number") c.sm = s.stayMin;
    if (s.indoor === true || s.indoor === false) c.in = s.indoor;
    if (s.openHours) c.oh = s.openHours;
    if (s.closingDays && s.closingDays.length) c.cd = s.closingDays;
    if (s.closingNote) c.cn = s.closingNote;
    if (s.reservation && s.reservation !== "none") c.rs = s.reservation;
    if (s.reservationNote) c.rn = s.reservationNote;
    if (s.fixed) c.fx = 1;
    if (s.photoSpot) c.ph = 1;
    if (s.note) c.nt = s.note;
    if (s.cost) c.co = s.cost;
    return c;
  }
  function expandStop(c) {
    var o = {};
    Object.keys(KMAP).forEach(function (k) { if (k in c) o[KMAP[k]] = c[k]; });
    o.fixed = !!c.fx; o.photoSpot = !!c.ph;
    return o;
  }

  /* ---- base64url (UTF-8 안전) ---- */
  function b64urlEncode(s) {
    return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return decodeURIComponent(escape(atob(s)));
  }

  function encode(trip) {
    var compact = {
      t: trip.title,
      d: (trip.days || []).map(function (day) {
        var o = { dt: day.date, s: (day.stops || []).map(compactStop) };
        if (day.label) o.l = day.label;
        return o;
      })
    };
    return b64urlEncode(JSON.stringify(compact));
  }
  function decode(str) {
    try {
      var c = JSON.parse(b64urlDecode(str));
      if (!c || !Array.isArray(c.d)) return null;
      return {
        title: c.t || "공유받은 일정",
        days: c.d.map(function (day) {
          return { date: day.dt || "", label: day.l || "", stops: (day.s || []).map(expandStop) };
        })
      };
    } catch (e) { return null; }
  }

  function buildURL(trip) {
    var base = location.origin + location.pathname;   // 쿼리스트링 전파 방지
    return base + "#trip=" + encode(trip);
  }

  /* ---- 공유 실행 ---- */
  function shareTrip(trip) {
    trip = trip || TP.store.activeTrip();
    if (!trip) { U.toast("공유할 여행을 먼저 선택하세요"); return; }
    if (!trip.days || !trip.days.length) { U.toast("공유할 일정이 없어요. 먼저 날짜와 장소를 추가하세요."); return; }
    var url = buildURL(trip);
    if (url.length > 16000) { U.toast("일정이 너무 커서 링크가 길어요. ‘내보내기(JSON)’로 공유하세요."); return; }
    var title = trip.title || "여행 일정";
    var shareText = title + " — 어케가지로 만든 여행 일정 보기";
    if (navigator.share) {
      navigator.share({ title: title, text: shareText, url: url }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () { U.toast("공유 링크를 복사했어요. 카톡·텔레그램에 붙여넣어 보내세요!"); },
        function () { promptCopy(url); }
      );
    } else {
      promptCopy(url);
    }
  }
  function promptCopy(url) { window.prompt("아래 링크를 복사해 카톡·텔레그램으로 보내세요:", url); }

  /* ---- 공유 링크로 들어온 경우 처리 ---- */
  function checkIncoming() {
    var m = /[#&]trip=([^&]+)/.exec(location.hash || "");
    if (!m) return false;
    var trip = decode(m[1]);
    // 해시 payload 제거(새로고침 시 재프롬프트 방지) → 홈으로
    try { history.replaceState(null, "", location.pathname + location.search + "#/"); } catch (e) { location.hash = "#/"; }
    if (!trip) { U.toast("공유 링크를 읽지 못했어요"); return false; }
    showImportModal(trip);
    return true;
  }

  function showImportModal(trip) {
    var dayCount = (trip.days || []).length;
    var stopCount = (trip.days || []).reduce(function (a, d) { return a + (d.stops ? d.stops.length : 0); }, 0);
    TP.editor.modal(function (box, close) {
      box.appendChild(el("div.modal__title", { text: "📨 공유받은 일정" }));
      box.appendChild(el("div.modal__sub", { text: (trip.title || "여행 일정") + " · " + dayCount + "일 · " + stopCount + "곳" }));
      box.appendChild(el("p", { text: "이 일정을 내 ‘어케가지’ 여행 목록에 새 여행으로 추가할까요? 기존 여행은 그대로 유지됩니다.",
        style: { color: "var(--text-2)", fontSize: "13px", lineHeight: "1.6", margin: "4px 0 4px" } }));
      box.appendChild(el("div.modal__actions", null, [
        el("button.btn.btn--block", {
          onclick: function () {
            var t = TP.store.addTripData(trip);
            close();
            location.hash = "#/trip/" + t.id;
            U.toast("공유된 여행을 추가했어요");
          }
        }, ["여행으로 추가"]),
        el("button.btn.btn--block.btn--ghost", { onclick: close }, ["취소"])
      ]));
    });
  }

  TP.share = { encode: encode, decode: decode, buildURL: buildURL, shareTrip: shareTrip, checkIncoming: checkIncoming };
})(window.TP = window.TP || {});
