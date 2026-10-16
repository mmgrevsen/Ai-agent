import type { Palette, Rarity } from './types';

export type EquipSlot = 'weapon' | 'helmet' | 'chest' | 'gloves' | 'boots' | 'relic';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'relic'];

/**
 * Hero/army stat keys. heroDamage and heroHp are flat; every other key is a fraction (0.1 = +10%).
 */
export type StatKey =
  | 'heroDamage'
  | 'heroHp'
  | 'attackSpeed'
  | 'critChance'
  | 'repPower'
  | 'specialCharge'
  | 'armyDamage'
  | 'armyHp'
  | 'goldBonus'
  | 'bossDamage'
  | 'offlineBonus';

export const STAT_LABELS: Record<StatKey, string> = {
  heroDamage: 'Hero damage',
  heroHp: 'Hero health',
  attackSpeed: 'Hero attack speed',
  critChance: 'Critical chance',
  repPower: 'Push-up power',
  specialCharge: 'Special charge speed',
  armyDamage: 'Army damage',
  armyHp: 'Army health',
  goldBonus: 'Gold bonus',
  bossDamage: 'Boss damage',
  offlineBonus: 'Offline rewards',
};

export const FLAT_STATS: ReadonlySet<StatKey> = new Set(['heroDamage', 'heroHp']);

export type ItemEffect =
  | { kind: 'burn'; fraction: number }
  | { kind: 'slow'; amount: number; sec: number }
  | { kind: 'chain'; jumps: number }
  | { kind: 'lifesteal'; fraction: number }
  | { kind: 'repShield'; hpFraction: number };

export interface ItemDef {
  id: string;
  name: string;
  slot: EquipSlot;
  rarity: Rarity;
  kind: string;
  stats: Partial<Record<StatKey, number>>;
  effect?: ItemEffect;
  effectText?: string;
  description: string;
  palette: Palette;
  /** Swords sold in the Armory for gold, unlocked once this global stage index has been reached. */
  armoryStage?: number;
}

const steel: Palette = { primary: '#bdc3c7', secondary: '#7f8c8d', accent: '#ecf0f1' };

