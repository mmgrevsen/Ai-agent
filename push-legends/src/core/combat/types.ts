import type { Difficulty } from '../config/balance';
import type { ItemEffect } from '../data/equipment';
import type { PetActive } from '../data/pets';
import type { AbilityDef, BossDef, CardDef, DamageType, EnemyRole, TargetPriority, UnitRole } from '../data/types';

export type BattleMode = 'campaign' | 'dungeon' | 'endless' | 'blitz' | 'weekly' | 'challenge';

export type EnemySpawn =
  | { kind: 'enemy'; role: EnemyRole; elite: boolean }
  | { kind: 'boss'; bossId: string; tier: 1 | 2 };

export interface WaveDef {
  spawns: EnemySpawn[];
  isBossWave: boolean;
}

export interface DeckCardSpec {
  def: CardDef;
  level: number;
  hp: number;
  damage: number;
}

export interface HeroSpec {
  hp: number;
  damage: number;
  attackInterval: number;
  critChance: number;
  bossDamage: number;
  armyDamage: number;
  armyHp: number;
  repPower: number;
  specialCharge: number;
  effects: ItemEffect[];
  petActive: { def: PetActive; power: number } | null;
  cape: string;
  aura: string;
}

export type BattleModifierId = 'swift_foes' | 'iron_skin' | 'sky_raid' | 'glass_cannon' | 'elite_surge' | 'rally';

export interface BattleModifierDef {
  id: BattleModifierId;
  name: string;
  text: string;
}

export const BATTLE_MODIFIERS: Record<BattleModifierId, BattleModifierDef> = {
  swift_foes: { id: 'swift_foes', name: 'Swift Foes', text: 'Enemies move 35% faster.' },
  iron_skin: { id: 'iron_skin', name: 'Iron Skin', text: 'Enemies gain +20% armor. Bring fire, lightning or bombs.' },
  sky_raid: { id: 'sky_raid', name: 'Sky Raid', text: 'Many enemies are flying.' },
  glass_cannon: { id: 'glass_cannon', name: 'Glass Cannon', text: 'Everyone deals +50% damage.' },
  elite_surge: { id: 'elite_surge', name: 'Elite Surge', text: 'Elite enemies appear far more often.' },
  rally: { id: 'rally', name: 'Rally', text: 'Start with full valor and +2 valor per push-up.' },
};

export interface BattleSetup {
  mode: BattleMode;
  label: string;
  seed: number;
  world: number;
  /** Global stage index used for reward scaling. */
  stageIndex: number;
  difficulty: Difficulty;
  difficultyMult: number;
  rewardMult: number;
  waves: WaveDef[];
  startWave: number;
  /** Generate waves forever (endless, blitz, weekly). */
  endless: boolean;
  endlessGrowth: number;
  timeLimit: number;
  deck: DeckCardSpec[];
  hero: HeroSpec;
  modifiers: BattleModifierId[];
  restBuff: number;
  autoDeploy: boolean;
  exerciseMode: 'full' | 'knee' | null;
}

export interface Unit {
  id: number;
  side: 'ally' | 'enemy';
  kind: 'hero' | 'card' | 'enemy' | 'boss';
  defId: string;
  name: string;
  role: UnitRole | EnemyRole | 'hero' | 'boss';
  elite: boolean;
  bossTier: 0 | 1 | 2;
  x: number;
  lane: number;
  size: number;
  hp: number;
  maxHp: number;
  shield: number;
  shieldUntil: number;
  damage: number;
  attackInterval: number;
  attackCd: number;
  range: number;
  speed: number;
  armor: number;
  flying: boolean;
  targetsGround: boolean;
  targetsAir: boolean;
  damageType: DamageType;
  resist: Partial<Record<DamageType, number>>;
  priority: TargetPriority;
  ability: AbilityDef;
  abilityTimer: number;
  slowMult: number;
  slowUntil: number;
  burnDps: number;
  burnUntil: number;
  stunUntil: number;
  hasteMult: number;
  hasteUntil: number;
  targetId: number | null;
  lastHitTargetId: number | null;
  rebirthUsed: boolean;
  goldValue: number;
  xpValue: number;
  dead: boolean;
  lastAttackAt: number;
  lastHitAt: number;
  spawnedAt: number;
  cardIndex: number | null;
  boss: BossRuntime | null;
}

