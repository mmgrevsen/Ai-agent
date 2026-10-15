import { BALANCE, type Difficulty } from '../config/balance';
import { STAGES_PER_WORLD, TOTAL_STAGES } from '../data/worlds';

/** Global stage index: world 0 stage 1 → 0, world 1 stage 1 → 10. */
export const stageIndex = (world: number, stage: number) => world * STAGES_PER_WORLD + (stage - 1);
export const stageFromIndex = (index: number) => ({
  world: Math.floor(index / STAGES_PER_WORLD),
  stage: (index % STAGES_PER_WORLD) + 1,
});
export const isValidStage = (index: number) => Number.isInteger(index) && index >= 0 && index < TOTAL_STAGES;

/** Multiplier applied to enemy health and damage. */
export function difficultyMultiplier(index: number, difficulty: Difficulty = 'normal'): number {
  const { world } = stageFromIndex(index);
  return Math.pow(BALANCE.difficulty.stageGrowth, index) * Math.pow(BALANCE.difficulty.worldStep, world) * BALANCE.difficulty[difficulty].power;
}

export function rewardMultiplier(difficulty: Difficulty): number {
  return BALANCE.difficulty[difficulty].rewards;
}

export function killGold(index: number, goldWeight = 1): number {
  return BALANCE.economy.killGoldBase * Math.pow(BALANCE.economy.killGoldGrowth, index) * goldWeight;
}

export function stageClearGold(index: number): number {
  return Math.round(BALANCE.economy.stageClearGoldBase * Math.pow(BALANCE.economy.killGoldGrowth, index));
}

export function stageClearXp(index: number): number {
  return Math.round(BALANCE.economy.stageXpBase * Math.pow(BALANCE.economy.stageXpGrowth, index));
}

/**
 * Approximate gold per second of active campaign play at a stage. Used as the common unit for
 * idle income, quest rewards and rep gold, so all of them scale together with progression.
 */
export function goldRatePerSecond(index: number): number {
  const i = Math.max(0, index);
  return killGold(i) * 0.8 + stageClearGold(i) / 75;
}

/** Index used for reward scaling: the next stage the player is working on. */
export function progressIndex(highestCleared: number): number {
  return Math.min(TOTAL_STAGES - 1, Math.max(0, highestCleared + 1));
}
