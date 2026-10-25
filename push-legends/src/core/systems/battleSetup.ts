import { BALANCE, type Difficulty } from '../config/balance';
import { getCard } from '../content/cards';
import { BUILDING_EFFECTS } from '../content/buildings';
import { buildStageWaves } from '../combat/waves';
import type { BattleModifierId, BattleSetup, DeckCardSpec, HeroSpec, WaveDef } from '../combat/types';
import { hashString } from '../rng';
import type { GameState } from '../state/types';
import { weekKey } from '../util';
import { cardStats } from './cards';
import { difficultyMultiplier, progressIndex, rewardMultiplier, stageFromIndex } from './economy';
import { computeHeroStats } from './hero';
import { stageRepsRequired } from './training';

export function buildHeroSpec(state: GameState): HeroSpec {
  const h = computeHeroStats(state);
  return {
    hp: h.hp,
    damage: h.damage,
    attackInterval: h.attackInterval,
    critChance: h.critChance,
    bossDamage: h.bossDamage,
    armyDamage: h.armyDamage,
    armyHp: h.armyHp,
    repPower: h.repPower,
    specialCharge: h.specialCharge,
    effects: h.effects,
    petActive: h.petActive,
    cape: state.hero.cape,
    aura: state.hero.aura,
  };
}

/** Baseline hero for fair, normalized challenge battles: no gear, pets or building bonuses. */
export function normalizedHeroSpec(state: GameState): HeroSpec {
  const lvl = 10;
  return {
    hp: Math.round(BALANCE.hero.baseHp * Math.pow(BALANCE.hero.hpGrowth, lvl - 1)),
    damage: Math.round(BALANCE.hero.baseDamage * Math.pow(BALANCE.hero.damageGrowth, lvl - 1)),
    attackInterval: BALANCE.hero.attackInterval,
    critChance: 0.05,
    bossDamage: 1,
    armyDamage: 1,
    armyHp: 1,
    repPower: 1,
    specialCharge: 1,
    effects: [],
    petActive: null,
    cape: state.hero.cape,
    aura: state.hero.aura,
  };
}

export function buildDeckSpec(state: GameState, normalizedLevel?: number): DeckCardSpec[] {
  return state.deck
    .filter((id) => state.cards[id])
    .map((id) => {
      const def = getCard(id);
      const level = normalizedLevel ?? state.cards[id]!.level;
      const s = cardStats(def, level);
      return { def, level, hp: s.hp, damage: s.damage };
    });
}

function baseSetup(state: GameState, partial: Partial<BattleSetup> & Pick<BattleSetup, 'mode' | 'label' | 'seed' | 'world' | 'stageIndex' | 'waves'>): BattleSetup {
  return {
    difficulty: 'normal',
    difficultyMult: difficultyMultiplier(partial.stageIndex),
    rewardMult: 1,
    startWave: 0,
    endless: false,
    endlessGrowth: BALANCE.difficulty.endlessWaveGrowth,
    timeLimit: BALANCE.combat.stageTimeLimitSec,
    deck: buildDeckSpec(state),
    hero: buildHeroSpec(state),
    modifiers: [],
    restBuff: 0,
    autoDeploy: state.settings.autoDeploy,
    exerciseMode: state.settings.useCamera ? state.settings.exerciseMode : null,
    repsRequired: 0,
    ...partial,
  };
}

export function stageSeed(stageIdx: number): number {
  return hashString(`stage-${stageIdx}`);
}

export function campaignWaves(stageIdx: number): WaveDef[] {
  const { world, stage } = stageFromIndex(stageIdx);
  return buildStageWaves(world, stage, stageSeed(stageIdx));
}

