import { describe, expect, it } from 'vitest';
import { TOTAL_STAGES } from '../src/core/content/worlds';
import { simulateProgression, SIM_PROFILES } from '../src/core/sim/simulate';

/**
 * Balance regression tests: simulate weeks of play with three player profiles and check for
 * soft locks, walls, runaway numbers and that exercise helps without being mandatory.
 */
describe('progression simulation', () => {
  const days = 40;
  const ex = simulateProgression(SIM_PROFILES.exerciser, days, 1);
  const idle = simulateProgression(SIM_PROFILES.idle, days, 1);
  const casual = simulateProgression(SIM_PROFILES.casual, days, 1);

  it('prints a balance report (npm run simulate)', () => {
    for (const r of [ex, idle, casual]) {
      const milestones = r.clearDay.map((d, i) => ((i + 1) % 10 === 0 ? `W${(i + 1) / 10}:${d < 0 ? 'not yet' : `day ${d.toFixed(1)}`}` : '')).filter(Boolean);
      console.info(`[balance] ${r.profile.padEnd(9)} stages ${r.highestCleared + 1}/${TOTAL_STAGES}  ${milestones.join('  ')}  battles ${r.battles}  avg card L${r.avgCardLevel.toFixed(1)}  hero L${r.heroLevel}`);
    }
  });

  it('every profile clears world 1 within the first two days', () => {
    for (const r of [ex, idle, casual]) expect(r.clearDay[9]!, r.profile).toBeGreaterThanOrEqual(0);
    for (const r of [ex, idle, casual]) expect(r.clearDay[9]!, r.profile).toBeLessThan(2);
  });

  it('nobody is soft-locked: every profile reaches the final world', () => {
    for (const r of [ex, idle, casual]) expect(r.highestCleared, r.profile).toBeGreaterThanOrEqual(40);
  });

  it('exercising players progress faster through the mid-game, but idle players are not far behind', () => {
    const stage = 39;
    expect(ex.clearDay[stage]!).toBeGreaterThanOrEqual(0);
    expect(idle.clearDay[stage]!).toBeGreaterThanOrEqual(0);
    expect(ex.clearDay[stage]!).toBeLessThan(idle.clearDay[stage]!);
    expect(idle.clearDay[stage]! / ex.clearDay[stage]!).toBeLessThan(3);
  });

  it('the campaign takes more than a week even for heavy players (long-term goals exist)', () => {
    const finishDay = ex.clearDay[TOTAL_STAGES - 1]!;
    expect(finishDay === -1 || finishDay > 7).toBe(true);
  });

  it('economy numbers stay sane (no runaway gold, card levels within bounds)', () => {
    for (const r of [ex, idle, casual]) {
      expect(Number.isFinite(r.maxGold)).toBe(true);
      expect(r.maxGold, r.profile).toBeLessThan(5_000_000);
      expect(r.avgCardLevel).toBeLessThanOrEqual(20);
      expect(r.goldSpent).toBeGreaterThan(0);
    }
  });
});
