# 어케가지 (akegazi) HANDOFF

> 다음 세션에서 이어서 작업할 때 가장 먼저 읽어야 하는 문서. 앱 표시명은 **어케가지**, repo/폴더는 `akegazi`.

최종 업데이트: 2026-06-23

## 현재 상태 한 줄 요약
날짜별 목적지 입력 → **구글 지도 검색**·동선 최적화 · **구글맵 번호 동선** · **공항 시각 기반 시간 일정(ETA·비행기 마감 경고)** · 실시간 날씨 · 우천 시 실내 추천 · 휴무/예약 체크 · 일정 링크 공유까지 되는 **정적 SPA**. 구글맵은 **referrer 제한 브라우저 키**(`js/config.js`) 1개로 동작. **GitHub Pages 배포** → https://nj1099.github.io/akegazi/ (repo: NJ1099/akegazi).

> ⚠️ **키 필수**: `js/config.js`의 `GOOGLE_MAPS_API_KEY`가 비어 있으면 검색은 키리스 폴백(OSM)으로, 지도는 안내 메시지로 degrade. 키를 넣어야 구글 검색/지도가 켜진다. 키는 HTTP 리퍼러(`nj1099.github.io/*`, `localhost`)+API(Maps JS·Places New) 제한 필수.

## 지금 동작하는 것
- **다중 여행 관리** — 홈=여행 목록(나라·일정별), 여행=날짜 목록, 날짜=장소 타임라인 (3단계 해시 라우팅). 여행 추가/전환/삭제, 전체 지우기.
- **드래그 정렬** — 타임라인 손잡이(⠿) 끌어 순서 변경(포인터 기반, 터치+마우스). 카드 ✕ 인라인 삭제.
- **일자별 타임라인** — Day 추가 → 장소(가고싶은곳/먹고싶은곳/카페/체험/숙소/이동/공항) 추가 → 시간순 카드
- **상태 배지 자동 파생** — 고정/예약(불필요·권장·필수·완료)/비와도OK·야외/휴무/인증포인트 (Stop 필드에서 생성)
- **휴무 충돌 경고** — `closingDays`에 방문 요일이 있으면 카드에 자동 경고
- **장소 검색 = 구글 Places** — 에디터 검색창에 입력 즉시(디바운스) 구글 Places Text Search로 후보 표시(한국어). 키 없으면 OSM/Open-Meteo 폴백.
- **동선 최적화** — geo.js nearest-neighbor + 2-opt, 공항/숙소/고정 앵커 보존
- **공항 시각 기반 시간 일정** — 공항 stop에 도착(arriveTime)/출발(departTime) 시각 입력 → `geo.buildSchedule`가 구간별 예상 도착(ETA, 추정) 자동 계산. 도착편=하루 시작(수속 45분 버퍼), 출발편=마감(출발 2시간 전 권장). 비행기 놓칠 위험이면 **빨간 경고 배너**. 체류시간은 stop별 `stayMin`(없으면 종류별 기본값). 이동시간은 직선거리/22km·h 추정.
- **실시간 날씨** — Open-Meteo (미래 16일 예보 / 과거 archive 실측), 무료·키 불필요
- **우천 → 실내 추천** — 강수 ≥3mm 또는 확률 ≥60%면 배너 + 야외 장소 우천주의 배지
- **지도 = 구글맵 JS API** — 다크 스타일 구글맵에 **방문 순서 번호 마커**(SVG) + 점선 동선. 위치 선택기도 구글맵 클릭/드래그(Leaflet 완전 제거).
- **길찾기** — 구글맵 대중교통 딥링크 (이전→여기 / 전체)
- **일정 공유** — `↗ 공유`로 일정을 URL(`#trip=`)에 압축 담아 Web Share/클립보드 → 카톡·텔레그램. 링크 열면 ‘불러오기’ 모달.
- **홈 이동** — 앱 제목 ‘어케가지’ 클릭 시 홈. 앱바: 공유 / 예시 / ⋯(가져오기·내보내기).
- **저장** — localStorage 자동저장 + JSON 가져오기/내보내기
- **예시 데이터** — 오사카 3일 일정, 날짜는 오늘+10~12일 동적 생성(예보 동작)

