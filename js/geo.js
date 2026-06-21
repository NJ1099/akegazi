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
  function hasCoord(s) {
    return s && typeof s.lat === "number" && typeof s.lon === "number" &&
           isFinite(s.lat) && isFinite(s.lon) &&
           s.lat >= -90 && s.lat <= 90 && s.lon >= -180 && s.lon <= 180;
  }
  function normLat(v) { v = parseFloat(v); return (isFinite(v) && v >= -90 && v <= 90) ? v : null; }
  function normLon(v) { v = parseFloat(v); return (isFinite(v) && v >= -180 && v <= 180) ? v : null; }
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
          lat: normLat(r.lat), lon: normLon(r.lon),
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
          lat: normLat(r.latitude), lon: normLon(r.longitude)
        };
      });
    }).catch(function () { return []; });
  }

  /* ---------- 동선 최적화 ----------
     좌표 있는 stop만 대상(좌표 없는 stop은 원래 자리 유지).
     앵커(공항/숙소/고정)는 '모두' 원래 위치에 고정하고,
     인접 앵커 사이의 비앵커 구간만 각각 최적화한다.  */
  function optimizeOrder(stops) {
    var idxGeo = [];                 // 원본 배열에서 좌표 있는 인덱스
    stops.forEach(function (s, i) { if (hasCoord(s)) idxGeo.push(i); });
    if (idxGeo.length < 3) {
      return { order: stops.map(function (s) { return s.id; }), improved: false, reason: "too-few-coords", geoCount: idxGeo.length, before: 0, after: 0 };
    }
    var geo = idxGeo.map(function (i) { return stops[i]; });
    var n = geo.length;
    var before = pathLen(geo);

    var optimized = geo.slice();
    var segStart = 0;
    for (var p = 0; p <= n; p++) {
      var atAnchor = (p === n) || isAnchor(geo[p]);
      if (atAnchor) {
        var lo = segStart, hi = p - 1;                       // [lo..hi] = 비앵커 구간
        if (hi - lo >= 1) {
          var prev = (lo > 0) ? optimized[lo - 1] : null;    // 앞 앵커(고정 단자)
          var next = (p < n) ? geo[p] : null;                // 뒤 앵커(고정 단자)
          var ordered = optimizeSegment(optimized.slice(lo, hi + 1), prev, next);
          for (var q = 0; q < ordered.length; q++) optimized[lo + q] = ordered[q];
        }
        segStart = p + 1;
      }
    }

    var after = pathLen(optimized);
    if (after >= before - 1) {
      return { order: stops.map(function (s) { return s.id; }), improved: false, reason: "already-optimal", before: before, after: before };
    }
    var result = stops.slice();
    idxGeo.forEach(function (origIdx, k) { result[origIdx] = optimized[k]; });
    return { order: result.map(function (s) { return s.id; }), improved: true, before: before, after: after };
  }

  // 앞/뒤 앵커(prev/next)를 고정 단자로 끼워, 그 사이 비앵커 stop들만 NN + 2-opt
  function optimizeSegment(seg, prev, next) {
    if (seg.length < 2) return seg;
    var nodes = seg.slice();
    if (prev) nodes.unshift(prev);
    if (next) nodes.push(next);
    var lockStart = !!prev, lockEnd = !!next;
    var perm = nearestNeighbor(nodes, 0);
    if (lockEnd) {                                  // 끝 앵커를 경로 맨 끝으로 강제 정렬
      var endK = nodes.length - 1, ai = perm.indexOf(endK);
      if (ai >= 0 && ai !== perm.length - 1) { perm.splice(ai, 1); perm.push(endK); }
    }
    perm = twoOpt(nodes, perm, lockStart, lockEnd);
    var out = perm.map(function (k) { return nodes[k]; });
    if (prev) out.shift();
    if (next) out.pop();
    return out;
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
          var hasA = i > 0;                       // 열린 경로 시작 노드 앞에는 끊을 엣지가 없음
          var b = path[i], c = path[j], d2 = path[j + 1];
          var beforeD = (hasA ? dist(path[i - 1], b) : 0) + (d2 !== undefined ? dist(c, d2) : 0);
          var afterD = (hasA ? dist(path[i - 1], c) : 0) + (d2 !== undefined ? dist(b, d2) : 0);
          if (afterD + 0.01 < beforeD) {
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
  // 전체 동선 (origin + waypoints + destination) → { url, dropped, total }
  function multiDirURL(stops, mode) {
    var pts = stops.filter(function (s) { return locToken(s); });
    if (pts.length < 2) return { url: pts.length === 1 ? searchURL(pts[0]) : null, dropped: 0, total: pts.length };
    var origin = pts[0], dest = pts[pts.length - 1];
    var allMids = pts.slice(1, -1);
    var mids = allMids.slice(0, 9);            // 구글맵 URL은 waypoint ~9개 제한
    var dropped = allMids.length - mids.length;
    var p = ["origin=" + encodeURIComponent(locToken(origin)),
             "destination=" + encodeURIComponent(locToken(dest)),
             "travelmode=" + (mode || "transit")];
    if (mids.length) {
      p.push("waypoints=" + mids.map(function (s) { return encodeURIComponent(locToken(s)); }).join("%7C"));
    }
    return { url: "https://www.google.com/maps/dir/?api=1&" + p.join("&"), dropped: dropped, total: pts.length };
  }
  // 지도(위치 보기)
  function searchURL(s) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(locToken(s));
  }

  TP.geo = {
    haversine: haversine, hasCoord: hasCoord, fmtDist: fmtDist,
    normLat: normLat, normLon: normLon,
    geocode: geocode, optimizeOrder: optimizeOrder, pathLen: pathLen,
    dirURL: dirURL, multiDirURL: multiDirURL, searchURL: searchURL
  };
})(window.TP = window.TP || {});
