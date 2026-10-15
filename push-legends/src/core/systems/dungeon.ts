import { BALANCE } from '../config/balance';
import { getCard } from '../content/cards';
import type { Reward } from '../content/quests';
import { BOSS_STAGE, getWorld } from '../content/worlds';
import { buildStageWaves } from '../combat/waves';
import type { BattleResult, BattleSetup, WaveDef } from '../combat/types';
import { hashString, Rng } from '../rng';
import type { DungeonNode, DungeonRun, GameState } from '../state/types';
import { dayKey } from '../util';
import { buildDeckSpec, buildHeroSpec } from './battleSetup';
import { addCardFragments, discoverableCards } from './cards';
import { difficultyMultiplier, goldRatePerSecond, progressIndex, stageFromIndex } from './economy';
import { applyQuestEvent } from './quests';
import { grantReward } from './rewards';

export const DUNGEON_UNLOCK_CASTLE = 2;

export const ROOM_INFO: Record<DungeonNode['kind'], { name: string; text: string }> = {
  battle: { name: 'Skirmish', text: 'A standard fight.' },
  swarm: { name: 'Swarm', text: 'More enemies, +60% gold.' },
  elite: { name: 'Elite Lair', text: 'A tougher elite fight with much better rewards.' },
  rest: { name: 'Campfire', text: 'Your army rests: +25% health and damage for the rest of the run.' },
  treasure: { name: 'Treasure Room', text: 'Free gold and ore.' },
  cards: { name: 'Card Shrine', text: 'Choose fragments for one of three cards.' },
  boss: { name: 'Dungeon Boss', text: 'Defeat the guardian to complete the dungeon.' },
};

export function dungeonUnlocked(state: GameState): boolean {
  return state.buildings.castle.level >= DUNGEON_UNLOCK_CASTLE;
}

export function generateDungeon(seed: number, world: number, now: number, fullRewards: boolean): DungeonRun {
  const rng = new Rng(seed);
  const floors = BALANCE.dungeon.floors;
  const nodes: DungeonNode[] = [];
  const byFloor: DungeonNode[][] = [];
  for (let f = 0; f < floors; f++) {
    const count = f === 0 ? 2 : f === floors - 1 ? 1 : rng.int(2, 3);
    const row: DungeonNode[] = [];
    for (let i = 0; i < count; i++) {
      let kind: DungeonNode['kind'];
      if (f === floors - 1) kind = 'boss';
      else if (f === 0) kind = i === 0 ? 'battle' : 'swarm';
      else kind = rng.weighted({ battle: 3, swarm: 2, elite: 1.6, rest: f >= 2 ? 1.2 : 0, treasure: 1.2, cards: 1.2 });
      const node: DungeonNode = { id: `f${f}n${i}`, floor: f, kind, next: [] };
      row.push(node);
      nodes.push(node);
    }
    byFloor.push(row);
  }
  // Connect each node to 1-2 nodes on the next floor, keeping every node reachable.
  for (let f = 0; f < floors - 1; f++) {
    const row = byFloor[f]!;
    const next = byFloor[f + 1]!;
    row.forEach((n, i) => {
      const j = Math.min(next.length - 1, Math.round((i / Math.max(1, row.length - 1)) * (next.length - 1)));
      n.next.push(next[j]!.id);
      if (next.length > 1 && rng.chance(0.6)) {
        const alt = next[Math.min(next.length - 1, Math.max(0, j + (rng.chance(0.5) ? 1 : -1)))]!;
        if (!n.next.includes(alt.id)) n.next.push(alt.id);
      }
    });
    for (const target of next) {
      if (!row.some((n) => n.next.includes(target.id))) rng.pick(row).next.push(target.id);
    }
  }
  return { seed, world, nodes, currentNodeId: null, visited: [], banked: {}, restBuff: 0, fullRewards, startedAt: now };
}

