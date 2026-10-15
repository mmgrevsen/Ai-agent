import { useEffect, useRef, useState } from 'react';
import { SKELETON_EDGES, type Landmark, type PoseFrame } from '../../core/exercise/pose';
import { calibratedConfig, defaultRepConfig, RepCounter, type FrameOutput, type RepEvent } from '../../core/exercise/repCounter';
import type { Calibration, CameraPlacement, ExerciseMode } from '../../core/state/types';
import { PoseCamera, type CameraStatus } from '../../platform/pose';

export interface ExerciseTracker {
  status: CameraStatus;
  error: string;
  output: FrameOutput | null;
  count: number;
  fps: number;
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

  useEffect(() => {
    if (!opts.enabled || !videoRef.current) return;
    const base = defaultRepConfig(opts.kind, opts.placement);
    const cfg = opts.calibration ? calibratedConfig(base, opts.calibration.topAngle, opts.calibration.bottomAngle) : base;
    const counter = new RepCounter(cfg);
    let lastUi = 0;
    const camera = new PoseCamera(
      (frame) => {
        landmarksRef.current = frame.landmarks;
        onFrameRef.current?.(frame);
        const out = counter.process(frame);
        if (out.rep) {
          setCount(counter.count);
          onRepRef.current(out.rep);
        }
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
      },
    );
    void camera.start(videoRef.current);
    return () => {
      camera.stop();
      landmarksRef.current = null;
    };
  }, [opts.enabled, opts.kind, opts.placement, opts.calibration?.topAngle, opts.calibration?.bottomAngle]);

  return { status, error, output, count, fps, videoRef, landmarksRef };
}

/** Draws the detected skeleton over the (mirrored) camera preview. */
export function drawSkeleton(ctx: CanvasRenderingContext2D, lm: Landmark[] | null, w: number, h: number, mirrored: boolean, color = '#ffc94a'): void {
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  const px = (l: Landmark) => (mirrored ? (1 - l.x) * w : l.x * w);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [a, b] of SKELETON_EDGES) {
    const la = lm[a];
    const lb = lm[b];
    if (!la || !lb || (la.visibility ?? 1) < 0.4 || (lb.visibility ?? 1) < 0.4) continue;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(px(la), la.y * h);
    ctx.lineTo(px(lb), lb.y * h);
    ctx.stroke();
  }
  for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    const l = lm[i];
    if (!l || (l.visibility ?? 1) < 0.4) continue;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px(l), l.y * h, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
