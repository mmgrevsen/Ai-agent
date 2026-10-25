import type { Difficulty } from '../config/balance';
import type { BuildingId } from '../content/buildings';
import type { EquipSlot } from '../content/equipment';
import type { ChestKind, Reward } from '../content/quests';

export const SAVE_VERSION = 1;

export type ExerciseMode = 'full' | 'knee';
export type CameraPlacement = 'side' | 'front';

export interface CardProgress {
  level: number;
  fragments: number;
}

export interface ItemInstance {
  uid: string;
  defId: string;
  level: number;
  stars: number;
}

export interface PetProgress {
  level: number;
  stars: number;
}

export interface BuildingState {
  level: number;
  /** Epoch ms when the in-progress upgrade finishes, or null. */
  upgradeEndsAt: number | null;
}

export interface QuestInstance {
  templateId: string;
  target: number;
  progress: number;
  claimed: boolean;
  reward: Reward;
}

export interface Calibration {
  topAngle: number;
  bottomAngle: number;
  calibratedAt: number;
}

export interface LocalFriend {
  code: string;
  name: string;
  addedAt: number;
  note: string;
  bestChallengeScore?: number;
}

export interface ChallengeRecord {
  code: string;
  fromName: string;
  mode: 'blitz' | 'endless';
  theirScore: number;
  myBest: number | null;
  receivedAt: number;
}

export interface DungeonNode {
  id: string;
  floor: number;
  kind: 'battle' | 'swarm' | 'elite' | 'rest' | 'treasure' | 'cards' | 'boss';
  next: string[];
}

export interface DungeonRun {
  seed: number;
  world: number;
  nodes: DungeonNode[];
  currentNodeId: string | null;
  visited: string[];
  /** Rewards banked so far. They are applied immediately when each room is cleared. */
  banked: Reward & { fragments?: number };
  restBuff: number;
  fullRewards: boolean;
  startedAt: number;
}

export interface GameStats {
  verifiedFullReps: number;
  verifiedKneeReps: number;
  simulatedReps: number;
  enemiesDefeated: number;
  battlesPlayed: number;
  battlesWon: number;
  bossesDefeated: number;
  specialsUsed: number;
  interrupts: number;
  warCries: number;
  goldEarned: number;
  dungeonsCompleted: number;
  exerciseDays: string[];
  repsToday: { day: string; count: number };
  /** Most verified push-ups in one battle (drives the stage requirement and the training goals). */
  bestBattleReps: number;
  /** Verified push-ups per day (newest last, at most a year), for the training history and progress. */
  repLog: RepDay[];
}

export interface RepDay {
  day: string;
  full: number;
  knee: number;
  /** Most push-ups in one battle that day. */
  best: number;
  /** Battles with at least one push-up that day. */
  sets: number;
}

export interface StreakState {
  count: number;
  lastDay: string | null;
  restTokens: number;
  best: number;
}

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  haptics: boolean;
  reducedMotion: boolean;
  /** 3D views: 'pixel' renders at 256 px height with hard pixel edges, 'smooth' at full resolution. */
  graphics: 'pixel' | 'smooth';
  /** True once the player picked a graphics style themselves (otherwise the default applies). */
  graphicsChosen: boolean;
  largeText: boolean;
  devTools: boolean;
  exerciseMode: ExerciseMode;
  useCamera: boolean;
  cameraPlacement: CameraPlacement;
  showSkeleton: boolean;
  calibration: Partial<Record<ExerciseMode, Calibration>>;
  autoDeploy: boolean;
  /**
   * Start every battle with auto-deploy on. Only the Settings / pre-battle switch sets this; the AUTO
   * button inside a battle affects that battle only.
   */
  autoDeployOptIn: boolean;
  cameraPrivacyAccepted: boolean;
  /** Body weight in kg for the calorie estimate (the player can change it). */
  bodyWeightKg: number;
}

export interface Progress {
  /** Highest cleared global stage index (world * 10 + stage - 1), or -1. */
  highestCleared: number;
  /** Stage the player has selected on the map (global index). */
  selectedStage: number;
  bossesDefeated: string[];
  /** Stages where the player reached the boss; they may start straight at the boss. */
  bossCheckpoints: number[];
  heroicCleared: number[];
  endlessBest: number;
  blitzBest: number;
  weekly: { weekKey: string; best: number };
  dungeonRunsToday: { day: string; count: number };
}

export interface GameState {
  version: number;
  createdAt: number;
  lastSeenAt: number;
  /** Highest timestamp ever observed, used to reject device clocks moved backwards. */
  maxSeenAt: number;
  profile: {
    name: string;
    friendCode: string;
    privacy: 'public' | 'friends' | 'private';
    title: string;
    /** Set once developer shortcuts are used; shared challenge codes are then marked "assisted". */
    devAssisted: boolean;
  };
  resources: {
    gold: number;
    gems: number;
    ore: number;
    petTreats: number;
    glory: number;
  };
  hero: {
    level: number;
    xp: number;
    equipped: Record<EquipSlot, string | null>;
    cape: string;
    aura: string;
    cosmetics: string[];
  };
  cards: Record<string, CardProgress>;
  deck: string[];
  items: ItemInstance[];
  pets: Record<string, PetProgress>;
  activePet: string | null;
  buildings: Record<BuildingId, BuildingState>;
  mine: { lastCollectedAt: number };
  /** Idle army income accrues from this timestamp until claimed. */
  idle: { lastClaimAt: number };
  progress: Progress;
  dungeon: DungeonRun | null;
  quests: {
    dailyKey: string;
    weeklyKey: string;
    daily: QuestInstance[];
    weekly: QuestInstance[];
    rerollsLeft: number;
  };
  achievements: Record<string, number>;
  stats: GameStats;
  streak: StreakState;
  settings: Settings;
  social: {
    /**
     * Login on the friend server. `token` empty = logged out (the game shows the login screen);
     * `username` is the account that last used this device (it owns the local save).
     */
    online: { server: string; token: string; username: string };
    friends: LocalFriend[];
    blocked: string[];
    challenges: ChallengeRecord[];
  };
  tutorial: Record<string, boolean>;
  pendingChests: ChestKind[];
  shop: { day: string; purchased: string[] };
}

export type { Difficulty };
