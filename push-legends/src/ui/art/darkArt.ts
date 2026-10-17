/**
 * Push Legends art bible (dark fantasy). One source of truth for the colours, factions and per-unit
 * presentation shared by the 3D battle models, the card portraits rendered from those models and
 * the card frames. Plain data: safe to import from 2D UI code without loading three.js.
 *
 * Rules:
 * - Restrained palette: black, charcoal, gunmetal, dark steel, crimson, blood red, bone, muted gold.
 *   Factions add one accent each; glow is reserved for eyes, runes and magic.
 * - Not pure black: every unit keeps a readable silhouette (steel highlights, bone and cloth
 *   accents, a coloured rim light on cards).
 * - Faces are concealed (visors, hoods, masks, skulls) or shadowed; no smiles, no big eyes.
 * - Proportions are realistic (about seven heads tall); giants and bosses are drawn larger.
 */
export const PAL = {
  void: '#0b0b0e',
  black: '#121216',
  charcoal: '#1d1d22',
  iron: '#4d5055',
  blackSteel: '#3e4349',
  gunmetal: '#626871',
  steel: '#8a929b',
  steelLight: '#b8c0c9',
  crimson: '#5e0f14',
  blood: '#8a1a1c',
  bloodBright: '#b3232b',
  bone: '#d6c9ad',
  boneDark: '#9e9077',
  gold: '#8f7130',
  goldLight: '#bf9d52',
  leather: '#3a2a20',
  leatherDark: '#231913',
  cloth: '#27231f',
  ash: '#4a4541',
  ashLight: '#6e6761',
  wood: '#3b2a1e',
  obsidian: '#16141a',
  skinPale: '#b9a693',
  skinGrey: '#8f8a84',
  // Magic and glow accents (used sparingly)
  ember: '#ff5a1f',
  fire: '#ff7a1a',
  frost: '#86d6ff',
  void2: '#9a52ff',
  toxic: '#9ccf3f',
  holy: '#e9c46a',
  storm: '#a8c8ff',
  eyeRed: '#ff2b2b',
} as const;

export type Faction = 'iron' | 'ash' | 'grave' | 'frost' | 'storm' | 'blood' | 'void' | 'wild';

/** Faction look: card background tones, rim light and glow accent. */
export const FACTIONS: Record<Faction, { name: string; bgTop: string; bgBottom: string; rim: string; accent: string; glow: string }> = {
  iron: { name: 'Iron Legion', bgTop: '#1a1b20', bgBottom: '#2a1214', rim: '#ffb07a', accent: PAL.blood, glow: PAL.ember },
  ash: { name: 'Ashen Covenant', bgTop: '#1a0f0c', bgBottom: '#3a160c', rim: '#ff7a2a', accent: PAL.fire, glow: PAL.fire },
  grave: { name: 'Gravewatch', bgTop: '#111614', bgBottom: '#22301f', rim: '#b8d88a', accent: PAL.toxic, glow: PAL.toxic },
  frost: { name: 'Rimeborn', bgTop: '#0c1218', bgBottom: '#1d3346', rim: '#9fdcff', accent: PAL.frost, glow: PAL.frost },
  storm: { name: 'Stormbound', bgTop: '#0f1018', bgBottom: '#262c48', rim: '#c8d8ff', accent: PAL.storm, glow: PAL.storm },
  blood: { name: 'Red Hand', bgTop: '#120b0c', bgBottom: '#32100f', rim: '#ff4a4a', accent: PAL.bloodBright, glow: PAL.eyeRed },
  void: { name: 'Hollow Court', bgTop: '#0d0b14', bgBottom: '#2a1544', rim: '#c39bff', accent: PAL.void2, glow: PAL.void2 },
  wild: { name: 'Feral Host', bgTop: '#101210', bgBottom: '#2c241a', rim: '#ffcf8a', accent: PAL.ember, glow: PAL.ember },
};

/** Dark-fantasy title, faction and lore line for each card id (ids and stats stay unchanged). */
export const UNIT_LOOK: Record<string, { faction: Faction; epithet: string }> = {
  oakshield_knight: { faction: 'iron', epithet: 'Plate, scars and a blade that never sheathes.' },
  thornbow_archer: { faction: 'grave', epithet: 'Masked hunters. They never miss twice.' },
  field_medic: { faction: 'grave', epithet: 'His cures burn. Nobody refuses them.' },
  wolf_rider: { faction: 'wild', epithet: 'The warg is hungrier than its rider.' },
  powder_bombardier: { faction: 'ash', epithet: 'Black powder, short fuses, no regrets.' },
  ember_mage: { faction: 'ash', epithet: 'Where it speaks, the ground turns to cinder.' },
  hawkeye_ranger: { faction: 'iron', epithet: 'One bolt. One less captain.' },
  dawn_paladin: { faction: 'blood', epithet: 'The oath broke. The faith did not.' },
  bastion_golem: { faction: 'ash', epithet: 'Carved from a dead volcano, woken with blood.' },
  frost_witch: { faction: 'frost', epithet: 'Her touch stops hearts, then rivers.' },
  aegis_guardian: { faction: 'iron', epithet: 'A wall of iron that walks.' },
  shade_assassin: { faction: 'blood', epithet: 'You only see the hooks.' },
  storm_adept: { faction: 'storm', epithet: 'He bargained with the sky and won.' },
  phoenix_warden: { faction: 'ash', epithet: 'It burns, dies, and burns again.' },
  aurora_drake: { faction: 'void', epithet: 'Born where the stars went out.' },
};

/** Card frame treatment per rarity (forged metals, not candy colours). */
export const RARITY_FRAME: Record<'common' | 'rare' | 'epic' | 'legendary' | 'mythic', { metal: string; edge: string; accent: string; glow: string }> = {
  common: { metal: '#3b3e43', edge: '#7c8188', accent: '#9aa0a6', glow: 'transparent' },
  rare: { metal: '#2b3540', edge: '#6f8aa6', accent: '#8fb2d4', glow: 'rgba(110,150,200,0.25)' },
  epic: { metal: '#2e2433', edge: '#8a5a9e', accent: '#b98ad0', glow: 'rgba(150,80,190,0.3)' },
  legendary: { metal: '#2f2717', edge: '#b08d43', accent: '#e0bd6a', glow: 'rgba(224,170,80,0.35)' },
  mythic: { metal: '#1a0d0e', edge: '#b3232b', accent: '#e8d9bd', glow: 'rgba(200,30,40,0.45)' },
};
