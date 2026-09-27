/* gmaps.js — Google Maps JavaScript API 동적 로더 + 라이브러리 헬퍼 (네임스페이스 TP.gmaps)
 *
 *   - config.js의 GOOGLE_MAPS_API_KEY가 있으면 구글 공식 "동적 라이브러리 임포트"
 *     부트스트랩 로더를 주입한다. 실제 라이브러리(maps/places)는 필요할 때
 *     TP.gmaps.lib("maps") 처럼 지연 로드한다(키별 1회만 네트워크 요청).
 *   - 키가 없으면 로더를 주입하지 않으며, lib()는 reject 한다 →
 *     geo.js/maps.js가 키리스 폴백/안내 메시지로 graceful degrade.
 */
(function (TP) {
  "use strict";
  var CFG = window.TP_CONFIG || {};
  var KEY = ((CFG.GOOGLE_MAPS_API_KEY || "") + "").trim();

  function hasKey() { return !!KEY; }

  if (KEY) {
    // ── Google Maps JavaScript API: 공식 인라인 부트스트랩 로더(동적 라이브러리 임포트) ──
    // 참고: https://developers.google.com/maps/documentation/javascript/load-maps-js-api
    (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
      key: KEY,
      v: "weekly",
      language: "ko"
    });
  }

  /* ── 고장 감지 ──
   * 결제 중지·API 미사용·키 제한 등으로 구글이 거부하면, 지도는 "제대로 로드할 수 없습니다" 창을 띄우고
   * 검색은 403을 돌려준다. 이때마다 구글을 다시 두드리면 느리고 화면만 깨지므로, 한 번 실패하면
   * 범위(maps/places)별로 1시간 동안 "고장"으로 기억하고 키리스 대안(OSM 지도·Nominatim 검색)으로 바로 간다.
   * 결제를 고치면 1시간 뒤(또는 TP.gmaps.resetBroken() 후) 자동으로 구글로 돌아온다. */
  var BROKEN_KEY = "akegazi.gmaps.broken.v1";
  var BROKEN_TTL = 60 * 60 * 1000;
  var broken = (function () {
    try {
      var v = JSON.parse(localStorage.getItem(BROKEN_KEY)) || {}, out = {};
      Object.keys(v).forEach(function (k) { if (v[k] && Date.now() - v[k].t < BROKEN_TTL) out[k] = v[k]; });
      return out;
    } catch (e) { return {}; }
  })();
  var brokenListeners = [];

  function scopeOf(name) { return name === "places" ? "places" : "maps"; }
  function isBroken(scope) { return !!broken[scope || "maps"]; }
  function markBroken(scope, reason) {
    scope = scope || "maps";
    if (broken[scope]) return;
    broken[scope] = { t: Date.now(), reason: String(reason || "error") };
    try { localStorage.setItem(BROKEN_KEY, JSON.stringify(broken)); } catch (e) {}
    if (window.console && console.warn) console.warn("[어케가지] 구글 " + scope + " 사용 불가(" + broken[scope].reason + ") → 키리스 대안으로 전환");
    brokenListeners.slice().forEach(function (l) { if (l.scope === scope) { try { l.fn(broken[scope].reason); } catch (e) {} } });
    brokenListeners = brokenListeners.filter(function (l) { return l.scope !== scope; });
  }
  function onBroken(scope, fn) {
    if (broken[scope]) { fn(broken[scope].reason); return function () {}; }
    var l = { scope: scope, fn: fn };
    brokenListeners.push(l);
    return function () { brokenListeners = brokenListeners.filter(function (x) { return x !== l; }); };
  }
  function resetBroken() { broken = {}; try { localStorage.removeItem(BROKEN_KEY); } catch (e) {} }

  if (KEY) {
    // 키 인증 실패(잘못된 키·리퍼러 불허) 시 구글이 호출하는 공식 전역 콜백
    window.gm_authFailure = function () { markBroken("maps", "AuthFailure"); };
    // 결제 미사용(BillingNotEnabledMapError) 등은 콜백 없이 콘솔 오류로만 알려준다 → 콘솔 오류를 엿봐서 감지
    var origError = console.error;
    console.error = function () {
      try {
        var m = /Google Maps JavaScript API error: (\w+)/.exec(String(arguments[0] || ""));
        if (m && /MapError$/.test(m[1])) markBroken("maps", m[1]);
      } catch (e) {}
      return origError.apply(console, arguments);
    };
  }

  // 부트스트랩이 importLibrary를 동기적으로 정의하므로, 키가 있으면 즉시 true.
  function available() {
    return !!(window.google && window.google.maps && window.google.maps.importLibrary);
  }

  // 라이브러리 지연 로드. 키 없음·로더 미주입·고장 기억 중이면 reject → 호출부에서 폴백.
  function lib(name) {
    if (!available()) return Promise.reject(new Error("google-maps-unavailable"));
    if (isBroken(scopeOf(name))) return Promise.reject(new Error("google-" + scopeOf(name) + "-broken"));
    return window.google.maps.importLibrary(name);
  }

  TP.gmaps = { hasKey: hasKey, available: available, lib: lib,
    isBroken: isBroken, markBroken: markBroken, onBroken: onBroken, resetBroken: resetBroken };
})(window.TP = window.TP || {});
