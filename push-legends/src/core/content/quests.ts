/** Gameplay events emitted by systems. Quests and achievements subscribe to these. */
export type GameEventType =
  | 'enemyDefeated'
  | 'battleWon'
  | 'battlePlayed'
  | 'bossDefeated'
  | 'verifiedRep'
  | 'specialUsed'
  | 'warCry'
  | 'cardDeployed'
  | 'cardUpgraded'
  | 'buildingUpgraded'
  | 'itemUpgraded'
  | 'mineCollected'
  | 'dungeonRoomCleared'
  | 'chestOpened'
  | 'endlessWave'
  | 'interrupt';

export interface GameEvent {
  type: GameEventType;
  amount: number;
}

export interface Reward {
  gold?: number;
  gems?: number;
  ore?: number;
  petTreats?: number;
  glory?: number;
  heroXp?: number;
  chest?: ChestKind;
}

export type ChestKind = 'wooden' | 'silver' | 'gold' | 'legend';

export interface QuestTemplate {
  id: string;
  event: GameEventType;
  /** Target amount; scaled lightly by player progress for non-exercise quests. */
  target: number;
  text: (target: number) => string;
  /** Rewards expressed in "stage seconds" of gold plus fixed extras (see systems/quests.ts). */
  goldSeconds: number;
  extra: Omit<Reward, 'gold'>;
  exercise?: boolean;
  scales?: boolean;
}

export const DAILY_QUESTS: readonly QuestTemplate[] = [
  { id: 'd_slay', event: 'enemyDefeated', target: 60, scales: true, text: (n) => `Defeat ${n} enemies`, goldSeconds: 90, extra: { heroXp: 40 } },
  { id: 'd_win', event: 'battleWon', target: 3, text: (n) => `Win ${n} battles`, goldSeconds: 90, extra: { ore: 3 } },
  { id: 'd_deploy', event: 'cardDeployed', target: 25, text: (n) => `Deploy ${n} cards`, goldSeconds: 70, extra: { heroXp: 30 } },
  { id: 'd_special', event: 'specialUsed', target: 3, text: (n) => `Unleash your Legend Strike ${n} times`, goldSeconds: 70, extra: { petTreats: 3 } },
  { id: 'd_upgrade', event: 'cardUpgraded', target: 1, text: () => 'Upgrade any card', goldSeconds: 60, extra: { gems: 3 } },
  { id: 'd_mine', event: 'mineCollected', target: 2, text: (n) => `Collect from the Gold Mine ${n} times`, goldSeconds: 50, extra: { ore: 2 } },
  { id: 'd_reps', event: 'verifiedRep', target: 20, exercise: true, text: (n) => `Do ${n} verified push-ups (any mode)`, goldSeconds: 120, extra: { gems: 5, heroXp: 60 } },
  { id: 'd_warcry', event: 'warCry', target: 1, exercise: true, text: () => 'Trigger a War Cry in battle', goldSeconds: 80, extra: { petTreats: 4 } },
  { id: 'd_dungeon', event: 'dungeonRoomCleared', target: 2, text: (n) => `Clear ${n} dungeon rooms`, goldSeconds: 90, extra: { ore: 4 } },
  { id: 'd_interrupt', event: 'interrupt', target: 1, text: () => 'Interrupt a boss attack with your Legend Strike', goldSeconds: 80, extra: { gems: 3 } },
];

export const WEEKLY_QUESTS: readonly QuestTemplate[] = [
  { id: 'w_slay', event: 'enemyDefeated', target: 700, scales: true, text: (n) => `Defeat ${n} enemies`, goldSeconds: 600, extra: { chest: 'silver' } },
  { id: 'w_win', event: 'battleWon', target: 20, text: (n) => `Win ${n} battles`, goldSeconds: 600, extra: { gems: 15 } },
  { id: 'w_boss', event: 'bossDefeated', target: 3, text: (n) => `Defeat ${n} bosses or mini-bosses (any mode)`, goldSeconds: 600, extra: { chest: 'silver' } },
  { id: 'w_reps', event: 'verifiedRep', target: 100, exercise: true, text: (n) => `Do ${n} verified push-ups this week`, goldSeconds: 800, extra: { chest: 'gold' } },
  { id: 'w_build', event: 'buildingUpgraded', target: 4, text: (n) => `Upgrade buildings ${n} times`, goldSeconds: 500, extra: { gems: 15 } },
  { id: 'w_endless', event: 'endlessWave', target: 25, text: (n) => `Clear ${n} Endless Siege waves in total`, goldSeconds: 600, extra: { ore: 15 } },
  { id: 'w_gear', event: 'itemUpgraded', target: 5, text: (n) => `Upgrade gear ${n} times`, goldSeconds: 500, extra: { ore: 10 } },
];

