import { defineConfig } from 'vite';

// 번들은 토스 앱 안에서 정적 파일로 서비스되므로 상대 경로로 빌드해요.
// web/ 은 scripts/sync-web.mjs가 저장소 루트의 public/을 복사한 폴더로, 그대로 dist에 들어가요.
export default defineConfig({
  base: './',
  publicDir: 'web',
  build: { outDir: 'dist', target: 'es2020' },
  server: { host: true, port: 5173 },
});
