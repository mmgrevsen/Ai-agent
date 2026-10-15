import type { CapacitorConfig } from '@capacitor/cli';

// Native shells are generated with `npx cap add android` / `npx cap add ios`.
// The game runs entirely in the WebView; pose detection uses MediaPipe's WASM build on-device.
const config: CapacitorConfig = {
  appId: 'com.pushlegends.game',
  appName: 'Push Legends',
  webDir: 'dist',
  backgroundColor: '#140f2e',
  android: { allowMixedContent: false },
  ios: { contentInset: 'never' },
};

export default config;
