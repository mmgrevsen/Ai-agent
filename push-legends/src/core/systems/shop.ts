import { BALANCE } from '../config/balance';
import { getCard } from '../content/cards';
import { hashString, Rng } from '../rng';
import type { GameState } from '../state/types';
import { dayKey } from '../util';
import { addCardFragments, discoverableCards } from './cards';

export interface ShopOffer {
  id: string;
  cardId: string;
  amount: number;
  gold: number;
}

/** Daily fragment offers. There are no real-money purchases anywhere in the game. */
export function dailyOffers(state: GameState, now: number): ShopOffer[] {
  const day = dayKey(now);
  const rng = new Rng(hashString(`shop-${day}-${state.profile.friendCode}`));
  const pool = discoverableCards(state);
  const picks = rng.shuffle([...pool]).slice(0, 4);
  const worldScale = Math.pow(BALANCE.economy.killGoldGrowth, Math.max(0, state.progress.highestCleared));
  return picks.map((c, i) => {
    const amount = { common: 10, rare: 6, epic: 3, legendary: 1, mythic: 1 }[c.rarity];
    return { id: `${day}-${i}`, cardId: c.id, amount, gold: Math.round(BALANCE.cards.shopFragmentGold[c.rarity] * amount * worldScale) };
  });
}

export function buyOffer(state: GameState, offerId: string, now: number): boolean {
  const day = dayKey(now);
  if (state.shop.day !== day) state.shop = { day, purchased: [] };
  if (state.shop.purchased.includes(offerId)) return false;
  const offer = dailyOffers(state, now).find((o) => o.id === offerId);
  if (!offer || state.resources.gold < offer.gold) return false;
  state.resources.gold -= offer.gold;
  addCardFragments(state, offer.cardId, offer.amount);
  state.shop.purchased.push(offerId);
  return true;
}

export function gloryPrice(cardId: string): number {
  return BALANCE.cards.shopFragmentGlory[getCard(cardId).rarity];
}

/** Glory tokens (from surplus duplicates) buy fragments of any discoverable card. */
export function buyWithGlory(state: GameState, cardId: string): boolean {
  if (!discoverableCards(state).some((c) => c.id === cardId)) return false;
  const price = gloryPrice(cardId);
  if (state.resources.glory < price) return false;
  state.resources.glory -= price;
  addCardFragments(state, cardId, 1);
  return true;
}
