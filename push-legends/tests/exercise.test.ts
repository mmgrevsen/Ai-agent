import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/config/balance';
import { Calibrator } from '../src/core/exercise/calibration';
import type { PoseFrame } from '../src/core/exercise/pose';
import { calibratedConfig, defaultRepConfig, RepCounter, type FrameOutput } from '../src/core/exercise/repCounter';
import { repSequence, syntheticPose } from '../src/core/exercise/synthetic';
import { repRewardMultiplier } from '../src/core/exercise/rewards';
import { Rng } from '../src/core/rng';

function run(counter: RepCounter, frames: PoseFrame[]): FrameOutput[] {
  return frames.map((f) => counter.process(f));
}

const full = () => new RepCounter(defaultRepConfig('full', 'side'));
const knee = () => new RepCounter(defaultRepConfig('knee', 'side'));

describe('rep counter - valid movements', () => {
  it('counts 5 clean full push-ups exactly', () => {
    const c = full();
    const out = run(c, repSequence({ reps: 5 }));
    expect(c.count).toBe(5);
    expect(out.filter((o) => o.rep).every((o) => o.rep!.kind === 'full')).toBe(true);
  });

  it('counts knee push-ups as knee reps in knee mode', () => {
    const c = knee();
    run(c, repSequence({ reps: 4, kind: 'knee' }));
    expect(c.count).toBe(4);
  });

  it('counts reps at different speeds and frame rates', () => {
    for (const [fps, repMs] of [
      [15, 1200],
      [30, 900],
      [60, 2500],
    ] as const) {
      const c = full();
      run(c, repSequence({ reps: 3, fps, repMs }));
      expect(c.count, `fps ${fps} repMs ${repMs}`).toBe(3);
    }
  });

  it('follows the READY → DESCENDING → BOTTOM → ASCENDING → COOLDOWN state order', () => {
    const c = full();
    const states: string[] = [];
    for (const o of run(c, repSequence({ reps: 1 }))) if (states.at(-1) !== o.state) states.push(o.state);
    expect(states).toEqual(['NOT_READY', 'READY', 'DESCENDING', 'BOTTOM', 'ASCENDING', 'COOLDOWN', 'READY']);
  });
});

