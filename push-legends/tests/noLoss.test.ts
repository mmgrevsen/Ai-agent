import { describe, expect, it } from 'vitest';
import { Battle } from '../src/core/combat/engine';
import type { BattleResult } from '../src/core/combat/types';
import { Rng } from '../src/core/rng';
import { createInitialState } from '../src/core/state/initial';
import type { GameState } from '../src/core/state/types';
import { blitzSetup, campaignSetup, endlessSetup, weeklySetup } from '../src/core/systems/battleSetup';
import { finalizeDungeonBattle, enterNode, availableNodes, startDungeon } from '../src/core/systems/dungeon';
import { addItem } from '../src/core/systems/equipment';
import { addPet } from '../src/core/systems/pets';
import { finalizeBattle } from '../src/core/systems/progression';
import { recordActiveDay } from '../src/core/systems/quests';
import { expectNoLoss, snapshotPermanent } from './helpers';

const NOW = Date.UTC(2026, 9, 15, 12);

function richState(seed: number): GameState {
  const s = createInitialState(NOW, seed);
  const rng = new Rng(seed);
  s.resources = { gold: rng.int(0, 50_000), gems: rng.int(0, 500), ore: rng.int(0, 300), petTreats: rng.int(0, 100), glory: rng.int(0, 100) };
  s.progress.highestCleared = rng.int(-1, 30);
  s.hero.level = rng.int(1, 30);
  s.hero.xp = rng.int(0, 50);
  for (const id of Object.keys(s.cards)) s.cards[id] = { level: rng.int(1, 12), fragments: rng.int(0, 40) };
  addItem(s, 'emberbrand');
  addItem(s, 'lucky_coin');
  addPet(s, 'ember_fox');
  s.buildings.barracks.level = rng.int(0, 5);
  s.progress.bossesDefeated = ['mossback'];
  s.progress.endlessBest = rng.int(0, 20);
  s.progress.blitzBest = rng.int(0, 60);
  return s;
}

/** A battle the player is guaranteed to lose: a 1 HP hero facing a boss. */
function losingBattle(s: GameState, stageIdx: number): BattleResult {
  const setup = campaignSetup(s, stageIdx, 'normal');
  setup.hero = { ...setup.hero, hp: 1 };
  setup.deck = [];
  return new Battle(setup).runToEnd();
}