export function startDungeon(state: GameState, now: number, seed: number): DungeonRun | null {
  if (!dungeonUnlocked(state)) return null;
  const today = dayKey(now);
  if (state.progress.dungeonRunsToday.day !== today) state.progress.dungeonRunsToday = { day: today, count: 0 };
  const fullRewards = state.progress.dungeonRunsToday.count < BALANCE.dungeon.fullRewardRunsPerDay;
  state.progress.dungeonRunsToday.count++;
  const world = stageFromIndex(progressIndex(state.progress.highestCleared)).world;
  state.dungeon = generateDungeon(seed, world, now, fullRewards);
  return state.dungeon;
}

export function availableNodes(run: DungeonRun): DungeonNode[] {
  if (run.currentNodeId === null) return run.nodes.filter((n) => n.floor === 0);
  const current = run.nodes.find((n) => n.id === run.currentNodeId);
  if (!current || !run.visited.includes(current.id)) return [];
  return current.next.map((id) => run.nodes.find((n) => n.id === id)!).filter(Boolean);
}

function rewardScale(run: DungeonRun): number {
  return run.fullRewards ? 1 : BALANCE.dungeon.reducedRewardRate;
}

function bank(run: DungeonRun, reward: Reward & { fragments?: number }): void {
  for (const [k, v] of Object.entries(reward) as [keyof DungeonRun['banked'], number | string][]) {
    if (typeof v === 'number') (run.banked as Record<string, number>)[k] = ((run.banked as Record<string, number>)[k] ?? 0) + v;
  }
}

/** Options shown by a Card Shrine room (deterministic per run and node). */
export function cardShrineOptions(state: GameState, run: DungeonRun, nodeId: string): string[] {
  const rng = new Rng(hashString(`${run.seed}-${nodeId}`));
  const pool = discoverableCards(state).map((c) => c.id);
  return rng.shuffle([...pool]).slice(0, 3);
}

export type RoomOutcome =
  | { kind: 'battle'; setup: BattleSetup }
  | { kind: 'rest'; buff: number }
  | { kind: 'treasure'; reward: Reward }
  | { kind: 'cards'; options: string[] };

/** Enters a node. Non-combat rooms resolve immediately (cards wait for the player's pick). */
export function enterNode(state: GameState, nodeId: string): RoomOutcome | null {
  const run = state.dungeon;
  if (!run) return null;
  const node = availableNodes(run).find((n) => n.id === nodeId);
  if (!node) return null;
  run.currentNodeId = node.id;
  const scale = rewardScale(run);
  const rate = goldRatePerSecond(progressIndex(state.progress.highestCleared));
  switch (node.kind) {
    case 'rest':
      run.restBuff += BALANCE.dungeon.restHealBuff;
      run.visited.push(node.id);
      applyQuestEvent(state, { type: 'dungeonRoomCleared', amount: 1 });
      return { kind: 'rest', buff: run.restBuff };
    case 'treasure': {
      const reward: Reward = { gold: Math.round(rate * 60 * scale), ore: Math.round(4 * scale) + 1 };
      grantReward(state, reward);
      bank(run, reward);
      run.visited.push(node.id);
      applyQuestEvent(state, { type: 'dungeonRoomCleared', amount: 1 });
      return { kind: 'treasure', reward };
    }
    case 'cards':
      return { kind: 'cards', options: cardShrineOptions(state, run, node.id) };
    default:
      return { kind: 'battle', setup: dungeonBattleSetup(state, run, node) };
  }
}

export function pickShrineCard(state: GameState, cardId: string): number {
  const run = state.dungeon;
  if (!run || run.currentNodeId === null || run.visited.includes(run.currentNodeId)) return 0;
  const node = run.nodes.find((n) => n.id === run.currentNodeId);
  if (!node || node.kind !== 'cards' || !cardShrineOptions(state, run, node.id).includes(cardId)) return 0;
  const rarity = getCard(cardId).rarity;
  const base = { common: 10, rare: 6, epic: 4, legendary: 2, mythic: 1 }[rarity];
  const amount = Math.max(1, Math.round(base * rewardScale(run)));
  addCardFragments(state, cardId, amount);
  bank(run, { fragments: amount });
  run.visited.push(node.id);
  applyQuestEvent(state, { type: 'dungeonRoomCleared', amount: 1 });
  return amount;
}

