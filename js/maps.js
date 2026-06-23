/* maps.js — 구글맵(JavaScript API): 번호 마커 + 점선 동선 + 위치 선택기 (네임스페이스 TP.maps)
 *
 *   - TP.gmaps.lib("maps")로 지연 로드한 구글맵 위에 방문 순서 번호 마커와 점선 경로를 그린다.
 *   - 다크 프리미엄 테마에 맞춘 라스터 다크 스타일 사용(키만 있으면 동작, Map ID 불필요).
 *   - 키 없으면 안내 메시지로 graceful degrade.
 *   - 반환 계약(app.js/editor.js 의존):
 *       renderRoute → 핸들 객체(즉시 반환). destroy(handle)로 무효화.
 *       picker      → { map, setView(lat,lon) }. 모달에서 클릭/드래그로 좌표 지정.
 */
(function (TP) {
  "use strict";
  var hasCoord = TP.geo.hasCoord;
  var DOT = ["#fb7185", "#fb923c", "#fbbf24", "#4ade80", "#34d399", "#60a5fa", "#a78bfa", "#f472b6"];

  /* 다크 지도 스타일 (구글 Night mode 기반) */
  var DARK_STYLE = [
    { elementType: "geometry", stylers: [{ color: "#1a2236" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#0d1322" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#9aa6c2" }] },
    { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#5b6480" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#cdd6ee" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#8b94b0" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#16321f" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#4ade80" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a3450" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9aa6c2" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a4666" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2a3450" }] },
    { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#a78bfa" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1830" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a5680" }] }
  ];

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
      styles: DARK_STYLE, backgroundColor: "#0d1322",
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

  /* 동선 지도: stops(좌표 있는 것만 번호 매김) → 핸들 즉시 반환(맵은 비동기 생성) */
  function renderRoute(container, stops, opts) {
    opts = opts || {};
    var geoStops = (stops || []).filter(hasCoord);
    if (!geoStops.length) return null;
    var handle = { destroyed: false, map: null };
    if (!TP.gmaps || !TP.gmaps.hasKey()) {
      fail(container, "구글 지도 키가 설정되지 않았어요.\nconfig.js에 키를 넣으면 지도가 켜져요.");
      return handle;
    }
    var color = opts.color || "#fb923c";
    // maps + marker 동시 로드: google.maps.Marker는 "marker" 라이브러리 소속이라 함께 임포트해야 보장됨
    Promise.all([TP.gmaps.lib("maps"), TP.gmaps.lib("marker")]).then(function (libs) {
      var maps = libs[0];
      if (handle.destroyed || !container.isConnected) return;
      var bounds = new google.maps.LatLngBounds();
      geoStops.forEach(function (s) { bounds.extend({ lat: s.lat, lng: s.lon }); });
      var map = new maps.Map(container, baseOptions({ center: bounds.getCenter(), zoom: 13, gestureHandling: "cooperative" }));
      handle.map = map;

      var path = [];
      geoStops.forEach(function (s, i) {
        var pos = { lat: s.lat, lng: s.lon };
        path.push(pos);
        var marker = new google.maps.Marker({ position: pos, map: map, icon: pinIcon(i + 1, color), title: (i + 1) + ". " + (s.title || "장소"), zIndex: 1000 - i });
        var iw = new google.maps.InfoWindow({ content: popupNode(s, i + 1) });
        marker.addListener("click", function () { iw.open({ anchor: marker, map: map }); });
      });
      if (path.length > 1) dashedLine(path, color).setMap(map);
      map.fitBounds(bounds, 44);
      if (path.length === 1) { map.setCenter(path[0]); map.setZoom(15); }
    }).catch(function () { if (!handle.destroyed) fail(container, "지도를 불러오지 못했어요."); });
    return handle;
  }

  /* 위치 선택기: 클릭/드래그로 좌표 지정 → { map, setView } */
  function picker(container, initial, onPick) {
    var handle = { destroyed: false, map: null, place: null, pendingView: null };
    var wrapper = {
      map: handle,
      setView: function (lat, lon) {
        if (handle.place && handle.map) { handle.map.setCenter({ lat: lat, lng: lon }); handle.map.setZoom(15); handle.place(lat, lon); }
        else handle.pendingView = { lat: lat, lon: lon };
      }
    };
    if (!TP.gmaps || !TP.gmaps.hasKey()) { fail(container, "구글 지도 키가 설정되지 않았어요."); return wrapper; }
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
      if (hasInit) place(initial.lat, initial.lon);
      map.addListener("click", function (e) { place(e.latLng.lat(), e.latLng.lng()); });
      if (handle.pendingView) { var v = handle.pendingView; map.setCenter({ lat: v.lat, lng: v.lon }); map.setZoom(15); place(v.lat, v.lon); handle.pendingView = null; }
    }).catch(function () { if (!handle.destroyed) fail(container, "지도를 불러오지 못했어요."); });
    return wrapper;
  }

  /* 무효화: 구글맵은 컨테이너 제거 시 GC되므로 플래그만 세워 비동기 stale 생성을 막는다. */
  function destroy(h) {
    if (!h) return;
    try {
      if (h.setView && h.map) h.map.destroyed = true;   // picker wrapper { map: handle, setView }
      else h.destroyed = true;                           // renderRoute handle
    } catch (e) {}
  }

  TP.maps = { renderRoute: renderRoute, picker: picker, destroy: destroy, DOT: DOT };
})(window.TP = window.TP || {});
