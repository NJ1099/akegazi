/* sample.js — 예시 여행 데이터 (참고 영상의 도쿄 3일 일정) — TP.sample
 * 좌표는 실제 명소 근사값. '예시 불러오기' 버튼으로 로드.
 */
(function (TP) {
  "use strict";
  function S(o) {
    return Object.assign({
      type: "attraction", subtitle: "", address: "", lat: null, lon: null,
      time: "", durationLabel: "", indoor: null, openHours: "",
      closingDays: [], closingNote: "", reservation: "none", reservationNote: "",
      fixed: false, photoSpot: false, note: "", cost: ""
    }, o);
  }

  TP.sample = function () {
    return {
      title: "도쿄 3일 여행",
      days: [
        {
          date: "2026-06-14", label: "도착 · 긴자 · 시부야",
          stops: [
            S({ type: "airport", title: "나리타 공항 도착", subtitle: "成田空港 T1/T2", address: "Narita Airport, Chiba",
                lat: 35.7720, lon: 140.3929, time: "10:30", durationLabel: "약 60~90분", indoor: true, fixed: true,
                closingNote: "연중무휴",
                note: "입국심사·수하물·티켓팅에 60~90분. 도심 도착은 약 13:00로 잡으면 현실적." }),
            S({ type: "transport", title: "Skyliner / N'EX 타고 도심", subtitle: "都心へ", address: "Keisei / JR",
                lat: 35.7138, lon: 139.7770, time: "12:00", durationLabel: "41~60분", indoor: true, reservation: "recommended",
                openHours: "Skyliner 첫차 07:23 ~ 막차 23:00",
                note: "지정석. 긴자행이면 Skyliner+우에노(41분)+히비야선이 빠름. 외국인 N'EX 왕복권 ¥4,070." }),
            S({ type: "lodging", title: "코코호텔 긴자 체크인·짐 보관", subtitle: "COCO HOTEL GINZA 1-CHOME", address: "銀座1-9-5 (JR 유라쿠초/도쿄역 도보권)",
                lat: 35.6717, lon: 139.7640, time: "13:00", durationLabel: "30분", indoor: true, closingNote: "연중무휴",
                note: "체크인 보통 15:00 (짐 보관 조기 가능). 체크인 전이면 캐리어 프런트에 맡기고 바로 시부야로." }),
            S({ type: "attraction", title: "시부야 스크램블 교차로 · 하치코", subtitle: "スクランブル交差点 / ハチ公", address: "시부야 (긴자→시부야 약 17분)",
                lat: 35.6595, lon: 139.7004, time: "14:00", durationLabel: "40분", indoor: false, photoSpot: true, closingNote: "24시간",
                note: "첫 도보 필수 인증샷. 교차로는 위에서 보면 더 멋짐(스타벅스 츠타야점). 하치코 동상 도보 1분." }),
            S({ type: "food", title: "점심 — 모헤지 (시부야 스크램블스퀘어 12F)", subtitle: "もへじ 渋谷スクランブルスクエア店", address: "시부야역 직결 스크램블스퀘어 12F",
                lat: 35.6580, lon: 139.7016, time: "14:45", durationLabel: "1~1.5시간", indoor: true, reservation: "recommended", closingNote: "시설상 무휴(빌딩 영업일)",
                openHours: "11:00~23:00 통영업 (L.O.22:00)",
                note: "일요일 직접 점심. 해산물정식(몬자야키풍). 1인 4,000~5,000엔대." }),
            S({ type: "cafe", title: "시부야 거리 산책 · 카페", subtitle: "渋谷一帯", address: "시부야 일대",
                lat: 35.6590, lon: 139.6985, time: "16:00", durationLabel: "자유", indoor: true,
                note: "첫날은 무리 말고 여유. 도겐자카 골목·논베이요코초 분위기 구경하거나 카페에서 쉬며 저녁까지 컨디션 조절." }),
            S({ type: "food", title: "Beef Kitchen 에비스 (야키니쿠, 예약)", subtitle: "和牛焼肉 Beef Kitchen 恵比寿", address: "에비스역 서쪽출구 도보 3분",
                lat: 35.6467, lon: 139.7100, time: "19:15", durationLabel: "1.5~2시간", indoor: true, fixed: true,
                reservation: "done", reservationNote: "(6/14)", closingNote: "부정기(셀 연휴만)",
                note: "A5 흑우와규를 합리적 가격에 — 타베로그 평점 높음. 디너 1인 8,000~10,000엔." }),
            S({ type: "attraction", title: "도쿄타워 야경", subtitle: "東京タワー", address: "에비스→카미야초(히비야선) 약 10분, 도쿄타워 도보 7분",
                lat: 35.6586, lon: 139.7454, time: "21:00", durationLabel: "1시간", indoor: true, photoSpot: true, closingNote: "연중무휴",
                openHours: "메인데크 9:00~23:00 (탑데크 ~22:45)",
                note: "라이트업된 도쿄타워 야경 첫날 하이라이트. 메인데크 입장 ¥1,500. 약차후 시 탑데크 중단 가능." }),
            S({ type: "lodging", title: "긴자 호텔 복귀", subtitle: "→ 銀座", address: "도쿄타워→다이몬역(아사쿠사선) 약 12분",
                lat: 35.6717, lon: 139.7640, time: "22:15", durationLabel: "약 15분", indoor: true,
                note: "첫날 마무리. 푹 쉬고 둘째 날 해리포터 컨디션 챙기기." })
          ]
        },
        {
          date: "2026-06-15", label: "해리포터 스튜디오 · 신주쿠 밤",
          stops: [
            S({ type: "activity", title: "이케부쿠로 선샤인시티", subtitle: "サンシャインシティ", address: "긴자→이케부쿠로 약 18분, 도보 8분",
                lat: 35.7295, lon: 139.7190, time: "10:00", durationLabel: "1.5~2시간", indoor: true, closingNote: "연중무휴",
                openHours: "시설별 (수족관 9:30~21:00 등)",
                note: "완전 실내. 수족관·포켓몬센터·플라네타리움·난자타운 원스톱. 비 오는 날 토시마엔 직행 전 둘러보기 좋음." }),
            S({ type: "transport", title: "이케부쿠로 → 토시마엔 이동", subtitle: "西武池袋線 → 豊島園", address: "세이부 이케부쿠로선 직통",
                lat: 35.7456, lon: 139.6470, time: "11:30", durationLabel: "약 20분", indoor: true,
                note: "세이부 이케부쿠로선 직통 약 17분, 토시마엔역 도보 2분. 13:00 입장 목표." }),
            S({ type: "activity", title: "워너브라더스 해리포터 스튜디오 투어 (예약)", subtitle: "WB Studio Tour Tokyo", address: "練馬区桜台1-1-7",
                lat: 35.7505, lon: 139.6460, time: "13:00", durationLabel: "약 5시간", indoor: true, fixed: true,
                reservation: "done", reservationNote: "(13:00 입장)", closingNote: "연중무휴",
                openHours: "날짜별 변동 (대체로 8:30~19:00) — 입장 전 공식 사이트 확인",
                note: "이번 여행 1순위. 그레이트홀·다이애건 앨리·9¾승강장·호그와트 익스프레스(실제 기차)·금지된 숲. 굿즈샵 인기, 시간 여유 두기." }),
            S({ type: "food", title: "Ko Sushi (니시신주쿠, 저녁 스시)", subtitle: "西新宿 寿司店", address: "신주쿠역/도쿄도청 인근",
                lat: 35.6938, lon: 139.6920, time: "18:30", durationLabel: "1~1.5시간", indoor: true, reservation: "recommended",
                openHours: "디너 월~금 17:00~22:30",
                note: "월요일 영업 확인됨(소규모 12석, 예약 권장). 동네 쇼와풍 에도마에 스시. 1인 4,000~7,000엔대." }),
            S({ type: "attraction", title: "도쿄도청 무료전망대 · 가부키초", subtitle: "東京都庁舎", address: "도쿄도에어 직결 / JR신주쿠 도보 10분",
                lat: 35.6896, lon: 139.6917, time: "20:00", durationLabel: "30~50분", indoor: true, photoSpot: true,
                openHours: "남전망대 9:30~22:00 (입장 21:30)",
                note: "무료 야경 스폿. 신주쿠 산책 코스. 일찍 야경 보고 가부키초·골든가이는 외곽 구경 정도로 (너무 늦게까지 머물지 말고 호텔 복귀)." }),
            S({ type: "transport", title: "신주쿠 → 긴자 호텔 복귀", subtitle: "丸ノ内線 → 銀座", address: "마루노우치선 신주쿠↔긴자 직통",
                lat: 35.6717, lon: 139.7640, time: "21:30", durationLabel: "약 20분", indoor: true,
                note: "환승 없이 한 번에 긴자." })
          ]
        },
        {
          date: "2026-06-16", label: "도쿄 디즈니씨 종일",
          stops: [
            S({ type: "transport", title: "호텔 출발 → 도쿄역", subtitle: "→ 東京駅", address: "긴자→마루노우치선 도쿄역 1정거장 (또는 도보 15분)",
                lat: 35.6812, lon: 139.7671, time: "06:45", durationLabel: "약 10분", indoor: true,
                note: "9시 게이트 도착 목표 → 6:45 출발. 도쿄역 케이요선 승강장이 멀어 여유 있게." }),
            S({ type: "transport", title: "도쿄역 → 마이하마 (JR 케이요선)", subtitle: "京葉線", address: "케이요선 약 15분 ¥260, 마이하마역",
                lat: 35.6330, lon: 139.8804, time: "07:15", durationLabel: "약 16분", indoor: true,
                note: "마이하마에서 디즈니리조트라인(모노레일) 환승." }),
            S({ type: "activity", title: "디즈니씨 게이트 도착 (개장 전 대기)", subtitle: "東京ディズニーシー", address: "마이하마 / 디즈니리조트라인",
                lat: 35.6267, lon: 139.8850, time: "08:00", durationLabel: "종일", indoor: false, photoSpot: true,
                reservation: "done", reservationNote: "(입장권 사전구매)", closingNote: "연중무휴",
                openHours: "개장 9:00 (날씨·시즌 변동)",
                note: "전 세계 단 하나뿐인 바다 테마파크. 8시 도착해 줄 서기. 개장 직후 인기 어트랙션부터. 우천 대비 우비 지참, DPA(유료 우선입장) 적극 활용." })
          ]
        }
      ]
    };
  };
})(window.TP = window.TP || {});
