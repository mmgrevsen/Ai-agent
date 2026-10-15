import { expect } from 'vitest';
import { BUILDINGS } from '../src/core/content/buildings';
import type { GameState } from '../src/core/state/types';

/** Everything a player could consider "theirs". Used to prove the no-loss rule. */
export function snapshotPermanent(s: GameState) {
  return {
    resources: { ...s.resources },
    cards: Object.fromEntries(Object.entries(s.cards).map(([id, c]) => [id, { ...c }])),
    items: s.items.map((i) => ({ ...i })),
    pets: Object.fromEntries(Object.entries(s.pets).map(([id, p]) => [id, { ...p }])),
    buildings: Object.fromEntries(BUILDINGS.map((b) => [b.id, s.buildings[b.id].level])),
    hero: { level: s.hero.level, xp: s.hero.xp, cosmetics: [...s.hero.cosmetics] },
    highestCleared: s.progress.highestCleared,
    bossesDefeated: [...s.progress.bossesDefeated],
    endlessBest: s.progress.endlessBest,
    blitzBest: s.progress.blitzBest,
    stats: { ...s.stats, exerciseDays: [...s.stats.exerciseDays] },
  };
}

export type Snapshot = ReturnType<typeof snapshotPermanent>;

export function expectNoLoss(before: Snapshot, after: GameState, context = ''): void {
  const now = snapshotPermanent(after);
  for (const [k, v] of Object.entries(before.resources)) {
    expect(now.resources[k as keyof typeof now.resources], `${context} resource ${k}`).toBeGreaterThanOrEqual(v);
  }
  for (const [id, c] of Object.entries(before.cards)) {
    const n = now.cards[id];
    expect(n, `${context} card ${id} still owned`).toBeDefined();
    expect(n!.level, `${context} card ${id} level`).toBeGreaterThanOrEqual(c.level);
    if (n!.level === c.level) expect(n!.fragments, `${context} card ${id} fragments`).toBeGreaterThanOrEqual(c.fragments);
  }
  for (const item of before.items) {
    const n = now.items.find((i) => i.uid === item.uid);
    expect(n, `${context} item ${item.uid} still owned`).toBeDefined();
    expect(n!.level).toBeGreaterThanOrEqual(item.level);
    expect(n!.stars).toBeGreaterThanOrEqual(item.stars);
  }
  for (const [id, p] of Object.entries(before.pets)) {
    expect(now.pets[id], `${context} pet ${id}`).toBeDefined();
    expect(now.pets[id]!.level).toBeGreaterThanOrEqual(p.level);
    expect(now.pets[id]!.stars).toBeGreaterThanOrEqual(p.stars);
  }
  for (const [id, lvl] of Object.entries(before.buildings)) expect(now.buildings[id], `${context} building ${id}`).toBeGreaterThanOrEqual(lvl);
  expect(now.hero.level > before.hero.level || (now.hero.level === before.hero.level && now.hero.xp >= before.hero.xp), `${context} hero progress`).toBe(true);
  for (const c of before.hero.cosmetics) expect(now.hero.cosmetics).toContain(c);
  expect(now.highestCleared).toBeGreaterThanOrEqual(before.highestCleared);
  for (const b of before.bossesDefeated) expect(now.bossesDefeated).toContain(b);
  expect(now.endlessBest).toBeGreaterThanOrEqual(before.endlessBest);
  expect(now.blitzBest).toBeGreaterThanOrEqual(before.blitzBest);
  for (const k of ['verifiedFullReps', 'verifiedKneeReps', 'enemiesDefeated', 'bossesDefeated', 'battlesPlayed', 'goldEarned'] as const) {
    expect(now.stats[k], `${context} stat ${k}`).toBeGreaterThanOrEqual(before.stats[k]);
  }
}
