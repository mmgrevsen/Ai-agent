import { BALANCE } from '../config/balance';
import { ITEMS } from '../data/equipment';
import type { ChestKind } from '../data/quests';
import { RARITIES, type Rarity } from '../data/types';
import type { Rng } from '../rng';
import type { GameState } from '../state/types';
import { addCardFragments, discoverableCards } from './cards';
import { goldRatePerSecond, progressIndex } from './economy';
import { addItem } from './equipment';
import { addPet } from './pets';
import { grantReward } from './rewards';

const RARITY_FRAGMENT_FACTOR: Record<Rarity, number> = { common: 1, rare: 0.65, epic: 0.4, legendary: 0.2, mythic: 0.15 };
const PET_CHANCE: Record<ChestKind, number> = { wooden: 0, silver: 0.05, gold: 0.12, legend: 0.3 };

export const CHEST_NAMES: Record<ChestKind, string> = {
  wooden: 'Wooden Chest',
  silver: 'Silver Chest',
  gold: 'Golden Chest',
  legend: 'Legend Chest',
};

export interface ChestOdds {
  /** Probability (0-1) that each fragment stack is of a given rarity, after removing rarities with no discoverable card. */
  rarity: { rarity: Rarity; chance: number }[];
  stacks: number;
  totalFragments: number;
  itemChance: number;
  petChance: number;
  gold: number;
}

/** The exact odds used by openChest, shown to the player before opening or buying. */
export function chestOdds(state: GameState, kind: ChestKind): ChestOdds {
  const cfg = BALANCE.chests[kind];
  const pool = discoverableCards(state);
  const weights = RARITIES.map((r) => ({ rarity: r, w: pool.some((c) => c.rarity === r) ? cfg.weights[r] : 0 }));
  const total = weights.reduce((s, x) => s + x.w, 0) || 1;
  return {
    rarity: weights.filter((x) => x.w > 0).map((x) => ({ rarity: x.rarity, chance: x.w / total })),
    stacks: cfg.stacks,
    totalFragments: cfg.fragments,
    itemChance: BALANCE.chests.itemChance[kind],
    petChance: Object.keys(state.pets).length ? PET_CHANCE[kind] : 0,
    gold: Math.round(goldRatePerSecond(progressIndex(state.progress.highestCleared)) * cfg.goldMult),
  };
}

export interface ChestResult {
  kind: ChestKind;
  gold: number;
  fragments: { cardId: string; amount: number; newCard: boolean }[];
  item: { defId: string; result: 'new' | 'star' | 'ore' } | null;
  pet: { petId: string; result: string } | null;
}

export function openChest(state: GameState, kind: ChestKind, rng: Rng): ChestResult {
  const odds = chestOdds(state, kind);
  const pool = discoverableCards(state);
  const result: ChestResult = { kind, gold: odds.gold, fragments: [], item: null, pet: null };
  grantReward(state, { gold: odds.gold });

  const weightMap = Object.fromEntries(odds.rarity.map((r) => [r.rarity, r.chance])) as Record<Rarity, number>;
  const perStack = odds.totalFragments / odds.stacks;
  for (let i = 0; i < odds.stacks; i++) {
    const rarity = rng.weighted(weightMap);
    const candidates = pool.filter((c) => c.rarity === rarity);
    const card = rng.pick(candidates);
    const amount = Math.max(1, Math.round(perStack * RARITY_FRAGMENT_FACTOR[rarity]));
    const newCard = addCardFragments(state, card.id, amount);
    const existing = result.fragments.find((f) => f.cardId === card.id);
    if (existing) {
      existing.amount += amount;
      existing.newCard ||= newCard;
    } else result.fragments.push({ cardId: card.id, amount, newCard });
  }

  if (rng.chance(odds.itemChance)) {
    const cfg = BALANCE.chests[kind];
    const itemWeights = Object.fromEntries(RARITIES.map((r) => [r, ITEMS.some((i) => i.rarity === r) ? cfg.weights[r] : 0])) as Record<Rarity, number>;
    const rarity = rng.weighted(itemWeights);
    const def = rng.pick(ITEMS.filter((i) => i.rarity === rarity));
    result.item = { defId: def.id, result: addItem(state, def.id).result };
  }

  if (odds.petChance > 0 && rng.chance(odds.petChance)) {
    const petId = rng.pick(Object.keys(state.pets).sort());
    result.pet = { petId, result: addPet(state, petId) };
  }
  return result;
}

export type ChestPurchase = 'gold' | 'gems';

export function chestPrice(kind: ChestKind, currency: ChestPurchase, state: GameState): number {
  if (currency === 'gems') return BALANCE.chests.gemPrice[kind];
  // Gold price scales with progress so chests remain a meaningful sink.
  const base = BALANCE.chests.goldPrice[kind];
  return base <= 0 ? 0 : Math.round(base * Math.pow(BALANCE.economy.killGoldGrowth, Math.max(0, state.progress.highestCleared)));
}

export function buyChest(state: GameState, kind: ChestKind, currency: ChestPurchase, rng: Rng): ChestResult | null {
  const price = chestPrice(kind, currency, state);
  if (price <= 0) return null;
  const wallet = currency === 'gold' ? 'gold' : 'gems';
  if (state.resources[wallet] < price) return null;
  state.resources[wallet] -= price;
  return openChest(state, kind, rng);
}

export function openPendingChest(state: GameState, index: number, rng: Rng): ChestResult | null {
  const kind = state.pendingChests[index];
  if (!kind) return null;
  state.pendingChests.splice(index, 1);
  return openChest(state, kind, rng);
}
