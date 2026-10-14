// 앱인토스 콘솔 등록용 이미지(로고 600x600 · 썸네일 1932x828 · 세로 스크린샷 636x1048)를 만들어요.
// 사용: toss 폴더에서 `npx vite preview --port 4705` 를 띄운 뒤 `node store/shoot.mjs`
// Playwright는 이 PC의 다른 프로젝트에 설치된 것을 빌려 쓰고, 브라우저는 시스템 Chrome을 써요.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire('E:/AI/saju-ohaeng-main/package.json');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:4705/';
const out = name => new URL(name, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const icon = 'data:image/png;base64,' + readFileSync(new URL('../../assets/icon-512.png', import.meta.url)).toString('base64');

const browser = await chromium.launch({ channel: 'chrome' });

// 1) 로고: 기존 앱 아이콘을 600x600으로 그려요.
{
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
  await page.setContent(`<body style="margin:0"><img src="${icon}" style="width:600px;height:600px;display:block"></body>`);
  await page.screenshot({ path: out('logo-600x600.png') });
  await page.close();
}

// 2) 썸네일: 앱 이름·한 줄 소개·아이콘을 담은 가로 배너예요.
{
  const page = await browser.newPage({ viewport: { width: 1932, height: 828 } });
  await page.setContent(`<body style="margin:0;font-family:'Pretendard','Malgun Gothic',sans-serif">
  <div style="width:1932px;height:828px;background:linear-gradient(135deg,#3182F6,#1B64DA);display:flex;align-items:center;justify-content:space-between;padding:0 170px;box-sizing:border-box;color:#fff">
    <div>
      <div style="font-size:150px;font-weight:800;letter-spacing:-4px">어케가지</div>
      <div style="font-size:60px;font-weight:600;margin-top:24px;opacity:.95">날짜별 가고 싶은 곳만 적으면 동선 끝</div>
      <div style="display:flex;gap:20px;margin-top:48px">
        ${['동선 최적화', '날씨·우천 대비', '휴무 체크', '일정 공유'].map(t => `<span style="font-size:40px;font-weight:600;background:rgba(255,255,255,.2);padding:14px 30px;border-radius:999px">${t}</span>`).join('')}
      </div>
    </div>
    <img src="${icon}" style="width:440px;height:440px;border-radius:96px;box-shadow:0 30px 80px rgba(0,0,0,.25)">
  </div></body>`);
  await page.screenshot({ path: out('thumbnail-1932x828.png') });
  await page.close();
}

// 3) 세로 스크린샷: 예시(오사카 3일)를 불러와 실제 화면을 찍어요. 375x618 화면을 636/375배로 찍으면 636x1048이에요.
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 618 }, deviceScaleFactor: 636 / 375 });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('screenshot-1-home.png') });

  await page.getByText('예시(오사카 3일) 불러오기').click();
  await page.waitForTimeout(4000); // 안내 토스트가 사라질 때까지 기다려요
  await page.screenshot({ path: out('screenshot-2-trip.png') });

  await page.locator('.day-card').first().click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: out('screenshot-3-day.png') });

  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out('screenshot-4-day-more.png') });
  await ctx.close();
}

await browser.close();
console.log('store/ 에 이미지를 만들었어요.');
