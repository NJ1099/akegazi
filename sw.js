/* sw.js — 네트워크 우선(network-first) 서비스 워커
 *
 *   목적: GitHub Pages의 HTML 캐시(기본 10분) 때문에 "새로고침해도 최신화 안 됨"을 해결.
 *   - 온라인이면 항상 네트워크에서 최신을 받아오고(새로고침 = 최신), 받은 응답을 캐시에 복사.
 *   - 오프라인이면 마지막으로 캐시된 응답으로 폴백(간이 오프라인 지원).
 *   - 같은 출처(GET)만 처리. 구글맵/Places/날씨 등 외부(cross-origin) 요청은 건드리지 않고 그대로 통과.
 *   - skipWaiting + clients.claim 으로 새 버전이 즉시 활성화됨.
 *
 *   캐시 무효화가 필요하면 CACHE 이름의 버전을 올린다(예: akegazi-v2).
 *   🔴 JS/CSS 를 바꾸면 index.html 의 ?v=N 도 같은 숫자로 올릴 것 — 워커가 페이지를 제어하지 않는 순간
 *   (첫 방문·워커 교체 중)에는 브라우저 HTTP 캐시(max-age=600)가 옛 파일을 그대로 내준다(2026-09-28 실측).
 */
var CACHE = "akegazi-v20";

/* 앱 셸 프리캐시 — 설치 시 한 번에 담아 둔다.
 * 이유: network-first 는 "한 번이라도 받아본" 리소스만 캐시에 남는다. 여행 앱은 비행기 모드/
 *      해외 로밍 없이 열리는 게 핵심이라, 첫 방문에 셸 전체를 확보해 둬야 오프라인이 보장된다.
 * 개별 실패는 무시한다(하나가 404여도 SW 설치 자체는 성공해야 하므로).
 */
var SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/config.js", "./js/gmaps.js", "./js/util.js", "./js/store.js", "./js/geo.js",
  "./js/weather.js", "./js/maps.js", "./js/money.js", "./js/render.js", "./js/editor.js",
  "./js/share.js", "./js/sample.js", "./js/insta.js", "./js/app.js",
  "./assets/icon-192.png", "./assets/icon-512.png", "./assets/icon-maskable-512.png",
  "./assets/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: "reload" })).catch(function () {});   // 개별 실패 무시
      }));
    }).catch(function () {})
  );
  self.skipWaiting();   // 새 SW를 대기 없이 즉시 활성 후보로
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));   // 옛 캐시 정리
    }).then(function () { return self.clients.claim(); })   // 열린 탭을 즉시 제어
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;                                  // GET만
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;                   // 외부 API는 그대로 통과(구글맵 등)

  e.respondWith(
    // cache:"no-cache" — 브라우저 HTTP 캐시를 그대로 쓰지 말고 매번 서버에 재확인(바뀐 게 없으면 304라 가볍다).
    // 기본값으로 두면 GitHub Pages 의 max-age=600 때문에 배포 후 최대 10분간 옛 JS 가 돌았다
    // (2026-09-28 실측: 새 sw.js 는 받았는데 editor.js 는 이전 버전이 실행되고 있었다).
    fetch(req, { cache: "no-cache" }).then(function (res) {           // 네트워크 우선
      if (res && res.status === 200 && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () {                                            // 오프라인 → 캐시 폴백
      // ignoreSearch: index.html 이 ./js/app.js?v=N 처럼 버전을 붙여 부르므로, 설치 때 넣어 둔 ./js/app.js 와도 맞춰 준다
      return caches.match(req, { ignoreSearch: true }).then(function (c) {
        return c || (req.mode === "navigate" ? caches.match("./index.html") : undefined);
      });
    })
  );
});
