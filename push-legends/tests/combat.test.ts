import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/config/balance';
import { getCard } from '../src/core/content/cards';
import { Battle } from '../src/core/combat/engine';
import type { BattleSetup, WaveDef } from '../src/core/combat/types';
import { buildStageWaves } from '../src/core/combat/waves';
import { createInitialState } from '../src/core/state/initial';
import { campaignSetup, endlessSetup } from '../src/core/systems/battleSetup';
import { cardStats } from '../src/core/systems/cards';

const NOW = Date.UTC(2026, 9, 15, 12);

function setupWith(waves: WaveDef[], deckIds: string[] = ['oakshield_knight', 'thornbow_archer'], patch: Partial<BattleSetup> = {}): BattleSetup {
  const s = createInitialState(NOW, 1);
  s.deck = deckIds;
  for (const id of deckIds) s.cards[id] = { level: 1, fragments: 0 };
  return { ...campaignSetup(s, 0, 'normal'), waves, autoDeploy: false, ...patch };
}

const wave = (...spawns: WaveDef['spawns']): WaveDef => ({ spawns, isBossWave: spawns.some((s) => s.kind === 'boss') });

describe('combat engine', () => {
  it('is deterministic for the same setup', () => {
    const s = createInitialState(NOW, 1);
    const a = new Battle(campaignSetup(s, 3, 'normal')).runToEnd();
    const b = new Battle(campaignSetup(s, 3, 'normal')).runToEnd();
    expect(a).toEqual(b);
  });

  it('wins a first stage with the starter deck on auto-deploy', () => {
    const s = createInitialState(NOW, 1);
    s.settings.autoDeploy = true;
    const r = new Battle(campaignSetup(s, 0, 'normal')).runToEnd();
    expect(r.outcome).toBe('victory');
    expect(r.goldEarned).toBeGreaterThan(0);
  });

  it('deploying spends valor equal to the card cost and cycles the hand', () => {
    const b = new Battle(setupWith([wave({ kind: 'enemy', role: 'normal', elite: false })], ['oakshield_knight', 'thornbow_archer', 'field_medic', 'wolf_rider', 'powder_bombardier']));
    b.valor = 10;
    const card = b.handCard(0)!;
    const next = b.nextCard()!;
    expect(b.deploy(0)).toBe(true);
    expect(b.valor).toBeCloseTo(10 - card.def.cost, 5);
    expect(b.handCard(0)!.def.id).toBe(next.def.id);
    expect(b.allies.filter((u) => u.kind === 'card')).toHaveLength(card.def.count);
  });

  it('refuses to deploy without enough valor', () => {
    const b = new Battle(setupWith([wave({ kind: 'enemy', role: 'normal', elite: false })], ['bastion_golem']));
    b.valor = 5;
    expect(b.deploy(0)).toBe(false);
    expect(b.valor).toBe(5);
  });

  it('valor regenerates over time up to the cap', () => {
    const b = new Battle(setupWith([wave({ kind: 'enemy', role: 'normal', elite: false })]));
    b.valor = 0;
    for (let i = 0; i < 40; i++) b.step(0.05);
    expect(b.valor).toBeCloseTo(BALANCE.combat.valorRegenPerSec * 2, 1);
    for (let i = 0; i < 60; i++) b.step(0.5);
    expect(b.valor).toBeLessThanOrEqual(BALANCE.combat.maxValor);
  });

  it('full push-ups give full valor; knee push-ups give the configured fraction', () => {
    const b = new Battle(setupWith([wave({ kind: 'enemy', role: 'normal', elite: false })]));
    b.valor = 0;
    b.registerRep('full', true);
    const fullGain = b.valor;
    expect(fullGain).toBeCloseTo(BALANCE.exercise.valorPerRep * b.setup.hero.repPower, 5);
    b.valor = 0;
    b.registerRep('knee', true);
    expect(b.valor).toBeCloseTo(fullGain * BALANCE.exercise.kneeRepMultiplier, 5);
    expect(b.reps).toMatchObject({ full: 1, knee: 1, simulated: 0 });
  });

  it('push-ups trigger a War Cry every 10 full reps and do not charge the Legend Strike', () => {
    const b = new Battle(setupWith([wave({ kind: 'enemy', role: 'normal', elite: false })]));
    b.special = 0;
    for (let i = 0; i < 9; i++) b.registerRep('full', true);
    expect(b.special).toBe(0);
    expect(b.warCryActive).toBe(false);
    b.registerRep('full', true);
    expect(b.warCryActive).toBe(true);
    expect(b.warCries).toBe(1);
  });

  const waitForEnemy = (b: Battle) => {
    for (let i = 0; i < 200 && b.enemies.length === 0; i++) b.step(0.05);
  };

  it('each push-up strikes the enemy closest to the gate for hero damage × repStrikeDamage', () => {
    const setup = setupWith([wave({ kind: 'enemy', role: 'armored', elite: true }, { kind: 'enemy', role: 'armored', elite: true })], []);
    const b = new Battle(setup);
    waitForEnemy(b);
    const target = b.enemies.reduce((a, e) => (e.x < a.x ? e : a));
    const before = target.hp;
    b.registerRep('full', true);
    const expected = setup.hero.damage * BALANCE.exercise.repStrikeDamage * setup.hero.repPower * (1 - target.armor) * (1 - (target.resist.physical ?? 0));
    expect(before - target.hp).toBeCloseTo(expected, 3);
    expect(b.repDamage).toBeGreaterThan(0);
    expect(b.drainEvents().some((e) => e.type === 'pushStrike')).toBe(true);
  });

  it('a stronger sword (more hero damage) means more damage per push-up; knee reps deal the configured fraction', () => {
    const base = setupWith([wave({ kind: 'enemy', role: 'armored', elite: true })], []);
    const hit = (heroDamage: number, kind: 'full' | 'knee') => {
      const b = new Battle({ ...base, hero: { ...base.hero, damage: heroDamage } });
      waitForEnemy(b);
      const e = b.enemies[0]!;
      const before = e.hp;
      b.registerRep(kind, true);
      return before - e.hp;
    };
    expect(hit(80, 'full')).toBeCloseTo(hit(40, 'full') * 2, 3);
    expect(hit(40, 'knee')).toBeCloseTo(hit(40, 'full') * BALANCE.exercise.kneeRepMultiplier, 3);
  });

  it('push-ups done between waves are saved and released when enemies arrive', () => {
    const b = new Battle(setupWith([wave({ kind: 'enemy', role: 'armored', elite: true })], []));
    b.registerRep('full', true);
    b.registerRep('full', true);
    expect(b.bankedStrikes).toBe(2);
    expect(b.repDamage).toBe(0);
    for (let i = 0; i < 200 && b.bankedStrikes > 0; i++) b.step(0.05);
    expect(b.bankedStrikes).toBe(0);
    expect(b.repDamage).toBeGreaterThan(0);
  });

  it('knee push-ups need twice as many reps for a War Cry', () => {
    const b = new Battle(setupWith([wave({ kind: 'enemy', role: 'normal', elite: false })]));
    for (let i = 0; i < 19; i++) b.registerRep('knee', true);
    expect(b.warCries).toBe(0);
    b.registerRep('knee', true);
    expect(b.warCries).toBe(1);
  });

  it('simulated (developer) reps are tracked separately from verified reps', () => {
    const b = new Battle(setupWith([wave({ kind: 'enemy', role: 'normal', elite: false })]));
    b.registerRep('full', false);
    expect(b.reps).toEqual({ full: 0, knee: 0, simulated: 1, repUnits: 0 });
  });

  it('melee units cannot hit flying enemies, archers can and prioritise them', () => {
    const b = new Battle(setupWith([wave({ kind: 'enemy', role: 'flying', elite: false }, { kind: 'enemy', role: 'normal', elite: false })], ['oakshield_knight', 'thornbow_archer']));
    b.valor = 10;
    const knightSlot = [0, 1].find((i) => b.handCard(i)!.def.id === 'oakshield_knight')!;
    b.deploy(knightSlot);
    const archerSlot = [0, 1].find((i) => b.handCard(i)?.def.id === 'thornbow_archer')!;
    b.deploy(archerSlot);
    const knight = b.allies.find((u) => u.defId === 'oakshield_knight')!;
    const archer = b.allies.find((u) => u.defId === 'thornbow_archer')!;
    for (let i = 0; i < 400 && b.enemies.length < 2; i++) b.step(0.05);
    for (let i = 0; i < 200; i++) {
      b.step(0.05);
      const target = b.units.find((u) => u.id === knight.targetId);
      if (target) expect(target.flying).toBe(false);
      const at = b.units.find((u) => u.id === archer.targetId);
      const flier = b.enemies.find((e) => e.flying);
      if (at && flier && Math.abs(flier.x - archer.x) <= archer.range) expect(at.flying).toBe(true);
    }
  });

  it('armor reduces physical damage more than elemental damage', () => {
    const b = new Battle(setupWith([wave({ kind: 'enemy', role: 'armored', elite: false })]));
    for (let i = 0; i < 200 && b.enemies.length === 0; i++) b.step(0.05);
    const armored = b.enemies[0]!;
    const physicalMult = (b as unknown as { resistMultiplier: (t: unknown, d: string) => number }).resistMultiplier(armored, 'physical');
    const fireMult = (b as unknown as { resistMultiplier: (t: unknown, d: string) => number }).resistMultiplier(armored, 'fire');
    expect(physicalMult).toBeLessThan(fireMult);
  });

  it('bosses change phase at their health thresholds and announce it', () => {
    const b = new Battle(setupWith([wave({ kind: 'boss', bossId: 'grovemaw', tier: 2 })], ['oakshield_knight'], { timeLimit: 999 }));
    for (let i = 0; i < 60 && !b.activeBoss; i++) b.step(0.1);
    const boss = b.activeBoss!;
    expect(boss.boss!.phaseIndex).toBe(0);
    boss.hp = boss.maxHp * 0.55;
    b.step(0.05);
    expect(boss.boss!.phaseIndex).toBe(1);
    expect(b.drainEvents().some((e) => e.type === 'phase')).toBe(true);
    boss.hp = boss.maxHp * 0.2;
    b.step(0.05);
    expect(boss.boss!.phaseIndex).toBe(2);
    // Phase 3 hardens bark: physical resist goes up.
    expect(boss.resist.physical).toBeGreaterThan(0.2);
  });

  it('boss telegraphs resolve after their wind-up, and the Legend Strike interrupts them', () => {
    const b = new Battle(setupWith([wave({ kind: 'boss', bossId: 'mossback', tier: 1 })], ['oakshield_knight'], { timeLimit: 999 }));
    b.valor = 10;
    b.deploy(0);
    let telegraphed = false;
    for (let i = 0; i < 2000 && !telegraphed; i++) {
      b.step(0.05);
      telegraphed = b.telegraphs.length > 0;
    }
    expect(telegraphed).toBe(true);
    b.special = 1;
    expect(b.useSpecial()).toBe(true);
    expect(b.telegraphs).toHaveLength(0);
    expect(b.interrupts).toBe(1);
    expect(b.drainEvents().some((e) => e.type === 'interrupt')).toBe(true);
  });

  it('ends in defeat when the hero falls and in victory when all waves are cleared', () => {
    const lose = new Battle(setupWith([wave(...Array.from({ length: 8 }, () => ({ kind: 'enemy' as const, role: 'normal' as const, elite: true })))], [], { hero: { ...setupWith([]).hero, hp: 10 } }));
    expect(lose.runToEnd().outcome).toBe('defeat');
    const win = new Battle(setupWith([wave({ kind: 'enemy', role: 'normal', elite: false })], [], { hero: { ...setupWith([]).hero, damage: 9999 } }));
    const r = win.runToEnd();
    expect(r.outcome).toBe('victory');
    expect(r.wavesCleared).toBe(1);
  });

  it('times out instead of stalling forever', () => {
    const s = setupWith([wave({ kind: 'boss', bossId: 'nyxara', tier: 2 })], [], { timeLimit: 20, difficultyMult: 50, hero: { ...setupWith([]).hero, hp: 1e9 } });
    expect(new Battle(s).runToEnd().outcome).toBe('timeout');
  });

  it('endless mode never ends in victory; it completes when the hero falls', () => {
    const s = createInitialState(NOW, 1);
    s.settings.autoDeploy = true;
    const setup = endlessSetup(s, 99);
    const r = new Battle(setup).runToEnd(1200);
    expect(r.outcome).toBe('complete');
    expect(r.wavesCleared).toBeGreaterThan(0);
  });

  it('stage waves introduce enemy types gradually and add bosses on stage 5 and 10', () => {
    const early = buildStageWaves(0, 1, 1).flatMap((w) => w.spawns);
    expect(early.every((s) => s.kind === 'enemy' && s.role === 'normal')).toBe(true);
    expect(buildStageWaves(0, 5, 1).at(-1)!.isBossWave).toBe(true);
    expect(buildStageWaves(0, 10, 1).at(-1)!.spawns[0]).toMatchObject({ kind: 'boss', bossId: 'grovemaw', tier: 2 });
    expect(buildStageWaves(0, 3, 1).some((w) => w.isBossWave)).toBe(false);
  });

  it('card stats scale with level', () => {
    const def = getCard('oakshield_knight');
    expect(cardStats(def, 5).hp).toBeGreaterThan(cardStats(def, 1).hp);
    expect(cardStats(def, 1).hp).toBe(def.hp);
  });
});
