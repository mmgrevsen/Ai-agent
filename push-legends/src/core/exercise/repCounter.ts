import type { Landmark, PoseFrame } from './pose';
import { measure, type ExerciseKind, type Guidance, type Measurement, type Placement } from './tracking';

export type RepState = 'NOT_READY' | 'READY' | 'DESCENDING' | 'BOTTOM' | 'ASCENDING' | 'COOLDOWN' | 'PAUSED';

export type RepRejection = 'too_shallow' | 'too_fast' | 'too_slow' | 'body_line' | 'knees_bent' | 'tracking' | 'not_horizontal';

/** Feedback for the player. Rejections are framed as coaching, never as accusations. */
export type RepFeedback = Guidance | 'ready' | 'go_lower' | 'push_up' | 'good_rep' | RepRejection | 'tracking_paused';

export interface RepCounterConfig {
  kind: ExerciseKind;
  placement: Placement;
  /** Elbow angle (deg) at or above which arms count as extended. */
  topAngle: number;
  /** Elbow angle (deg) at or below which the bottom position is reached. */
  bottomAngle: number;
  /** Hysteresis band (deg) to stop noise from flipping states. */
  hysteresis: number;
  /** Minimum difference (deg) between the highest and lowest elbow angle within a rep. */
  minRangeOfMotion: number;
  minRepMs: number;
  maxRepMs: number;
  cooldownMs: number;
  /** Frames are ignored for counting below this confidence. */
  minConfidence: number;
  /** Tracking must be lost this long before the counter pauses. */
  lostTimeoutMs: number;
  /** Consecutive top-position frames required before the first rep. */
  readyFrames: number;
  /** EMA smoothing factor for the elbow angle (1 = no smoothing). */
  smoothing: number;
  /** Minimum body-line angle (straight body = 180). */
  minBodyLine: number;
  /** Full push-ups require the knee angle above this (straight legs). */
  minKneeAngleFull: number;
  /** Side placement: maximum torso tilt from horizontal. */
  maxTorsoTilt: number;
  /** Maximum fraction of frames in a rep allowed to have form or tracking problems. */
  maxBadFrameFraction: number;
}

export function defaultRepConfig(kind: ExerciseKind, placement: Placement): RepCounterConfig {
  return {
    kind,
    placement,
    topAngle: 150,
    bottomAngle: kind === 'full' ? 100 : 105,
    hysteresis: 8,
    minRangeOfMotion: 40,
    minRepMs: 450,
    maxRepMs: 10_000,
    cooldownMs: 150,
    minConfidence: 0.5,
    lostTimeoutMs: 700,
    readyFrames: 4,
    smoothing: 0.5,
    minBodyLine: kind === 'full' ? 145 : 130,
    minKneeAngleFull: 140,
    maxTorsoTilt: 55,
    maxBadFrameFraction: 0.35,
  };
}

/** Applies a calibration (measured top/bottom elbow angles) to a config. */
export function calibratedConfig(base: RepCounterConfig, topAngle: number, bottomAngle: number): RepCounterConfig {
  const top = Math.max(130, Math.min(170, topAngle - 12));
  const bottom = Math.max(70, Math.min(120, bottomAngle + 15));
  if (top - bottom < 30) return base;
  return { ...base, topAngle: top, bottomAngle: bottom, minRangeOfMotion: Math.max(30, Math.min(60, (topAngle - bottomAngle) * 0.6)) };
}

export interface RepEvent {
  kind: ExerciseKind;
  durationMs: number;
  rangeOfMotion: number;
  minAngle: number;
  t: number;
}

export interface FrameOutput {
  state: RepState;
  feedback: RepFeedback;
  measurement: Measurement;
  smoothedAngle: number | null;
  /** 0 at the top position, 1 at the bottom threshold. */
  depth: number;
  rep: RepEvent | null;
  rejected: RepRejection | null;
  ignored: 'duplicate' | 'out_of_order' | null;
}

/**
 * Push-up repetition state machine:
 * NOT_READY → READY → DESCENDING → BOTTOM → ASCENDING → (count) COOLDOWN → READY.
 * Counting requires a full range of motion, plausible timing, acceptable form and reliable tracking
 * for the whole repetition, so camera noise or partial bends cannot create reps.
 */
export class RepCounter {
  readonly config: RepCounterConfig;
  state: RepState = 'NOT_READY';
  count = 0;
  rejectedCount = 0;

  private smoothed: number | null = null;
  private lastT = -Infinity;
  private lastKey = '';
  private lastGoodT = -Infinity;
  private readyStreak = 0;
  private repStartT = 0;
  private repMax = 0;
  private repMin = 180;
  private repFrames = 0;
  private repBadFrames = 0;
  private repKneeBadFrames = 0;
  private repTiltBadFrames = 0;
  private repLowConfFrames = 0;
  private cooldownUntil = 0;
  private lastFeedback: RepFeedback = 'get_into_position';

