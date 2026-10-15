import { BALANCE } from '../config/balance';
import { BUILDING_EFFECTS } from '../data/buildings';
import { getPet, PET_BY_ID } from '../data/pets';
import type { GameState, PetProgress } from '../state/types';

export function petPowerMultiplier(progress: PetProgress, sanctuaryLevel: number): number {
  return (
    (1 + BALANCE.pets.perLevelBonus * (progress.level - 1) + BALANCE.pets.perStarBonus * progress.stars) *
    (1 + BUILDING_EFFECTS.sanctuaryPetBonus(sanctuaryLevel))
  );
}

export function petPassiveValue(state: GameState, petId: string): number {
  const progress = state.pets[petId];
  if (!progress) return 0;
  const def = getPet(petId);
  const v = def.passiveBase * petPowerMultiplier(progress, state.buildings.pet_sanctuary.level);
  return def.passiveStat === 'heroHp' || def.passiveStat === 'heroDamage' ? Math.round(v) : Math.round(v * 1000) / 1000;
}

export function petUpgradeCost(level: number): { gold: number; treats: number } {
  return {
    gold: Math.round(BALANCE.pets.goldCostBase * Math.pow(BALANCE.pets.goldCostGrowth, level - 1)),
    treats: Math.round(BALANCE.pets.treatCostBase * Math.pow(BALANCE.pets.treatCostGrowth, level - 1)),
  };
}

export function canUpgradePet(state: GameState, petId: string): boolean {
  const p = state.pets[petId];
  if (!p || p.level >= BALANCE.pets.maxLevel) return false;
  const cost = petUpgradeCost(p.level);
  return state.resources.gold >= cost.gold && state.resources.petTreats >= cost.treats;
}

export function upgradePet(state: GameState, petId: string): boolean {
  if (!canUpgradePet(state, petId)) return false;
  const p = state.pets[petId]!;
  const cost = petUpgradeCost(p.level);
  state.resources.gold -= cost.gold;
  state.resources.petTreats -= cost.treats;
  p.level += 1;
  return true;
}

/** Adds a pet. Duplicates add stars, then convert into treats. Pets are never lost. */
export function addPet(state: GameState, petId: string): 'new' | 'star' | 'treats' | 'invalid' {
  if (!PET_BY_ID.has(petId)) return 'invalid';
  const p = state.pets[petId];
  if (!p) {
    state.pets[petId] = { level: 1, stars: 0 };
    if (!state.activePet) state.activePet = petId;
    return 'new';
  }
  if (p.stars < BALANCE.pets.maxStars) {
    p.stars += 1;
    return 'star';
  }
  state.resources.petTreats += BALANCE.pets.surplusDuplicateTreats;
  return 'treats';
}

export function setActivePet(state: GameState, petId: string | null): boolean {
  if (petId !== null && !state.pets[petId]) return false;
  state.activePet = petId;
  return true;
}
