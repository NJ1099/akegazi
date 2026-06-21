/* maps.js — Leaflet 지도: 번호 핀 + 점선 동선 + 위치 선택기 (네임스페이스 TP.maps) */
(function (TP) {
  "use strict";
  var hasCoord = TP.geo.hasCoord;
  var DOT = ["#fb7185", "#fb923c", "#fbbf24", "#4ade80", "#34d399", "#60a5fa", "#a78bfa", "#f472b6"];

  var TILE = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";  // CARTO Voyager (무료·고품질)
  var ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

  function baseLayer() {
    return L.tileLayer(TILE, { maxZoom: 20, subdomains: "abcd", attribution: ATTR });
  }

  /* 동선 지도: stops(좌표 있는 것만 번호 매김) */
  function renderRoute(container, stops, opts) {
    opts = opts || {};
    if (!window.L) { container.textContent = "지도를 불러오지 못했습니다."; return null; }
    var geo = stops.filter(hasCoord);
    if (!geo.length) return null;

    var map = L.map(container, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    baseLayer().addTo(map);

    var color = opts.color || "#fb923c";
    var latlngs = [];
    geo.forEach(function (s, i) {
      var ll = [s.lat, s.lon];
      latlngs.push(ll);
      var icon = L.divIcon({
        className: "pin-wrap",
        html: '<div class="pin-num" style="background:' + color + '">' + (i + 1) + "</div>",
        iconSize: [28, 28], iconAnchor: [14, 14]
      });
      var mk = L.marker(ll, { icon: icon }).addTo(map);
      mk.bindPopup(popupNode(s, i + 1));
    });

    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: color, weight: 3, opacity: 0.85, dashArray: "6 8", lineJoin: "round" }).addTo(map);
    }

    var bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [38, 38], maxZoom: 15 });
    setTimeout(function () { map.invalidateSize(); if (latlngs.length === 1) map.setZoom(14); }, 60);
    return map;
  }

  function popupNode(s, n) {
    var box = document.createElement("div");
    var t = document.createElement("div");
    t.style.fontWeight = "800";
    t.textContent = n + ". " + (s.title || "장소");
    box.appendChild(t);
    if (s.subtitle) {
      var sub = document.createElement("div");
      sub.style.color = "#aab4cf"; sub.style.fontSize = "11px"; sub.style.marginTop = "2px";
      sub.textContent = s.subtitle;
      box.appendChild(sub);
    }
    return box;
  }

  /* 위치 선택기: 클릭/드래그로 좌표 지정 */
  function picker(container, initial, onPick) {
    if (!window.L) { container.textContent = "지도를 불러오지 못했습니다."; return null; }
    var center = initial && isFinite(initial.lat) ? [initial.lat, initial.lon] : [37.5665, 126.9780];
    var map = L.map(container, { zoomControl: true, scrollWheelZoom: true });
    baseLayer().addTo(map);
    map.setView(center, initial && isFinite(initial.lat) ? 15 : 11);

    var marker = null;
    function place(ll) {
      if (marker) marker.setLatLng(ll);
      else {
        marker = L.marker(ll, { draggable: true }).addTo(map);
        marker.on("dragend", function () { var p = marker.getLatLng(); onPick({ lat: p.lat, lon: p.lng }); });
      }
      onPick({ lat: ll[0] != null ? ll[0] : ll.lat, lon: ll[1] != null ? ll[1] : ll.lng });
    }
    if (initial && isFinite(initial.lat)) place([initial.lat, initial.lon]);
    map.on("click", function (e) { place([e.latlng.lat, e.latlng.lng]); });
    setTimeout(function () { map.invalidateSize(); }, 60);

    return { map: map, setView: function (lat, lon) { map.setView([lat, lon], 15); place([lat, lon]); } };
  }

  function destroy(map) {
    try { if (map && map.remove) map.remove(); else if (map && map.map) map.map.remove(); } catch (e) {}
  }

  var EMBED_MAX = 10;   // 임베드 동선에 표시할 좌표 stop 상한 (출발+경유+도착)

  /* 구글맵 키리스 임베드 URL — 단일(q=) / 경로(saddr+daddr+to:). API 키 불필요. */
  function gmapEmbedURL(stops) {
    var pts = (stops || []).filter(hasCoord);
    if (!pts.length) return null;
    if (pts.length === 1) {
      return "https://maps.google.com/maps?q=" + pts[0].lat + "," + pts[0].lon + "&z=14&hl=ko&output=embed";
    }
    var used = pts.slice(0, EMBED_MAX);
    var saddr = used[0].lat + "," + used[0].lon;
    var daddr = used.slice(1).map(function (s) { return s.lat + "," + s.lon; }).join("+to:");
    return "https://maps.google.com/maps?saddr=" + saddr + "&daddr=" + daddr + "&hl=ko&output=embed";
  }

  TP.maps = { renderRoute: renderRoute, picker: picker, destroy: destroy, gmapEmbedURL: gmapEmbedURL, EMBED_MAX: EMBED_MAX, DOT: DOT };
})(window.TP = window.TP || {});
