import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // `--mode single`: one self-contained HTML file (see scripts/make-single-file.mjs) that can be
  // double-clicked on a Mac/PC. Code is not split, and large public assets are left out
  // (the pose model is fetched from the CDN when the camera is used).
  const single = mode === 'single';
  return {
    plugins: [react()],
    // Relative base so the build works inside Capacitor's WebView and from file servers.
    base: './',
    publicDir: single ? false : 'public',
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
      outDir: single ? 'dist-single' : 'dist',
      rollupOptions: single ? { output: { codeSplitting: false } } : undefined,
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
