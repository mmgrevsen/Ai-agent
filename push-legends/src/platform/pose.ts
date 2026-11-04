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
/** The full model tracks shoulders and torso much better than lite; lite is the fallback. */
const MODEL_SIZES = ['full', 'lite'] as const;
const localModel = (size: string) => `./models/pose_landmarker_${size}.task`;
const cdnModel = (size: string) => `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${size}/float16/latest/pose_landmarker_${size}.task`;

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
  const sources: [string, string][] = MODEL_SIZES.flatMap((size): [string, string][] =>
    fromDisk
      ? [
          [CDN_WASM, cdnModel(size)],
          [CDN_WASM_2, cdnModel(size)],
        ]
      : [
          [LOCAL_WASM, localModel(size)],
          [CDN_WASM, cdnModel(size)],
          [CDN_WASM_2, cdnModel(size)],
        ],
  );
  let lastError: unknown;
  for (const [wasm, model] of sources) {
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        const fileset = await vision.FilesetResolver.forVisionTasks(wasm);
        const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: model, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          // A little lower than the default so the body is kept while lying flat in a push-up
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
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

/** What the camera ended up delivering (shown in the camera setup). */
export interface CameraView {
  width: number;
  height: number;
  /** The lens in use: the ultra-wide back lens when the phone has one. */
  lens: 'ultrawide' | 'standard';
  /** Zoom factor in use when the browser reports one (below 1 = wider than the standard lens). */
  zoom: number | null;
}

// Full-sensor 4:3 picture: phone sensors are 4:3, and asking for 16:9 crops the top and bottom
// off, which is exactly the part needed to see a whole body on the floor
const WIDE: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 960 }, aspectRatio: { ideal: 4 / 3 }, frameRate: { ideal: 30 } };
const ULTRA_WIDE = /ultra ?wide|0[.,]5 ?x|wide.?angle/i;

/**
 * Opens the camera with the widest view it offers: the full sensor, the ultra-wide back lens if
 * the device lists one (labels are only readable once permission is granted, so it re-opens),
 * and the lowest zoom the track supports.
 */
export async function openWideCamera(facing: 'user' | 'environment'): Promise<{ stream: MediaStream; view: CameraView }> {
  const md = navigator.mediaDevices;
  let stream = await md.getUserMedia({ video: { ...WIDE, facingMode: facing }, audio: false });
  let lens: CameraView['lens'] = 'standard';
  if (facing === 'environment' && md.enumerateDevices) {
    try {
      const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
      const devices = await md.enumerateDevices();
      const wide = devices.find((d) => d.kind === 'videoinput' && ULTRA_WIDE.test(d.label) && !/front/i.test(d.label));
      if (wide && wide.deviceId && wide.deviceId !== current) {
        const next = await md.getUserMedia({ video: { ...WIDE, deviceId: { exact: wide.deviceId } }, audio: false });
        stream.getTracks().forEach((t) => t.stop());
        stream = next;
        lens = 'ultrawide';
      } else if (wide) lens = 'ultrawide';
    } catch {
      /* keep the standard lens */
    }
  }
  const track = stream.getVideoTracks()[0];
  let zoom: number | null = null;
  if (track) {
    type ZoomCaps = { zoom?: { min: number; max: number } };
    const caps = (track.getCapabilities?.() ?? {}) as ZoomCaps;
    const now = (track.getSettings() as { zoom?: number }).zoom;
    if (caps.zoom && typeof now === 'number' && caps.zoom.min < now) {
      try {
        await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet] });
      } catch {
        /* zoom stays where it was */
      }
    }
    const z = (track.getSettings() as { zoom?: number }).zoom;
    zoom = typeof z === 'number' ? z : null;
  }
  const set = track?.getSettings() ?? {};
  return { stream, view: { width: set.width ?? 0, height: set.height ?? 0, lens, zoom } };
}

export class PoseCamera {
  status: CameraStatus = 'idle';
  error = '';
  fps = 0;
  view: CameraView | null = null;
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
    private readonly facing: 'user' | 'environment' = 'user',
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
      const opened = await openWideCamera(this.facing);
      this.stream = opened.stream;
      this.view = opened.view;
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
