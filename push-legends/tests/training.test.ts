import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/config/balance';
import { deserializeState, sanitizeState, serializeState } from '../src/core/state/save';
import { createInitialState } from '../src/core/state/initial';
import { recordBattleReps, repCalories, stageRepsRequired, trainingSummary } from '../src/core/systems/training';

const NOW = new Date('2026-10-20T12:00:00').getTime();
const DAY = 86_400_000;

describe('push-up training', () => {
  it('stage requirement starts small, grows with stages and bosses, and stays near the player best', () => {
    const s = createInitialState(NOW, 1);
    expect(stageRepsRequired(s, 0)).toBe(BALANCE.exercise.stageReps.min);
    s.stats.bestBattleReps = 100;
    const early = stageRepsRequired(s, 0);
    const late = stageRepsRequired(s, 40);
    expect(late).toBeGreaterThan(early);
    expect(stageRepsRequired(s, 9)).toBeGreaterThan(stageRepsRequired(s, 8)); // boss stage
    expect(stageRepsRequired(s, 49)).toBeLessThanOrEqual(BALANCE.exercise.stageReps.max);
    s.stats.bestBattleReps = 6;
    // Never more than a few above the player's own best battle
    expect(stageRepsRequired(s, 49)).toBe(6 + BALANCE.exercise.stageReps.aboveBest);
  });

  it('logs reps per day with records, and estimates calories from body weight', () => {
    const s = createInitialState(NOW, 1);
    recordBattleReps(s, NOW - DAY, 8, 0);
    recordBattleReps(s, NOW, 5, 2);
    recordBattleReps(s, NOW, 12, 0);
    expect(s.stats.repLog).toHaveLength(2);
    expect(s.stats.repLog[1]).toMatchObject({ full: 17, knee: 2, best: 12, sets: 2 });
    expect(s.stats.bestBattleReps).toBe(12);
    expect(repCalories(10, 0, 80)).toBeCloseTo(10 * BALANCE.exercise.kcalPerKgPerRep * 80, 6);
    expect(repCalories(0, 10, 80)).toBeLessThan(repCalories(10, 0, 80));
  });

  it('summarises totals, the last 14 days, streak and the next goals', () => {
    const s = createInitialState(NOW, 1);
    for (const [d, n] of [[3, 10], [2, 12], [1, 14], [0, 15]] as const) {
      recordBattleReps(s, NOW - d * DAY, n, 0);
      s.stats.verifiedFullReps += n;
    }
    const t = trainingSummary(s, NOW);
    expect(t.total.all).toBe(51);
    expect(t.days).toHaveLength(14);
    expect(t.days.at(-1)).toMatchObject({ reps: 15, best: 15 });
    expect(t.streak).toBe(4);
    expect(t.today.reps).toBe(15);
    expect(t.goals.battle).toBeGreaterThan(t.bestBattle);
    expect(t.rank.name).toBe('Soldier');
    expect(t.nextRank?.name).toBe('Knight');
    expect(t.nextMilestone).toBe(100);
  });

  it('the push-up log and body weight survive a save round trip, and junk is dropped', () => {
    const s = createInitialState(NOW, 1);
    recordBattleReps(s, NOW, 9, 1);
    s.settings.bodyWeightKg = 82;
    const back = deserializeState(serializeState(s, NOW), NOW);
    if (!back.ok) throw new Error(back.reason);
    expect(back.state.stats.repLog).toEqual(s.stats.repLog);
    expect(back.state.stats.bestBattleReps).toBe(10);
    expect(back.state.settings.bodyWeightKg).toBe(82);
    const junk = JSON.parse(JSON.stringify(s));
    junk.stats.repLog.push({ day: 'bad', full: 5 }, 'nonsense');
    junk.settings.bodyWeightKg = -4;
    const clean = sanitizeState(junk, NOW);
    expect(clean.stats.repLog).toEqual([{ day: s.stats.repLog[0]!.day, full: 9, knee: 1, best: 10, sets: 1 }]);
    expect(clean.settings.bodyWeightKg).toBe(75);
  });
});
