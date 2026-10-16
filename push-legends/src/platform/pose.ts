import type { Landmark, PoseFrame } from '../core/exercise/pose';

/**
 * Camera + MediaPipe Pose Landmarker running on-device (WASM, GPU delegate when available).
 * Video frames never leave the device and are never stored; only the 33 landmark points of the
 * current frame are passed to the rep counter and then discarded.
 */
export type CameraStatus = 'idle' | 'requesting' | 'denied' | 'unavailable' | 'loading' | 'running' | 'error';

const MP_VERSION = '1.0.1';
const LOCAL_WASM = './mediapipe';
const CDN_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const CDN_WASM_2 = `https://unpkg.com/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const LOCAL_MODEL = './models/pose_landmarker_lite.task';
const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

type Landmarker = {
  detectForVideo(video: HTMLVideoElement, ts: number): { landmarks: Landmark[][] };
  close(): void;
};

let landmarkerPromise: Promise<Landmarker> | null = null;

async function loadLandmarker(): Promise<Landmarker> {
  const vision = await import('@mediapipe/tasks-vision');
  // A page opened straight from disk (file://, e.g. the single-file Mac build) cannot fetch bundled
  // assets, so it goes to the CDN directly. Otherwise bundled assets are tried first (offline apps).
  const fromDisk = typeof location !== 'undefined' && location.protocol === 'file:';
  const sources: [string, string][] = fromDisk
    ? [
        [CDN_WASM, CDN_MODEL],
        [CDN_WASM_2, CDN_MODEL],
      ]
    : [
        [LOCAL_WASM, LOCAL_MODEL],
        [CDN_WASM, CDN_MODEL],
        [CDN_WASM_2, CDN_MODEL],
      ];
  let lastError: unknown;
  for (const [wasm, model] of sources) {
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        const fileset = await vision.FilesetResolver.forVisionTasks(wasm);
        const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: model, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        return landmarker as unknown as Landmarker;
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Pose model failed to load (an internet connection is needed the first time)');
}

export function preloadPoseModel(): Promise<Landmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = loadLandmarker().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export class PoseCamera {
  status: CameraStatus = 'idle';
  error = '';
  fps = 0;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private landmarker: Landmarker | null = null;
  private rafId: number | null = null;
  private lastVideoTime = -1;
  private frameTimes: number[] = [];
  private stopped = false;

  constructor(
    private readonly onFrame: (frame: PoseFrame) => void,
    private readonly onStatus: (status: CameraStatus, error?: string) => void,
  ) {}

  private set(status: CameraStatus, error = ''): void {
    this.status = status;
    this.error = error;
    this.onStatus(status, error);
  }

  async start(video: HTMLVideoElement): Promise<void> {
    this.stopped = false;
    this.video = video;
    if (!cameraSupported()) return this.set('unavailable', 'This device or browser does not provide camera access.');
    this.set('requesting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: false,
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') return this.set('denied', 'Camera permission was not granted.');
      return this.set('unavailable', 'No usable camera was found.');
    }
    if (this.stopped) return this.stop();
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    try {
      await video.play();
    } catch {
      /* autoplay restrictions: the loop starts once frames arrive */
    }
    this.set('loading');
    try {
      this.landmarker = await preloadPoseModel();
    } catch (err) {
      this.set('error', `Pose detection could not start (${err instanceof Error ? err.message : 'unknown error'}). You can still play without the camera.`);
      return;
    }
    if (this.stopped) return this.stop();
    this.set('running');
    this.loop();
  }

  private loop = (): void => {
    if (this.stopped || !this.video || !this.landmarker) return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const t = performance.now();
      try {
        const res = this.landmarker.detectForVideo(v, t);
        this.onFrame({ t, landmarks: res.landmarks[0] ?? null });
      } catch {
        this.onFrame({ t, landmarks: null });
      }
      this.frameTimes.push(t);
      while (this.frameTimes.length && t - this.frameTimes[0]! > 1000) this.frameTimes.shift();
      this.fps = this.frameTimes.length;
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  stop(): void {
    this.stopped = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    if (this.status !== 'denied' && this.status !== 'unavailable' && this.status !== 'error') this.set('idle');
  }
}
