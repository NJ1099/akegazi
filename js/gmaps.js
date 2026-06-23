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

  // 부트스트랩이 importLibrary를 동기적으로 정의하므로, 키가 있으면 즉시 true.
  function available() {
    return !!(window.google && window.google.maps && window.google.maps.importLibrary);
  }

  // 라이브러리 지연 로드. 키 없거나 로더 미주입이면 reject → 호출부에서 폴백.
  function lib(name) {
    if (!available()) return Promise.reject(new Error("google-maps-unavailable"));
    return window.google.maps.importLibrary(name);
  }

  TP.gmaps = { hasKey: hasKey, available: available, lib: lib };
})(window.TP = window.TP || {});