export function dungeonBattleSetup(state: GameState, run: DungeonRun, node: DungeonNode): BattleSetup {
  const idx = Math.max(0, progressIndex(state.progress.highestCleared) - 1);
  const power = BALANCE.dungeon.roomPower[node.kind as keyof typeof BALANCE.dungeon.roomPower] ?? 1;
  const seed = hashString(`${run.seed}-${node.id}`);
  const stage = node.kind === 'boss' ? BOSS_STAGE : node.kind === 'elite' ? 8 : node.kind === 'swarm' ? 7 : 4;
  let waves: WaveDef[] = buildStageWaves(run.world, stage, seed, node.kind === 'elite' ? ['elite_surge'] : []);
  if (node.kind === 'swarm') waves = waves.map((w) => ({ ...w, spawns: [...w.spawns, ...w.spawns.slice(0, 3)] }));
  if (node.kind !== 'boss') waves = waves.filter((w) => !w.isBossWave).slice(0, node.kind === 'battle' ? 2 : 3);
  const goldMult = node.kind === 'swarm' ? 1 + BALANCE.dungeon.swarmGoldBonus : node.kind === 'elite' ? 1 + BALANCE.dungeon.eliteRewardBonus : 1;
  return {
    mode: 'dungeon',
    label: `${ROOM_INFO[node.kind].name} - Floor ${node.floor + 1}`,
    seed,
    world: run.world,
    stageIndex: idx,
    difficulty: 'normal',
    difficultyMult: difficultyMultiplier(idx) * power * 0.85,
    rewardMult: goldMult * rewardScale(run),
    waves,
    startWave: 0,
    endless: false,
    endlessGrowth: 1,
    timeLimit: BALANCE.combat.stageTimeLimitSec,
    deck: buildDeckSpec(state),
    hero: buildHeroSpec(state),
    modifiers: [],
    restBuff: run.restBuff,
    autoDeploy: state.settings.autoDeploy,
    exerciseMode: state.settings.useCamera ? state.settings.exerciseMode : null,
  };
}

export interface DungeonRoomSummary {
  cleared: boolean;
  runComplete: boolean;
  runEnded: boolean;
  reward: Reward | null;
}

/**
 * Applies a dungeon battle. finalizeBattle() has already granted kill gold. Losing ends the run, but
 * everything banked from earlier rooms was granted when those rooms were cleared and stays with the player.
 */
export function finalizeDungeonBattle(state: GameState, result: BattleResult): DungeonRoomSummary {
  const run = state.dungeon;
  if (!run || run.currentNodeId === null) return { cleared: false, runComplete: false, runEnded: true, reward: null };
  const node = run.nodes.find((n) => n.id === run.currentNodeId)!;
  if (result.outcome !== 'victory') {
    state.dungeon = null;
    return { cleared: false, runComplete: false, runEnded: true, reward: null };
  }
  run.visited.push(node.id);
  applyQuestEvent(state, { type: 'dungeonRoomCleared', amount: 1 });
  const scale = rewardScale(run);
  const rate = goldRatePerSecond(progressIndex(state.progress.highestCleared));
  let reward: Reward = { gold: Math.round(rate * 20 * scale), ore: Math.round(1 * scale) };
  if (node.kind === 'elite') reward = { gold: Math.round(rate * 50 * scale), ore: Math.round(3 * scale) + 1, petTreats: Math.round(2 * scale) + 1 };
  if (node.kind === 'boss') {
    reward = { gold: Math.round(rate * 120 * scale), ore: Math.round(8 * scale) + 2, petTreats: Math.round(4 * scale) + 1, gems: run.fullRewards ? 5 : 0, chest: run.fullRewards ? 'silver' : 'wooden' };
    state.stats.dungeonsCompleted++;
  }
  grantReward(state, reward);
  bank(run, { ...reward, chest: undefined });
  const runComplete = node.kind === 'boss';
  if (runComplete) state.dungeon = null;
  return { cleared: true, runComplete, runEnded: runComplete, reward };
}

export function abandonDungeon(state: GameState): void {
  state.dungeon = null;
}

export function dungeonWorldName(run: DungeonRun): string {
  return `${getWorld(run.world).name} Depths`;
}
