import { describe, expect, it } from 'vitest';
import { ARMORY_SWORDS } from '../src/core/content/equipment';
import { createInitialState } from '../src/core/state/initial';
import { armoryOffers, buySword, pushupDamage, swordPrice } from '../src/core/systems/armory';
import { computeHeroStats } from '../src/core/systems/hero';
import { expectNoLoss, snapshotPermanent } from './helpers';

const NOW = Date.UTC(2026, 9, 16, 12);

describe('armory: buy swords with gold to hit harder per push-up', () => {
  it('swords unlock with campaign progress and get pricier and stronger up the ladder', () => {
    let prevPrice = 0;
    let prevDmg = 0;
    for (const def of ARMORY_SWORDS) {
      const price = swordPrice(def.id);
      expect(price).toBeGreaterThan(prevPrice);
      expect(def.stats.heroDamage!).toBeGreaterThan(prevDmg);
      prevPrice = price;
      prevDmg = def.stats.heroDamage!;
    }
    const s = createInitialState(NOW, 1);
    expect(armoryOffers(s).every((o) => !o.unlocked)).toBe(true);
    s.progress.highestCleared = 2;
    expect(armoryOffers(s)[0]!.unlocked).toBe(true);
  });

  it('buying a sword spends gold, equips it and raises damage per push-up', () => {
    const s = createInitialState(NOW, 1);
    s.progress.highestCleared = 2;
    const offer = armoryOffers(s)[0]!;
    s.resources.gold = offer.price;
    const before = pushupDamage(computeHeroStats(s));
    expect(buySword(s, offer.defId)).toBe(true);
    expect(s.resources.gold).toBe(0);
    expect(s.items.find((i) => i.uid === s.hero.equipped.weapon)!.defId).toBe(offer.defId);
    expect(pushupDamage(computeHeroStats(s))).toBeGreaterThan(before);
    expect(offer.pushupDamageWith).toBe(pushupDamage(computeHeroStats(s)));
  });

  it('cannot buy locked, unaffordable or already-owned swords, and keeps the old sword', () => {
    const s = createInitialState(NOW, 1);
    const first = ARMORY_SWORDS[0]!.id;
    s.resources.gold = 1e9;
    expect(buySword(s, first)).toBe(false); // locked
    s.progress.highestCleared = 2;
    s.resources.gold = 0;
    expect(buySword(s, first)).toBe(false); // too expensive
    s.resources.gold = 1e9;
    const snap = snapshotPermanent(s);
    expect(buySword(s, first)).toBe(true);
    expect(buySword(s, first)).toBe(false); // owned
    expect(s.items.some((i) => i.defId === 'recruit_blade')).toBe(true);
    // Only gold was spent; nothing else was lost.
    const restored = structuredClone(s);
    restored.resources.gold = snap.resources.gold;
    expectNoLoss(snap, restored, 'armory');
  });
});
