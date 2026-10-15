export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

export type DamageType = 'physical' | 'fire' | 'frost' | 'lightning' | 'holy';
export type UnitRole = 'tank' | 'melee' | 'ranged' | 'area' | 'support' | 'assassin';
export type TargetPriority = 'nearest' | 'flyingFirst' | 'lowestHp' | 'priority' | 'armored' | 'groups';

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
}

export type AbilityDef =
  | { kind: 'none' }
  | { kind: 'antiAir'; bonus: number }
  | { kind: 'taunt'; radius: number }
  | { kind: 'splashBurn'; radius: number; burnFraction: number; burnSec: number }
  | { kind: 'bossBreaker'; bonus: number }
  | { kind: 'healAura'; radius: number; healPctPerSec: number; damageBuff: number }
  | { kind: 'priorityShot'; critChance: number; critMult: number }
  | { kind: 'frostNova'; radius: number; slow: number; slowSec: number }
  | { kind: 'execute'; threshold: number; mult: number; leapRange: number }
  | { kind: 'shieldAllies'; radius: number; shieldPct: number; interval: number }
  | { kind: 'chain'; jumps: number; falloff: number; jumpRange: number }
  | { kind: 'heal'; healMult: number }
  | { kind: 'charge'; firstHitMult: number }
  | { kind: 'armorBreak'; bonusVsArmored: number; splashRadius: number }
  | { kind: 'rebirth'; hpPct: number; splashRadius: number }
  | { kind: 'auroraBreath'; hasteBuff: number; hasteSec: number; interval: number };

export type CardUnlock =
  | { kind: 'start' }
  | { kind: 'stage'; world: number; stage: number };

export interface CardDef {
  id: string;
  name: string;
  rarity: Rarity;
  role: UnitRole;
  cost: number;
  /** Units spawned per deploy. */
  count: number;
  hp: number;
  damage: number;
  attackInterval: number;
  range: number;
  speed: number;
  damageType: DamageType;
  targetsGround: boolean;
  targetsAir: boolean;
  flying: boolean;
  /** Fraction of physical damage ignored. */
  armor: number;
  priority: TargetPriority;
  ability: AbilityDef;
  abilityName: string;
  abilityText: string;
  description: string;
  synergies: string[];
  weaknesses: string[];
  unlock: CardUnlock;
  palette: Palette;
}

export type EnemyRole = 'normal' | 'ranged' | 'fast' | 'armored' | 'flying';
export const ENEMY_ROLES: readonly EnemyRole[] = ['normal', 'ranged', 'fast', 'armored', 'flying'];

export interface EnemyRoleStats {
  hp: number;
  damage: number;
  attackInterval: number;
  range: number;
  speed: number;
  armor: number;
  flying: boolean;
  goldWeight: number;
}

export type BossAbility =
  | { kind: 'slam'; cooldown: number; telegraph: number; width: number; damageMult: number }
  | { kind: 'summon'; cooldown: number; telegraph: number; role: EnemyRole; count: number }
  | { kind: 'breath'; cooldown: number; telegraph: number; length: number; damageMult: number; slow: number }
  | { kind: 'meteor'; cooldown: number; telegraph: number; count: number; radius: number; damageMult: number }
  | { kind: 'shield'; cooldown: number; telegraph: number; amountPct: number; duration: number }
  | { kind: 'drain'; cooldown: number; telegraph: number; damageMult: number; healPct: number; length: number }
  | { kind: 'volley'; cooldown: number; telegraph: number; damageMult: number; radius: number };

export interface BossPhase {
  /** Phase becomes active when HP fraction drops to or below this value. */
  threshold: number;
  name: string;
  message: string;
  abilities: BossAbility[];
  attackSpeedMult: number;
  damageMult: number;
  resist?: Partial<Record<DamageType, number>>;
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  hp: number;
  damage: number;
  attackInterval: number;
  range: number;
  speed: number;
  size: number;
  armor: number;
  flying: boolean;
  resist: Partial<Record<DamageType, number>>;
  phases: BossPhase[];
  palette: Palette;
  sprite: string;
  lore: string;
  hint: string;
}

export interface WorldDef {
  id: string;
  index: number;
  name: string;
  theme: string;
  description: string;
  sky: [string, string];
  ground: string;
  groundDark: string;
  accent: string;
  enemyNames: Record<EnemyRole, string>;
  enemyPalette: Palette;
  /** Resistance (positive) or weakness (negative) per damage type for this world's enemies. */
  resist: Partial<Record<DamageType, number>>;
  /** Which roles appear from which stage (1-based). */
  roleUnlockStage: Record<EnemyRole, number>;
  eliteFromStage: number;
  miniBoss: BossDef;
  boss: BossDef;
}
