# 여행 플래너 (akegazi) HANDOFF

> 다음 세션에서 이어서 작업할 때 가장 먼저 읽어야 하는 문서.

최종 업데이트: 2026-06-21

## 현재 상태 한 줄 요약
날짜별 목적지 입력 → 동선 최적화 · 실시간 날씨 · 우천 시 실내 추천 · 휴무/예약 체크 · 구글맵 길찾기까지 되는 **서버 없는 정적 SPA** 1차 완성. GitHub Pages 배포 대상.

## 지금 동작하는 것
- **일자별 타임라인** — Day 추가 → 장소(가고싶은곳/먹고싶은곳/카페/체험/숙소/이동/공항) 추가 → 시간순 카드
- **상태 배지 자동 파생** — 고정/예약(불필요·권장·필수·완료)/비와도OK·야외/휴무/인증포인트 (Stop 필드에서 생성)
- **휴무 충돌 경고** — `closingDays`에 방문 요일이 있으면 카드에 자동 경고
- **동선 최적화** — geo.js nearest-neighbor + 2-opt, 공항/숙소/고정 앵커 보존
- **실시간 날씨** — Open-Meteo (미래 16일 예보 / 과거 archive 실측), 무료·키 불필요
- **우천 → 실내 추천** — 강수 ≥3mm 또는 확률 ≥60%면 배너 + 야외 장소 우천주의 배지
- **지도** — Leaflet+OSM 번호 핀·점선 동선, 위치 검색(Nominatim)·지도 클릭 선택
- **길찾기** — 구글맵 대중교통 딥링크 (이전→여기 / 전체)
- **저장/공유** — localStorage 자동저장 + JSON 가져오기/내보내기
- **예시 데이터** — 도쿄 3일 일정(영상 기반) `예시` 버튼 로드

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

## 배포 (다음 단계)
- 로컬 git repo 초기화 + 2커밋 완료(`feat 1차 구축` → `fix 리뷰 23건`). `gh` CLI 설치됨(미인증).
- **남은 단계**: 사용자 `gh auth login`(브라우저) → `gh repo create akegazi --public --source . --push` → Settings/Pages(main/root) 또는 `gh api`로 Pages 활성화.

## 알려진 제약 / TODO
- **대중교통 자동 경로/시간 계산 없음** — 길찾기는 구글맵 딥링크로 위임(무료 정적 호스팅 제약). 동선 최적화는 직선거리(haversine) 기준.
- **휴무/예약/영업시간은 수동 입력** — 임의 장소의 휴무일·예약필수 여부를 자동 조회하는 무료 API가 없어, 사용자가 입력(또는 예시 편집).
- **날씨 16일 이후 미래는 예보 없음** — Open-Meteo 한계. 해당 시 "예보 범위 밖" 안내.
- **Nominatim 사용정책** — 라이트 사용 전제(검색 디바운스/엔터). 대량 호출 금지.
- (TODO) PWA(오프라인)·드래그 정렬 UI·다중 여행 슬롯·공유 URL 인코딩 검토

## 백업 위치
- 참고 영상: `D:\Claude\akegazi\KakaoTalk_20260621_202955835.mp4` (gitignore — 공개 배포 제외)

## 다음에 시작할 때 체크리스트
1. 이 파일 먼저 읽기
2. `python -m http.server 4488` 후 `http://127.0.0.1:4488/` 확인
3. 배포: GitHub repo `akegazi` push → Settings→Pages→main/(root)
4. 작업 끝나면 이 HANDOFF.md 업데이트

## 주요 파일 (빠른 참조)
| 파일 | 역할 |
|------|------|
| `index.html` | SPA 셸, Leaflet/모듈 로드 |
| `css/app.css` | 디자인 시스템(다크 타임라인) |
| `js/store.js` | 데이터 모델 + localStorage |
| `js/geo.js` | 동선 최적화 + 지오코딩 + 구글맵 딥링크 |
| `js/weather.js` | Open-Meteo + 우천 실내 추천 |
| `js/render.js` | 타임라인/배지/날씨 배너 |
| `js/editor.js` | 장소/날짜 입력 모달 |
| `js/app.js` | 라우팅·오케스트레이션 |