  constructor(config: RepCounterConfig) {
    this.config = config;
  }

  reset(): void {
    this.state = 'NOT_READY';
    this.smoothed = null;
    this.readyStreak = 0;
    this.lastGoodT = -Infinity;
  }

  process(frame: PoseFrame): FrameOutput {
    const c = this.config;
    const m = measure(frame.landmarks, c.kind, c.placement);
    const base = (partial: Partial<FrameOutput>): FrameOutput => ({
      state: this.state,
      feedback: this.lastFeedback,
      measurement: m,
      smoothedAngle: this.smoothed,
      depth: this.depth(),
      rep: null,
      rejected: null,
      ignored: null,
      ...partial,
    });

    // Repeated or out-of-order frames never advance the state machine.
    if (frame.t < this.lastT) return base({ ignored: 'out_of_order' });
    const key = frameKey(frame.landmarks);
    if (frame.t === this.lastT || (key !== '' && key === this.lastKey)) {
      this.lastT = Math.max(this.lastT, frame.t);
      return base({ ignored: 'duplicate' });
    }
    this.lastT = frame.t;
    this.lastKey = key;

    const reliable = m.confidence >= c.minConfidence && m.elbowAngle !== null && m.guidance !== 'move_into_frame' && m.guidance !== 'no_person';
    if (!reliable) {
      if (this.isMidRep()) this.repLowConfFrames++;
      if (frame.t - this.lastGoodT > c.lostTimeoutMs && this.state !== 'NOT_READY' && this.state !== 'PAUSED') {
        this.state = 'PAUSED';
        this.smoothed = null;
        this.readyStreak = 0;
        return base({ state: this.state, feedback: this.setFeedback('tracking_paused') });
      }
      return base({ feedback: this.setFeedback(m.guidance === 'ok' ? 'low_light_or_blur' : m.guidance) });
    }
    this.lastGoodT = frame.t;

    const raw = m.elbowAngle!;
    this.smoothed = this.smoothed === null ? raw : this.smoothed + (raw - this.smoothed) * c.smoothing;
    const a = this.smoothed;
    const formOk = this.formOk(m);

    if (this.isMidRep()) {
      this.repFrames++;
      if (!formOk.body) this.repBadFrames++;
      if (!formOk.knees) this.repKneeBadFrames++;
      if (!formOk.tilt) this.repTiltBadFrames++;
      this.repMin = Math.min(this.repMin, a);
      this.repMax = Math.max(this.repMax, a);
      if (frame.t - this.repStartT > c.maxRepMs) {
        this.state = 'NOT_READY';
        this.readyStreak = 0;
        return base({ state: this.state, feedback: this.setFeedback('too_slow'), rejected: this.reject('too_slow') });
      }
    }

    const top = c.topAngle;
    const bottom = c.bottomAngle;
    const h = c.hysteresis;

    switch (this.state) {
      case 'PAUSED':
      case 'NOT_READY': {
        if (a >= top && formOk.tilt) this.readyStreak++;
        else this.readyStreak = 0;
        if (this.readyStreak >= c.readyFrames) {
          this.state = 'READY';
          return base({ state: this.state, feedback: this.setFeedback('ready') });
        }
        return base({ feedback: this.setFeedback(m.guidance !== 'ok' ? m.guidance : 'get_into_position') });
      }
      case 'COOLDOWN': {
        if (frame.t >= this.cooldownUntil) this.state = 'READY';
        return base({ state: this.state });
      }
      case 'READY': {
        if (a < top - h) {
          this.startRep(frame.t, a);
          this.state = 'DESCENDING';
          return base({ state: this.state, feedback: this.setFeedback('go_lower') });
        }
        return base({ feedback: this.lastFeedback === 'good_rep' ? 'good_rep' : this.setFeedback('ready') });
      }
      case 'DESCENDING': {
        if (a <= bottom) {
          this.state = 'BOTTOM';
          return base({ state: this.state, feedback: this.setFeedback('push_up') });
        }
        if (a >= top) {
          // Came back up without reaching the bottom: a partial movement, not a rep.
          this.state = 'READY';
          return base({ state: this.state, feedback: this.setFeedback('go_lower'), rejected: this.reject('too_shallow') });
        }
        return base({ feedback: this.setFeedback('go_lower') });
      }
      case 'BOTTOM': {
        if (a > bottom + h) {
          this.state = 'ASCENDING';
          return base({ state: this.state, feedback: this.setFeedback('push_up') });
        }
        return base({ feedback: this.setFeedback('push_up') });
      }
      case 'ASCENDING': {
        if (a <= bottom) {
          this.state = 'BOTTOM';
          return base({ state: this.state });
        }
        if (a >= top) return this.completeRep(frame.t, base);
        return base({ feedback: this.setFeedback('push_up') });
      }
    }
  }