export type AchievementMetric =
  | 'enemiesDefeated'
  | 'bossesDefeated'
  | 'verifiedReps'
  | 'exerciseDays'
  | 'cardsOwned'
  | 'buildingLevels'
  | 'stagesCleared'
  | 'endlessBest'
  | 'interrupts'
  | 'warCries'
  | 'heroLevel'
  | 'dungeonsCompleted';

export interface AchievementDef {
  id: string;
  name: string;
  metric: AchievementMetric;
  tiers: number[];
  text: (target: number) => string;
  category: 'combat' | 'exercise' | 'collection' | 'building' | 'story' | 'strategy';
  /** Cosmetic unlocked when the final tier is claimed. */
  cosmetic?: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'slayer', name: 'Monster Slayer', metric: 'enemiesDefeated', tiers: [100, 1000, 5000, 20000, 75000], text: (n) => `Defeat ${n} enemies`, category: 'combat', cosmetic: 'aura_crimson' },
  { id: 'boss_hunter', name: 'Boss Hunter', metric: 'bossesDefeated', tiers: [1, 5, 15, 40], text: (n) => `Defeat ${n} bosses`, category: 'combat', cosmetic: 'cape_royal' },
  { id: 'push_legend', name: 'Push-up Legend', metric: 'verifiedReps', tiers: [25, 150, 500, 1500, 5000], text: (n) => `Complete ${n} verified push-ups`, category: 'exercise', cosmetic: 'aura_gold' },
  { id: 'consistency', name: 'Steady Training', metric: 'exerciseDays', tiers: [2, 5, 12, 30, 75], text: (n) => `Exercise on ${n} different days`, category: 'exercise', cosmetic: 'cape_dawn' },
  { id: 'collector', name: 'Card Collector', metric: 'cardsOwned', tiers: [6, 9, 12, 15], text: (n) => `Own ${n} different cards`, category: 'collection' },
  { id: 'architect', name: 'Master Architect', metric: 'buildingLevels', tiers: [10, 30, 60, 100], text: (n) => `Reach ${n} total building levels`, category: 'building', cosmetic: 'cape_stone' },
  { id: 'explorer', name: 'World Explorer', metric: 'stagesCleared', tiers: [10, 20, 30, 40, 50], text: (n) => `Clear ${n} campaign stages`, category: 'story', cosmetic: 'aura_crystal' },
  { id: 'endless', name: 'Siege Breaker', metric: 'endlessBest', tiers: [10, 20, 35, 50], text: (n) => `Reach wave ${n} in Endless Siege`, category: 'strategy' },
  { id: 'interrupter', name: 'Perfect Timing', metric: 'interrupts', tiers: [1, 10, 40], text: (n) => `Interrupt ${n} boss attacks`, category: 'strategy', cosmetic: 'aura_storm' },
  { id: 'war_cries', name: 'Voice of the Army', metric: 'warCries', tiers: [1, 10, 50, 150], text: (n) => `Trigger ${n} War Cries`, category: 'exercise' },
  { id: 'hero_level', name: 'Rising Hero', metric: 'heroLevel', tiers: [5, 15, 30, 50], text: (n) => `Reach hero level ${n}`, category: 'story' },
  { id: 'delver', name: 'Dungeon Delver', metric: 'dungeonsCompleted', tiers: [1, 5, 20], text: (n) => `Complete ${n} dungeon runs`, category: 'strategy' },
];

export function achievementReward(tierIndex: number): Reward {
  return { gems: 10 + tierIndex * 10, gold: 0, heroXp: 50 * (tierIndex + 1) };
}