export function campaignSetup(
  state: GameState,
  stageIdx: number,
  difficulty: Difficulty,
  opts: { startAtBoss?: boolean; attemptSeed?: number } = {},
): BattleSetup {
  const { world, stage } = stageFromIndex(stageIdx);
  const waves = campaignWaves(stageIdx);
  const bossWave = waves.findIndex((w) => w.isBossWave);
  const canSkip = opts.startAtBoss && bossWave > 0 && state.progress.bossCheckpoints.includes(stageIdx);
  return baseSetup(state, {
    mode: 'campaign',
    label: `${world + 1}-${stage}`,
    seed: opts.attemptSeed ?? stageSeed(stageIdx) ^ 0x5bd1e995,
    world,
    stageIndex: stageIdx,
    waves,
    startWave: canSkip ? bossWave : 0,
    // Boss stages get extra time so the fight itself is never cut short.
    timeLimit: bossWave >= 0 ? BALANCE.combat.stageTimeLimitSec + 120 : BALANCE.combat.stageTimeLimitSec,
    // A stage is only claimed with push-ups (see systems/training.ts)
    repsRequired: stageRepsRequired(state, stageIdx),
    difficulty,
    difficultyMult: difficultyMultiplier(stageIdx, difficulty),
    rewardMult: rewardMultiplier(difficulty),
  });
}

/** Endless Siege starts a little below the player's frontier and grows every wave. */
export function endlessSetup(state: GameState, seed: number): BattleSetup {
  const idx = Math.max(0, progressIndex(state.progress.highestCleared) - 3);
  const { world } = stageFromIndex(idx);
  return baseSetup(state, {
    mode: 'endless',
    label: 'Endless Siege',
    seed,
    world,
    stageIndex: idx,
    waves: [],
    endless: true,
    timeLimit: 3600,
    difficultyMult: difficultyMultiplier(idx) * 0.7,
  });
}

export function blitzSetup(state: GameState, seed: number): BattleSetup {
  const idx = Math.max(0, progressIndex(state.progress.highestCleared) - 2);
  const { world } = stageFromIndex(idx);
  return baseSetup(state, {
    mode: 'blitz',
    label: 'Blitz Trial',
    seed,
    world,
    stageIndex: idx,
    waves: [],
    endless: true,
    endlessGrowth: 1.05,
    timeLimit: 90,
    difficultyMult: difficultyMultiplier(idx) * 0.6,
  });
}

const WEEKLY_MODIFIER_SETS: BattleModifierId[][] = [
  ['swift_foes', 'rally'],
  ['iron_skin', 'elite_surge'],
  ['sky_raid', 'glass_cannon'],
  ['elite_surge', 'rally'],
  ['sky_raid', 'swift_foes'],
  ['glass_cannon', 'iron_skin'],
];

export function weeklyModifiers(now: number): BattleModifierId[] {
  return WEEKLY_MODIFIER_SETS[hashString(weekKey(now)) % WEEKLY_MODIFIER_SETS.length]!;
}

export function weeklySetup(state: GameState, now: number): BattleSetup {
  const idx = Math.max(0, progressIndex(state.progress.highestCleared) - 2);
  const { world } = stageFromIndex(idx);
  return baseSetup(state, {
    mode: 'weekly',
    label: 'Weekly Challenge',
    seed: hashString(`weekly-${weekKey(now)}`),
    world,
    stageIndex: idx,
    waves: [],
    endless: true,
    timeLimit: 3600,
    modifiers: weeklyModifiers(now),
    difficultyMult: difficultyMultiplier(idx) * 0.75,
  });
}

/**
 * Friend challenge: a Blitz run on a shared seed with normalized card levels and a baseline hero,
 * so collection size and spending do not decide the result. Nothing is wagered.
 */
export function challengeSetup(state: GameState, seed: number, world: number): BattleSetup {
  const idx = world * 10 + 4;
  return baseSetup(state, {
    mode: 'challenge',
    label: 'Friend Challenge',
    seed,
    world,
    stageIndex: idx,
    waves: [],
    endless: true,
    endlessGrowth: 1.05,
    timeLimit: 90,
    deck: buildDeckSpec(state, BALANCE.cards.normalizedPvpLevel),
    hero: normalizedHeroSpec(state),
    difficultyMult: Math.pow(BALANCE.cards.statGrowth, BALANCE.cards.normalizedPvpLevel - 1) * 0.55,
    rewardMult: 0.5,
  });
}

export function academyFragmentBonus(state: GameState): number {
  return BUILDING_EFFECTS.academyFragmentBonus(state.buildings.academy.level);
}
