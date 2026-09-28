/* maps.js — 구글맵(JavaScript API): 번호 마커 + 점선 동선 + 위치 선택기 (네임스페이스 TP.maps)
 *
 *   - TP.gmaps.lib("maps")로 지연 로드한 구글맵 위에 방문 순서 번호 마커와 점선 경로를 그린다.
 *   - 다크 프리미엄 테마에 맞춘 라스터 다크 스타일 사용(키만 있으면 동작, Map ID 불필요).
 *   - 키가 없거나 구글이 거부하면(결제 중지 등) Leaflet + OSM 지도(다크 필터)로 자동 전환.
 *     같은 번호 핀·점선 동선·위치 선택을 그대로 제공한다.
 *   - 반환 계약(app.js/editor.js 의존):
 *       renderRoute → 핸들 객체(즉시 반환). destroy(handle)로 무효화.
 *       picker      → { map, setView(lat,lon) }. 모달에서 클릭/드래그로 좌표 지정.
 */
(function (TP) {
  "use strict";
  var hasCoord = TP.geo.hasCoord;
  var DOT = ["#fb7185", "#fb923c", "#fbbf24", "#4ade80", "#34d399", "#60a5fa", "#a78bfa", "#f472b6"];

  /* 밝은 지도(토스 테마) — 기본 구글 스타일에서 상점 아이콘만 걷어 번호 핀이 묻히지 않게 */
  var LIGHT_STYLE = [{ featureType: "poi.business", stylers: [{ visibility: "off" }] }];

  function fail(container, msg) {
    container.innerHTML = "";
    var d = document.createElement("div");
    d.className = "map-loading map-loading--fail";
    (msg || "").split("\n").forEach(function (line, i) {
      if (i) d.appendChild(document.createElement("br"));
      d.appendChild(document.createTextNode(line));
    });
    container.appendChild(d);
  }

  function baseOptions(extra) {
    var o = {
      styles: LIGHT_STYLE, backgroundColor: "#e5e8eb",
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      zoomControl: true, clickableIcons: false
    };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }

  /* 번호 핀(SVG data URL) */
  function pinIcon(num, color) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">'
      + '<circle cx="15" cy="15" r="12.5" fill="' + color + '" stroke="#ffffff" stroke-width="2.5"/>'
      + '<text x="15" y="15" dy="0.36em" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#1a1205">' + num + '</text></svg>';
    return {
      url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(30, 30), anchor: new google.maps.Point(15, 15)
    };
  }
  function dashedLine(path, color) {
    return new google.maps.Polyline({
      path: path, geodesic: false, strokeOpacity: 0,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.95, strokeColor: color, strokeWeight: 3, scale: 2 }, offset: "0", repeat: "13px" }]
    });
  }
  function popupNode(s, n) {
    var box = document.createElement("div"); box.className = "gmap-pop";
    var t = document.createElement("div"); t.className = "gmap-pop__t"; t.textContent = n + ". " + (s.title || "장소"); box.appendChild(t);
    if (s.subtitle) { var sub = document.createElement("div"); sub.className = "gmap-pop__s"; sub.textContent = s.subtitle; box.appendChild(sub); }
    var meta = [s.time, s.address].filter(Boolean).join(" · ");
    if (meta) { var md = document.createElement("div"); md.className = "gmap-pop__s"; md.textContent = meta; box.appendChild(md); }
    return box;
  }

  /* ---------- 키리스 대안: Leaflet + OSM ---------- */
  var LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
  var leafletP = null;
  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (leafletP) return leafletP;
    leafletP = new Promise(function (resolve, reject) {
      var css = document.createElement("link");
      css.rel = "stylesheet"; css.href = LEAFLET + "leaflet.min.css";
      document.head.appendChild(css);
      var sc = document.createElement("script");
      sc.src = LEAFLET + "leaflet.min.js";
      sc.onload = function () { if (window.L && window.L.map) resolve(window.L); else { leafletP = null; reject(new Error("leaflet")); } };
      sc.onerror = function () { leafletP = null; reject(new Error("leaflet-load")); };
      document.head.appendChild(sc);
    });
    return leafletP;
  }
  function darkTiles(L) {
    // OSM 표준 타일(키 불필요). 다크 테마는 CSS 필터(.lmap-dark)로 반전해 맞춘다.
    return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, className: "lmap-dark",
      attribution: "&copy; OpenStreetMap contributors"
    });
  }
  function useGoogle() { return !!(TP.gmaps && TP.gmaps.hasKey() && !TP.gmaps.isBroken("maps")); }

  function leafletRoute(container, geoStops, color, handle) {
    if (handle.lPending) return;             // 구글 실패 감지와 catch가 겹쳐도 한 번만
    handle.lPending = true;
    loadLeaflet().then(function (L) {
      if (handle.destroyed || !container.isConnected) return;
      container.innerHTML = "";
      var div = document.createElement("div");
      div.className = "gmap-canvas";
      container.appendChild(div);
      var map = L.map(div, { scrollWheelZoom: false });
      darkTiles(L).addTo(map);
      var pts = [];
      geoStops.forEach(function (s, i) {
        var ll = [s.lat, s.lon];
        pts.push(ll);
        L.marker(ll, {
          icon: L.divIcon({ className: "lmap-pin", html: '<span style="background:' + color + '">' + (i + 1) + "</span>", iconSize: [30, 30], iconAnchor: [15, 15] }),
          title: (i + 1) + ". " + (s.title || "장소"), zIndexOffset: 1000 - i
        }).addTo(map).bindPopup(popupNode(s, i + 1));
      });
      if (pts.length > 1) L.polyline(pts, { color: color, weight: 3, opacity: 0.95, dashArray: "4 9" }).addTo(map);
      if (pts.length === 1) map.setView(pts[0], 15); else map.fitBounds(pts, { padding: [44, 44] });
      handle.lmap = map; handle.map = map;
      setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 80);
    }).catch(function () { if (!handle.destroyed) fail(container, "지도를 불러오지 못했어요.\n인터넷 연결을 확인해주세요."); });
  }

  function leafletPicker(container, initial, onPick, handle) {
    if (handle.lPending) return;
    handle.lPending = true;
    loadLeaflet().then(function (L) {
      if (handle.destroyed || !container.isConnected) return;
      container.innerHTML = "";
      var div = document.createElement("div");
      div.className = "gmap-canvas";
      container.appendChild(div);
      var hasInit = initial && isFinite(initial.lat);
      var map = L.map(div).setView(hasInit ? [initial.lat, initial.lon] : [37.5665, 126.9780], hasInit ? 15 : 11);
      darkTiles(L).addTo(map);
      var icon = L.divIcon({ className: "lmap-pin", html: '<span style="background:#4f8bff">●</span>', iconSize: [30, 30], iconAnchor: [15, 15] });
      var marker = null;
      function place(lat, lon) {
        try {
          if (marker) marker.setLatLng([lat, lon]);
          else {
            marker = L.marker([lat, lon], { draggable: true, icon: icon }).addTo(map);
            marker.on("dragend", function () { var p = marker.getLatLng(); onPick({ lat: p.lat, lon: p.lng }); });
          }
        } catch (e) {}
        onPick({ lat: lat, lon: lon });
      }
      handle.lmap = map; handle.map = map;
      handle.place = place;
      handle.center = function (lat, lon) { map.setView([lat, lon], 15); };
      if (hasInit) place(initial.lat, initial.lon);
      map.on("click", function (e) { place(e.latlng.lat, e.latlng.lng); });
      if (handle.pendingView) { var v = handle.pendingView; handle.center(v.lat, v.lon); place(v.lat, v.lon); handle.pendingView = null; }
      setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 80);
    }).catch(function () { if (!handle.destroyed) fail(container, "지도를 불러오지 못했어요."); });
  }

  /* 동선 지도 인스턴스 풀 —
   * app.js 의 render()는 화면을 통째로 다시 만든다. 그때마다 new google.maps.Map 을 만들면
   * "지도 탭을 누른 횟수"만큼 Dynamic Maps 로 과금된다(타임라인↔지도 3회 왕복 = 지도 3개).
   * 지도는 자기 DOM 노드에 붙어 있을 뿐이라, 그 노드를 우리가 소유해 두면 떼었다 붙여도 살아 있다.
   * 그래서 캔버스 노드 하나를 재사용하고, 매번 바뀌는 것(마커·경로)만 지웠다 다시 그린다. */
  var pool = null;   // { el, map, markers[], line, iw }

  function clearOverlays(p) {
    p.markers.forEach(function (m) {
      try { google.maps.event.clearInstanceListeners(m); m.setMap(null); } catch (e) {}
    });
    p.markers = [];
    if (p.line) { try { p.line.setMap(null); } catch (e) {} p.line = null; }
    if (p.iw) { try { p.iw.close(); } catch (e) {} }
  }

  /* 동선 지도: stops(좌표 있는 것만 번호 매김) → 핸들 즉시 반환(맵은 비동기 생성) */
  function renderRoute(container, stops, opts) {
    opts = opts || {};
    var geoStops = (stops || []).filter(hasCoord);
    if (!geoStops.length) return null;
    var handle = { destroyed: false, map: null };
    var color = opts.color || "#fb923c";
    if (!useGoogle()) { leafletRoute(container, geoStops, color, handle); return handle; }
    // 구글이 뒤늦게(지도 생성 1~2초 후) 결제/키 오류를 알리면 그 자리에서 OSM 지도로 갈아 끼운다
    handle.off = TP.gmaps.onBroken("maps", function () {
      if (handle.destroyed || !container.isConnected) return;
      if (pool && pool.el.parentNode === container) container.removeChild(pool.el);
      leafletRoute(container, geoStops, color, handle);
    });
    // maps + marker 동시 로드: google.maps.Marker는 "marker" 라이브러리 소속이라 함께 임포트해야 보장됨
    Promise.all([TP.gmaps.lib("maps"), TP.gmaps.lib("marker")]).then(function (libs) {
      var maps = libs[0];
      if (handle.destroyed || !container.isConnected) return;
      var bounds = new google.maps.LatLngBounds();
      geoStops.forEach(function (s) { bounds.extend({ lat: s.lat, lng: s.lon }); });

      if (!pool) {
        var canvas = document.createElement("div");
        canvas.className = "gmap-canvas";
        pool = { el: canvas, map: null, markers: [], line: null, iw: null };
      }
      if (pool.el.parentNode !== container) container.appendChild(pool.el);   // 이전 컨테이너에서 옮겨 옴
      if (!pool.map) {
        pool.map = new maps.Map(pool.el, baseOptions({ center: bounds.getCenter(), zoom: 13, gestureHandling: "cooperative" }));
      } else {
        clearOverlays(pool);
        try { google.maps.event.trigger(pool.map, "resize"); } catch (e) {}   // 다시 붙은 뒤 크기 재계산
      }
      var map = pool.map;
      handle.map = map;

      var path = [];
      geoStops.forEach(function (s, i) {
        var pos = { lat: s.lat, lng: s.lon };
        path.push(pos);
        var marker = new google.maps.Marker({ position: pos, map: map, icon: pinIcon(i + 1, color), title: (i + 1) + ". " + (s.title || "장소"), zIndex: 1000 - i });
        // 말풍선은 클릭할 때 하나만 만들어 돌려 쓴다(열어 보지도 않을 N개를 미리 만들지 않는다)
        marker.addListener("click", function () {
          if (!pool.iw) pool.iw = new google.maps.InfoWindow();
          pool.iw.setContent(popupNode(s, i + 1));
          pool.iw.open({ anchor: marker, map: map });
        });
        pool.markers.push(marker);
      });
      if (path.length > 1) { pool.line = dashedLine(path, color); pool.line.setMap(map); }
      map.fitBounds(bounds, 44);
      if (path.length === 1) { map.setCenter(path[0]); map.setZoom(15); }
    }).catch(function () { if (!handle.destroyed) leafletRoute(container, geoStops, color, handle); });
    return handle;
  }

  /* 위치 선택기: 클릭/드래그로 좌표 지정 → { map, setView } */
  function picker(container, initial, onPick) {
    var handle = { destroyed: false, map: null, place: null, center: null, pendingView: null };
    var wrapper = {
      map: handle,
      setView: function (lat, lon) {
        if (handle.place && handle.center) { handle.center(lat, lon); handle.place(lat, lon); }
        else handle.pendingView = { lat: lat, lon: lon };
      }
    };
    if (!useGoogle()) { leafletPicker(container, initial, onPick, handle); return wrapper; }
    handle.off = TP.gmaps.onBroken("maps", function () {
      if (handle.destroyed || !container.isConnected) return;
      handle.place = null; handle.center = null;
      leafletPicker(container, initial, onPick, handle);
    });
    Promise.all([TP.gmaps.lib("maps"), TP.gmaps.lib("marker")]).then(function (libs) {
      var maps = libs[0];
      if (handle.destroyed || !container.isConnected) return;
      var hasInit = initial && isFinite(initial.lat);
      var center = hasInit ? { lat: initial.lat, lng: initial.lon } : { lat: 37.5665, lng: 126.9780 };
      var map = new maps.Map(container, baseOptions({ center: center, zoom: hasInit ? 15 : 11, clickableIcons: true, gestureHandling: "greedy" }));
      handle.map = map;
      var marker = null;
      function place(lat, lon) {
        var pos = { lat: lat, lng: lon };
        try {   // 마커 생성 실패가 좌표 설정을 막지 않도록 방어
          if (marker) marker.setPosition(pos);
          else {
            marker = new google.maps.Marker({ position: pos, map: map, draggable: true });
            marker.addListener("dragend", function () { var p = marker.getPosition(); onPick({ lat: p.lat(), lon: p.lng() }); });
          }
        } catch (e) {}
        onPick({ lat: lat, lon: lon });
      }
      handle.place = place;
      handle.center = function (lat, lon) { map.setCenter({ lat: lat, lng: lon }); map.setZoom(15); };
      if (hasInit) place(initial.lat, initial.lon);
      map.addListener("click", function (e) { place(e.latLng.lat(), e.latLng.lng()); });
      if (handle.pendingView) { var v = handle.pendingView; map.setCenter({ lat: v.lat, lng: v.lon }); map.setZoom(15); place(v.lat, v.lon); handle.pendingView = null; }
    }).catch(function () { if (!handle.destroyed) leafletPicker(container, initial, onPick, handle); });
    return wrapper;
  }

  /* 무효화: 플래그를 세워 비동기 stale 생성을 막는다.
   * 동선 지도는 파괴하지 않는다 — 캔버스 노드가 화면에서 떨어질 뿐이고, 다음 표시 때 그대로 재사용된다.
   * 붙어 있던 마커·경로만 정리해 옛 날짜의 핀이 다음 지도에 남지 않게 한다. */
  function destroy(h) {
    if (!h) return;
    try {
      if (h.setView && h.map) {                                     // picker wrapper { map: handle, setView }
        var ph = h.map;
        ph.destroyed = true;
        if (ph.off) ph.off();
        if (ph.lmap) { ph.lmap.remove(); ph.lmap = null; }
        return;
      }
      h.destroyed = true;                                           // renderRoute handle
      if (h.off) h.off();
      if (h.lmap) { h.lmap.remove(); h.lmap = null; return; }       // OSM 지도는 매번 새로 만든다(과금 없음)
      if (pool && pool.map) clearOverlays(pool);
    } catch (e) {}
  }

  TP.maps = { renderRoute: renderRoute, picker: picker, destroy: destroy, DOT: DOT };
})(window.TP = window.TP || {});
