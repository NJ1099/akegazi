# 어케가지 (akegazi) HANDOFF

> 다음 세션에서 이어서 작업할 때 가장 먼저 읽어야 하는 문서. 앱 표시명은 **어케가지**, repo/폴더는 `akegazi`.

최종 업데이트: 2026-06-23

## 현재 상태 한 줄 요약
날짜별 목적지 입력 → **구글 지도 검색**·동선 최적화 · **구글맵 번호 동선** · **공항 시각 기반 시간 일정(ETA·비행기 마감 경고)** · 실시간 날씨 · 우천 시 실내 추천 · 휴무/예약 체크 · 일정 링크 공유까지 되는 **정적 SPA**. 구글맵은 **referrer 제한 브라우저 키**(`js/config.js`) 1개로 동작. **GitHub Pages 배포** → https://nj1099.github.io/akegazi/ (repo: NJ1099/akegazi).

> ⚠️ **키 필수**: `js/config.js`의 `GOOGLE_MAPS_API_KEY`가 비어 있으면 검색은 키리스 폴백(OSM)으로, 지도는 안내 메시지로 degrade. 키를 넣어야 구글 검색/지도가 켜진다. 키는 HTTP 리퍼러 + API(Maps JS·Places New) 제한 필수.
>
> 🚨 **리퍼러 함정(중요)**: 지도(Maps JS)는 페이지 전체 URL(`https://nj1099.github.io/akegazi/`)을 리퍼러로 보내지만, **검색(Places API New, `places.googleapis.com`)은 브라우저 정책상 origin(`https://nj1099.github.io/`)만** 보낸다. 그래서 키 허용목록에 `https://nj1099.github.io/akegazi/*`만 있으면 **지도는 되는데 검색은 403(`API_KEY_HTTP_REFERRER_BLOCKED`)**으로 막힌다. 반드시 **origin 와일드카드 `https://nj1099.github.io/*`** 를 허용목록에 넣어야 검색이 동작한다(라이브 실측으로 확인된 게이팅 이슈).

## 지금 동작하는 것
- **다중 여행 관리** — 홈=여행 목록(나라·일정별), 여행=날짜 목록, 날짜=장소 타임라인 (3단계 해시 라우팅). 여행 추가/전환/삭제, 전체 지우기.
- **드래그 정렬** — 타임라인 손잡이(⠿) 끌어 순서 변경(포인터 기반, 터치+마우스). 카드 ✕ 인라인 삭제.
- **일자별 타임라인** — Day 추가 → 장소(가고싶은곳/먹고싶은곳/카페/체험/숙소/이동/공항) 추가 → 시간순 카드
- **상태 배지 자동 파생** — 고정/예약(불필요·권장·필수·완료)/비와도OK·야외/휴무/인증포인트 (Stop 필드에서 생성)
- **휴무 충돌 경고** — `closingDays`에 방문 요일이 있으면 카드에 자동 경고
- **장소 검색 = 구글 Places(이름 입력 시 자동)** — 에디터에서 **장소 이름을 적으면** 즉시(디바운스) 구글 Places로 위치 자동 검색·선택(별도 검색칸 없음). 키 없으면 OSM 폴백. 시각 입력은 시간휠 없이 **수동 텍스트(1300→13:00)**.
- **동선 최적화** — geo.js nearest-neighbor + 2-opt, 공항/숙소/고정 앵커 보존
- **공항 시각 기반 시간 일정** — 공항 stop에 도착(arriveTime)/출발(departTime) 시각 입력 → `geo.buildSchedule`가 구간별 예상 도착(ETA, 추정) 자동 계산. 도착편=하루 시작(수속 45분 버퍼), 출발편=마감(출발 2시간 전 권장). 비행기 놓칠 위험이면 **빨간 경고 배너**. 체류시간은 stop별 `stayMin`(없으면 종류별 기본값). 이동시간은 직선거리/22km·h 추정.
- **실시간 날씨** — Open-Meteo (미래 16일 예보 / 과거 archive 실측), 무료·키 불필요
- **우천 → 실내 추천** — 강수 ≥3mm 또는 확률 ≥60%면 배너 + 야외 장소 우천주의 배지
- **지도 = 구글맵 JS API** — 다크 스타일 구글맵에 **방문 순서 번호 마커**(SVG) + 점선 동선. 위치 선택기도 구글맵 클릭/드래그(Leaflet 완전 제거).
- **구간 교통수단·예상 교통비(구글 실거리)** — 카드 빠른 칩으로 대중교통/택시/도보 선택. **구글 Distance Matrix 실거리·시간**(키에 허용 시) 기준, 없으면 직선거리×1.4 폴백. 자동생성 공항은 좌표를 구글로 채워 ¥500 같은 기본요금만 나오던 문제 해결. 직접 입력 가능.
- **경비·예산(분류·결제수단·환율 환산)** — 장소마다 금액 + 분류(식비/입장료/숙소/쇼핑/기타) + 결제수단(신용/체크/현금). 일/여행 예산 배너에 분류별·결제수단별·예상 교통비 합산 총 예산 + **내 통화 환율 환산(≈)** 표시.
- **여행 생성/통화** — 새 여행 시 이름·지역·통화·기간·비행기 시각 입력 → 기간의 날짜들 + 첫날 도착공항·마지막날 출발공항(고정) 자동 생성(편집 가능). 통화(¥/₩/$/€)는 지역 입력 시 자동 추천. `openTripModal`.
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

