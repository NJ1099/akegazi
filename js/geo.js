/* geo.js — 지오코딩 · 거리 · 동선 최적화 · 시간 일정 · 구글맵 딥링크 (네임스페이스 TP.geo)
 *
 *   - 지오코딩: 구글 Places Text Search(키 있을 때) → 폴백 Nominatim(OSM)/Open-Meteo
 *   - 길찾기: 구글맵 Directions URL API (실제 대중교통/도보 경로)
 *   - 최적화: 좌표 있는 장소만 nearest-neighbor + 2-opt (양 끝 앵커 고정)
 *   - 시간 일정: 공항 도착/출발 시각 기준 구간 ETA + 비행기 마감 위험(buildSchedule)
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

  /* ---------- 지오코딩 ----------
     1순위: 구글 Places Text Search(키 있을 때) — 장소명/주소 품질 우수
     폴백: Nominatim(OSM) → Open-Meteo(도시명). 키 없거나 구글 실패/무결과 시.
     반환 계약: [{ name, address, lat, lon }] (editor.js가 의존) */
  function geocode(query) {
    query = (query || "").trim();
    if (!query) return Promise.resolve([]);
    if (TP.gmaps && TP.gmaps.hasKey()) {
      return googleGeocode(query).then(function (list) {
        return list.length ? list : keylessGeocode(query);   // 구글 무결과 → 폴백
      }).catch(function () { return keylessGeocode(query); }); // 구글 오류 → 폴백
    }
    return keylessGeocode(query);
  }

  // 구글 Places (New) Text Search — 영업시간(regularOpeningHours)까지 함께 받아 자동 채움
  function googleGeocode(query) {
    return TP.gmaps.lib("places").then(function (places) {
      return places.Place.searchByText({
        textQuery: query,
        fields: ["displayName", "formattedAddress", "location", "regularOpeningHours"],
        language: "ko",
        maxResultCount: 8
      });
    }).then(function (res) {
      var arr = (res && res.places) || [];
      return arr.map(function (p) {
        var loc = p.location, lat = null, lon = null;
        if (loc) {
          lat = (typeof loc.lat === "function") ? loc.lat() : loc.lat;
          lon = (typeof loc.lng === "function") ? loc.lng() : loc.lng;
        }
        var nm = p.displayName;
        if (nm && typeof nm === "object") nm = nm.text || "";   // 혹시 객체로 올 때
        return { name: nm || query, address: p.formattedAddress || "", lat: normLat(lat), lon: normLon(lon), hours: compactHours(p.regularOpeningHours) };
      }).filter(function (r) { return r.lat != null && r.lon != null; });
    });
  }

  /* 구글 regularOpeningHours → 한 줄 요약(같은 영업시간 연속 요일 묶음).
     예: ["월요일: 오전 11:00~오후 11:00", ...] → "월~일 오전11:00~오후11:00" / "토 휴무일" */
  var DAY_AB = {
    "월요일": "월", "화요일": "화", "수요일": "수", "목요일": "목", "금요일": "금", "토요일": "토", "일요일": "일",
    "Monday": "월", "Tuesday": "화", "Wednesday": "수", "Thursday": "목", "Friday": "금", "Saturday": "토", "Sunday": "일"
  };
  function dayAbbrev(day) { return DAY_AB[day] || (day ? day.slice(0, 1) : ""); }
  function compactHours(roh) {
    if (!roh) return "";
    var descs = roh.weekdayDescriptions || roh.weekday_text || [];
    if (!descs || !descs.length) return "";
    var rows = descs.map(function (d) {
      d = String(d).replace(/\s+/g, " ").trim();
      var i = d.indexOf(":");
      var day = i > 0 ? d.slice(0, i).trim() : "";
      var time = (i > 0 ? d.slice(i + 1) : d).trim().replace(/\s*[–—\-]\s*/g, "~").replace(/\s*~\s*/g, "~");
      return { ab: dayAbbrev(day), time: time };
    });
    var groups = [], cur = null;
    rows.forEach(function (r) {
      if (cur && cur.time === r.time) cur.days.push(r.ab);
      else { cur = { time: r.time, days: [r.ab] }; groups.push(cur); }
    });
    return groups.map(function (g) {
      var label = g.days.length >= 3 ? (g.days[0] + "~" + g.days[g.days.length - 1]) : g.days.join("·");
      return label + " " + g.time;
    }).join(", ");
  }

  // 키리스 폴백: Nominatim(OSM) → Open-Meteo(도시명)
  function keylessGeocode(query) {
    var nomi = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&limit=6&accept-language=ko&q=" + encodeURIComponent(query);
    return fetchJSON(nomi, { timeout: 9000 }).then(function (arr) {
      var out = (arr || []).map(function (r) {
        return {
          name: shortName(r),
          address: r.display_name || "",
          lat: normLat(r.lat), lon: normLon(r.lon),
          type: r.type, category: r.category,
          hours: (r.extratags && r.extratags.opening_hours) ? String(r.extratags.opening_hours) : ""   // OSM 영업시간(있으면)
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
    // 양 끝이 자유(앵커 없음)면 경로 방향이 모호 → 사용자가 입력한 순서에 더 가까운 방향을 선택.
    // (역방향은 거리가 같아 '최적'이지만 입력과 반대로 뒤집혀 보이므로 방지)
    if (!lockStart && !lockEnd && out.length > 2) {
      var rev = out.slice().reverse();
      if (orderDisplacement(rev, seg) < orderDisplacement(out, seg)) out = rev;
    }
    return out;
  }

  // arr가 기준 순서(ref)에서 얼마나 어긋났는지(위치 차의 합) — 작을수록 입력에 가까움
  function orderDisplacement(arr, ref) {
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += Math.abs(i - ref.indexOf(arr[i]));
    return sum;
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

  /* ---------- 시간 기반 일정(스케줄) ----------
     공항 도착/출발 시각을 기준으로 하루 동선의 구간별 예상 도착(ETA)을 계산하고,
     출발편(비행기)을 놓칠 위험을 경고한다. 이동시간은 직선거리 기반 추정치다. */
  var SPEED_KMH = 22;          // 도심 평균(대중교통+도보 혼합) 추정 속도
  var MIN_TRAVEL = 5;          // 두 장소 간 최소 이동(분)
  var EXIT_BUFFER = 45;        // 도착편: 입국·수하물·이동 준비(분) 후 일정 시작
  var CHECKIN_BUFFER = 120;    // 출발편: 비행기 출발 몇 분 전까지 공항 도착 권장
  var DWELL = { attraction: 90, food: 60, cafe: 40, activity: 120, lodging: 30, transport: 0, airport: 0 };

  function defaultDwell(type) { return DWELL[type] != null ? DWELL[type] : 60; }
  function dwellMinutes(s) {
    var v = parseInt(s && s.stayMin, 10);
    if (isFinite(v) && v >= 0) return v;
    return defaultDwell(s && s.type);
  }
  function travelMinutes(a, b) {
    var m = haversine(a, b);
    if (!isFinite(m)) return null;
    var min = (m / 1000) / SPEED_KMH * 60;
    return Math.max(MIN_TRAVEL, Math.round(min / 5) * 5);   // 5분 단위 반올림
  }
  function hmToMin(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(((s || "") + "").trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  function minToHm(v) {
    if (v == null || !isFinite(v)) return "";
    v = ((Math.round(v) % 1440) + 1440) % 1440;     // 자정 넘김 정규화
    var h = Math.floor(v / 60), mi = v % 60;
    return (h < 10 ? "0" : "") + h + ":" + (mi < 10 ? "0" : "") + mi;
  }

  // 이 stop의 '확정 도착 시각'(분): 도착편 공항 arriveTime, 또는 고정+시간.
  function arriveAnchorMin(s) {
    if (s.type === "airport" && s.arriveTime) return hmToMin(s.arriveTime);
    if (s.fixed && s.time) return hmToMin(s.time);
    return null;
  }

  /* buildSchedule(stops) — 하루 stops 배열의 시간 일정 계산.
     반환: { active, startMin, items[], deadline }
       active   : 공항 시각(도착/출발)이 입력돼 일정 계산이 켜졌는지
       items[i] : { id, etaArrive, etaDepart, est(추정여부), travel, dwell,
                    isAirportDepart, flightDepart, mustBeBy, late, overBy }
       deadline : 출발편 정보 { stopId, flightDepart, mustBeBy, etaArrive, late, overBy } | null */
  function buildSchedule(stops) {
    stops = stops || [];
    var hasAirportTime = stops.some(function (s) {
      return s.type === "airport" && (s.arriveTime || s.departTime);
    });
    var items = stops.map(function (s) { return { id: s.id, etaArrive: null, etaDepart: null, est: false }; });
    if (!hasAirportTime) return { active: false, startMin: null, items: items, deadline: null };

    var cursor = null, prev = null, deadline = null, conflict = null, unknownChain = false;
    for (var i = 0; i < stops.length; i++) {
      var s = stops[i], it = items[i];
      if (cursor != null && prev) {            // 이전 → 여기 이동
        if (hasCoord(prev) && hasCoord(s)) {
          var tm = travelMinutes(prev, s);
          if (tm != null) { cursor += tm; it.travel = tm; }
        } else {
          it.travelUnknown = true; unknownChain = true;   // 좌표 없어 이동시간 추정 불가 → 이후 ETA 신뢰 불가
        }
      }
      var anchor = arriveAnchorMin(s);                       // 확정 시각(공항 도착 / 고정+시간)
      var manualMin = hmToMin(s.time);                       // 임의 stop의 사용자 입력 시각
      var depMin = (s.type === "airport" && s.departTime) ? hmToMin(s.departTime) : null;

      // 도착 시각 결정
      if (anchor != null) {                                  // 확정 도착 → 시각 재기준
        if (cursor != null && anchor < cursor - 1) {         // 입력 시각이 직전 추정보다 이르면 동선과 모순
          it.conflict = true;
          conflict = conflict || { stopId: s.id, projected: cursor, anchor: anchor };
        }
        it.etaArrive = anchor; cursor = anchor; it.est = false;
      } else if (manualMin != null) {                        // 사용자 입력 시각: 그대로 표시 + 커서를 그 이상으로 전진
        it.etaArrive = manualMin; it.est = false;            // (역행 방지 → 뒤 장소 ETA가 이 시각보다 이르게 안 나옴)
        cursor = (cursor != null) ? Math.max(cursor, manualMin) : manualMin;
      } else if (cursor != null) {                           // 추정 도착(ETA)
        it.etaArrive = cursor; it.est = true;
      }

      // 출발 시각 / 다음 커서
      if (depMin != null) {                                  // 출발편 공항(마감)
        it.isAirportDepart = true;
        it.flightDepart = depMin;
        it.mustBeBy = depMin - CHECKIN_BUFFER;
        // 좌표 누락으로 이동시간을 못 구한 구간이 있으면 ETA 신뢰 불가 → late 판정 보류(거짓 안전 방지)
        if (it.etaArrive != null && !unknownChain) { it.late = it.etaArrive > it.mustBeBy; it.overBy = it.etaArrive - it.mustBeBy; }
        it.etaDepart = depMin; cursor = depMin;
        deadline = { stopId: s.id, flightDepart: depMin, mustBeBy: it.mustBeBy,
                     etaArrive: (unknownChain ? null : it.etaArrive),
                     late: !!it.late, overBy: (it.overBy != null ? it.overBy : null),
                     travelUnknown: unknownChain };
      } else if (s.type === "airport" && anchor != null) {   // 도착편 공항: 수속 버퍼 후 출발
        cursor = anchor + EXIT_BUFFER; it.etaDepart = cursor; it.dwell = EXIT_BUFFER;
      } else if (cursor != null) {                           // 일반/수동/추정: 체류시간 가산
        var dw = dwellMinutes(s); cursor += dw; it.etaDepart = cursor; it.dwell = dw;
      }
      prev = s;
    }
    var startMin = null;
    for (var j = 0; j < items.length; j++) { if (items[j].etaArrive != null) { startMin = items[j].etaArrive; break; } }
    return { active: true, startMin: startMin, items: items, deadline: deadline, conflict: conflict };
  }

  /* ---------- 구글 실거리(Distance Matrix) — 교통비 정확도용 ----------
     좌표 두 점의 실제 도로/대중교통 거리·시간을 캐시. 'Distance Matrix API'가 키에
     허용돼 있어야 동작(없으면 null → 직선거리×도로계수 폴백). 대중교통 요금이 오면 그대로 사용. */
  var roadCache = {};      // key → {km,min,fareValue?,fareCurrency?} | null(실패) | undefined(미조회)
  var roadFetching = {};
  function roundC(v) { return Math.round(v * 10000) / 10000; }
  function roadKey(a, b, mode) { return roundC(a.lat) + "," + roundC(a.lon) + ">" + roundC(b.lat) + "," + roundC(b.lon) + "|" + mode; }
  function cachedRoad(a, b, mode) {
    if (!hasCoord(a) || !hasCoord(b)) return null;
    return roadCache[roadKey(a, b, mode)];     // undefined=미조회, null=실패, 객체=성공
  }
  function ensureRoad(a, b, mode) {
    if (!hasCoord(a) || !hasCoord(b)) return Promise.resolve(null);
    var k = roadKey(a, b, mode);
    if (k in roadCache) return Promise.resolve(roadCache[k]);
    if (roadFetching[k]) return roadFetching[k];
    if (!TP.gmaps || !TP.gmaps.hasKey()) { roadCache[k] = null; return Promise.resolve(null); }
    roadFetching[k] = TP.gmaps.lib("routes").then(function () {
      return new Promise(function (resolve) {
        var svc = new window.google.maps.DistanceMatrixService();
        svc.getDistanceMatrix({
          origins: [{ lat: a.lat, lng: a.lon }], destinations: [{ lat: b.lat, lng: b.lon }],
          travelMode: (mode === "transit") ? "TRANSIT" : "DRIVING"
        }, function (res, status) {
          var out = null;
          try {
            var elr = res && res.rows && res.rows[0] && res.rows[0].elements && res.rows[0].elements[0];
            if (status === "OK" && elr && elr.status === "OK" && elr.distance) {
              out = { km: elr.distance.value / 1000, min: elr.duration ? Math.round(elr.duration.value / 60) : null };
              if (elr.fare && typeof elr.fare.value === "number") { out.fareValue = elr.fare.value; out.fareCurrency = elr.fare.currency; }
            }
          } catch (e) {}
          roadCache[k] = out; delete roadFetching[k]; resolve(out);
        });
      });
    }).catch(function () { roadCache[k] = null; delete roadFetching[k]; return null; });
    return roadFetching[k];
  }

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
    geocode: geocode, optimizeOrder: optimizeOrder, pathLen: pathLen, compactHours: compactHours,
    buildSchedule: buildSchedule, minToHm: minToHm, hmToMin: hmToMin, defaultDwell: defaultDwell,
    cachedRoad: cachedRoad, ensureRoad: ensureRoad,
    dirURL: dirURL, multiDirURL: multiDirURL, searchURL: searchURL
  };
})(window.TP = window.TP || {});
