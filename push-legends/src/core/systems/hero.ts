import { BALANCE } from '../config/balance';
import { BUILDING_EFFECTS } from '../content/buildings';
import { getItem, type ItemEffect, type StatKey } from '../content/equipment';
import { getPet, type PetActive } from '../content/pets';
import type { GameState } from '../state/types';
import { equippedItems, itemStats } from './equipment';
import { petPassiveValue } from './pets';

export { addHeroXpRaw as addHeroXp, xpToNextLevel } from './rewards';

/** Everything combat and economy need to know about the player's hero and global bonuses. */
export interface HeroStats {
  level: number;
  hp: number;
  damage: number;
  attackInterval: number;
  critChance: number;
  /** Multiplier on valor / special / war cry gained from each rep. */
  repPower: number;
  specialCharge: number;
  armyDamage: number;
  armyHp: number;
  goldBonus: number;
  bossDamage: number;
  offlineBonus: number;
  repGoldBonus: number;
  effects: ItemEffect[];
  petActive: { def: PetActive; power: number } | null;
  breakdown: Record<StatKey, number>;
}

export function computeHeroStats(state: GameState): HeroStats {
  const totals: Record<StatKey, number> = {
    heroDamage: 0,
    heroHp: 0,
    attackSpeed: 0,
    critChance: 0,
    repPower: 0,
    specialCharge: 0,
    armyDamage: 0,
    armyHp: 0,
    goldBonus: 0,
    bossDamage: 0,
    offlineBonus: 0,
  };
  const effects: ItemEffect[] = [];
  for (const item of equippedItems(state)) {
    for (const [k, v] of Object.entries(itemStats(item)) as [StatKey, number][]) totals[k] += v;
    const def = getItem(item.defId);
    if (def.effect) effects.push(def.effect);
  }

  let petActive: HeroStats['petActive'] = null;
  if (state.activePet && state.pets[state.activePet]) {
    const def = getPet(state.activePet);
    totals[def.passiveStat] += petPassiveValue(state, state.activePet);
    if (def.active) {
      const progress = state.pets[state.activePet]!;
      petActive = { def: def.active, power: 1 + 0.08 * (progress.level - 1) + 0.25 * progress.stars };
    }
  }

  const b = state.buildings;
  totals.armyHp += BUILDING_EFFECTS.barracksArmyHp(b.barracks.level);
  totals.armyDamage += BUILDING_EFFECTS.barracksArmyDamage(b.barracks.level);
  totals.repPower += BUILDING_EFFECTS.trainingRepPower(b.training_grounds.level);

  const lvl = state.hero.level;
  const hp = Math.round((BALANCE.hero.baseHp + totals.heroHp) * (1 + BALANCE.hero.hpPerLevel * (lvl - 1)));
  const damage = Math.round((BALANCE.hero.baseDamage + totals.heroDamage) * (1 + BALANCE.hero.damagePerLevel * (lvl - 1)));

  return {
    level: lvl,
    hp,
    damage,
    attackInterval: BALANCE.hero.attackInterval / (1 + totals.attackSpeed),
    critChance: Math.min(0.6, 0.05 + totals.critChance),
    repPower: 1 + totals.repPower,
    specialCharge: 1 + totals.specialCharge,
    armyDamage: 1 + totals.armyDamage,
    armyHp: 1 + totals.armyHp,
    goldBonus: 1 + totals.goldBonus,
    bossDamage: 1 + totals.bossDamage,
    offlineBonus: 1 + totals.offlineBonus,
    repGoldBonus: 1 + BUILDING_EFFECTS.trainingRepGold(b.training_grounds.level),
    effects,
    petActive,
    breakdown: totals,
  };
}

/** A single number summarising army strength, shown in the UI and used for recommendations. */
export function powerRating(state: GameState): number {
  const hero = computeHeroStats(state);
  let cardPower = 0;
  for (const id of state.deck) {
    const lvl = state.cards[id]?.level ?? 1;
    cardPower += 100 * Math.pow(BALANCE.cards.statGrowth, lvl - 1);
  }
  const avgCard = state.deck.length ? cardPower / state.deck.length : 0;
  return Math.round(avgCard * 8 * hero.armyDamage * hero.armyHp + hero.hp * 0.3 + hero.damage * 4);
}

/** Recommended power for a stage, so the UI can warn when a stage is a stretch. */
export function recommendedPower(stageIdx: number): number {
  return Math.round(1000 * Math.pow(BALANCE.difficulty.stageGrowth, stageIdx) * Math.pow(BALANCE.difficulty.worldStep, Math.floor(stageIdx / 10)) * 0.9);
}
