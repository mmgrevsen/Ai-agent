import type { StatKey } from './equipment';
import type { Palette, Rarity } from './types';

export type PetActive =
  | { kind: 'fireball'; interval: number; heroDamageMult: number; radius: number }
  | { kind: 'frostAura'; interval: number; slow: number; radius: number }
  | { kind: 'guard'; interval: number; shieldPct: number };

export interface PetDef {
  id: string;
  name: string;
  rarity: Rarity;
  passiveStat: StatKey;
  passiveBase: number;
  active?: PetActive;
  activeText?: string;
  description: string;
  palette: Palette;
  /** How the pet is first obtained (shown in the UI). */
  source: string;
}

export const PETS: readonly PetDef[] = [
  {
    id: 'ember_fox',
    name: 'Ember Fox',
    rarity: 'common',
    passiveStat: 'goldBonus',
    passiveBase: 0.1,
    description: 'A sly fox that sniffs out buried gold after every fight.',
    palette: { primary: '#e67e22', secondary: '#fdfefe', accent: '#784212' },
    source: 'Clear Verdant Wilds stage 5',
  },
  {
    id: 'pebble_golem',
    name: 'Pebble',
    rarity: 'rare',
    passiveStat: 'heroHp',
    passiveBase: 80,
    active: { kind: 'guard', interval: 12, shieldPct: 0.12 },
    activeText: 'Every 12s, shields your hero for 12% max health.',
    description: 'A tiny stone golem who takes guarding you very seriously.',
    palette: { primary: '#95a5a6', secondary: '#5d6d7e', accent: '#5dade2' },
    source: 'Defeat Grovemaw',
  },
  {
    id: 'sparkwing',
    name: 'Sparkwing Hatchling',
    rarity: 'epic',
    passiveStat: 'armyDamage',
    passiveBase: 0.06,
    active: { kind: 'fireball', interval: 6, heroDamageMult: 2.5, radius: 5 },
    activeText: 'Every 6s, spits a fireball for 250% hero damage.',
    description: 'A baby dragon. Small flames, big attitude.',
    palette: { primary: '#c0392b', secondary: '#f5b041', accent: '#fdebd0' },
    source: 'Clear Frostfang Tundra stage 5',
  },
  {
    id: 'moonmoth',
    name: 'Moonmoth',
    rarity: 'rare',
    passiveStat: 'offlineBonus',
    passiveBase: 0.2,
    description: 'Glows softly and gathers treasure while you sleep.',
    palette: { primary: '#d2b4de', secondary: '#5b2c6f', accent: '#fdfefe' },
    source: 'Defeat Queen Rimeclaw',
  },
  {
    id: 'frostpup',
    name: 'Frostpup',
    rarity: 'epic',
    passiveStat: 'repPower',
    passiveBase: 0.1,
    active: { kind: 'frostAura', interval: 5, slow: 0.35, radius: 14 },
    activeText: 'Every 5s, chills enemies near your hero (35% slow).',
    description: 'Cheers you on through every push-up with excited yips.',
    palette: { primary: '#d6eaf8', secondary: '#2e86c1', accent: '#ffffff' },
    source: 'Clear Emberforge Kingdom stage 5',
  },
];

export const PET_BY_ID: ReadonlyMap<string, PetDef> = new Map(PETS.map((p) => [p.id, p]));

export function getPet(id: string): PetDef {
  const def = PET_BY_ID.get(id);
  if (!def) throw new Error(`Unknown pet ${id}`);
  return def;
}