export interface BossRuntime {
  def: BossDef;
  phaseIndex: number;
  abilityCds: number[];
  castingUntil: number;
  baseResist: Partial<Record<DamageType, number>>;
  baseAttackInterval: number;
  baseDamage: number;
}

export interface Telegraph {
  id: number;
  sourceId: number;
  kind: 'slam' | 'breath' | 'meteor' | 'summon' | 'shield' | 'drain' | 'volley';
  x0: number;
  x1: number;
  createdAt: number;
  resolveAt: number;
  damage: number;
  slow: number;
  healPct: number;
  summon: { role: EnemyRole; count: number } | null;
  shieldAmount: number;
  shieldDuration: number;
}

export type BattleEvent =
  | { type: 'damage'; targetId: number; amount: number; crit: boolean; damageType: DamageType; x: number; side: 'ally' | 'enemy' }
  | { type: 'heal'; targetId: number; amount: number; x: number }
  | { type: 'attack'; sourceId: number; targetId: number; ranged: boolean; damageType: DamageType; fromX: number; toX: number; fromFlying: boolean; toFlying: boolean }
  | { type: 'death'; unitId: number; x: number; side: 'ally' | 'enemy'; gold: number; flying: boolean }
  | { type: 'spawn'; unitId: number; side: 'ally' | 'enemy' }
  | { type: 'deploy'; cardId: string; x: number }
  | { type: 'waveStart'; wave: number; total: number; boss: boolean }
  | { type: 'waveCleared'; wave: number }
  | { type: 'telegraph'; telegraph: Telegraph }
  | { type: 'telegraphResolved'; telegraphId: number; kind: Telegraph['kind']; x0: number; x1: number }
  | { type: 'interrupt'; bossName: string; x: number }
  | { type: 'phase'; bossName: string; phaseName: string; message: string }
  | { type: 'bossSpawn'; bossId: string; name: string; title: string; tier: 1 | 2 }
  | { type: 'special'; x0: number; x1: number; hits: number }
  | { type: 'warCry' }
  | { type: 'rep'; kind: 'full' | 'knee'; verified: boolean; valor: number }
  | { type: 'splash'; x: number; radius: number; damageType: DamageType }
  | { type: 'chain'; points: { x: number; flying: boolean }[] }
  | { type: 'rebirth'; unitId: number; x: number }
  | { type: 'shieldGranted'; x: number; radius: number }
  | { type: 'petAbility'; kind: PetActive['kind']; x: number; radius: number }
  | { type: 'end'; outcome: BattleOutcome };

export type BattleOutcome = 'victory' | 'defeat' | 'timeout' | 'retreat' | 'complete';

export interface BattleAnalysis {
  heroDamageTakenByRole: Record<string, number>;
  flyingReachedHero: number;
  armoredKills: number;
  maxEnemiesAlive: number;
  killedByBoss: boolean;
  deckHasAntiAir: boolean;
  deckHasTank: boolean;
  deckHasSplash: boolean;
  deckHasHealer: boolean;
  averageCardLevel: number;
  timeWithFullValor: number;
}

export interface BattleResult {
  mode: BattleMode;
  label: string;
  outcome: BattleOutcome;
  stageIndex: number;
  difficulty: Difficulty;
  wavesCleared: number;
  totalWaves: number;
  reachedBoss: boolean;
  bossDefeated: boolean;
  bossIds: string[];
  bossPhasesCleared: number;
  bossTotalPhases: number;
  bossHpFraction: number;
  enemiesDefeated: number;
  elitesDefeated: number;
  goldEarned: number;
  xpEarned: number;
  duration: number;
  reps: { full: number; knee: number; simulated: number; repUnits: number };
  specialsUsed: number;
  interrupts: number;
  warCries: number;
  cardsDeployed: number;
  score: number;
  analysis: BattleAnalysis;
}
