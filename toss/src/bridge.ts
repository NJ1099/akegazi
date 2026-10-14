// 웹 버전 화면을 토스 미니앱 안에서 앱인토스 가이드에 맞게 돌리기 위한 연결부예요.
// 일반 브라우저(로컬 개발)에는 브리지가 없어서, 실패하면 조용히 넘어가요.
import { SafeArea, Screen, graniteEvent } from '@apps-in-toss/web-framework';

function closeApp(): void {
  try { void Screen.close(); } catch { /* 브라우저에서는 무시 */ }
}

// 1) 시스템 뒤로가기: 열린 창·메뉴가 있으면 닫고, 하위 화면이면 한 단계 위로, 홈이면 앱을 닫아요.
//    창과 메뉴는 웹 코드가 Escape 키로 닫히게 만들어져 있어서 같은 키를 보내요.
function handleBack(): boolean {
  const modalOpen = (document.getElementById('modalRoot')?.childElementCount ?? 0) > 0;
  if (modalOpen || document.getElementById('appbarMenu')) {
    const target = document.activeElement ?? document;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  }
  const back = document.getElementById('navBack');
  if (back && !back.hidden) {
    back.click();
    return true;
  }
  return false;
}

try {
  graniteEvent.addEventListener('backEvent', {
    onEvent: () => { if (!handleBack()) closeApp(); },
    onError: () => {},
  });
} catch { /* 브라우저에서는 무시 */ }

// 2) Safe Area: 홈 인디케이터에 아래쪽 내용이 가리지 않게 해요.
function applySafeArea(): void {
  const set = (insets: { top: number; bottom: number }) => {
    document.documentElement.style.setProperty('--safe-bottom', `${insets.bottom}px`);
  };
  try {
    set(SafeArea.get());
    SafeArea.subscribe({ onEvent: set });
  } catch { /* 브라우저에서는 CSS env() 기본값을 써요 */ }
}
applySafeArea();
// 3) 뒤로가기 버튼 하나만: 토스 내비게이션 바에 이미 뒤로가기가 있어서 웹 화면의 ← 버튼은 숨겨요.
//    (2026-10-14 검수 반려 사유 "내비게이션 바의 뒤로가기와 미니앱 헤더의 뒤로가기가 함께 노출")
//    버튼은 DOM 에 남겨 두고 보이지만 않게 해요 — 위 handleBack 이 그 버튼의 hidden 상태와 click 을 그대로 써요.
const style = document.createElement('style');
style.textContent = 'body{padding-bottom:var(--safe-bottom,env(safe-area-inset-bottom,0px));}#navBack{display:none!important;}';
document.head.append(style);
