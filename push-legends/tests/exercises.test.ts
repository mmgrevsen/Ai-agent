import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/config/balance';
import { Battle } from '../src/core/combat/engine';
import { RepCounter, defaultRepConfig } from '../src/core/exercise/repCounter';
import { exerciseSequence, syntheticPullup, syntheticSitup } from '../src/core/exercise/synthetic';
import { measure } from '../src/core/exercise/tracking';
import { createInitialState } from '../src/core/state/initial';
import { campaignSetup } from '../src/core/systems/battleSetup';

const count = (kind: 'situp' | 'pullup', placement: 'side' | 'front', frames: ReturnType<typeof exerciseSequence>) => {
  const rc = new RepCounter(defaultRepConfig(kind, placement));
  for (const f of frames) rc.process(f);
  return rc.count;
};

describe('sit-ups and pull-ups', () => {
  it('measures the trunk angle for sit-ups and the elbow angle for pull-ups', () => {
    expect(measure(syntheticSitup(140), 'situp', 'side').angle).toBeCloseTo(140, 0);
    expect(measure(syntheticSitup(55), 'situp', 'side').angle).toBeCloseTo(55, 0);
    expect(measure(syntheticPullup(170), 'pullup', 'front').angle!).toBeGreaterThan(150);
    expect(measure(syntheticPullup(60), 'pullup', 'front').angle!).toBeLessThan(80);
  });

  it('counts full sit-ups and pull-ups', () => {
    expect(count('situp', 'side', exerciseSequence('situp', { reps: 5 }))).toBe(5);
    expect(count('pullup', 'front', exerciseSequence('pullup', { reps: 4 }))).toBe(4);
    expect(count('pullup', 'side', exerciseSequence('pullup', { reps: 3 }))).toBe(3);
  });

  it('does not count half sit-ups or half pull-ups', () => {
    expect(count('situp', 'side', exerciseSequence('situp', { reps: 4, bottom: 100 }))).toBe(0);
    expect(count('pullup', 'front', exerciseSequence('pullup', { reps: 4, bottom: 115 }))).toBe(0);
  });

  it('pull-ups hit much harder and count more towards the stage than push-ups', () => {
    const s = createInitialState(Date.now(), 1);
    const a = new Battle(campaignSetup(s, 0, 'normal'));
    const b = new Battle(campaignSetup(s, 0, 'normal'));
    a.registerRep('full', true);
    b.registerRep('pullup', true);
    expect(b.repsDone).toBe(BALANCE.exercise.pullupStageCount);
    expect(a.repsDone).toBe(1);
    expect(BALANCE.exercise.pullupRepMultiplier).toBeGreaterThanOrEqual(3 * BALANCE.exercise.fullRepMultiplier);
    expect(b.result().reps.pullup).toBe(1);
  });
});