  private completeRep(t: number, base: (p: Partial<FrameOutput>) => FrameOutput): FrameOutput {
    const c = this.config;
    const duration = t - this.repStartT;
    const rom = this.repMax - this.repMin;
    const frames = Math.max(1, this.repFrames);
    let rejection: RepRejection | null = null;
    if (rom < c.minRangeOfMotion) rejection = 'too_shallow';
    else if (duration < c.minRepMs) rejection = 'too_fast';
    else if (this.repLowConfFrames / (frames + this.repLowConfFrames) > c.maxBadFrameFraction) rejection = 'tracking';
    else if (this.repTiltBadFrames / frames > c.maxBadFrameFraction) rejection = 'not_horizontal';
    else if (this.repKneeBadFrames / frames > c.maxBadFrameFraction) rejection = 'knees_bent';
    else if (this.repBadFrames / frames > c.maxBadFrameFraction) rejection = 'body_line';

    this.state = 'COOLDOWN';
    this.cooldownUntil = t + c.cooldownMs;
    if (rejection) return base({ state: this.state, feedback: this.setFeedback(rejection), rejected: this.reject(rejection) });
    this.count++;
    const rep: RepEvent = { kind: c.kind, durationMs: duration, rangeOfMotion: rom, minAngle: this.repMin, t };
    return base({ state: this.state, feedback: this.setFeedback('good_rep'), rep });
  }

  private reject(r: RepRejection): RepRejection {
    this.rejectedCount++;
    return r;
  }

  private startRep(t: number, a: number): void {
    this.repStartT = t;
    this.repMax = Math.max(a, this.config.topAngle);
    this.repMin = a;
    this.repFrames = 0;
    this.repBadFrames = 0;
    this.repKneeBadFrames = 0;
    this.repTiltBadFrames = 0;
    this.repLowConfFrames = 0;
  }

  private isMidRep(): boolean {
    return this.state === 'DESCENDING' || this.state === 'BOTTOM' || this.state === 'ASCENDING';
  }

  private formOk(m: Measurement): { body: boolean; knees: boolean; tilt: boolean } {
    const c = this.config;
    const body = m.bodyLine === null || m.bodyLine >= c.minBodyLine;
    const knees = c.kind !== 'full' || m.kneeAngle === null || m.kneeAngle >= c.minKneeAngleFull;
    const tilt = c.placement !== 'side' || m.torsoTilt === null || m.torsoTilt <= c.maxTorsoTilt;
    return { body, knees, tilt };
  }

  private depth(): number {
    if (this.smoothed === null) return 0;
    const span = this.config.topAngle - this.config.bottomAngle;
    return Math.max(0, Math.min(1, (this.config.topAngle - this.smoothed) / span));
  }

  private setFeedback(f: RepFeedback): RepFeedback {
    this.lastFeedback = f;
    return f;
  }
}

/** Compact fingerprint of a frame so frozen/repeated camera frames can be detected. */
function frameKey(lm: Landmark[] | null): string {
  if (!lm) return '';
  const pick = [11, 13, 15, 23];
  return pick.map((i) => (lm[i] ? `${lm[i]!.x.toFixed(5)},${lm[i]!.y.toFixed(5)}` : '-')).join('|');
}

export const FEEDBACK_TEXT: Record<RepFeedback, string> = {
  no_person: 'Step into view of the camera',
  move_into_frame: 'Move back so your whole upper body is in the frame',
  show_arms: 'Make sure your arms are visible',
  show_hips: 'Make sure your hips are visible',
  show_legs: 'Move back so your legs are visible too',
  turn_sideways: 'Turn sideways to the camera',
  get_into_position: 'Get into the top push-up position',
  low_light_or_blur: 'Tracking is unsure - try more light or a steadier phone',
  ok: 'Looking good',
  ready: 'Ready! Lower yourself down',
  go_lower: 'Go a little lower',
  push_up: 'Now push back up',
  good_rep: 'Great rep!',
  too_shallow: 'Almost! Go a bit lower for it to count',
  too_fast: 'Slow down a little - control the movement',
  too_slow: 'Take a breather, then start from the top',
  body_line: 'Keep your body in a straight line',
  knees_bent: 'Legs look bent - straighten them, or switch to knee push-ups',
  tracking: 'Tracking was unsure during that rep - check your camera position',
  not_horizontal: 'Get into a push-up position facing the floor',
  tracking_paused: 'Tracking paused - reposition so the camera can see you',
};
