import { BALANCE } from '../config/balance';
import { BUILDING_EFFECTS } from '../data/buildings';
import { FLAT_STATS, getItem, type EquipSlot, type StatKey } from '../data/equipment';
import type { GameState, ItemInstance } from '../state/types';
import { uid } from '../util';

export function itemStatMultiplier(item: Pick<ItemInstance, 'level' | 'stars'>): number {
  return (1 + BALANCE.equipment.statGrowthPerLevel * (item.level - 1)) * (1 + BALANCE.equipment.starBonus * item.stars);
}

export function itemStats(item: Pick<ItemInstance, 'defId' | 'level' | 'stars'>): Partial<Record<StatKey, number>> {
  const def = getItem(item.defId);
  const m = itemStatMultiplier(item);
  const out: Partial<Record<StatKey, number>> = {};
  for (const [key, value] of Object.entries(def.stats) as [StatKey, number][]) {
    // Percentage stats grow at half speed so they cannot run away.
    const mult = FLAT_STATS.has(key) ? m : 1 + (m - 1) * 0.5;
    out[key] = FLAT_STATS.has(key) ? Math.round(value * mult) : Math.round(value * mult * 1000) / 1000;
  }
  return out;
}

export function itemMaxLevel(state: GameState): number {
  return BUILDING_EFFECTS.blacksmithItemMaxLevel(state.buildings.blacksmith.level);
}

export function itemUpgradeCost(level: number, blacksmithLevel: number): { gold: number; ore: number } {
  const discount = 1 - BUILDING_EFFECTS.blacksmithDiscount(blacksmithLevel);
  return {
    gold: Math.round(BALANCE.equipment.upgradeGoldBase * Math.pow(BALANCE.equipment.upgradeGoldGrowth, level - 1) * discount),
    ore: Math.max(1, Math.round(BALANCE.equipment.upgradeOreBase * Math.pow(BALANCE.equipment.upgradeOreGrowth, level - 1) * discount)),
  };
}

export type ItemUpgradeCheck =
  | { ok: true; gold: number; ore: number }
  | { ok: false; reason: 'missing' | 'max_level' | 'gold' | 'ore'; gold: number; ore: number };

export function checkItemUpgrade(state: GameState, itemUid: string): ItemUpgradeCheck {
  const item = state.items.find((i) => i.uid === itemUid);
  if (!item) return { ok: false, reason: 'missing', gold: 0, ore: 0 };
  if (item.level >= itemMaxLevel(state)) return { ok: false, reason: 'max_level', gold: 0, ore: 0 };
  const cost = itemUpgradeCost(item.level, state.buildings.blacksmith.level);
  if (state.resources.ore < cost.ore) return { ok: false, reason: 'ore', ...cost };
  if (state.resources.gold < cost.gold) return { ok: false, reason: 'gold', ...cost };
  return { ok: true, ...cost };
}

export function upgradeItem(state: GameState, itemUid: string): boolean {
  const check = checkItemUpgrade(state, itemUid);
  if (!check.ok) return false;
  const item = state.items.find((i) => i.uid === itemUid)!;
  state.resources.gold -= check.gold;
  state.resources.ore -= check.ore;
  item.level += 1;
  return true;
}

/**
 * Adds an item drop. A duplicate of an owned item raises that item's stars instead of cluttering the
 * inventory; once at max stars it converts to ore. No existing item is ever removed.
 */
export function addItem(state: GameState, defId: string): { result: 'new' | 'star' | 'ore'; uid?: string; ore?: number } {
  const def = getItem(defId);
  const existing = state.items.find((i) => i.defId === defId);
  if (!existing) {
    const item: ItemInstance = { uid: uid('item'), defId, level: 1, stars: 0 };
    state.items.push(item);
    if (!state.hero.equipped[def.slot]) state.hero.equipped[def.slot] = item.uid;
    return { result: 'new', uid: item.uid };
  }
  if (existing.stars < BALANCE.equipment.maxStars) {
    existing.stars += 1;
    return { result: 'star', uid: existing.uid };
  }
  const ore = BALANCE.equipment.surplusDuplicateOre[def.rarity];
  state.resources.ore += ore;
  return { result: 'ore', ore };
}

export function equipItem(state: GameState, itemUid: string): boolean {
  const item = state.items.find((i) => i.uid === itemUid);
  if (!item) return false;
  state.hero.equipped[getItem(item.defId).slot] = item.uid;
  return true;
}

export function unequipSlot(state: GameState, slot: EquipSlot): void {
  state.hero.equipped[slot] = null;
}

export function equippedItems(state: GameState): ItemInstance[] {
  return Object.values(state.hero.equipped)
    .map((u) => state.items.find((i) => i.uid === u))
    .filter((i): i is ItemInstance => !!i);
}
