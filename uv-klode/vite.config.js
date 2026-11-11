import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// viteSingleFile samler HELE appen (JavaScript, CSS, landegrænser og data) i én
// dist/index.html. Så kan filen åbnes direkte med dobbeltklik (file://) på en
// skolecomputer uden internet og uden webserver.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  test: { environment: 'node' },
});
