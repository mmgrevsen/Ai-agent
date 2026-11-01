import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/config/balance';
import { createInitialState } from '../src/core/state/initial';
import { cardRank, checkCardUpgrade, statMultiplier, upgradeAllAffordable } from '../src/core/systems/cards';

const NOW = new Date('2026-11-01T12:00:00').getTime();

describe('card ranks and upgrade all', () => {
  it('ranks at levels 5, 10, 15 and 20 add a bonus on top of level growth', () => {
    expect(cardRank(4).rank).toBe(0);
    expect(cardRank(5)).toMatchObject({ rank: 1, name: 'Veteran', next: { level: 10 } });
    expect(cardRank(20)).toMatchObject({ rank: 4, name: 'Legend', next: null });
    const step = statMultiplier(5) / statMultiplier(4);
    expect(step).toBeCloseTo(BALANCE.cards.statGrowth * (1 + BALANCE.cards.rankBonus), 6);
    expect(statMultiplier(6) / statMultiplier(5)).toBeCloseTo(BALANCE.cards.statGrowth, 6);
  });

  it('upgrade all spends only what the player has, deck first, and never goes negative', () => {
    const s = createInitialState(NOW, 1);
    s.resources.gold = 5000;
    for (const id of Object.keys(s.cards)) s.cards[id]!.fragments = 500;
    const before = s.resources.gold;
    const r = upgradeAllAffordable(s);
    expect(r.levels).toBeGreaterThan(3);
    expect(before - s.resources.gold).toBe(r.gold);
    expect(s.resources.gold).toBeGreaterThanOrEqual(0);
    expect(Object.keys(s.cards).every((id) => !checkCardUpgrade(s, id).ok)).toBe(true);
    expect(Object.values(s.cards).every((c) => c.fragments >= 0)).toBe(true);
  });
});
