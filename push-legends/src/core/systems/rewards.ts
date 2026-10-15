import { BALANCE } from '../config/balance';
import type { Reward } from '../data/quests';
import type { GameState } from '../state/types';

/** Adds a reward to the player's resources. Rewards are always non-negative; this never removes anything. */
export function grantReward(state: GameState, reward: Reward): void {
  const add = (v: number | undefined) => Math.max(0, Math.floor(v ?? 0));
  state.resources.gold += add(reward.gold);
  state.resources.gems += add(reward.gems);
  state.resources.ore += add(reward.ore);
  state.resources.petTreats += add(reward.petTreats);
  state.resources.glory += add(reward.glory);
  state.stats.goldEarned += add(reward.gold);
  if (reward.chest) state.pendingChests.push(reward.chest);
  if (reward.heroXp) addHeroXpRaw(state, add(reward.heroXp));
}

export function mergeRewards(a: Reward, b: Reward): Reward {
  const sum = (x?: number, y?: number) => (x ?? 0) + (y ?? 0) || undefined;
  return {
    gold: sum(a.gold, b.gold),
    gems: sum(a.gems, b.gems),
    ore: sum(a.ore, b.ore),
    petTreats: sum(a.petTreats, b.petTreats),
    glory: sum(a.glory, b.glory),
    heroXp: sum(a.heroXp, b.heroXp),
    chest: a.chest ?? b.chest,
  };
}

/** Hero XP lives here (not in hero.ts) to avoid an import cycle. */
export function xpToNextLevel(level: number): number {
  return Math.round(BALANCE.hero.xpToLevelBase * Math.pow(BALANCE.hero.xpToLevelGrowth, level - 1));
}

export function addHeroXpRaw(state: GameState, xp: number): number {
  let levelsGained = 0;
  state.hero.xp += Math.max(0, xp);
  while (state.hero.level < BALANCE.hero.maxLevel && state.hero.xp >= xpToNextLevel(state.hero.level)) {
    state.hero.xp -= xpToNextLevel(state.hero.level);
    state.hero.level += 1;
    levelsGained++;
  }
  if (state.hero.level >= BALANCE.hero.maxLevel) state.hero.xp = Math.min(state.hero.xp, xpToNextLevel(state.hero.level));
  return levelsGained;
}
