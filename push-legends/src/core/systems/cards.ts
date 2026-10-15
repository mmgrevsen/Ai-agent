import { BALANCE } from '../config/balance';
import { CARDS, getCard } from '../content/cards';
import type { CardDef, Rarity } from '../content/types';
import { BUILDING_EFFECTS } from '../content/buildings';
import type { GameState } from '../state/types';

export interface CardStats {
  hp: number;
  damage: number;
  dps: number;
}

export function statMultiplier(level: number): number {
  return Math.pow(BALANCE.cards.statGrowth, Math.max(0, level - 1));
}

export function cardStats(def: CardDef, level: number): CardStats {
  const m = statMultiplier(level);
  const hp = Math.round(def.hp * m);
  const damage = Math.round(def.damage * m);
  return { hp, damage, dps: Math.round((damage / def.attackInterval) * def.count * 10) / 10 };
}

export function fragmentsForUpgrade(rarity: Rarity, level: number): number {
  return BALANCE.cards.fragmentsPerLevel[rarity] * level;
}

export function goldForUpgrade(level: number, academyLevel = 0): number {
  const base = BALANCE.cards.upgradeGoldBase * Math.pow(BALANCE.cards.upgradeGoldGrowth, level - 1);
  return Math.round(base * (1 - BUILDING_EFFECTS.academyCardDiscount(academyLevel)));
}

export type UpgradeCheck =
  | { ok: true; gold: number; fragments: number }
  | { ok: false; reason: 'not_owned' | 'max_level' | 'fragments' | 'gold'; gold: number; fragments: number };

export function checkCardUpgrade(state: GameState, cardId: string): UpgradeCheck {
  const progress = state.cards[cardId];
  const def = getCard(cardId);
  if (!progress) return { ok: false, reason: 'not_owned', gold: 0, fragments: 0 };
  if (progress.level >= BALANCE.cards.maxLevel) return { ok: false, reason: 'max_level', gold: 0, fragments: 0 };
  const fragments = fragmentsForUpgrade(def.rarity, progress.level);
  const gold = goldForUpgrade(progress.level, state.buildings.academy.level);
  if (progress.fragments < fragments) return { ok: false, reason: 'fragments', gold, fragments };
  if (state.resources.gold < gold) return { ok: false, reason: 'gold', gold, fragments };
  return { ok: true, gold, fragments };
}

/** Upgrades a card by one level. A card is never consumed, removed, or downgraded. */
export function upgradeCard(state: GameState, cardId: string): boolean {
  const check = checkCardUpgrade(state, cardId);
  if (!check.ok) return false;
  const progress = state.cards[cardId]!;
  progress.fragments -= check.fragments;
  progress.level += 1;
  state.resources.gold -= check.gold;
  if (progress.level >= BALANCE.cards.maxLevel) convertSurplusFragments(state, cardId);
  return true;
}

/**
 * Adds fragments of a card. Unowned cards are unlocked at level 1 (the first fragment discovers them).
 * At max level, surplus fragments become Glory tokens so duplicates are always useful.
 * Returns true if the card was newly unlocked.
 */
export function addCardFragments(state: GameState, cardId: string, amount: number): boolean {
  if (amount <= 0 || !CARDS.some((c) => c.id === cardId)) return false;
  let unlocked = false;
  if (!state.cards[cardId]) {
    state.cards[cardId] = { level: 1, fragments: 0 };
    unlocked = true;
    amount -= 1;
    if (state.deck.length < BALANCE.cards.deckSize) state.deck.push(cardId);
  }
  state.cards[cardId]!.fragments += Math.max(0, Math.floor(amount));
  if (state.cards[cardId]!.level >= BALANCE.cards.maxLevel) convertSurplusFragments(state, cardId);
  return unlocked;
}

function convertSurplusFragments(state: GameState, cardId: string): void {
  const progress = state.cards[cardId]!;
  if (progress.fragments <= 0) return;
  const def = getCard(cardId);
  state.resources.glory += progress.fragments * BALANCE.cards.gloryPerSurplusFragment[def.rarity];
  progress.fragments = 0;
}

export function unlockCard(state: GameState, cardId: string): boolean {
  if (state.cards[cardId]) return false;
  return addCardFragments(state, cardId, 1);
}

// Deck management -----------------------------------------------------------

export function setDeck(state: GameState, deck: string[]): boolean {
  const unique = [...new Set(deck)];
  if (unique.length === 0 || unique.length > BALANCE.cards.deckSize) return false;
  if (!unique.every((id) => state.cards[id])) return false;
  state.deck = unique;
  return true;
}

export function toggleDeckCard(state: GameState, cardId: string): boolean {
  if (!state.cards[cardId]) return false;
  if (state.deck.includes(cardId)) {
    if (state.deck.length <= 1) return false;
    state.deck = state.deck.filter((id) => id !== cardId);
    return true;
  }
  if (state.deck.length >= BALANCE.cards.deckSize) return false;
  state.deck = [...state.deck, cardId];
  return true;
}

/** Swaps a deck card for a collection card in place (keeps the deck order). */
export function swapDeckCard(state: GameState, outId: string, inId: string): boolean {
  const idx = state.deck.indexOf(outId);
  if (idx < 0 || !state.cards[inId] || state.deck.includes(inId)) return false;
  state.deck = state.deck.map((id, i) => (i === idx ? inId : id));
  return true;
}

export function averageDeckCost(deck: string[]): number {
  if (deck.length === 0) return 0;
  return deck.reduce((s, id) => s + getCard(id).cost, 0) / deck.length;
}

/** Number of cards the player can upgrade right now (for notification badges). */
export function upgradeableCards(state: GameState): string[] {
  return Object.keys(state.cards).filter((id) => checkCardUpgrade(state, id).ok);
}

/** Cards discoverable through chests and the shop: owned cards plus any whose unlock world has been reached. */
export function discoverableCards(state: GameState): CardDef[] {
  const reachedWorld = Math.floor(Math.max(0, state.progress.highestCleared + 1) / 10);
  return CARDS.filter((c) => state.cards[c.id] || c.unlock.kind === 'start' || (c.unlock.kind === 'stage' && c.unlock.world <= reachedWorld));
}
