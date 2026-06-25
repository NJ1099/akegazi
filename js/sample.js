/* sample.js — 예시 여행 데이터 (오사카 3일, 동적 날짜) — TP.sample
 * '예시 불러오기' 버튼으로 로드. 날짜는 오늘+10~12일 — weather.js forecast 상한(off<=15) 안에
 * 들도록 둔 값. 이 오프셋을 13 이상으로 올리면 마지막 날이 예보 범위(+15)를 벗어날 수 있으니 주의.
 */
(function (TP) {
  "use strict";
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function iso(off) { var d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
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
      title: "오사카 3일 여행",
      region: "오사카", currency: "JPY", homeCurrency: "KRW",   // 엔 입력 ⇄ 원화 환산 데모
      days: [
        {
          date: iso(10), label: "도착 · 난바 · 도톤보리",
          stops: [
            S({ type: "airport", title: "간사이공항(KIX) 도착", subtitle: "関西空港", address: "Kansai International Airport",
                lat: 34.4347, lon: 135.2441, time: "13:00", arriveTime: "13:00", durationLabel: "약 60~90분", indoor: true, fixed: true, closingNote: "연중무휴",
                note: "입국심사·수하물 찾고 난바행 열차로. 도심 도착은 약 15:00로 잡으면 여유." }),
            S({ type: "transport", title: "난카이 라피트 타고 난바로", subtitle: "南海ラピート → なんば", address: "간사이공항역 → 난바역",
                lat: 34.6627, lon: 135.5026, time: "14:30", durationLabel: "약 40분", indoor: true, reservation: "recommended",
                openHours: "첫차 06:00 ~ 막차 23:00대",
                note: "특급 라피트 ¥1,450, 난바 직통 약 38분. 지정석권 미리 끊으면 편함(자유석도 가능)." }),
            S({ type: "lodging", title: "호텔 체크인 · 짐 보관 (난바)", subtitle: "なんば 호텔", address: "난바역 도보권",
                lat: 34.6650, lon: 135.5010, time: "15:30", durationLabel: "30분", indoor: true, closingNote: "연중무휴",
                openHours: "체크인 보통 15:00 (짐 보관 조기 가능)",
                note: "체크인 전이면 캐리어 프런트에 맡기고 도톤보리로(도보 5분)." }),
            S({ type: "attraction", title: "도톤보리 · 글리코 사인", subtitle: "道頓堀 グリコサイン", address: "에비스바시 일대",
                lat: 34.6687, lon: 135.5013, time: "16:30", durationLabel: "1시간", indoor: false, photoSpot: true, closingNote: "24시간",
                note: "글리코 러너 앞 인증샷은 에비스바시 다리 위에서. 운하 야경도 좋음." }),
            S({ type: "food", title: "저녁 — 이치란 도톤보리 (라멘)", subtitle: "一蘭 道頓堀店", address: "도톤보리 중심",
                lat: 34.6686, lon: 135.5010, time: "18:00", durationLabel: "1시간", indoor: true, closingNote: "연중무휴(24시간)", reservation: "none",
                openHours: "24시간 영업",
                note: "개인 부스 돈코츠 라멘. 줄 서면 회전 빠름. 비와도 OK. 1인 1,000~1,500엔." }),
            S({ type: "attraction", title: "구로몬 시장 산책 · 군것질", subtitle: "黒門市場", address: "닛폰바시역 인근 아케이드",
                lat: 34.6657, lon: 135.5060, time: "19:30", durationLabel: "1시간", indoor: true, closingNote: "점포별 휴무 상이",
                note: "지붕 있는 아케이드라 비와도 OK. 해산물구이·과일·타코야키. 저녁엔 일부 점포 마감 주의." }),
            S({ type: "lodging", title: "호텔 복귀", subtitle: "→ なんば", address: "난바",
                lat: 34.6650, lon: 135.5010, time: "21:00", durationLabel: "약 10분", indoor: true,
                note: "첫날 마무리. 둘째 날 오사카성·베이 일정 컨디션 챙기기." })
          ]
        },
        {
          date: iso(11), label: "오사카성 · 베이 · 우메다 야경",
          stops: [
            S({ type: "attraction", title: "오사카성 천수각", subtitle: "大阪城 天守閣", address: "주오구 오사카조",
                lat: 34.6873, lon: 135.5262, time: "09:00", durationLabel: "1.5시간", indoor: true, photoSpot: true, closingNote: "연중무휴(연말 휴관)",
                openHours: "9:00~17:00 (입장 16:30)",
                note: "8층 전망대 + 공원 산책. 천수각 내부는 박물관이라 비와도 OK. 입장 ¥600." }),
            S({ type: "food", title: "점심 — 모리노미야 / 성 근처", subtitle: "森ノ宮", address: "오사카성 공원 인근",
                lat: 34.6900, lon: 135.5320, time: "11:00", durationLabel: "1시간", indoor: true, reservation: "none",
                note: "성 구경 후 가벼운 점심. 공원 카페·식당가." }),
            S({ type: "activity", title: "가이유칸(해유관) 아쿠아리움", subtitle: "海遊館", address: "오사카 베이 덴포잔",
                lat: 34.6545, lon: 135.4289, time: "13:00", durationLabel: "2시간", indoor: true, reservation: "recommended", closingNote: "부정기 휴관",
                openHours: "10:00~20:00 (입장 19:00)",
                note: "거대 고래상어 수조가 메인. 완전 실내라 비 오는 날 1순위. 온라인 예매로 대기 단축. 1인 ¥2,700." }),
            S({ type: "attraction", title: "덴포잔 대관람차", subtitle: "天保山大観覧車", address: "가이유칸 옆",
                lat: 34.6562, lon: 135.4297, time: "15:30", durationLabel: "30분", indoor: true, photoSpot: true, closingNote: "부정기 휴무",
                note: "캡슐형이라 비와도 OK. 베이·시가지 전망. 가이유칸 바로 옆." }),
            S({ type: "attraction", title: "우메다 스카이빌딩 공중정원", subtitle: "梅田スカイビル 空中庭園", address: "기타구 오요도나카",
                lat: 34.7052, lon: 135.4903, time: "17:30", durationLabel: "1시간", indoor: false, photoSpot: true, closingNote: "연중무휴",
                openHours: "9:30~22:30 (입장 22:00)",
                note: "옥상 전망대는 야외라 우천 시엔 실내 전망층 위주. 일몰~야경 시간대 추천. 입장 ¥1,500." }),
            S({ type: "food", title: "저녁 — 우메다 꼬치·이자카야", subtitle: "梅田 居酒屋", address: "우메다역 식당가",
                lat: 34.7025, lon: 135.4959, time: "19:30", durationLabel: "1.5시간", indoor: true, reservation: "recommended", closingNote: "부정기 휴무",
                note: "구시카츠·꼬치 + 생맥. 인기집은 예약 권장." }),
            S({ type: "lodging", title: "호텔 복귀", subtitle: "→ なんば", address: "난바",
                lat: 34.6650, lon: 135.5010, time: "21:30", durationLabel: "약 15분", indoor: true,
                note: "우메다→난바 미도스지선 직통." })
          ]
        },
        {
          date: iso(12), label: "유니버설 스튜디오 재팬",
          stops: [
            S({ type: "transport", title: "호텔 출발 → 유니버설시티역", subtitle: "→ ユニバーサルシティ", address: "난바 → 니시쿠조 환승 → 유니버설시티",
                lat: 34.6667, lon: 135.4339, time: "08:00", durationLabel: "약 25분", indoor: true,
                note: "난바에서 한신/JR 환승. 개장 전 도착 목표로 일찍 출발." }),
            S({ type: "activity", title: "USJ 입장 (개장 전 대기)", subtitle: "ユニバーサル・スタジオ・ジャパン", address: "고노하나구 사쿠라지마",
                lat: 34.6654, lon: 135.4323, time: "08:45", durationLabel: "종일", indoor: false, photoSpot: true,
                reservation: "done", reservationNote: "(입장권·익스프레스패스)", closingNote: "연중무휴",
                openHours: "개장 9:00 (시즌 변동)",
                note: "닌텐도 월드·해리포터 구역이 메인. 익스프레스패스 사전 구매로 대기 단축. 우천 대비 우비 지참. DPA/타이밍 활용." })
          ]
        }
      ]
    };
  };
})(window.TP = window.TP || {});