## 최근 라운드에서 한 일 (2026-06-21)
### 1차 구축 (영상 리버스 엔지니어링 → 정적 SPA)
1. **[필수] 영상 분석** — KakaoTalk mp4(도쿄 3일 일정 앱 시연) ffmpeg 프레임 추출로 UI/데이터 구조 파악
2. **[필수] 전 모듈 구현** — index.html/app.css + js 9개(util·store·geo·weather·maps·render·editor·sample·app)
3. **[검증] 브라우저 QA** — Playwright(시스템 Chrome 채널)로 빈화면→예시→타임라인→지도→에디터 플로우, 콘솔에러 0건, 스크린샷 확인
4. **[수정] 버그 픽스** — 홈에서 뒤로(←) 버튼 노출(`display:grid`가 `hidden` 덮음) → `[hidden]{display:none!important}` 추가. 예시 제목 3일로 정정.
5. **[검증] 다차원 어드버서리얼 리뷰(23건) 반영** — 5차원(보안/정확성/엣지/UX/배포) 워크플로로 확정된 결함 전건 수정:
   - 동선 최적화 중간 앵커 보존(구간 분할) + 2-opt i=0 버그 (node 단위테스트로 검증)
   - 키보드 접근성(Stop 카드 role/tabindex), 모달 포커스 트랩/복원/role=dialog, 배경 스크롤 잠금
   - 날씨 최근 과거일 forecast 조회(`past_days` 병용 시 400 — 실측으로 확인 후 제거), 실패 응답 캐시 금지
   - 좌표 범위 정규화·parseDate 롤오버 거부·el() html XSS 회귀 가드·지도 누수 가드
   - 대비(텍스트/버튼 AA)·터치 타깃 44px·OSM 단일 호스트 타일
6. **[검증] 재 QA** — Playwright(시스템 Chrome) 콘솔에러 0, a11y/모달/날씨/지도 통과
7. **[배포] GitHub Pages** — NJ1099/akegazi 공개 repo 생성·push·Pages 활성화, 라이브 재검증(에러 0)

### 2차 (사용자 피드백 반영)
1. **지도 → 구글맵** — Leaflet 동선뷰를 구글맵 키리스 임베드로 교체(품질·친숙도). 임베드 렌더 실측 후 적용. Leaflet은 위치 선택기에만 잔존.
2. **일정 공유** — `js/share.js` 신규: 트립을 URL-safe base64로 `#trip=`에 인코딩, Web Share API/클립보드, 링크 열면 불러오기 모달. encode→열기→불러오기 라운드트립 QA 통과(3일 복원).
3. **브랜드·내비** — 앱명 ‘어케가지’로 변경, 제목 클릭 홈이동, 앱바 ⋯ 메뉴(가져오기/내보내기) + ↗ 공유.
4. **예시 교체** — 도쿄(영상) → 오사카 3일(랜덤), 날짜 오늘+10~12 동적화로 예보 동작.

