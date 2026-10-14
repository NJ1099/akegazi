// 웹 버전(저장소 루트의 index.html, js/, css/, assets/)을 토스 미니앱 번들로 가져와요.
// 웹과 같은 화면을 그대로 쓰고, 토스 전용 처리는 src/bridge.ts에서 덧붙여요.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const toss = new URL('../', import.meta.url);

const out = new URL('web/', toss);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const dir of ['js', 'css', 'assets']) cpSync(new URL(`${dir}/`, root), new URL(`${dir}/`, out), { recursive: true });

let html = readFileSync(new URL('index.html', root), 'utf8');
// 서비스 워커·PWA 설치는 웹 전용이에요. 토스 앱 안에서는 번들이 이미 기기에 있어서 필요 없어요.
const sw = html.match(/\s*<!-- 서비스 워커[\s\S]*?<\/script>/);
if (!sw) throw new Error('index.html에서 서비스 워커 등록 스크립트를 찾지 못했어요.');
html = html.replace(sw[0], '');
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
// 브리지는 웹 스크립트 뒤에 붙여요. (웹 스크립트는 일반 스크립트라 모듈인 브리지보다 먼저 실행돼요)
html = html.replace('</body>', '  <script type="module" src="/src/bridge.ts"></script>\n</body>');
writeFileSync(new URL('index.html', toss), html);
console.log('웹 화면을 toss/web, toss/index.html로 가져왔어요.');