export const ITEMS: readonly ItemDef[] = [
  // Weapons
  { id: 'recruit_blade', name: "Recruit's Blade", slot: 'weapon', rarity: 'common', kind: 'Sword', stats: { heroDamage: 8 }, description: 'Every legend starts somewhere.', palette: steel },
  { id: 'iron_longsword', name: 'Iron Longsword', slot: 'weapon', rarity: 'common', kind: 'Sword', stats: { heroDamage: 18 }, description: 'Honest steel. Every push-up lands a little harder.', palette: { primary: '#d5d8dc', secondary: '#5d6d7e', accent: '#ffffff' }, armoryStage: 3 },
  { id: 'woodcutter_axe', name: 'Woodcutter Axe', slot: 'weapon', rarity: 'common', kind: 'Axe', stats: { heroDamage: 10, critChance: 0.04 }, description: 'Heavy, honest, and surprisingly sharp.', palette: { primary: '#a04000', secondary: '#7f8c8d', accent: '#f5cba7' } },
  { id: 'prospector_pick', name: "Prospector's Pick", slot: 'weapon', rarity: 'common', kind: 'Hammer', stats: { heroDamage: 6, goldBonus: 0.08 }, description: 'Finds a little extra gold in every fight.', palette: { primary: '#7e5109', secondary: '#f1c40f', accent: '#fcf3cf' } },
  { id: 'frostbite_saber', name: 'Frostbite Saber', slot: 'weapon', rarity: 'rare', kind: 'Sword', stats: { heroDamage: 26 }, effect: { kind: 'slow', amount: 0.3, sec: 1.5 }, effectText: 'Hero strikes (including push-up strikes) slow enemies by 30%.', description: 'Rimed steel that bites with cold.', palette: { primary: '#aed6f1', secondary: '#2874a6', accent: '#ffffff' }, armoryStage: 8 },
  { id: 'thunder_spear', name: 'Thunder Spear', slot: 'weapon', rarity: 'rare', kind: 'Spear', stats: { heroDamage: 12, repPower: 0.15 }, description: 'Hums louder with every push-up.', palette: { primary: '#5b2c6f', secondary: '#f7dc6f', accent: '#fdfefe' } },
  { id: 'emberbrand', name: 'Emberbrand', slot: 'weapon', rarity: 'epic', kind: 'Sword', stats: { heroDamage: 38, armyDamage: 0.05 }, effect: { kind: 'burn', fraction: 0.4 }, effectText: 'Hero strikes burn for 40% extra damage over time.', description: 'Forged in the heart of a volcano.', palette: { primary: '#c0392b', secondary: '#f39c12', accent: '#fdebd0' }, armoryStage: 15 },
  { id: 'oathkeeper', name: 'Oathkeeper', slot: 'weapon', rarity: 'epic', kind: 'Sword', stats: { heroDamage: 52, critChance: 0.05 }, description: 'Sworn to never let a rep go to waste.', palette: { primary: '#5dade2', secondary: '#d4ac0d', accent: '#ebf5fb' }, armoryStage: 22 },
  { id: 'titanbreaker', name: 'Titanbreaker Maul', slot: 'weapon', rarity: 'epic', kind: 'Hammer', stats: { heroDamage: 24, bossDamage: 0.2 }, description: 'Made for one purpose: toppling giants.', palette: { primary: '#566573', secondary: '#a04000', accent: '#d5dbdb' } },
  { id: 'stormcaller', name: 'Stormcaller Greatsword', slot: 'weapon', rarity: 'legendary', kind: 'Greatsword', stats: { heroDamage: 68, repPower: 0.15 }, effect: { kind: 'chain', jumps: 2 }, effectText: 'Hero strikes arc to 2 extra enemies.', description: 'Lightning answers every rep.', palette: { primary: '#2e86c1', secondary: '#f7dc6f', accent: '#ebf5fb' }, armoryStage: 29 },
  { id: 'sunforged', name: 'Sunforged Blade', slot: 'weapon', rarity: 'legendary', kind: 'Sword', stats: { heroDamage: 88, bossDamage: 0.15 }, description: 'Hammered at dawn on a mountain peak.', palette: { primary: '#f5b041', secondary: '#ba4a00', accent: '#fef9e7' }, armoryStage: 36 },
  { id: 'dawnbreaker', name: 'Dawnbreaker', slot: 'weapon', rarity: 'mythic', kind: 'Sword', stats: { heroDamage: 115, armyDamage: 0.15, specialCharge: 0.2 }, effect: { kind: 'lifesteal', fraction: 0.15 }, effectText: 'Hero heals for 15% of damage dealt.', description: 'The first light of a new legend.', palette: { primary: '#f4d03f', secondary: '#fdfefe', accent: '#f39c12' }, armoryStage: 43 },
  // Helmets
  { id: 'leather_cap', name: 'Leather Cap', slot: 'helmet', rarity: 'common', kind: 'Helmet', stats: { heroHp: 60 }, description: 'Better than nothing. Much better.', palette: { primary: '#935116', secondary: '#6e2c00', accent: '#f5cba7' } },
  { id: 'iron_helm', name: 'Iron Helm', slot: 'helmet', rarity: 'rare', kind: 'Helmet', stats: { heroHp: 120, armyHp: 0.04 }, description: 'Inspires the troops to stand firm.', palette: steel },
  { id: 'crown_focus', name: 'Crown of Focus', slot: 'helmet', rarity: 'epic', kind: 'Crown', stats: { heroHp: 80, specialCharge: 0.15 }, description: 'Clears the mind for the decisive strike.', palette: { primary: '#f1c40f', secondary: '#8e44ad', accent: '#fcf3cf' } },
  // Chest
  { id: 'padded_vest', name: 'Padded Vest', slot: 'chest', rarity: 'common', kind: 'Armor', stats: { heroHp: 90 }, description: 'Soft, warm and slightly dented.', palette: { primary: '#a67c52', secondary: '#6e4b2a', accent: '#f0e0c8' } },
  { id: 'knight_cuirass', name: "Knight's Cuirass", slot: 'chest', rarity: 'rare', kind: 'Armor', stats: { heroHp: 180 }, description: 'Polished plate for a polished hero.', palette: steel },
  { id: 'dragonscale', name: 'Dragonscale Mail', slot: 'chest', rarity: 'legendary', kind: 'Armor', stats: { heroHp: 260, armyHp: 0.1 }, effect: { kind: 'repShield', hpFraction: 0.04 }, effectText: 'Each push-up shields your hero for 4% max health.', description: 'Each scale was a gift, not a trophy.', palette: { primary: '#117a65', secondary: '#d4ac0d', accent: '#d1f2eb' } },
  // Gloves
  { id: 'grip_wraps', name: 'Grip Wraps', slot: 'gloves', rarity: 'common', kind: 'Gloves', stats: { repPower: 0.08 }, description: 'For a steady base on every rep.', palette: { primary: '#d5d8dc', secondary: '#839192', accent: '#fdfefe' } },
  { id: 'gauntlets_might', name: 'Gauntlets of Might', slot: 'gloves', rarity: 'rare', kind: 'Gauntlets', stats: { heroDamage: 6, critChance: 0.05 }, description: 'Every punch lands harder.', palette: steel },
  { id: 'champion_fists', name: "Champion's Fists", slot: 'gloves', rarity: 'epic', kind: 'Gauntlets', stats: { repPower: 0.2, armyDamage: 0.06 }, description: 'Your effort echoes through the army.', palette: { primary: '#b9770e', secondary: '#78281f', accent: '#fdebd0' } },
  // Boots
  { id: 'traveler_boots', name: 'Traveler Boots', slot: 'boots', rarity: 'common', kind: 'Boots', stats: { offlineBonus: 0.1 }, description: 'Your army keeps marching while you rest.', palette: { primary: '#784212', secondary: '#4a235a', accent: '#f5cba7' } },
  { id: 'swiftstep', name: 'Swiftstep Boots', slot: 'boots', rarity: 'rare', kind: 'Boots', stats: { attackSpeed: 0.12 }, description: 'Light as a breeze.', palette: { primary: '#48c9b0', secondary: '#117864', accent: '#e8f8f5' } },
  { id: 'pathfinder', name: 'Pathfinder Greaves', slot: 'boots', rarity: 'epic', kind: 'Greaves', stats: { offlineBonus: 0.2, goldBonus: 0.08 }, description: 'Always finds the richest road.', palette: { primary: '#6e2c00', secondary: '#d4ac0d', accent: '#fcf3cf' } },
  // Relics
  { id: 'lucky_coin', name: 'Lucky Coin', slot: 'relic', rarity: 'common', kind: 'Relic', stats: { goldBonus: 0.1 }, description: 'Heads you win, tails you also win.', palette: { primary: '#f1c40f', secondary: '#b7950b', accent: '#fef9e7' } },
  { id: 'war_banner', name: 'War Banner', slot: 'relic', rarity: 'rare', kind: 'Banner', stats: { armyDamage: 0.08 }, description: 'Raised high, it rallies every soldier.', palette: { primary: '#922b21', secondary: '#f4d03f', accent: '#fdedec' } },
  { id: 'mountain_heart', name: 'Heart of the Mountain', slot: 'relic', rarity: 'epic', kind: 'Relic', stats: { armyHp: 0.12, heroHp: 100 }, description: 'Steady, patient, unbreakable.', palette: { primary: '#5d6d7e', secondary: '#5dade2', accent: '#ebf5fb' } },
  { id: 'hourglass_rest', name: 'Hourglass of Rest', slot: 'relic', rarity: 'legendary', kind: 'Relic', stats: { offlineBonus: 0.35 }, description: 'Rest is part of training. This relic agrees.', palette: { primary: '#a569bd', secondary: '#f5cba7', accent: '#f4ecf7' } },
];

export const ITEM_BY_ID: ReadonlyMap<string, ItemDef> = new Map(ITEMS.map((i) => [i.id, i]));

export function getItem(id: string): ItemDef {
  const def = ITEM_BY_ID.get(id);
  if (!def) throw new Error(`Unknown item ${id}`);
  return def;
}

export const STARTER_ITEMS = ['recruit_blade', 'leather_cap'];

/** Swords in the Armory, cheapest first. */
export const ARMORY_SWORDS: readonly ItemDef[] = ITEMS.filter((i) => i.armoryStage !== undefined).sort((a, b) => a.armoryStage! - b.armoryStage!);