### 5차 (사용자 피드백 반영) — 2026-06-24
1. **동선 최적화 방향 안정화** — 앵커 없는 열린 경로는 방향이 모호해, 첫 등록 장소가 지리적 중간이면 결과가 통째로 역방향(예 `C,A,B,D,E`→`E,D,C,B,A`)으로 뒤집혀 "뒤바뀐다"는 불만. `geo.optimizeSegment`에 **방향 선택(orderDisplacement)** 추가: 자유 구간은 최적화 후 입력 순서에 더 가까운 방향을 채택, 단순 역순 입력은 그대로 유지(→ "이미 효율적"). node 테스트로 고정.
2. **캐시 최신화(서비스 워커)** — "새로고침해도 최신화 안 됨(다른 브라우저는 됨)"은 GitHub Pages의 HTML 캐시(기본 10분) 탓. `sw.js`(**network-first**, 같은 출처 GET만, 외부 구글/날씨 통과, skipWaiting+claim) 신규 + index.html 등록. 온라인이면 새로고침=최신, 오프라인은 캐시 폴백. 캐시 무효화 필요 시 `sw.js`의 `CACHE` 버전 올림. ⚠️ 현재 구버전 캐시를 가진 사용자는 **1회 강력 새로고침/사이트 데이터 삭제**로 SW를 깔면 이후 자동 최신화.
3. **수동 시각 뒤 ETA 역행 수정** — `buildSchedule`에서 일반 장소의 수동 입력 시각이 ETA 커서를 갱신 안 해, 수동 15:00 장소 뒤에 추가한 무시각 장소가 14:20처럼 더 이르게 표시되던 문제(스크린샷). 수동 시각이 있으면 그 시각으로 표시하고 **커서를 그 시각 이상으로 전진(Math.max)** → 뒤 ETA가 항상 단조 증가. 공항/고정 앵커가 아닌 수동 시각은 거친 이동추정發 거짓 모순경고 안 띄움. node 테스트로 고정(40/40).

### 6차 (사용자 피드백 반영) — 2026-06-24
1. **교통수단·예상 교통비** — `js/money.js` 신규(TP.money: 통화표·format·estimateFare(거리기반)·currencyForRegion). Stop에 `arriveBy`(transit/taxi/walk/none)·`fareAmount`. 카드 빠른칩 + editor 섹션. 실제 요금 API 없어 거리/통화별 추정(직접 수정 가능).
2. **결제수단별 경비·총 예산** — Stop에 `costAmount`·`payment`(credit/debit/cash). render `dayBudget/tripBudget/budgetBanner`(결제수단별 + 예상 교통비 합산). 일/여행 뷰에 예산 배너.
3. **여행 생성/통화** — `openTripModal`(이름·지역·통화·기간·비행기) → `generateDaysAndFlights`로 날짜들 + 도착/출발 공항(고정) 자동 생성. Trip에 `region`·`currency`. 지역→통화 자동추천. `newTrip`이 빈 여행 대신 모달 오픈. 여행 헤더에 지역·통화·편집(✎).
4. **검증** — money/budget/share node 33/33, geo 40/40, 브라우저 스모크 13/13. + 어드버서리얼 리뷰 반영.

