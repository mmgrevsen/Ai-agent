import { BALANCE } from '../config/balance';
import type { BuildingId } from '../data/buildings';
import { BUILDING_EFFECTS } from '../data/buildings';
import type { Reward } from '../data/quests';
import type { GameState } from '../state/types';
import { completeBuildingUpgrades, mineStored } from './buildings';
import { upgradeableCards } from './cards';
import { goldRatePerSecond } from './economy';
import { computeHeroStats } from './hero';
import { grantReward } from './rewards';

export function idleCapHours(state: GameState): number {
  return Math.min(BALANCE.idle.maxCapHours, BALANCE.idle.baseCapHours + BUILDING_EFFECTS.treasuryOfflineHours(state.buildings.treasury.level) * BALANCE.idle.capHoursPerTreasuryLevel);
}

/** Gold per second the army earns while idle, before diminishing returns. */
export function idleGoldRate(state: GameState): number {
  const hero = computeHeroStats(state);
  const best = state.progress.highestCleared;
  const base = best < 0 ? goldRatePerSecond(0) * 0.5 : goldRatePerSecond(best);
  return base * BALANCE.idle.armyIncomeFraction * hero.offlineBonus * hero.goldBonus;
}

/**
 * Converts real elapsed seconds into credited seconds: full rate for the first hours, a reduced rate
 * afterwards, and nothing beyond the cap. This prevents runaway rewards without punishing breaks.
 */
export function creditedSeconds(elapsedSec: number, capHours: number): number {
  const t = Math.max(0, Math.min(elapsedSec, capHours * 3600));
  const full = BALANCE.idle.fullRateHours * 3600;
  return Math.min(t, full) + Math.max(0, t - full) * BALANCE.idle.diminishedRate;
}

export interface IdleAccrual {
  elapsedSec: number;
  creditedSec: number;
  capped: boolean;
  gold: number;
  ore: number;
  enemiesDefeated: number;
}

export function idleAccrued(state: GameState, now: number): IdleAccrual {
  const elapsedSec = Math.max(0, (now - state.idle.lastClaimAt) / 1000);
  const cap = idleCapHours(state);
  const credited = creditedSeconds(elapsedSec, cap);
  return {
    elapsedSec,
    creditedSec: credited,
    capped: elapsedSec >= cap * 3600,
    gold: Math.floor(idleGoldRate(state) * credited),
    ore: Math.floor((credited / 3600) * BALANCE.idle.orePerHour),
    enemiesDefeated: Math.floor((credited / 60) * BALANCE.idle.enemiesPerMinute),
  };
}

export function claimIdle(state: GameState, now: number): IdleAccrual {
  const acc = idleAccrued(state, now);
  grantReward(state, { gold: acc.gold, ore: acc.ore });
  state.idle.lastClaimAt = Math.max(state.idle.lastClaimAt, now);
  return acc;
}

export interface OfflineReport {
  awaySec: number;
  idle: IdleAccrual;
  mineReady: number;
  buildingsCompleted: BuildingId[];
  returnBonus: Reward | null;
  upgradesAvailable: number;
  clockWarning: boolean;
}

/**
 * Called when the app opens or resumes. Handles device clock changes: time moved backwards is never
 * credited (and never removes anything), and future timestamps left by a wrong clock are re-anchored.
 */
export function processReturn(state: GameState, now: number): OfflineReport | null {
  let clockWarning = false;
  if (now < state.maxSeenAt - 5 * 60_000) {
    clockWarning = true;
    // Re-anchor timers that are in the future relative to the corrected clock so income resumes normally.
    if (state.idle.lastClaimAt > now) state.idle.lastClaimAt = now;
    if (state.mine.lastCollectedAt > now) state.mine.lastCollectedAt = now;
  }
  const awaySec = clockWarning ? 0 : Math.max(0, (now - state.lastSeenAt) / 1000);
  const buildingsCompleted = completeBuildingUpgrades(state, now);
  state.lastSeenAt = now;
  state.maxSeenAt = Math.max(state.maxSeenAt, now);

  if (awaySec < BALANCE.idle.minReportSeconds && !clockWarning) return null;
  let returnBonus: Reward | null = null;
  if (awaySec >= BALANCE.idle.returnBonusAfterHours * 3600) {
    returnBonus = { chest: awaySec >= 48 * 3600 ? 'silver' : 'wooden', gems: 5 };
    grantReward(state, returnBonus);
  }
  return {
    awaySec,
    idle: idleAccrued(state, now),
    mineReady: mineStored(state, now),
    buildingsCompleted,
    returnBonus,
    upgradesAvailable: upgradeableCards(state).length,
    clockWarning,
  };
}

/** Called periodically while the app is open. */
export function touch(state: GameState, now: number): BuildingId[] {
  if (now >= state.maxSeenAt - 5 * 60_000) {
    state.lastSeenAt = now;
    state.maxSeenAt = Math.max(state.maxSeenAt, now);
  }
  return completeBuildingUpgrades(state, now);
}
