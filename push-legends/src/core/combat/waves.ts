import { ENEMY_ROLES, type EnemyRole } from '../content/types';
import { BOSS_STAGE, getWorld, MINI_BOSS_STAGE } from '../content/worlds';
import { Rng } from '../rng';
import type { BattleModifierId, EnemySpawn, WaveDef } from './types';

function availableRoles(world: number, stage: number): EnemyRole[] {
  const w = getWorld(world);
  return ENEMY_ROLES.filter((r) => w.roleUnlockStage[r] <= stage);
}

function rollRole(rng: Rng, roles: EnemyRole[], modifiers: BattleModifierId[]): EnemyRole {
  if (modifiers.includes('sky_raid') && roles.includes('flying') && rng.chance(0.45)) return 'flying';
  // Normal enemies are the backbone of every wave; specials add variety.
  const weights: Record<EnemyRole, number> = { normal: 4, fast: 2, ranged: 2, flying: 1.6, armored: 1.3 };
  const filtered = Object.fromEntries(roles.map((r) => [r, weights[r]])) as Record<EnemyRole, number>;
  return rng.weighted(filtered);
}

/** Builds the waves for a campaign stage. Deterministic for a given world/stage/seed. */
export function buildStageWaves(world: number, stage: number, seed: number, modifiers: BattleModifierId[] = []): WaveDef[] {
  const rng = new Rng(seed);
  const w = getWorld(world);
  const roles = availableRoles(world, stage);
  const waveCount = 2 + Math.floor((stage - 1) / 3);
  const waves: WaveDef[] = [];
  const eliteChance = stage >= w.eliteFromStage ? (modifiers.includes('elite_surge') ? 0.3 : 0.1) : 0;

  for (let i = 0; i < waveCount; i++) {
    const count = Math.min(16, 4 + Math.floor(stage * 0.5) + world + i);
    const spawns: EnemySpawn[] = [];
    let elites = 0;
    for (let k = 0; k < count; k++) {
      const elite = elites < 2 && rng.chance(eliteChance);
      if (elite) elites++;
      spawns.push({ kind: 'enemy', role: rollRole(rng, roles, modifiers), elite });
    }
    waves.push({ spawns, isBossWave: false });
  }

  if (stage === MINI_BOSS_STAGE || stage === BOSS_STAGE) {
    const tier = stage === BOSS_STAGE ? 2 : 1;
    const escorts: EnemySpawn[] = Array.from({ length: 2 + world }, () => ({ kind: 'enemy', role: rollRole(rng, roles, modifiers), elite: false }));
    waves.push({
      spawns: [{ kind: 'boss', bossId: tier === 2 ? w.boss.id : w.miniBoss.id, tier }, ...escorts],
      isBossWave: true,
    });
  }
  return waves;
}

/**
 * Endless/blitz wave n (0-based). Difficulty growth is applied by the engine; this decides composition.
 * Every 5th wave adds elites; every 10th wave brings a mini-boss or boss from the rotation.
 */
export function buildEndlessWave(world: number, n: number, rng: Rng, modifiers: BattleModifierId[]): WaveDef {
  const roles = [...ENEMY_ROLES];
  const count = Math.min(18, 5 + Math.floor(n / 2));
  const spawns: EnemySpawn[] = [];
  const eliteCount = (n + 1) % 5 === 0 ? 1 + Math.floor(n / 10) : modifiers.includes('elite_surge') ? 1 : 0;
  for (let k = 0; k < count; k++) spawns.push({ kind: 'enemy', role: rollRole(rng, roles, modifiers), elite: k < eliteCount });
  if ((n + 1) % 10 === 0) {
    const rotationWorld = getWorld((world + Math.floor(n / 10)) % 5);
    const tier = (n + 1) % 20 === 0 ? 2 : 1;
    spawns.unshift({ kind: 'boss', bossId: tier === 2 ? rotationWorld.boss.id : rotationWorld.miniBoss.id, tier });
    return { spawns, isBossWave: true };
  }
  return { spawns, isBossWave: false };
}

export const totalWaveCount = (stage: number) => 2 + Math.floor((stage - 1) / 3) + (stage === MINI_BOSS_STAGE || stage === BOSS_STAGE ? 1 : 0);

