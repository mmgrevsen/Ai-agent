import { useEffect, useRef, useState } from 'react';
import { SKELETON_EDGES, type Landmark, type PoseFrame } from '../../core/exercise/pose';
import { calibratedConfig, defaultRepConfig, RepCounter, type FrameOutput, type RepEvent } from '../../core/exercise/repCounter';
import type { Calibration, CameraPlacement, ExerciseMode } from '../../core/state/types';
import { LandmarkSmoother } from '../../core/exercise/filter';
import { PoseCamera, type CameraStatus, type CameraView } from '../../platform/pose';
import { voiceCoach } from '../../platform/voice';

export interface ExerciseTracker {
  status: CameraStatus;
  error: string;
  output: FrameOutput | null;
  count: number;
  fps: number;
  /** Resolution, lens and zoom the camera delivers (null until it opens). */
  view: CameraView | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  landmarksRef: React.RefObject<Landmark[] | null>;
}

/**
 * Runs the camera + pose model + rep counter while `enabled`. Each verified repetition calls onRep.
 * Landmarks are kept only for the current frame (for the skeleton overlay) and never stored.
 */
export function useExerciseTracker(opts: {
  enabled: boolean;
  kind: ExerciseMode;
  placement: CameraPlacement;
  calibration: Calibration | undefined;
  facing?: 'user' | 'environment';
  /** Speak the rep count and coaching cues. */
  voice?: boolean;
  onRep: (rep: RepEvent) => void;
  onFrame?: (frame: PoseFrame) => void;
}): ExerciseTracker {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarksRef = useRef<Landmark[] | null>(null);
  const onRepRef = useRef(opts.onRep);
  onRepRef.current = opts.onRep;
  const onFrameRef = useRef(opts.onFrame);
  onFrameRef.current = opts.onFrame;
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState('');
  const [output, setOutput] = useState<FrameOutput | null>(null);
  const [count, setCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [view, setView] = useState<CameraView | null>(null);

  useEffect(() => {
    if (!opts.enabled || !videoRef.current) return;
    const base = defaultRepConfig(opts.kind, opts.placement);
    const cfg = opts.calibration ? calibratedConfig(base, opts.calibration.topAngle, opts.calibration.bottomAngle) : base;
    const counter = new RepCounter(cfg);
    const smoother = new LandmarkSmoother();
    const coach = opts.voice ? voiceCoach() : null;
    let lastUi = 0;
    const camera = new PoseCamera(
      (raw) => {
        // Smoothed landmarks: steadier skeleton, angles and form checks
        const frame = smoother.apply(raw);
        landmarksRef.current = frame.landmarks;
        onFrameRef.current?.(frame);
        const out = counter.process(frame);
        if (out.rep) {
          setCount(counter.count);
          onRepRef.current(out.rep);
          coach?.count(counter.count);
        } else if (out.rejected) coach?.cue(out.rejected);
        // Throttle React updates to ~12 per second.
        if (out.rep || out.rejected || frame.t - lastUi > 80) {
          lastUi = frame.t;
          setOutput(out);
          setFps(camera.fps);
        }
      },
      (s, err) => {
        setStatus(s);
        setError(err ?? '');
        setView(camera.view);
      },
      opts.facing ?? 'user',
    );
    void camera.start(videoRef.current);
    return () => {
      camera.stop();
      coach?.stop();
      landmarksRef.current = null;
    };
  }, [opts.enabled, opts.kind, opts.placement, opts.facing, opts.voice, opts.calibration?.topAngle, opts.calibration?.bottomAngle]);

  return { status, error, output, count, fps, view, videoRef, landmarksRef };
}

/**
 * Sizes the overlay canvas to the video's real aspect ratio (a phone delivers a portrait picture,
 * a laptop a landscape one). The canvas and the video then share the same `object-fit: cover`
 * crop, so the skeleton sits exactly on the body. Returns true if the canvas was resized.
 */
export function syncOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement | null): void {
  const vw = video?.videoWidth ?? 0;
  const vh = video?.videoHeight ?? 0;
  if (!vw || !vh) return;
  const w = 360;
  const h = Math.round((w * vh) / vw);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

const GOOD = '#7dffa8';
const FAIR = '#ffd166';

/** Draws the tracked body over the camera preview: torso (chest) highlighted, shoulders and hips marked. */
export function drawSkeleton(ctx: CanvasRenderingContext2D, lm: Landmark[] | null, w: number, h: number, mirrored: boolean, color = '#ffc94a'): void {
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  const u = w / 120; // line and dot sizes scale with the canvas
  const px = (l: Landmark) => (mirrored ? (1 - l.x) * w : l.x * w);
  const py = (l: Landmark) => l.y * h;
  const seen = (i: number, min = 0.4) => !!lm[i] && (lm[i]!.visibility ?? 1) >= min;

  // Chest: the shoulders-to-hips quad as a soft fill, with the chest centre marked
  const quad = [11, 12, 24, 23];
  if (quad.every((i) => seen(i, 0.3))) {
    ctx.beginPath();
    quad.forEach((i, k) => (k ? ctx.lineTo(px(lm[i]!), py(lm[i]!)) : ctx.moveTo(px(lm[i]!), py(lm[i]!))));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,201,74,0.18)';
    ctx.fill();
    const cx = (px(lm[11]!) + px(lm[12]!)) / 2;
    const cy = (py(lm[11]!) + py(lm[12]!)) / 2;
    const hx = (px(lm[23]!) + px(lm[24]!)) / 2;
    const hy = (py(lm[23]!) + py(lm[24]!)) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + (hx - cx) * 0.3, cy + (hy - cy) * 0.3, 3 * u, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineWidth = 2.5 * u;
  ctx.lineCap = 'round';
  for (const [a, b] of SKELETON_EDGES) {
    if (!seen(a) || !seen(b)) continue;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(px(lm[a]!), py(lm[a]!));
    ctx.lineTo(px(lm[b]!), py(lm[b]!));
    ctx.stroke();
  }
  // Joints: green when the model is sure, amber when it is guessing; shoulders and hips are larger
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if (!seen(i)) continue;
    const big = i === 11 || i === 12 || i === 23 || i === 24;
    ctx.fillStyle = (lm[i]!.visibility ?? 1) >= 0.65 ? GOOD : FAIR;
    ctx.beginPath();
    ctx.arc(px(lm[i]!), py(lm[i]!), (big ? 4.5 : 3) * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1 * u;
    ctx.stroke();
  }
}
