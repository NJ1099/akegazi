/* help.js — 단계별 사용 설명 ⓘ 팝업 (네임스페이스 TP.help)
 *
 *   TP.help.btn("day") → 제목 옆에 붙이는 작은 ⓘ 버튼. 누르면 그 화면 설명이 가운데 팝업으로 뜬다.
 *   장소 편집창 같은 모달 위에서도 열리므로, 공용 modal() 을 쓰지 않고 자기 레이어를 따로 띄운다
 *   (공용 modal 을 겹쳐 열면 Esc 한 번에 아래 편집창까지 함께 닫힌다).
 *   설명은 짧게 — 한 화면에 3~5줄. 기능을 바꾸면 여기 문구도 함께 고칠 것.
 */
(function (TP) {
  "use strict";
  var U = TP.util, el = U.el;

  var HELP = {
    home: { title: "내 여행", lines: [
      "‘+ 새 여행’에서 어디로 가는지만 적으면 시작돼요.",
      "여행 날짜가 되면 맨 위에 ‘오늘’ 카드가 떠요 — 다음 장소로 바로 길찾기.",
      "여행 카드의 D-9 는 출발까지 남은 날이에요.",
      "📸 인스타 게시물 링크나 캡처로 소개된 장소를 찾아 여행에 담을 수 있어요."
    ] },
    today: { title: "오늘 카드", lines: [
      "다음 장소 = 지금 시각 이후로 잡힌 첫 장소예요 (시각이 없으면 첫 장소).",
      "‘길찾기’는 지금 내 위치에서 출발해요.",
      "‘다음 ›’으로 그 뒤 장소를 미리 볼 수 있어요 (저장되지 않아요)."
    ] },
    lodging: { title: "숙소", lines: [
      "체크인 날짜와 몇 박인지 고르면 그 날짜들(Day)이 자동으로 생겨요.",
      "숙소를 여러 개 넣으면 날짜마다 묵는 곳이 정해져요. 숙소를 바꾸는 날은 A에서 나와 B로 가요.",
      "숙소는 매일 아침 출발점·밤 귀가점이 되어 동선 최적화와 교통비에 들어가요."
    ] },
    days: { title: "일정", lines: [
      "Day 를 누르면 그날 일정으로 들어가요.",
      "카드에 그날 장소가 순서대로 보이고, 16일 안이면 날씨·비 소식도 함께 떠요.",
      "‘+ 날짜’로 숙소 없이 날짜만 추가할 수 있어요. 날짜 삭제는 Day 안의 ✎ 편집에서."
    ] },
    wish: { title: "보관함", lines: [
      "언제 갈지 아직 모르는 곳을 모아 두는 곳이에요.",
      "누른 뒤 ‘언제 갈까요?’에서 Day 를 고르면 그 날 맨 뒤로 옮겨져요.",
      "일정에 있던 곳도 편집 → ‘날짜 옮기기’ → ‘보관함으로’ 되돌릴 수 있어요.",
      "보관함에 있는 곳은 예산에 들어가지 않아요."
    ] },
    day: { title: "하루 일정", lines: [
      "카드를 누르면 편집, 왼쪽 ⠿ 를 끌면 순서를 바꿔요.",
      "🚌 🚕 🚶 칩은 앞 장소에서 여기까지 가는 방법이에요. 교통비가 예산에 더해져요.",
      "맨 위·맨 아래 🏨 줄은 숙소 출발·귀가예요 (숙소 기간으로 자동).",
      "‘동선 최적화’는 숙소·공항·고정 일정은 두고 그 사이 순서만 짧게 바꿔요.",
      "🕐 경고는 도착 예정 시각에 가게가 닫혀 있거나 곧 닫을 때 떠요."
    ] },
    stop: { title: "장소 넣기", lines: [
      "종류를 고르고 이름을 적으면 구글에서 위치를 찾아요. 결과를 누르면 위치·영업시간·쉬는 요일이 채워져요.",
      "꼭 필요한 건 이름뿐이에요. 시각·금액은 알 때만.",
      "‘더 입력하기’에 교통수단·영업시간·예약·메모가 있어요.",
      "숙소를 고르면 체크인 날짜와 몇 박인지 정해요."
    ] },
    trip: { title: "새 여행", lines: [
      "지역만 적어도 돼요 — 이름은 ‘지역 + 여행’으로 채워져요.",
      "날짜를 넣으면 Day 가 한 번에 생겨요. 비워 두고 숙소로 정해도 돼요.",
      "‘더 설정하기’에서 통화·내 통화(환산 표시)·비행기 시각을 정해요."
    ] },
    money: { title: "쓴 돈", lines: [
      "실제로 쓴 돈을 적는 곳이에요. 여행 화면의 예산은 계획이고 여기는 실제예요.",
      "금액은 여행 통화로 적고, ≈ 는 내 통화로 바꾼 값이에요.",
      "일행을 2명 이상 넣으면 누가 냈는지·누구랑 나눴는지 고를 수 있고, 위에 ‘누가 누구에게 얼마’가 계산돼요.",
      "기록을 누르면 고치거나 지울 수 있어요."
    ] },
    expense: { title: "쓴 돈 기록", lines: [
      "금액만 있어도 저장돼요.",
      "누가 냈나요 = 결제한 사람, 누구랑 나눴나요 = 똑같이 나눌 사람이에요."
    ] },
    pack: { title: "준비물", lines: [
      "누르면 챙김 표시가 돼요. 한 번 더 누르면 취소.",
      "✕ 로 빼고, 아래 칸에 적어서 더해요.",
      "챙긴 개수는 여행 화면에도 보여요."
    ] }
  };

  var openBack = null;
  function close() {
    if (!openBack) return;
    document.removeEventListener("keydown", onKey, true);
    if (openBack.parentNode) openBack.parentNode.removeChild(openBack);
    openBack = null;
  }
  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); }   // 아래 편집창까지 닫히지 않게
  }
  function show(key) {
    var h = HELP[key]; if (!h) return;
    close();
    var box = el("div.help", { role: "dialog", "aria-modal": "true", "aria-label": h.title + " 사용 설명", tabindex: "-1" }, [
      el("div.help__title", { text: "ⓘ " + h.title }),
      el("ul.help__list", null, h.lines.map(function (t) { return el("li", { text: t }); })),
      el("button.btn.btn--block", { onclick: close }, ["알겠어요"])
    ]);
    openBack = el("div.help-back", { onclick: function (e) { if (e.target === openBack) close(); } }, [box]);
    document.body.appendChild(openBack);
    document.addEventListener("keydown", onKey, true);
    try { box.focus(); } catch (e) {}
  }
  /* 제목 옆 ⓘ 버튼 — 부모(카드·줄)의 클릭으로 번지지 않게 막는다 */
  function btn(key) {
    return el("button.info-btn", { type: "button", "aria-label": ((HELP[key] || {}).title || "") + " 사용 설명", title: "사용 설명",
      onclick: function (e) { e.stopPropagation(); e.preventDefault(); show(key); } }, ["i"]);
  }

  TP.help = { btn: btn, show: show, HELP: HELP };
})(window.TP = window.TP || {});
