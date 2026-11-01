// Copies the MediaPipe WASM runtime into public/ and downloads the pose model if missing,
// so the app can run pose detection fully offline inside the native WebView.
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/mediapipe');
// Full model (better shoulders and torso, used first) and lite model (fallback)
const MODELS = ['full', 'lite'].map((size) => ({
  size,
  dst: join(root, `public/models/pose_landmarker_${size}.task`),
  url: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${size}/float16/latest/pose_landmarker_${size}.task`,
}));

mkdirSync(wasmDst, { recursive: true });
for (const file of readdirSync(wasmSrc)) {
  // Only the vision_wasm_internal pair is loaded by FilesetResolver.forVisionTasks.
  if (!file.startsWith('vision_wasm_internal') && !file.startsWith('vision_wasm_nosimd_internal')) continue;
  copyFileSync(join(wasmSrc, file), join(wasmDst, file));
}
console.log('[prepare-assets] MediaPipe WASM copied to public/mediapipe');

for (const m of MODELS) {
  if (existsSync(m.dst)) continue;
  try {
    const res = await fetch(m.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(dirname(m.dst), { recursive: true });
    writeFileSync(m.dst, Buffer.from(await res.arrayBuffer()));
    console.log(`[prepare-assets] Pose model (${m.size}) downloaded`);
  } catch (err) {
    // The app falls back to loading the model from the CDN at runtime.
    console.warn(`[prepare-assets] Could not download the ${m.size} pose model (${err.message}); runtime CDN fallback will be used.`);
  }
}
