import { BALANCE } from '../config/balance';
import { BUILDING_EFFECTS, BUILDINGS, getBuilding, type BuildingId } from '../content/buildings';
import type { GameState } from '../state/types';

export function buildingUpgradeCost(id: BuildingId, currentLevel: number): number {
  const def = getBuilding(id);
  return Math.round(def.costBase * Math.pow(def.costGrowth, currentLevel));
}

export function buildingUpgradeDuration(currentLevel: number): number {
  if (currentLevel <= 0) return 3;
  const b = BALANCE.buildings;
  return Math.round(Math.min(b.durationCapSec, b.durationBaseSec * Math.pow(b.durationGrowth, currentLevel - 1)));
}

export function buildingLevelCap(state: GameState, id: BuildingId): number {
  const def = getBuilding(id);
  if (id === 'castle') return Math.min(def.maxLevel, BUILDING_EFFECTS.castleMaxLevelForProgress(state.progress.highestCleared));
  return Math.min(def.maxLevel, BUILDING_EFFECTS.buildingCapFromCastle(state.buildings.castle.level));
}

export function activeUpgrades(state: GameState): BuildingId[] {
  return BUILDINGS.filter((b) => state.buildings[b.id].upgradeEndsAt !== null).map((b) => b.id);
}

export type BuildingCheck =
  | { ok: true; cost: number; duration: number }
  | { ok: false; reason: 'locked' | 'max_level' | 'castle_cap' | 'progress_cap' | 'busy' | 'no_builder' | 'gold'; cost: number; duration: number };

export function checkBuildingUpgrade(state: GameState, id: BuildingId): BuildingCheck {
  const def = getBuilding(id);
  const b = state.buildings[id];
  const cost = buildingUpgradeCost(id, b.level);
  const duration = buildingUpgradeDuration(b.level);
  if (state.buildings.castle.level < def.unlockCastleLevel) return { ok: false, reason: 'locked', cost, duration };
  if (b.level >= def.maxLevel) return { ok: false, reason: 'max_level', cost, duration };
  if (b.level >= buildingLevelCap(state, id)) return { ok: false, reason: id === 'castle' ? 'progress_cap' : 'castle_cap', cost, duration };
  if (b.upgradeEndsAt !== null) return { ok: false, reason: 'busy', cost, duration };
  if (activeUpgrades(state).length >= BALANCE.buildings.builders) return { ok: false, reason: 'no_builder', cost, duration };
  if (state.resources.gold < cost) return { ok: false, reason: 'gold', cost, duration };
  return { ok: true, cost, duration };
}

/** Starts an upgrade. The building keeps working at its current level while upgrading. */
export function startBuildingUpgrade(state: GameState, id: BuildingId, now: number): boolean {
  const check = checkBuildingUpgrade(state, id);
  if (!check.ok) return false;
  // Collect the mine first so a level change never alters already-produced gold.
  if (id === 'gold_mine' || id === 'treasury') collectMine(state, now);
  state.resources.gold -= check.cost;
  state.buildings[id].upgradeEndsAt = now + check.duration * 1000;
  return true;
}

/** Completes any finished upgrades. Returns the ids that completed. */
export function completeBuildingUpgrades(state: GameState, now: number): BuildingId[] {
  const done: BuildingId[] = [];
  for (const def of BUILDINGS) {
    const b = state.buildings[def.id];
    if (b.upgradeEndsAt !== null && now >= b.upgradeEndsAt) {
      if (def.id === 'gold_mine' || def.id === 'treasury') collectMineInto(state, Math.min(now, b.upgradeEndsAt));
      b.level = Math.min(def.maxLevel, b.level + 1);
      b.upgradeEndsAt = null;
      done.push(def.id);
    }
  }
  return done;
}

export function skipCostGems(state: GameState, id: BuildingId, now: number): number {
  const endsAt = state.buildings[id].upgradeEndsAt;
  if (endsAt === null) return 0;
  const minutes = Math.max(0, (endsAt - now) / 60000);
  return Math.max(1, Math.ceil(minutes * BALANCE.buildings.gemsPerMinuteSkip));
}

export function skipBuildingUpgrade(state: GameState, id: BuildingId, now: number): boolean {
  const b = state.buildings[id];
  if (b.upgradeEndsAt === null) return false;
  const gems = skipCostGems(state, id, now);
  if (state.resources.gems < gems) return false;
  state.resources.gems -= gems;
  b.upgradeEndsAt = now;
  completeBuildingUpgrades(state, now);
  return true;
}

// Gold mine ------------------------------------------------------------------

export function mineCapacity(state: GameState): number {
  return Math.round(BUILDING_EFFECTS.mineGoldPerHour(state.buildings.gold_mine.level) * BUILDING_EFFECTS.mineCapacityHours(state.buildings.treasury.level));
}

export function mineStored(state: GameState, now: number): number {
  const elapsedH = Math.max(0, now - state.mine.lastCollectedAt) / 3600000;
  return Math.min(mineCapacity(state), Math.floor(elapsedH * BUILDING_EFFECTS.mineGoldPerHour(state.buildings.gold_mine.level)));
}

function collectMineInto(state: GameState, at: number): number {
  const amount = mineStored(state, at);
  state.resources.gold += amount;
  state.stats.goldEarned += amount;
  state.mine.lastCollectedAt = Math.max(state.mine.lastCollectedAt, at);
  return amount;
}

export function collectMine(state: GameState, now: number): number {
  return collectMineInto(state, now);
}

export function totalBuildingLevels(state: GameState): number {
  return BUILDINGS.reduce((s, b) => s + state.buildings[b.id].level, 0);
}
