export interface CosmeticDef {
  id: string;
  kind: 'cape' | 'aura';
  name: string;
  color: string;
  secondary: string;
  source: string;
}

export const COSMETICS: readonly CosmeticDef[] = [
  { id: 'cape_crimson', kind: 'cape', name: 'Crimson Cape', color: '#c0392b', secondary: '#7b241c', source: 'Starter' },
  { id: 'cape_forest', kind: 'cape', name: 'Forest Cape', color: '#27ae60', secondary: '#145a32', source: 'Starter' },
  { id: 'cape_royal', kind: 'cape', name: 'Royal Cape', color: '#6c3483', secondary: '#f4d03f', source: 'Boss Hunter (final tier)' },
  { id: 'cape_dawn', kind: 'cape', name: 'Dawn Cape', color: '#f5b041', secondary: '#fdfefe', source: 'Steady Training (final tier)' },
  { id: 'cape_stone', kind: 'cape', name: 'Mason Cape', color: '#7f8c8d', secondary: '#34495e', source: 'Master Architect (final tier)' },
  { id: 'cape_frost', kind: 'cape', name: 'Frostfang Cape', color: '#5dade2', secondary: '#eaf2f8', source: 'Defeat Queen Rimeclaw' },
  { id: 'aura_none', kind: 'aura', name: 'No Aura', color: 'transparent', secondary: 'transparent', source: 'Starter' },
  { id: 'aura_ember', kind: 'aura', name: 'Ember Aura', color: '#e67e22', secondary: '#f9e79f', source: 'Defeat Grovemaw' },
  { id: 'aura_crimson', kind: 'aura', name: 'Crimson Aura', color: '#e74c3c', secondary: '#fadbd8', source: 'Monster Slayer (final tier)' },
  { id: 'aura_gold', kind: 'aura', name: 'Golden Aura', color: '#f4d03f', secondary: '#fef9e7', source: 'Push-up Legend (final tier)' },
  { id: 'aura_crystal', kind: 'aura', name: 'Crystal Aura', color: '#48c9b0', secondary: '#e8f8f5', source: 'World Explorer (final tier)' },
  { id: 'aura_storm', kind: 'aura', name: 'Storm Aura', color: '#5dade2', secondary: '#f7dc6f', source: 'Perfect Timing (final tier)' },
];

export const COSMETIC_BY_ID: ReadonlyMap<string, CosmeticDef> = new Map(COSMETICS.map((c) => [c.id, c]));
export const STARTER_COSMETICS = ['cape_crimson', 'cape_forest', 'aura_none'];

/** Cosmetics awarded on first defeat of a boss. */
export const BOSS_COSMETICS: Record<string, string> = {
  grovemaw: 'aura_ember',
  rimeclaw: 'cape_frost',
};
