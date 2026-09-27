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
  var MAX_IMAGES = 10, MAX_EDGE = 1400, QUALITY = 0.82;

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

  function analyze(images, caption) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 90000);
    return fetch(WORKER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: images.map(function (i) { return { type: "image/jpeg", data: i.data }; }),
        caption: caption
      }),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        clearTimeout(timer);
        if (!r.ok) throw new Error(j.error || ("서버 오류 (" + r.status + ")"));
        return Array.isArray(j.places) ? j.places : [];
      });
    }, function (e) {
      clearTimeout(timer);
      throw (e && e.name === "AbortError") ? new Error("시간이 너무 오래 걸려요. 사진 수를 줄여보세요") : new Error("연결에 실패했어요");
    });
  }

  function placeRow(p) {
    var sub = [p.name_ko && p.name_ko !== p.name ? p.name_ko : "", p.area].filter(Boolean).join(" · ");
    return el("a.ig-place", { href: mapsURL(p), target: "_blank", rel: "noopener" }, [
      el("span.ig-place__emoji", { text: catEmoji(p.category) }),
      el("span.ig-place__main", null, [
        el("span.ig-place__name", { text: p.name || p.name_ko || "이름 없음" }),
        sub ? el("span.ig-place__sub", { text: sub }) : null
      ]),
      p.confidence === "low" ? el("span.ig-place__guess", { text: "추정" }) : null,
      el("span.ig-place__go", { html: "›" })
    ]);
  }

  function renderResults(target, places, label) {
    target.innerHTML = "";
    if (!places.length) {
      target.appendChild(el("p.ig-note", { text: "장소를 찾지 못했어요. 간판이나 장소명이 보이는 사진, 또는 캡션을 함께 넣어보세요." }));
      return;
    }
    target.appendChild(el("div.ig-results__head", null, [
      el("span", { text: label }),
      el("span.ig-results__count", { text: places.length + "곳" })
    ]));
    places.forEach(function (p) { target.appendChild(placeRow(p)); });
    target.appendChild(el("p.ig-note", { text: "누르면 구글맵에서 열려요. 저장 버튼으로 원하는 목록에 담으세요." }));
  }

  function open() {
    var shots = [];   // {data, preview}
    var busy = false;

    TP.editor.modal(function (box, close) {
      box.appendChild(el("div.modal__title", { text: "📸 인스타에서 장소 찾기" }));
      box.appendChild(el("div.modal__sub", { text: "게시물 사진을 캡처해 올리면 소개된 장소를 찾아드려요." }));

      var results = el("div.ig-results");

      if (!WORKER) {
        box.appendChild(el("p.ig-note.ig-note--warn", { text: "config.js에 INSTA_WORKER_URL이 비어 있어요. Worker를 배포한 뒤 주소를 넣어주세요." }));
      } else {
        var fileIn = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
        var thumbs = el("div.ig-thumbs");
        var pickBtn = el("button.btn.btn--ghost.btn--block", { onclick: function () { fileIn.click(); } }, ["🖼 스크린샷 선택"]);
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
          if (!shots.length && !caption) { U.toast("사진이나 캡션을 넣어주세요"); return; }
          busy = true; goBtn.disabled = true;
          status.textContent = "🔎 사진을 읽고 있어요… (10~30초)";
          analyze(shots, caption).then(function (places) {
            saveLast(places);
            status.textContent = "";
            renderResults(results, places, "찾은 장소");
          }, function (err) {
            status.textContent = "⚠️ " + err.message;
          }).then(function () { busy = false; goBtn.disabled = false; });
        }

        box.appendChild(fileIn);
        box.appendChild(pickBtn);
        box.appendChild(thumbs);
        box.appendChild(el("div.field", { style: { marginTop: "12px" } }, [cap]));
        box.appendChild(goBtn);
        box.appendChild(status);
      }

      box.appendChild(results);
      var last = loadLast();
      if (last && last.places.length) renderResults(results, last.places, "지난번에 찾은 장소");

      box.appendChild(el("div.modal__actions", null, [
        el("button.btn.btn--block.btn--ghost", { onclick: close }, ["닫기"])
      ]));
    });
  }

  TP.insta = { open: open, mapsURL: mapsURL };
})(window.TP = window.TP || {});
