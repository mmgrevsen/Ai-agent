import { BALANCE } from '../config/balance';
import { ARMORY_SWORDS, getItem } from '../content/equipment';
import type { GameState } from '../state/types';
import { goldRatePerSecond } from './economy';
import { addItem, equipItem, itemStats } from './equipment';
import { computeHeroStats, type HeroStats } from './hero';

/** Damage one verified full push-up deals (knee push-ups deal the knee multiplier of this). */
export function pushupDamage(hero: Pick<HeroStats, 'damage' | 'repPower'>): number {
  return Math.round(hero.damage * BALANCE.exercise.repStrikeDamage * hero.repPower);
}

export interface ArmoryOffer {
  defId: string;
  price: number;
  unlockStage: number;
  unlocked: boolean;
  owned: boolean;
  affordable: boolean;
  /** Push-up damage the hero would have with this sword equipped (at level 1). */
  pushupDamageWith: number;
}

export function swordPrice(defId: string): number {
  const def = getItem(defId);
  return Math.round(goldRatePerSecond(def.armoryStage ?? 0) * BALANCE.equipment.armoryPriceSeconds);
}

/** Swords become available once the player has reached their unlock stage (cleared the stage before it). */
export function armoryOffers(state: GameState): ArmoryOffer[] {
  const reached = state.progress.highestCleared + 1;
  return ARMORY_SWORDS.map((def) => {
    const price = swordPrice(def.id);
    const owned = state.items.some((i) => i.defId === def.id);
    const unlocked = reached >= def.armoryStage!;
    return {
      defId: def.id,
      price,
      unlockStage: def.armoryStage!,
      unlocked,
      owned,
      affordable: unlocked && !owned && state.resources.gold >= price,
      pushupDamageWith: pushupDamageWithWeapon(state, def.id, 1, 0),
    };
  });
}

/** Push-up damage if the given weapon (at a level/star count) replaced the equipped weapon. */
export function pushupDamageWithWeapon(state: GameState, defId: string, level: number, stars: number): number {
  const copy = structuredClone(state);
  const probe = { uid: '__probe__', defId, level, stars };
  copy.items = [...copy.items.filter((i) => i.uid !== probe.uid), probe];
  copy.hero.equipped.weapon = probe.uid;
  return pushupDamage(computeHeroStats(copy));
}

/**
 * Buys a sword with gold. The new sword is equipped if it hits harder than the current weapon.
 * Old swords are kept (never removed) and can still be equipped or upgraded.
 */
export function buySword(state: GameState, defId: string): boolean {
  const offer = armoryOffers(state).find((o) => o.defId === defId);
  if (!offer || !offer.affordable) return false;
  state.resources.gold -= offer.price;
  const added = addItem(state, defId);
  if (!added.uid) return true;
  const current = state.items.find((i) => i.uid === state.hero.equipped.weapon);
  const currentDamage = current ? (itemStats(current).heroDamage ?? 0) : 0;
  const newDamage = itemStats(state.items.find((i) => i.uid === added.uid)!).heroDamage ?? 0;
  if (newDamage >= currentDamage) equipItem(state, added.uid);
  return true;
}

/** The cheapest sword the player can buy right now, if any (for UI nudges). */
export function nextAffordableSword(state: GameState): ArmoryOffer | null {
  return armoryOffers(state).find((o) => o.affordable) ?? null;
}
