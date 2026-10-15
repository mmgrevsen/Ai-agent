// Copies the MediaPipe WASM runtime into public/ and downloads the pose model if missing,
// so the app can run pose detection fully offline inside the native WebView.
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/mediapipe');
const modelDst = join(root, 'public/models/pose_landmarker_lite.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

mkdirSync(wasmDst, { recursive: true });
for (const file of readdirSync(wasmSrc)) {
  // Only the vision_wasm_internal pair is loaded by FilesetResolver.forVisionTasks.
  if (!file.startsWith('vision_wasm_internal') && !file.startsWith('vision_wasm_nosimd_internal')) continue;
  copyFileSync(join(wasmSrc, file), join(wasmDst, file));
}
console.log('[prepare-assets] MediaPipe WASM copied to public/mediapipe');

if (!existsSync(modelDst)) {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(dirname(modelDst), { recursive: true });
    writeFileSync(modelDst, Buffer.from(await res.arrayBuffer()));
    console.log('[prepare-assets] Pose model downloaded');
  } catch (err) {
    // The app falls back to loading the model from the CDN at runtime.
    console.warn(`[prepare-assets] Could not download pose model (${err.message}); runtime CDN fallback will be used.`);
  }
}
