/* config.js — 런타임 설정 (네임스페이스 window.TP_CONFIG)
 *
 * GOOGLE_MAPS_API_KEY:
 *   - 구글 지도 검색(Places)·동선 지도(Maps JavaScript API)에 쓰는 브라우저 키.
 *   - 이 키는 "HTTP 리퍼러 제한"(예: https://nj1099.github.io/*, http://localhost:*)을
 *     걸어둔 브라우저용 공개 키입니다. 공개 저장소/배포 파일에 들어가도, 허용된 도메인이
 *     아니면 구글이 거부하므로 안전합니다. (시크릿 키가 아닙니다.)
 *   - 비워두면(""): 구글 기능은 비활성화되고, 검색은 키리스 폴백(OSM/Open-Meteo)으로,
 *     지도는 안내 메시지로 동작합니다. 앱 자체는 정상 작동합니다.
 *
 * 키 발급: Google Cloud Console → 프로젝트 생성 → 결제 연결 →
 *   "Maps JavaScript API"·"Places API (New)" 사용 설정 → 사용자 인증 정보 → API 키 →
 *   애플리케이션 제한(HTTP 리퍼러) + API 제한(위 두 API)으로 제한.
 */
window.TP_CONFIG = window.TP_CONFIG || {};
window.TP_CONFIG.GOOGLE_MAPS_API_KEY = "AIzaSyCmy-1bxr29Et7FFTQuCNR_w9XIxW_R1bc";

/* INSTA_WORKER_URL: 인스타 스크린샷 → 장소 찾기 기능이 호출하는 Cloudflare Worker 주소.
 *   worker/worker.js 를 배포하고 받은 주소(예: https://akegazi-insta.<계정>.workers.dev)를 넣는다.
 *   Claude API 키는 Worker의 비밀 변수에만 있고 이 파일에는 넣지 않는다. 비워두면 기능이 안내 문구만 보인다. */
window.TP_CONFIG.INSTA_WORKER_URL = "https://akegazi-insta.kado-alert-bot.workers.dev";