describe('rep counter - noise and invalid input', () => {
  it('handles noisy landmarks without extra or missing counts', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const c = full();
      run(c, repSequence({ reps: 6, noise: 0.006, seed }));
      expect(c.count, `seed ${seed}`).toBe(6);
    }
  });

  it('does not count partial bends (insufficient range of motion)', () => {
    const c = full();
    const out = run(c, repSequence({ reps: 5, bottomAngle: 125 }));
    expect(c.count).toBe(0);
    expect(out.some((o) => o.rejected === 'too_shallow')).toBe(true);
  });

  it('does not count jitter or shaking around the top position', () => {
    const c = full();
    const rng = new Rng(9);
    const frames: PoseFrame[] = [];
    for (let i = 0; i < 300; i++) frames.push({ t: i * 33, landmarks: syntheticPose({ elbowAngle: 160 + rng.range(-12, 12), kind: 'full', rng, noise: 0.004 }) });
    run(c, frames);
    expect(c.count).toBe(0);
  });

  it('rejects implausibly fast movements', () => {
    const c = full();
    const out = run(c, repSequence({ reps: 3, fps: 60, repMs: 250 }));
    expect(c.count).toBe(0);
    expect(out.some((o) => o.rejected === 'too_fast')).toBe(true);
  });

  it('accepts a mildly imperfect body line (lenient form check)', () => {
    const c = full();
    run(c, repSequence({ reps: 3, hipSag: 20 }));
    expect(c.count).toBe(3);
  });

  it('rejects reps with a heavily sagging body line', () => {
    const c = full();
    const out = run(c, repSequence({ reps: 3, hipSag: 50 }));
    expect(c.count).toBe(0);
    expect(out.some((o) => o.rejected === 'body_line')).toBe(true);
  });

  it('does not credit knee push-ups as full push-ups', () => {
    const c = full();
    const out = run(c, repSequence({ reps: 3, kneeBend: 75 }));
    expect(c.count).toBe(0);
    expect(out.some((o) => o.rejected === 'knees_bent')).toBe(true);
  });

  it('does not count arm bends while standing upright (side placement)', () => {
    const c = full();
    run(c, repSequence({ reps: 4, bodyTilt: 90 }));
    expect(c.count).toBe(0);
  });

  it('ignores repeated frames and never double counts one repetition', () => {
    const c = full();
    const frames = repSequence({ reps: 3 });
    const doubled = frames.flatMap((f) => [f, f, { ...f }]);
    const out = run(c, doubled);
    expect(c.count).toBe(3);
    expect(out.filter((o) => o.ignored === 'duplicate').length).toBe(frames.length * 2);
  });

  it('ignores out-of-order frames', () => {
    const c = full();
    const frames = repSequence({ reps: 2 });
    const shuffled = [...frames];
    // Insert stale frames from earlier in the stream.
    for (let i = 40; i < shuffled.length; i += 25) shuffled.splice(i, 0, frames[i - 30]!);
    const out = run(c, shuffled);
    expect(c.count).toBe(2);
    expect(out.some((o) => o.ignored === 'out_of_order')).toBe(true);
  });

  it('frozen camera frames (identical landmarks) cannot generate reps', () => {
    const c = full();
    const frozen = syntheticPose({ elbowAngle: 160, kind: 'full' });
    const frames: PoseFrame[] = Array.from({ length: 200 }, (_, i) => ({ t: i * 33, landmarks: frozen }));
    run(c, frames);
    expect(c.count).toBe(0);
  });

  it('pauses when tracking is lost mid-rep and does not count that rep', () => {
    const c = full();
    const frames = repSequence({ reps: 1 });
    const mid = Math.floor(frames.length * 0.6);
    // Replace a 1-second chunk in the middle of the rep with "no person detected".
    const lost: PoseFrame[] = Array.from({ length: 30 }, (_, i) => ({ t: frames[mid]!.t + i * 33 + 1, landmarks: null }));
    const after = frames.slice(mid).map((f) => ({ ...f, t: f.t + 1100 }));
    const out = run(c, [...frames.slice(0, mid), ...lost, ...after]);
    expect(out.some((o) => o.state === 'PAUSED')).toBe(true);
    expect(c.count).toBe(0);
    // Tracking resumes and the next clean reps count again.
    const lastT = after.at(-1)!.t;
    run(c, repSequence({ reps: 2, startT: lastT + 10, seed: 11 }));
    expect(c.count).toBe(2);
  });

  it('short tracking dropouts do not break an otherwise valid rep', () => {
    const c = full();
    const frames = repSequence({ reps: 2 });
    const withGaps = frames.map((f, i) => (i % 17 === 0 ? { t: f.t, landmarks: null } : f));
    run(c, withGaps);
    expect(c.count).toBe(2);
  });

  it('does not count with low landmark visibility and gives repositioning guidance', () => {
    const c = full();
    const out = run(c, repSequence({ reps: 3, visibility: 0.3 }));
    expect(c.count).toBe(0);
    expect(out.every((o) => o.measurement.quality === 'poor' || o.measurement.quality === 'lost')).toBe(true);
  });

  it('reports no_person when no landmarks are detected', () => {
    const c = full();
    const o = c.process({ t: 1, landmarks: null });
    expect(o.measurement.guidance).toBe('no_person');
    expect(o.state).toBe('NOT_READY');
  });
});

describe('calibration', () => {
  it('derives personal thresholds from held top and bottom positions', () => {
    const cal = new Calibrator('full', 'side', 1000);
    let t = 0;
    for (let i = 0; i < 45; i++) cal.process({ t: (t += 33), landmarks: syntheticPose({ elbowAngle: 158, kind: 'full' }) });
    expect(cal.phase).toBe('bottom');
    for (let i = 0; i < 45; i++) cal.process({ t: (t += 33), landmarks: syntheticPose({ elbowAngle: 95, kind: 'full' }) });
    expect(cal.phase).toBe('done');
    const r = cal.getResult()!;
    expect(r.topAngle).toBeCloseTo(158, 0);
    expect(r.bottomAngle).toBeCloseTo(95, 0);

    const cfg = calibratedConfig(defaultRepConfig('full', 'side'), r.topAngle, r.bottomAngle);
    expect(cfg.topAngle).toBeCloseTo(146, 5);
    expect(cfg.bottomAngle).toBeCloseTo(110, 5);
    // A user with this range now gets counted with their own (shallower) movement.
    const c = new RepCounter(cfg);
    run(c, repSequence({ reps: 3, topAngle: 158, bottomAngle: 95 }));
    expect(c.count).toBe(3);
  });

  it('fails calibration when the range of motion is too small', () => {
    const cal = new Calibrator('full', 'side', 600);
    let t = 0;
    for (let i = 0; i < 30; i++) cal.process({ t: (t += 33), landmarks: syntheticPose({ elbowAngle: 150, kind: 'full' }) });
    for (let i = 0; i < 30; i++) cal.process({ t: (t += 33), landmarks: syntheticPose({ elbowAngle: 119, kind: 'full' }) });
    expect(cal.phase).toBe('failed');
  });
});

describe('exercise rewards', () => {
  it('full push-ups give 100% and knee push-ups the configured reduced reward', () => {
    expect(repRewardMultiplier('full')).toBe(1);
    expect(repRewardMultiplier('knee')).toBe(BALANCE.exercise.kneeRepMultiplier);
    expect(BALANCE.exercise.kneeRepMultiplier).toBe(0.5);
  });
});
