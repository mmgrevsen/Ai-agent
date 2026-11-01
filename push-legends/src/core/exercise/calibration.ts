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
  message = 'Hold the start position';
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
    if (m.confidence < 0.5 || m.angle === null) {
      this.holdStart = null;
      this.samples = [];
      this.progress = 0;
      this.message = this.kind === 'situp' ? 'Make sure your shoulders, hips and knees are visible' : 'Make sure your arms, shoulders and hips are visible';
      return this.phase;
    }
    const a = m.angle;
    const su = this.kind === 'situp';
    const inPose = this.phase === 'top' ? a >= (su ? 110 : 135) : a <= (su ? 90 : 120);
    const stable = this.samples.length < 3 || Math.abs(a - median(this.samples)) < 12;
    if (!inPose || !stable) {
      this.holdStart = null;
      this.samples = [];
      this.progress = 0;
      this.message = this.topBottomText();
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
        this.message = this.topBottomText();
      } else {
        this.result.bottomAngle = median(this.samples);
        const ok = this.result.topAngle! - this.result.bottomAngle >= (this.kind === 'situp' ? 25 : 35);
        this.phase = ok ? 'done' : 'failed';
        this.message = ok ? 'Calibration complete!' : 'Range of motion was too small - try going a bit lower';
      }
    }
    return this.phase;
  }

  private topBottomText(): string {
    const k = this.kind;
    if (this.phase === 'top') return k === 'situp' ? 'Lie back with your knees bent and hold' : k === 'pullup' ? 'Hang from the bar with straight arms and hold' : 'Hold the top of a push-up with straight arms';
    return k === 'situp' ? 'Now sit up and hold' : k === 'pullup' ? 'Now pull up and hold with your chin at the bar' : 'Now lower down and hold the bottom position';
  }

  getResult(): CalibrationResult | null {
    return this.phase === 'done' ? (this.result as CalibrationResult) : null;
  }
}
