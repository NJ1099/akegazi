# ✈️ 여행 플래너 (akegazi)

날짜별 목적지를 입력하면 **동선 최적화 · 실시간 날씨 · 우천 시 실내 추천 · 휴무/예약 체크 · 구글맵 길찾기**까지 한 화면에서 도와주는 **서버 없는 정적 웹앱**입니다. 빌드 단계·API 키·백엔드가 전혀 없어 GitHub Pages에 그대로 올라갑니다.

> 데모: `https://<USERNAME>.github.io/akegazi/`

## 핵심 기능

| 기능 | 설명 |
|------|------|
| 📅 일자별 일정 | 날짜를 추가하고, 그날의 장소를 **가고 싶은 곳 · 먹고 싶은 곳 · 카페 · 체험 · 숙소 · 이동 · 공항**으로 분류해 타임라인으로 봅니다. |
| 🧭 동선 최적화 | 좌표가 있는 장소를 **nearest-neighbor + 2-opt**로 재정렬. 공항/숙소/고정 일정은 양 끝 앵커로 보존합니다. |
| 🌦 실시간 날씨 | **Open-Meteo**(무료·키 불필요)로 일자별 기온·강수·강수확률을 가져옵니다. 미래 16일 이내는 예보, 과거는 실측(archive). |
| ☔ 우천 → 실내 추천 | 강수 임계(≥3mm 또는 확률 ≥60%) 초과 시 **‘실내 위주’ 추천 배너**를 띄우고, 야외 일정에 ‘우천주의’ 배지를 자동 표시합니다. |
| 🍴 휴무·예약 체크 | 장소의 **휴무 요일**이 방문 예정 요일과 겹치면 자동 경고. **예약 불필요/권장/필수/완료** 상태를 배지로 표시합니다. |
| 🗺 지도 동선 | **Leaflet + OpenStreetMap**에 번호 핀과 점선 동선을 그립니다. |
| 🚇 길찾기 | ‘길찾기(이전→여기)’·‘전체 길찾기’ 버튼이 **구글맵 대중교통 경로**로 연결됩니다. |
| 💾 저장·공유 | 모든 데이터는 브라우저 **localStorage**에 자동 저장. JSON **가져오기/내보내기**로 백업·공유가 됩니다. |

## 사용법

1. **`예시`** 버튼으로 도쿄 3일 일정을 불러와 둘러보거나, **`+ 날짜 추가`** 로 직접 시작합니다.
2. 날짜 카드를 열고 **`+ 장소 추가`** → 이름·종류·위치(검색 또는 지도 클릭)·시간·영업시간·휴무·예약·실내여부·메모를 입력합니다.
3. **`동선 최적화`** 로 방문 순서를 자동 정렬하고, **`지도`** 탭에서 동선을 확인합니다.
4. 각 카드의 **`길찾기`** 로 구글맵 경로를, **`지도`** 로 위치를 엽니다.

## 기술 스택

- **순수 바닐라 JS (빌드 없음)** — 클래식 스크립트 + 전역 네임스페이스 `TP`. `file://` 더블클릭도 동작.
- **지도**: [Leaflet](https://leafletjs.com/) 1.9.4 (CDN, SRI 무결성) + OpenStreetMap 타일
- **날씨**: [Open-Meteo](https://open-meteo.com/) Forecast/Archive API (무료·키 불필요)
- **지오코딩**: [Nominatim](https://nominatim.org/) (OSM) → 실패 시 Open-Meteo Geocoding 폴백
- **길찾기**: Google Maps [Directions URL API](https://developers.google.com/maps/documentation/urls/get-started) 딥링크

## 프로젝트 구조

```
akegazi/
├─ index.html          # SPA 셸 (Leaflet/모듈 로드)
├─ css/app.css         # 다크 프리미엄 디자인 시스템
└─ js/
   ├─ util.js          # DOM/날짜/fetch/토스트 헬퍼
   ├─ store.js         # Trip→Day→Stop 모델 + localStorage + import/export
   ├─ geo.js           # 지오코딩 · 거리 · 동선 최적화 · 구글맵 딥링크
   ├─ weather.js       # Open-Meteo + 우천 시 실내 추천 로직
   ├─ maps.js          # Leaflet 번호 핀 · 점선 동선 · 위치 선택기
   ├─ render.js        # 타임라인/카드/배지/날씨 배너 렌더
   ├─ editor.js        # 장소/날짜 추가·편집 모달
   ├─ sample.js        # 예시(도쿄 3일) 데이터
   └─ app.js           # 라우팅 · 오케스트레이션 · 날씨 로딩
```

## 로컬 실행

서버가 꼭 필요하진 않지만(파일 더블클릭 가능), 권장:

```bash
# 아무 정적 서버나 가능
python -m http.server 4488
# → http://127.0.0.1:4488/
```

## 배포 (GitHub Pages)

1. 이 폴더를 GitHub 저장소 `akegazi`로 push.
2. 저장소 **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main` / `(root)`.
3. 잠시 후 `https://<USERNAME>.github.io/akegazi/` 에서 동작합니다. (`.nojekyll` 포함되어 Jekyll 처리 없이 정적 배포)

## 개인정보 / 데이터

- 일정 데이터는 **브라우저에만** 저장됩니다(localStorage). 서버로 전송하지 않습니다.
- 외부 호출은 날씨(Open-Meteo)·지오코딩(Nominatim)·지도 타일(OSM)뿐이며, 입력한 검색어/좌표만 전달됩니다.

## 라이선스

MIT
