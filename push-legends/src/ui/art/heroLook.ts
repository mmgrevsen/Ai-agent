import { COSMETIC_BY_ID } from '../../core/content/cosmetics';
import { ITEM_BY_ID } from '../../core/content/equipment';
import type { GameState } from '../../core/state/types';

/** The hero carries the gold-hilted sword once an epic or better weapon is equipped. */
export function heroHasGoldSword(game: GameState): boolean {
  const uid = game.hero.equipped.weapon;
  const item = uid ? game.items.find((i) => i.uid === uid) : undefined;
  const def = item ? ITEM_BY_ID.get(item.defId) : undefined;
  return !!def && def.rarity !== 'common' && def.rarity !== 'rare';
}

export function heroCapeColor(capeId: string): string {
  return COSMETIC_BY_ID.get(capeId)?.color ?? '#5e0f14';
}

/** Portrait key (see art/cardPortraits.ts) for the player's hero as currently equipped. */
export function heroPortraitKey(game: GameState): string {
  return `hero:${heroCapeColor(game.hero.cape)}:${heroHasGoldSword(game) ? 'goldsword' : 'sword'}`;
}
