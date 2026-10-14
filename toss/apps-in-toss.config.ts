import { defineConfig } from '@apps-in-toss/web-framework/config';

// 콘솔에 등록한 appName과 같아야 해요. (앱 이름·아이콘은 SDK 3.x부터 콘솔에서 관리해요)
export default defineConfig({
  appName: 'akegazi',
  brand: {
    primaryColor: '#3182F6',
  },
  permissions: [],
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
  },
  webBundleDir: 'dist',
});
