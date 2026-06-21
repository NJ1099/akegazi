/* geo.js — 지오코딩 · 거리 · 동선 최적화 · 구글맵 딥링크 (네임스페이스 TP.geo)
 *
 * 무료/키 불필요:
 *   - 지오코딩: Nominatim(OSM) → 실패 시 Open-Meteo Geocoding(도시명) 폴백
 *   - 길찾기: 구글맵 Directions URL API (실제 대중교통/도보 경로)
 *   - 최적화: 좌표 있는 장소만 nearest-neighbor + 2-opt (양 끝 앵커 고정)
 */
(function (TP) {
  "use strict";
  var fetchJSON = TP.util.fetchJSON;

  /* ---------- 거리 ---------- */
  function rad(d) { return d * Math.PI / 180; }
  function haversine(a, b) {
    if (!hasCoord(a) || !hasCoord(b)) return Infinity;
    var R = 6371000;
    var dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function hasCoord(s) { return s && typeof s.lat === "number" && typeof s.lon === "number" && isFinite(s.lat) && isFinite(s.lon); }
  function fmtDist(m) {
    if (!isFinite(m)) return "—";
    return m < 1000 ? Math.round(m) + "m" : (m / 1000).toFixed(m < 10000 ? 1 : 0) + "km";
  }

  /* ---------- 지오코딩 ---------- */
  function geocode(query) {
    query = (query || "").trim();
    if (!query) return Promise.resolve([]);
    var nomi = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=ko&q=" + encodeURIComponent(query);
    return fetchJSON(nomi, { timeout: 9000 }).then(function (arr) {
      var out = (arr || []).map(function (r) {
        return {
          name: shortName(r),
          address: r.display_name || "",
          lat: parseFloat(r.lat), lon: parseFloat(r.lon),
          type: r.type, category: r.category
        };
      });
      if (out.length) return out;
      return omFallback(query);
    }).catch(function () { return omFallback(query); });
  }
  function shortName(r) {
    if (r.namedetails && r.namedetails.name) return r.namedetails.name;
    if (r.name) return r.name;
    var d = (r.display_name || "").split(",");
    return (d[0] || "").trim();
  }
  function omFallback(query) {
    var url = "https://geocoding-api.open-meteo.com/v1/search?count=6&language=ko&format=json&name=" + encodeURIComponent(query);
    return fetchJSON(url, { timeout: 8000 }).then(function (j) {
      return ((j && j.results) || []).map(function (r) {
        return {
          name: r.name,
          address: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
          lat: r.latitude, lon: r.longitude
        };
      });
    }).catch(function () { return []; });
  }

  /* ---------- 동선 최적화 ----------
     좌표가 있는 stop들만 대상으로, 좌표 없는 stop은 원래 자리 유지.
     앵커: 공항/숙소/고정(fixed) 은 양 끝에 고정.  */
  function optimizeOrder(stops) {
    var idxGeo = [];                 // 원본 배열에서 좌표 있는 인덱스
    stops.forEach(function (s, i) { if (hasCoord(s)) idxGeo.push(i); });
    if (idxGeo.length < 3) {
      return { order: stops.map(function (s) { return s.id; }), improved: false, before: pathLen(stops.map(function(s){return s;})), after: pathLen(stops) };
    }
    var geo = idxGeo.map(function (i) { return stops[i]; });
    var n = geo.length;

    var lockStart = isAnchor(geo[0]) ? 0 : -1;
    var lockEnd = isAnchor(geo[n - 1]) ? n - 1 : -1;

    var before = pathLen(geo);
    var perm = nearestNeighbor(geo, lockStart >= 0 ? 0 : 0);
    perm = twoOpt(geo, perm, lockStart >= 0, lockEnd >= 0);
    var optimized = perm.map(function (k) { return geo[k]; });
    var after = pathLen(optimized);

    // 더 나빠지면 원본 유지
    if (after >= before - 1) {
      return { order: stops.map(function (s) { return s.id; }), improved: false, before: before, after: before };
    }
    // 좌표 stop들을 최적 순서로 원래 슬롯에 재배치
    var result = stops.slice();
    idxGeo.forEach(function (origIdx, k) { result[origIdx] = optimized[k]; });
    return { order: result.map(function (s) { return s.id; }), improved: true, before: before, after: after };
  }

  function isAnchor(s) { return s.fixed || s.type === "airport" || s.type === "lodging"; }

  function pathLen(arr) {
    var sum = 0;
    for (var i = 1; i < arr.length; i++) {
      var d = haversine(arr[i - 1], arr[i]);
      if (isFinite(d)) sum += d;
    }
    return sum;
  }
  function nearestNeighbor(geo, startK) {
    var n = geo.length, used = {}, path = [startK]; used[startK] = true;
    var cur = startK;
    for (var step = 1; step < n; step++) {
      var best = -1, bd = Infinity;
      for (var j = 0; j < n; j++) {
        if (used[j]) continue;
        var d = haversine(geo[cur], geo[j]);
        if (d < bd) { bd = d; best = j; }
      }
      if (best < 0) break;
      used[best] = true; path.push(best); cur = best;
    }
    return path;
  }
  function twoOpt(geo, path, lockStart, lockEnd) {
    var n = path.length, improved = true, guard = 0;
    function dist(a, b) { return haversine(geo[a], geo[b]); }
    while (improved && guard++ < 60) {
      improved = false;
      var iMin = lockStart ? 1 : 0;
      var jMax = lockEnd ? n - 2 : n - 1;
      for (var i = iMin; i < n - 1; i++) {
        for (var j = i + 1; j <= jMax; j++) {
          var a = path[i - 1], b = path[i], c = path[j], d2 = path[j + 1];
          var before = dist(a, b) + (d2 !== undefined ? dist(c, d2) : 0);
          var after = dist(a, c) + (d2 !== undefined ? dist(b, d2) : 0);
          if (after + 0.01 < before) {
            reverse(path, i, j); improved = true;
          }
        }
      }
    }
    return path;
  }
  function reverse(arr, i, j) { while (i < j) { var t = arr[i]; arr[i] = arr[j]; arr[j] = t; i++; j--; } }

  /* ---------- 구글맵 딥링크 ---------- */
  function locToken(s) {
    if (hasCoord(s)) return s.lat.toFixed(6) + "," + s.lon.toFixed(6);
    var q = [s.title, s.subtitle, s.address].filter(Boolean).join(" ");
    return q || (s.title || "");
  }
  // 이전 → 여기 (단일 구간)
  function dirURL(from, to, mode) {
    var base = "https://www.google.com/maps/dir/?api=1";
    var p = [];
    if (from) p.push("origin=" + encodeURIComponent(locToken(from)));
    p.push("destination=" + encodeURIComponent(locToken(to)));
    p.push("travelmode=" + (mode || "transit"));
    return base + "&" + p.join("&");
  }
  // 전체 동선 (origin + waypoints + destination)
  function multiDirURL(stops, mode) {
    var pts = stops.filter(function (s) { return locToken(s); });
    if (pts.length < 2) return pts.length === 1 ? searchURL(pts[0]) : null;
    var origin = pts[0], dest = pts[pts.length - 1];
    var mids = pts.slice(1, -1).slice(0, 9); // 구글맵 URL은 waypoint ~9개 제한
    var p = ["origin=" + encodeURIComponent(locToken(origin)),
             "destination=" + encodeURIComponent(locToken(dest)),
             "travelmode=" + (mode || "transit")];
    if (mids.length) {
      p.push("waypoints=" + mids.map(function (s) { return encodeURIComponent(locToken(s)); }).join("%7C"));
    }
    return "https://www.google.com/maps/dir/?api=1&" + p.join("&");
  }
  // 지도(위치 보기)
  function searchURL(s) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(locToken(s));
  }

  TP.geo = {
    haversine: haversine, hasCoord: hasCoord, fmtDist: fmtDist,
    geocode: geocode, optimizeOrder: optimizeOrder, pathLen: pathLen,
    dirURL: dirURL, multiDirURL: multiDirURL, searchURL: searchURL
  };
})(window.TP = window.TP || {});
