/* insta.js — 인스타 게시물 스크린샷/캡션 → 장소 목록 → 탭하면 구글맵 (네임스페이스 TP.insta)
 *
 *   - 사진은 브라우저에서 긴 변 1400px JPEG로 줄여서 보낸다(업로드 용량·속도 절약).
 *   - 분석은 Cloudflare Worker(worker/worker.js)가 Claude API로 처리한다.
 *     API 키는 Worker에만 있고 이 페이지에는 없다. 주소는 config.js의 INSTA_WORKER_URL.
 *   - 장소를 누르면 구글맵 검색 링크(https://www.google.com/maps/search/?api=1&query=…)로 이동.
 *     모바일에선 구글맵 앱이 바로 열린다. Places API(결제)가 없어도 동작한다.
 *   - 마지막 결과는 localStorage에 남겨, 구글맵에 다녀와도 목록이 그대로 보이게 한다.
 */
(function (TP) {
  "use strict";
  var el = TP.util.el, U = TP.util;
  var CFG = window.TP_CONFIG || {};
  var WORKER = ((CFG.INSTA_WORKER_URL || "") + "").trim();
  var LS_KEY = "akegazi.insta.v1";
  var MAX_IMAGES = 12, MAX_EDGE = 1400, QUALITY = 0.82;

  var CAT_EMOJI = [
    [/카페|cafe|coffee|디저트|dessert|베이커리|bakery/i, "☕"],
    [/식당|음식|맛집|레스토랑|restaurant|food|누들|국수|국밥|street food/i, "🍴"],
    [/^바$|\bbar\b|펍|pub|루프탑|rooftop|칵테일/i, "🍸"],
    [/숙소|호텔|hotel|resort|리조트|호스텔/i, "🏨"],
    [/쇼핑|마켓|market|mall|야시장|시장/i, "🛍️"],
    [/사원|temple|\bwat\b|사찰/i, "🛕"],
    [/해변|beach|섬|island/i, "🏝️"],
    [/스파|마사지|spa|massage/i, "💆"]
  ];
  function catEmoji(c) {
    c = c || "";
    for (var i = 0; i < CAT_EMOJI.length; i++) if (CAT_EMOJI[i][0].test(c)) return CAT_EMOJI[i][1];
    return "📍";
  }

  function mapsURL(p) {
    var q = [p.name || p.name_ko, p.area].filter(Boolean).join(" ");
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  }

  function loadLast() {
    try { var v = JSON.parse(localStorage.getItem(LS_KEY)); return (v && Array.isArray(v.places)) ? v : null; }
    catch (e) { return null; }
  }
  function saveLast(places) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ t: Date.now(), places: places })); } catch (e) {}
  }

  /* 이미지 → 긴 변 MAX_EDGE px JPEG(base64) */
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var s = Math.min(1, MAX_EDGE / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var dataURL = c.toDataURL("image/jpeg", QUALITY);
        resolve({ data: dataURL.split(",")[1], preview: dataURL });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("이미지를 읽지 못했어요")); };
      img.src = url;
    });
  }

  function post(path, payload) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 90000);
    return fetch(WORKER.replace(/\/$/, "") + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        clearTimeout(timer);
        if (!r.ok) throw new Error(j.error || ("서버 오류 (" + r.status + ")"));
        return j;
      });
    }, function (e) {
      clearTimeout(timer);
      throw (e && e.name === "AbortError") ? new Error("시간이 너무 오래 걸려요. 사진 수를 줄여보세요") : new Error("연결에 실패했어요");
    });
  }
  function sameKey(p) { return String(p.name || p.name_ko || "").toLowerCase().replace(/[^0-9a-z฀-๿가-힣]/g, ""); }
  /* 링크(캡션·표지)와 캡처 사진을 함께 분석해 합친다 → { places, link }
   * 링크만으로는 인스타가 첫 사진과 캡션만 내준다(넘겨 보는 사진은 로그인 벽 뒤) — link.imagesFromLink 로 안내한다. */
  function analyze(images, caption, url) {
    var jobs = [];
    if (url) jobs.push(post("/link", { url: url }));
    if (images.length || (caption && !url)) jobs.push(post("/", {
      images: images.map(function (i) { return { type: "image/jpeg", data: i.data }; }),
      caption: caption
    }));
    return Promise.all(jobs.map(function (j) { return j.then(function (v) { return v; }, function (e) { return { error: e }; }); })).then(function (res) {
      var ok = res.filter(function (r) { return !r.error; });
      if (!ok.length) throw res[0].error;
      var seen = {}, places = [];
      // 캡처 사진 쪽 결과를 먼저(게시물 순서), 링크 쪽은 새로 나온 곳만 뒤에
      ok.slice().reverse().forEach(function (r) {
        (r.places || []).forEach(function (p) { var k = sameKey(p); if (k && !seen[k]) { seen[k] = 1; places.push(p); } });
      });
      var link = ok.filter(function (r) { return r.link; })[0];
      return { places: places, link: link ? link.link : null, partialError: ok.length < res.length ? (res.filter(function (r) { return r.error; })[0].error.message) : "" };
    });
  }

  /* ── 여행에 담기 ──
   * 찾은 장소를 고른 날짜의 맨 뒤에 붙이고, 이름으로 위치를 찾아 좌표를 채운다(지도 번호 핀이 생긴다).
   * 위치 검색은 편집창과 같은 TP.geo.geocode(구글 → OSM → 이름 바꿔 재검색) 한 벌을 쓴다. */
  function stopType(c) {
    c = c || "";
    if (/카페|cafe|coffee|디저트|베이커리/i.test(c)) return "cafe";
    if (/식당|음식|맛집|레스토랑|restaurant|food|바|bar|펍/i.test(c)) return "food";
    if (/숙소|호텔|hotel|리조트|resort|호스텔/i.test(c)) return "lodging";
    if (/체험|스파|마사지|spa|massage|투어/i.test(c)) return "activity";
    return "attraction";
  }
  // 모든 여행의 날짜 → 선택지. 지금 보고 있는 여행을 먼저.
  function dayTargets() {
    var S = TP.store, act = S.activeId(), out = [];
    var trips = S.trips().slice().sort(function (a, b) { return (b.id === act) - (a.id === act); });
    trips.forEach(function (t) {
      (t.days || []).forEach(function (d, i) {
        out.push({ tripId: t.id, dayId: d.id, label: (t.title || "여행") + " · Day " + (i + 1) + (d.date ? " " + U.fmtDate(d.date) : "") });
      });
    });
    return out;
  }
  // 도시 중심 좌표(한 번 찾으면 기억). 못 찾으면 null → 거리 검사 없이 받는다.
  var NEAR_KM = 60;
  var cityMem = {};
  function cityCenter(city) {
    if (!city) return Promise.resolve(null);
    if (!cityMem[city]) {
      cityMem[city] = TP.geo.geocode(city).then(function (l) { return (l && l[0]) ? { lat: l[0].lat, lon: l[0].lon } : null; }, function () { return null; });
    }
    return cityMem[city];
  }
  // 위치 찾기는 차례로 — OSM(Nominatim)은 초당 1회 정책이라 한꺼번에 쏘면 막힌다
  var geoQueue = Promise.resolve();
  function addToTrip(p, target) {
    var S = TP.store;
    S.setActive(target.tripId);
    var title = p.name_ko || p.name;
    var s = S.addStop(target.dayId, {
      type: stopType(p.category), title: title,
      subtitle: (p.name_ko && p.name && p.name !== p.name_ko) ? p.name : "",
      address: p.address || "",
      note: "📸 인스타에서 찾은 장소"
    });
    if (!s) return Promise.resolve(false);
    // 이름으로 먼저, 못 찾으면 게시물에 적힌 주소로(작은 가게는 OSM 에 이름이 없고 주소만 있는 경우가 많다)
    // 마지막 수단: 번지(11, 3 / 6/1,6 …)와 건물명을 떼고 골목·거리만 — 가게 자리는 아니어도 그 거리에 핀이 찍힌다
    var street = String(p.address || "").split(",").map(function (x) { return x.trim(); })
      .filter(function (x) { return /[a-z]/i.test(x) && !/mall|hotel|plaza|tower|center|centre|\d+f\b/i.test(x); })
      .map(function (x) { return x.replace(/^[\d\s\/-]+/, "").trim(); })[0] || "";
    var queries = [[p.name || p.name_ko, p.area], [p.address, p.area], [street, (p.area || "").split(" ")[0]]]
      .map(function (a) { return a.filter(Boolean).join(" "); })
      .filter(function (q, i, arr) { return q && (i === 0 || p.address) && arr.indexOf(q) === i; });
    // 🔴 OSM 은 이름이 같은 다른 나라 가게를 준다("The Family" → 미국 — 2026-09-27 실측).
    // 게시물 도시(area 첫 단어, 없으면 여행 지역)의 중심에서 NEAR_KM 안의 결과만 받는다.
    var city = (p.area || "").split(/\s+/)[0] || ((S.trip(target.tripId) || {}).region || "");
    function findFirst(center, i) {
      if (i >= queries.length) return Promise.resolve([]);
      return TP.geo.geocode(queries[i]).then(function (list) {
        var near = (list || []).filter(function (r) { return !center || TP.geo.haversine(center, r) < NEAR_KM * 1000; });
        return near.length ? near : findFirst(center, i + 1);
      }, function () { return findFirst(center, i + 1); });
    }
    geoQueue = geoQueue.then(function () {
      return cityCenter(city).then(function (center) { return findFirst(center, 0); }).then(function (list) {
        var r = list && list[0];
        if (!r) return false;
        S.setActive(target.tripId);                      // 사이에 다른 여행을 열었어도 제자리에 쓴다
        S.updateStop(target.dayId, s.id, { lat: r.lat, lon: r.lon, address: p.address || r.address || "", openHours: s.openHours || r.hours || "" });
        return true;
      }, function () { return false; });
    });
    return geoQueue;
  }

  function placeRow(p, ctx) {
    var sub = [p.name_ko && p.name_ko !== p.name ? p.name_ko : "", p.area].filter(Boolean).join(" · ");
    var link = el("a.ig-place", { href: mapsURL(p), target: "_blank", rel: "noopener" }, [
      el("span.ig-place__emoji", { text: catEmoji(p.category) }),
      el("span.ig-place__main", null, [
        el("span.ig-place__name", { text: p.name || p.name_ko || "이름 없음" }),
        sub ? el("span.ig-place__sub", { text: sub }) : null
      ]),
      p.confidence === "low" ? el("span.ig-place__guess", { text: "추정" }) : null,
      el("span.ig-place__go", { html: "›" })
    ]);
    if (!ctx || !ctx.target()) return link;
    var btn = el("button.ig-add", { "aria-label": (p.name_ko || p.name) + " 여행에 담기", onclick: function () { ctx.add([p], [btn]); } }, ["＋"]);
    ctx.buttons.push({ p: p, btn: btn });
    return el("div.ig-row", null, [link, btn]);
  }

  function markAdded(btn) { btn.disabled = true; btn.textContent = "✓"; btn.classList.add("is-done"); }

  // 담을 날짜 선택 + 담기 동작. 여행이 없으면 null(목록은 구글맵 링크로만 보인다).
  function addContext(onDone) {
    var targets = dayTargets();
    if (!targets.length) return null;
    var sel = el("select.select", { "aria-label": "담을 날짜" }, targets.map(function (t, i) { return el("option", { value: String(i), text: t.label }); }));
    var ctx = {
      sel: sel, buttons: [],
      target: function () { return targets[+sel.value] || null; },
      add: function (list, btns) {
        var tg = ctx.target();
        if (!tg) return;
        btns.forEach(function (b) { b.disabled = true; b.textContent = "…"; });
        var jobs = list.map(function (p) { return addToTrip(p, tg); });
        btns.forEach(markAdded);
        U.toast(list.length + "곳을 " + tg.label.replace(/^.* · /, "") + "에 담았어요 · 위치 찾는 중…");
        Promise.all(jobs).then(function (res) {
          var miss = res.filter(function (ok) { return !ok; }).length;
          U.toast(miss ? (miss + "곳은 위치를 못 찾았어요 — 일정에서 직접 지정해 주세요") : "위치까지 모두 찾았어요 🗺");
          if (onDone) onDone(tg);
        });
      }
    };
    return ctx;
  }

  function renderResults(target, places, label, ctx) {
    target.innerHTML = "";
    if (!places.length) {
      target.appendChild(el("p.ig-note", { text: "장소를 찾지 못했어요. 간판이나 장소명이 보이는 사진, 또는 캡션을 함께 넣어보세요." }));
      return;
    }
    target.appendChild(el("div.ig-results__head", null, [
      el("span", { text: label }),
      el("span.ig-results__count", { text: places.length + "곳" })
    ]));
    ctx = ctx && ctx();
    if (ctx) {
      target.appendChild(el("div.ig-addbar", null, [
        el("span.ig-addbar__label", { text: "담을 날짜" }), ctx.sel,
        el("button.btn.btn--block", { onclick: function () {
          var left = ctx.buttons.filter(function (b) { return !b.btn.disabled; });
          if (!left.length) { U.toast("이미 모두 담았어요"); return; }
          ctx.add(left.map(function (b) { return b.p; }), left.map(function (b) { return b.btn; }));
        } }, ["🗺 전부 여행에 담기"])
      ]));
    }
    places.forEach(function (p) { target.appendChild(placeRow(p, ctx)); });
    target.appendChild(el("p.ig-note", { text: ctx
      ? "＋ 를 누르면 고른 날짜에 담기고 지도에 번호 핀이 생겨요. 이름을 누르면 구글맵에서 열려요."
      : "누르면 구글맵에서 열려요. 여행을 만들면 여기서 바로 일정에 담을 수 있어요." }));
  }

  function open() {
    var shots = [];   // {data, preview}
    var busy = false;

    TP.editor.modal(function (box, close) {
      box.appendChild(el("div.modal__title", { text: "📸 인스타에서 장소 찾기" }));
      box.appendChild(el("div.modal__sub", { text: "게시물 링크를 붙여넣거나 사진을 캡처해 올리면 소개된 장소를 찾아드려요." }));

      var results = el("div.ig-results");
      var goBar = el("div.ig-gobar");
      // 담고 나면 "그 날짜 일정 보기" 버튼을 띄운다(지도 탭에서 번호 핀 확인)
      function makeCtx() {
        return addContext(function (tg) {
          goBar.innerHTML = "";
          goBar.appendChild(el("button.btn.btn--block", { onclick: function () {
            close();
            location.hash = "#/trip/" + tg.tripId + "/day/" + tg.dayId;
          } }, ["📅 담은 날짜 일정 보기"]));
        });
      }

      if (!WORKER) {
        box.appendChild(el("p.ig-note.ig-note--warn", { text: "config.js에 INSTA_WORKER_URL이 비어 있어요. Worker를 배포한 뒤 주소를 넣어주세요." }));
      } else {
        var fileIn = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
        var thumbs = el("div.ig-thumbs");
        var pickBtn = el("button.btn.btn--ghost.btn--block", { onclick: function () { fileIn.click(); } }, ["🖼 스크린샷 선택"]);
        var linkIn = el("input.input", { type: "url", inputmode: "url", placeholder: "인스타 게시물 링크 붙여넣기 (instagram.com/p/…)", "aria-label": "인스타 게시물 링크" });
        var cap = el("textarea.textarea", { rows: "3", placeholder: "캡션을 복사해 붙여넣으면 더 정확해요 (선택)" });
        var status = el("div.ig-status", { role: "status", "aria-live": "polite" });
        var goBtn = el("button.btn.btn--block", { onclick: run }, ["📍 장소 찾기"]);

        function drawThumbs() {
          thumbs.innerHTML = "";
          shots.forEach(function (s, i) {
            thumbs.appendChild(el("div.ig-thumb", null, [
              el("img", { src: s.preview, alt: "사진 " + (i + 1) }),
              el("button.ig-thumb__del", { "aria-label": "사진 " + (i + 1) + " 빼기", onclick: function () { shots.splice(i, 1); drawThumbs(); } }, ["✕"])
            ]));
          });
          pickBtn.textContent = shots.length ? "🖼 사진 추가 (" + shots.length + "/" + MAX_IMAGES + ")" : "🖼 스크린샷 선택";
        }

        fileIn.addEventListener("change", function () {
          var files = Array.prototype.slice.call(fileIn.files || []);
          fileIn.value = "";
          var room = MAX_IMAGES - shots.length;
          if (files.length > room) U.toast("사진은 최대 " + MAX_IMAGES + "장까지예요");
          files = files.slice(0, Math.max(0, room));
          if (!files.length) return;
          status.textContent = "사진 준비 중…";
          Promise.all(files.map(function (f) { return shrink(f).catch(function () { return null; }); })).then(function (list) {
            list.forEach(function (s) { if (s) shots.push(s); });
            status.textContent = "";
            drawThumbs();
          });
        });

        function run() {
          if (busy) return;
          var caption = cap.value.trim();
          var url = linkIn.value.trim();
          if (url && !/instagram\.com\//i.test(url)) { U.toast("인스타 게시물 링크를 넣어주세요"); return; }
          if (!shots.length && !caption && !url) { U.toast("링크·사진·캡션 중 하나를 넣어주세요"); return; }
          busy = true; goBtn.disabled = true;
          status.textContent = shots.length ? "🔎 사진 " + shots.length + "장을 읽고 있어요… (10~30초)" : "🔎 게시물을 읽고 있어요… (5~15초)";
          analyze(shots, caption, url).then(function (res) {
            var places = res.places;
            saveLast(places);
            var notes = [];
            // 링크만 넣었으면 첫 사진·캡션만 읽은 것이다 — 여러 장짜리 게시물은 캡처가 필요하다고 알려 준다
            if (res.link && !shots.length) notes.push("링크로는 첫 사진과 캡션만 읽을 수 있어요. 사진을 넘겨 보는 게시물이면 각 사진을 캡처해서 함께 올려 주세요.");
            if (res.partialError) notes.push("일부는 읽지 못했어요: " + res.partialError);
            status.textContent = notes.join(" ");
            renderResults(results, places, "찾은 장소", makeCtx);
          }, function (err) {
            status.textContent = "⚠️ " + err.message;
          }).then(function () { busy = false; goBtn.disabled = false; });
        }

        box.appendChild(el("div.field", null, [linkIn]));
        box.appendChild(fileIn);
        box.appendChild(pickBtn);
        box.appendChild(thumbs);
        box.appendChild(el("div.field", { style: { marginTop: "12px" } }, [cap]));
        box.appendChild(goBtn);
        box.appendChild(status);
      }

      box.appendChild(results);
      box.appendChild(goBar);
      var last = loadLast();
      if (last && last.places.length) renderResults(results, last.places, "지난번에 찾은 장소", makeCtx);

      box.appendChild(el("div.modal__actions", null, [
        el("button.btn.btn--block.btn--ghost", { onclick: close }, ["닫기"])
      ]));
    });
  }

  TP.insta = { open: open, mapsURL: mapsURL };
})(window.TP = window.TP || {});
