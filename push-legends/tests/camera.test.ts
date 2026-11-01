import { describe, expect, it } from 'vitest';
import { LandmarkSmoother } from '../src/core/exercise/filter';
import { RepCounter, defaultRepConfig } from '../src/core/exercise/repCounter';
import { repSequence, syntheticPose, syntheticPullup } from '../src/core/exercise/synthetic';
import { detectPlacement, measure } from '../src/core/exercise/tracking';

describe('camera tracking improvements', () => {
  it('detects side and front views from the body', () => {
    expect(detectPlacement(syntheticPose({ elbowAngle: 160, kind: 'full' }))).toBe('side');
    expect(detectPlacement(syntheticPullup(170))).toBe('front');
    expect(measure(syntheticPullup(170), 'pullup', 'auto').placement).toBe('front');
  });

  it('the landmark smoother removes jitter while the body is still', () => {
    const sm = new LandmarkSmoother();
    const raw: number[] = [];
    const smooth: number[] = [];
    for (let i = 0; i < 90; i++) {
      const lm = syntheticPose({ elbowAngle: 160, kind: 'full' }).map((l) => ({ ...l, x: l.x + Math.sin(i * 2.7) * 0.012 }));
      const out = sm.apply({ t: i * 33, landmarks: lm });
      raw.push(lm[13]!.x);
      smooth.push(out.landmarks![13]!.x);
    }
    const spread = (xs: number[]) => Math.max(...xs.slice(30)) - Math.min(...xs.slice(30));
    expect(spread(smooth)).toBeLessThan(spread(raw) * 0.5);
  });

  it('with noisy tracking the smoothed stream still counts every rep', () => {
    const frames = repSequence({ reps: 6, noise: 0.012, seed: 3 });
    const sm = new LandmarkSmoother();
    const rc = new RepCounter(defaultRepConfig('full', 'auto'));
    for (const f of frames) rc.process(sm.apply(f));
    expect(rc.count).toBe(6);
  });
});