describe('NO-LOSS RULE: losing never removes permanent progress', () => {
  it('a real lost campaign battle keeps everything and keeps earned gold', () => {
    const s = richState(1);
    const before = snapshotPermanent(s);
    const result = losingBattle(s, 4);
    expect(result.outcome).toBe('defeat');
    const summary = finalizeBattle(s, result, NOW, new Rng(1));
    expectNoLoss(before, s, 'defeat');
    expect(summary.victoryBonus).toBeNull();
    expect(summary.kept.gold ?? 0).toBeGreaterThanOrEqual(0);
    expect(summary.suggestions.length).toBeGreaterThan(0);
  });

  it('gold earned before losing is kept', () => {
    const s = createInitialState(NOW, 3);
    const setup = campaignSetup(s, 9, 'normal');
    // Strong enough to kill some enemies, too weak to win.
    setup.hero = { ...setup.hero, hp: 600, damage: 200 };
    const battle = new Battle(setup);
    const result = battle.runToEnd();
    expect(result.outcome).not.toBe('victory');
    expect(result.enemiesDefeated).toBeGreaterThan(0);
    const goldBefore = s.resources.gold;
    const summary = finalizeBattle(s, result, NOW, new Rng(2));
    expect(summary.kept.gold).toBeGreaterThan(0);
    expect(s.resources.gold).toBe(goldBefore + summary.kept.gold!);
  });

  it('fuzz: hundreds of random defeats, timeouts and retreats never reduce anything', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 300; i++) {
      const s = richState(i + 100);
      const before = snapshotPermanent(s);
      const outcome = rng.pick(['defeat', 'timeout', 'retreat'] as const);
      const mode = rng.pick(['campaign', 'endless', 'blitz', 'weekly', 'dungeon', 'challenge'] as const);
      const result: BattleResult = {
        mode,
        label: 'fuzz',
        outcome: mode === 'endless' || mode === 'blitz' ? 'complete' : outcome,
        stageIndex: rng.int(0, 49),
        difficulty: rng.pick(['story', 'normal', 'heroic'] as const),
        wavesCleared: rng.int(0, 6),
        totalWaves: 6,
        reachedBoss: rng.chance(0.5),
        bossDefeated: false,
        bossIds: [],
        bossPhasesCleared: rng.int(0, 2),
        bossTotalPhases: 3,
        bossHpFraction: rng.next(),
        enemiesDefeated: rng.int(0, 80),
        elitesDefeated: rng.int(0, 3),
        goldEarned: rng.int(0, 5000),
        xpEarned: rng.int(0, 200),
        duration: rng.range(1, 200),
        reps: { full: rng.int(0, 20), knee: rng.int(0, 20), simulated: rng.int(0, 5), repUnits: rng.int(0, 30) },
        repDamage: rng.int(0, 5000),
        specialsUsed: rng.int(0, 5),
        interrupts: rng.int(0, 2),
        warCries: rng.int(0, 3),
        cardsDeployed: rng.int(0, 30),
        score: rng.int(0, 50),
        analysis: {
          heroDamageTakenByRole: {},
          flyingReachedHero: rng.range(0, 10),
          armoredKills: 0,
          maxEnemiesAlive: rng.int(0, 15),
          killedByBoss: rng.chance(0.5),
          deckHasAntiAir: rng.chance(0.5),
          deckHasTank: rng.chance(0.5),
          deckHasSplash: rng.chance(0.5),
          deckHasHealer: rng.chance(0.5),
          averageCardLevel: 3,
          timeWithFullValor: rng.range(0, 40),
        },
      };
      finalizeBattle(s, result, NOW, new Rng(i));
      expectNoLoss(before, s, `fuzz #${i} ${mode}/${outcome}`);
    }
  });

  it('endless, blitz and weekly runs ending in a "loss" keep all progress and records', () => {
    for (const make of [(s: GameState) => endlessSetup(s, 5), (s: GameState) => blitzSetup(s, 6), (s: GameState) => weeklySetup(s, NOW)]) {
      const s = richState(7);
      const before = snapshotPermanent(s);
      const setup = make(s);
      setup.hero = { ...setup.hero, hp: 50 };
      const result = new Battle(setup).runToEnd(300);
      finalizeBattle(s, result, NOW, new Rng(3));
      expectNoLoss(before, s, setup.mode);
    }
  });

  it('a lost boss fight saves a checkpoint so earlier waves stay cleared', () => {
    const s = createInitialState(NOW, 9);
    const setup = campaignSetup(s, 4, 'normal');
    setup.startWave = setup.waves.length - 1; // jump to the boss wave
    setup.hero = { ...setup.hero, hp: 1 };
    setup.deck = [];
    const result = new Battle(setup).runToEnd();
    expect(result.reachedBoss).toBe(true);
    const summary = finalizeBattle(s, result, NOW, new Rng(1));
    expect(summary.bossCheckpointSaved).toBe(true);
    expect(s.progress.bossCheckpoints).toContain(4);
    const retry = campaignSetup(s, 4, 'normal', { startAtBoss: true });
    expect(retry.startWave).toBe(retry.waves.length - 1);
  });

  it('losing a dungeon room ends the run but keeps rewards from cleared rooms', () => {
    const s = richState(11);
    s.buildings.castle.level = 3;
    startDungeon(s, NOW, 1234);
    const first = availableNodes(s.dungeon!)[0]!;
    const outcome = enterNode(s, first.id);
    expect(outcome?.kind).toBe('battle');
    if (outcome?.kind !== 'battle') return;
    // Win the first room.
    const win = new Battle({ ...outcome.setup, hero: { ...outcome.setup.hero, hp: 1e9, damage: 1e6 } }).runToEnd();
    expect(win.outcome).toBe('victory');
    finalizeBattle(s, win, NOW, new Rng(1));
    const room = finalizeDungeonBattle(s, win);
    expect(room.cleared).toBe(true);
    const before = snapshotPermanent(s);
    // Lose the next room.
    const next = availableNodes(s.dungeon!).find((n) => n.kind !== 'rest' && n.kind !== 'treasure' && n.kind !== 'cards');
    if (!next) return;
    const o2 = enterNode(s, next.id);
    if (o2?.kind !== 'battle') return;
    const loss = new Battle({ ...o2.setup, hero: { ...o2.setup.hero, hp: 1 }, deck: [] }).runToEnd();
    finalizeBattle(s, loss, NOW, new Rng(2));
    const r2 = finalizeDungeonBattle(s, loss);
    expect(r2.runEnded).toBe(true);
    expect(s.dungeon).toBeNull();
    expectNoLoss(before, s, 'dungeon loss');
  });

  it('missing days never removes possessions (streak only affects a bonus)', () => {
    const s = richState(13);
    recordActiveDay(s, NOW);
    const before = snapshotPermanent(s);
    recordActiveDay(s, NOW + 10 * 86400_000);
    expectNoLoss(before, s, 'streak gap');
    expect(s.streak.count).toBe(1);
  });

  it('defeat summaries always include progress info, kept rewards and a retry-friendly suggestion', () => {
    const s = richState(17);
    const result = losingBattle(s, 9);
    const summary = finalizeBattle(s, result, NOW, new Rng(1));
    expect(summary.progressLines.length).toBeGreaterThan(0);
    expect(summary.kept).toBeDefined();
    expect(summary.suggestions.some((x) => x.action === 'retry_story' || x.action === 'retry_boss' || x.action === 'cards')).toBe(true);
  });
});