### 3차 (사용자 피드백 반영)
1. **다중 여행 관리** — store.js를 trips[]+activeId로 리팩터(구버전 단일여행 마이그레이션). app.js 3단계 라우팅(#/ → #/trip/:id → #/trip/:id/day/:dayId), 앱바 컨텍스트(공유/예시 토글, ⋯ 라우트별 메뉴).
2. **드래그 정렬** — app.js attachDragReorder(document pointermove/up, afterElement 위치계산, reorderStops 커밋). render.js 카드에 손잡이(⠿)+삭제(✕).
3. **삭제/전체지우기** — 카드 인라인 삭제, 여행 카드 ✕ 삭제, ⋯메뉴 ‘전체 지우기’(reset).
4. **지도 번호 핀 복원** — 구글 임베드 → Leaflet renderRoute(번호 핀)로 복귀 + CARTO Voyager 고품질 타일.
5. **가독성 색 수정** — `.day-card`(button)가 색 미상속으로 ‘Day N’이 검정 → `color:var(--text)` 명시.
6. **검증·배포** — Playwright QA(다중여행 생성/전환/공유추가/전체삭제, 드래그+키보드 순서변경, 날짜/장소 삭제, 번호핀, 단일장소 핸들숨김, 콘솔에러 0) + 집중 리뷰 14건(전부 medium/low) 반영. **라이브 배포·재검증 완료** (commit e5c2b1e).

### 4차 (사용자 피드백 반영) — 2026-06-23
1. **검색 → 구글 Places** — `geo.geocode`를 구글 Places(New) Text Search로 교체(키 있을 때) + 키리스(OSM/Open-Meteo) 폴백. editor 검색창에 디바운스 라이브 검색 추가. 반환 계약 `{name,address,lat,lon}` 유지로 editor 변경 최소.
2. **지도 → 구글맵 JS API** — `maps.js`를 Leaflet에서 구글맵으로 전면 교체. 다크 스타일 + SVG 번호 마커 + 점선 Polyline + InfoWindow. `renderRoute`는 비동기지만 즉시 핸들 반환(epoch/destroy 계약 유지), picker는 `{map,setView}` 유지. `index.html`에서 Leaflet CDN 제거.
3. **구글 로더** — `js/config.js`(키), `js/gmaps.js`(공식 동적 라이브러리 임포트 부트스트랩 + `TP.gmaps.lib()` 헬퍼) 신규. 키 없으면 graceful degrade.
4. **공항 시각 기반 시간 일정** — `geo.buildSchedule` 신규(도착편=시작/출발편=마감, 구간 ETA, 비행기 위험). Stop에 `arriveTime/departTime/stayMin` 추가(store·share KMAP 3곳 규칙). editor에 공항 시각·체류 입력(공항 타입에서만 표시), render에 ETA 레일·`scheduleBanner` 위험 경고, app에서 schedule 계산·전달.
5. **검증** — geo 순수 로직 node 단위테스트 27/27, puppeteer 헤드리스 스모크 14/14(예시→배너→ETA→에디터 토글→공유 라운드트립, 콘솔에러 0).

## 알려진 제약 / TODO
- **구글맵 API 키 필요** — `js/config.js`에 referrer 제한 브라우저 키. 비면 검색은 OSM 폴백·지도는 안내문. 결제계정 필요하나 개인 사용은 무료 한도 내(예산 알림 권장).
- **시간 일정은 추정** — 이동시간은 직선거리/평균속도(22km·h) 기반 추정, 실제 대중교통 경로 시간 아님. 버퍼(수속 45분/출발 2시간)는 상수. 길찾기 실경로는 구글맵 딥링크로 위임.
- **휴무/예약/영업시간은 수동 입력** — 자동 조회 무료 API 부재.
- **날씨 16일 이후 미래는 예보 없음** — Open-Meteo 한계.
- (TODO) 실시간 교통 기반 이동시간(Distance Matrix, 유료), 버퍼/속도 사용자 설정, PWA(오프라인).

## 백업 위치
- 참고 영상: `D:\Claude\akegazi\KakaoTalk_20260621_202955835.mp4` (gitignore — 공개 배포 제외)

## 다음에 시작할 때 체크리스트
1. 이 파일 먼저 읽기
2. `js/config.js`에 구글 키 있는지 확인(로컬 테스트는 키 referrer에 `localhost` 포함 필요)
3. `python -m http.server 4488` 후 `http://127.0.0.1:4488/` 확인
4. 배포: GitHub repo `akegazi` push → Pages가 main/(root) 자동 재배포
5. 작업 끝나면 이 HANDOFF.md 업데이트

## 주요 파일 (빠른 참조)
| 파일 | 역할 |
|------|------|
| `index.html` | SPA 셸, config→gmaps→모듈 로드 (Leaflet 제거됨) |
| `js/config.js` | **구글맵 API 키**(referrer 제한 공개 키) |
| `js/gmaps.js` | 구글맵 동적 로더 + `TP.gmaps.lib()` 헬퍼 |
| `css/app.css` | 디자인 시스템(다크 타임라인) |
| `js/store.js` | 데이터 모델 + localStorage (arriveTime/departTime/stayMin 포함) |
| `js/geo.js` | 지오코딩(구글 Places) + 동선 최적화 + **buildSchedule(시간 일정)** + 구글맵 딥링크 |
| `js/maps.js` | **구글맵 JS API** 번호 마커·점선 동선·위치 선택기 |
| `js/weather.js` | Open-Meteo + 우천 실내 추천 |
| `js/render.js` | 타임라인/배지/날씨 배너/**일정·위험 배너** |
| `js/editor.js` | 장소/날짜 입력 모달 (공항 시각·체류·라이브 검색) |
| `js/app.js` | 라우팅·오케스트레이션·schedule 계산 |
