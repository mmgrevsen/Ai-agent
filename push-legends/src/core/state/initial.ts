import { STARTER_CARDS } from '../content/cards';
import { STARTER_COSMETICS } from '../content/cosmetics';
import type { BuildingId } from '../content/buildings';
import { BUILDINGS } from '../content/buildings';
import { Rng } from '../rng';
import { dayKey } from '../util';
import { SAVE_VERSION, type BuildingState, type GameState } from './types';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateFriendCode(seed: number): string {
  const rng = new Rng(seed);
  const part = () => Array.from({ length: 4 }, () => rng.pick(CODE_ALPHABET.split(''))).join('');
  return `PL-${part()}-${part()}`;
}

export function createInitialState(now: number, seed = Math.floor(Math.random() * 2 ** 31)): GameState {
  const buildings = Object.fromEntries(
    BUILDINGS.map((b) => [b.id, { level: b.id === 'castle' || b.id === 'gold_mine' ? 1 : 0, upgradeEndsAt: null }]),
  ) as Record<BuildingId, BuildingState>;

  const starterBlade = { uid: 'item_starter_blade', defId: 'recruit_blade', level: 1, stars: 0 };
  const starterCap = { uid: 'item_starter_cap', defId: 'leather_cap', level: 1, stars: 0 };

  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSeenAt: now,
    maxSeenAt: now,
    profile: {
      name: 'Hero',
      friendCode: generateFriendCode(seed),
      privacy: 'friends',
      title: 'Recruit',
      devAssisted: false,
    },
    resources: { gold: 150, gems: 20, ore: 5, petTreats: 0, glory: 0 },
    hero: {
      level: 1,
      xp: 0,
      equipped: { weapon: starterBlade.uid, helmet: starterCap.uid, chest: null, gloves: null, boots: null, relic: null },
      cape: 'cape_crimson',
      aura: 'aura_none',
      cosmetics: [...STARTER_COSMETICS],
    },
    cards: Object.fromEntries(STARTER_CARDS.map((id) => [id, { level: 1, fragments: 0 }])),
    deck: [...STARTER_CARDS],
    items: [starterBlade, starterCap],
    pets: {},
    activePet: null,
    buildings,
    mine: { lastCollectedAt: now },
    idle: { lastClaimAt: now },
    progress: {
      highestCleared: -1,
      selectedStage: 0,
      bossesDefeated: [],
      bossCheckpoints: [],
      heroicCleared: [],
      endlessBest: 0,
      blitzBest: 0,
      weekly: { weekKey: '', best: 0 },
      dungeonRunsToday: { day: dayKey(now), count: 0 },
    },
    dungeon: null,
    quests: { dailyKey: '', weeklyKey: '', daily: [], weekly: [], rerollsLeft: 1 },
    achievements: {},
    stats: {
      verifiedFullReps: 0,
      verifiedKneeReps: 0,
      simulatedReps: 0,
      enemiesDefeated: 0,
      battlesPlayed: 0,
      battlesWon: 0,
      bossesDefeated: 0,
      specialsUsed: 0,
      interrupts: 0,
      warCries: 0,
      goldEarned: 0,
      dungeonsCompleted: 0,
      exerciseDays: [],
      repsToday: { day: dayKey(now), count: 0 },
    },
    streak: { count: 0, lastDay: null, restTokens: 1, best: 0 },
    settings: {
      masterVolume: 0.8,
      musicVolume: 0.4,
      sfxVolume: 0.8,
      haptics: true,
      reducedMotion: typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      largeText: false,
      graphics: 'smooth',
      graphicsChosen: false,
      devTools: false,
      exerciseMode: 'full',
      useCamera: false,
      cameraPlacement: 'side',
      showSkeleton: true,
      calibration: {},
      autoDeploy: false,
      autoDeployOptIn: false,
      cameraPrivacyAccepted: false,
    },
    social: { online: { server: '', token: '', username: '' }, friends: [], blocked: [], challenges: [] },
    tutorial: {},
    pendingChests: [],
    shop: { day: '', purchased: [] },
  };
}