### 7차 (사용자 피드백 반영) — 2026-06-24
1. **환율 환산** — Trip `homeCurrency`. money.js 환율(open.er-api.com 무료·키없음 + 폴백 근사 + 캐시, `rate/convert/ensureRate/formatConv`). 금액 옆·예산 총액에 `≈ 환산값`. app `ensureFx`로 1회 로드 후 재렌더(실값 갱신). 여행 모달에 '내 통화(환산)' 선택(신규 기본 KRW).
2. **경비 카테고리** — Stop `costCategory`(food/ticket/lodging/shopping/etc, 미지정 시 종류로 추정 `inferCategory`). 에디터 분류 칩, 예산 배너 분류별 합계.
3. **검증** — money/budget/share node 54/54, 브라우저 스모크 12/12(실시간 환율·분류·환산 반영).

### 8차 (사용자 피드백 반영) — 2026-06-24
1. **이름 입력 시 위치 자동 검색** — editor에서 별도 검색칸 제거, 장소 이름 입력(디바운스)→geocode 자동, 결과는 이름칸 아래. 좌표 있으면 자동검색 멈춤(수정 방해 방지) + '다시 검색' 버튼.
2. **시각 수동 입력** — `type=time`(시간휠) → 텍스트 `timeInput`(1300→13:00 자동 콜론, inputmode numeric). 도착시간·공항 도착/출발·여행모달 비행기 시각 전부.
3. **교통비 구글 실거리화** — geo.js `cachedRoad/ensureRoad`(Distance Matrix, DRIVING/TRANSIT, 대중교통 fare 오면 사용). render legFare가 실거리 우선, 없으면 직선×1.4. money 택시 perKm 현실화. `generateDaysAndFlights`가 공항 좌표를 `region+" 공항"` 구글검색으로 채움(¥500 버그 근본 원인). app `ensureRoads`로 비동기 로드 후 재렌더.
4. **검증** — money/budget node 57/57, geo 40/40, 스모크 13+12+8/8(수동시간·이름검색·공항택시 ¥500→~¥2,230).

## 알려진 제약 / TODO
- **정확한 구글 교통비는 'Distance Matrix API' 필요** — 키에 그 API를 추가 허용해야 실거리·실제 대중교통 요금 반영. 미허용이면 직선×1.4 추정(공항 좌표는 채워지므로 기본요금 버그는 해소).
- **환율은 일 단위 참고치** — open.er-api.com(무료) 기준, API 실패 시 하드코딩 폴백 근사. `≈` 표시로 참고용임을 명시.
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
| `index.html` | SPA 셸, config→gmaps→모듈 로드 + SW 등록 (Leaflet 제거됨) |
| `sw.js` | 서비스 워커(network-first 캐시: 새로고침=최신, 오프라인 폴백) |
| `js/config.js` | **구글맵 API 키**(referrer 제한 공개 키) |
| `js/gmaps.js` | 구글맵 동적 로더 + `TP.gmaps.lib()` 헬퍼 |
| `css/app.css` | 디자인 시스템(다크 타임라인) |
| `js/store.js` | 데이터 모델 + localStorage (Trip region/currency, Stop arriveTime/departTime/stayMin/arriveBy/fareAmount/costAmount/payment) |
| `js/money.js` | 통화·금액 포맷·예상 교통요금·지역→통화 추천 (TP.money) |
| `js/geo.js` | 지오코딩(구글 Places) + 동선 최적화 + **buildSchedule(시간 일정)** + 구글맵 딥링크 |
| `js/maps.js` | **구글맵 JS API** 번호 마커·점선 동선·위치 선택기 |
| `js/weather.js` | Open-Meteo + 우천 실내 추천 |
| `js/render.js` | 타임라인/배지/날씨 배너/**일정·위험 배너** |
| `js/editor.js` | 장소/날짜 입력 모달 (공항 시각·체류·라이브 검색) |
| `js/app.js` | 라우팅·오케스트레이션·schedule 계산 |
