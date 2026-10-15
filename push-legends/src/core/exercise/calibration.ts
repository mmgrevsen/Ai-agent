import type { PoseFrame } from './pose';
import { measure, type ExerciseKind, type Placement } from './tracking';

export type CalibrationPhase = 'top' | 'bottom' | 'done' | 'failed';

export interface CalibrationResult {
  topAngle: number;
  bottomAngle: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/**
 * Two-step calibration: hold the top position, then hold the bottom position. Only elbow angles are
 * kept (no images or full landmark history), and only the two resulting numbers are saved.
 */
export class Calibrator {
  phase: CalibrationPhase = 'top';
  progress = 0;
  message = 'Hold the top of a push-up with straight arms';
  private samples: number[] = [];
  private holdStart: number | null = null;
  private result: Partial<CalibrationResult> = {};

  constructor(
    private readonly kind: ExerciseKind,
    private readonly placement: Placement,
    private readonly holdMs = 1500,
  ) {}

  process(frame: PoseFrame): CalibrationPhase {
    if (this.phase === 'done' || this.phase === 'failed') return this.phase;
    const m = measure(frame.landmarks, this.kind, this.placement);
    if (m.confidence < 0.5 || m.elbowAngle === null) {
      this.holdStart = null;
      this.samples = [];
      this.progress = 0;
      this.message = 'Make sure your arms, shoulders and hips are visible';
      return this.phase;
    }
    const a = m.elbowAngle;
    const inPose = this.phase === 'top' ? a >= 135 : a <= 120;
    const stable = this.samples.length < 3 || Math.abs(a - median(this.samples)) < 12;
    if (!inPose || !stable) {
      this.holdStart = null;
      this.samples = [];
      this.progress = 0;
      this.message = this.phase === 'top' ? 'Hold the top of a push-up with straight arms' : 'Lower down and hold the bottom position';
      return this.phase;
    }
    if (this.holdStart === null) this.holdStart = frame.t;
    this.samples.push(a);
    this.progress = Math.min(1, (frame.t - this.holdStart) / this.holdMs);
    this.message = this.phase === 'top' ? 'Hold it...' : 'Hold the bottom...';
    if (this.progress >= 1) {
      if (this.phase === 'top') {
        this.result.topAngle = median(this.samples);
        this.phase = 'bottom';
        this.samples = [];
        this.holdStart = null;
        this.progress = 0;
        this.message = 'Now lower down and hold the bottom position';
      } else {
        this.result.bottomAngle = median(this.samples);
        const ok = this.result.topAngle! - this.result.bottomAngle >= 35;
        this.phase = ok ? 'done' : 'failed';
        this.message = ok ? 'Calibration complete!' : 'Range of motion was too small - try going a bit lower';
      }
    }
    return this.phase;
  }

  getResult(): CalibrationResult | null {
    return this.phase === 'done' ? (this.result as CalibrationResult) : null;
  }
}
