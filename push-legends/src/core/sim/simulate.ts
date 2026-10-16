import { BUILDINGS, type BuildingId } from '../content/buildings';
import { TOTAL_STAGES } from '../content/worlds';
import { Battle } from '../combat/engine';
import { Rng } from '../rng';
import { createInitialState } from '../state/initial';
import type { GameState } from '../state/types';
import { campaignSetup } from '../systems/battleSetup';
import { checkBuildingUpgrade, collectMine, completeBuildingUpgrades, startBuildingUpgrade } from '../systems/buildings';
import { checkCardUpgrade, suggestDeck, upgradeCard } from '../systems/cards';
import { buySword, nextAffordableSword } from '../systems/armory';
import { buyChest, chestPrice, openPendingChest } from '../systems/chests';
import { buyOffer, dailyOffers } from '../systems/shop';
import { checkItemUpgrade, equippedItems, upgradeItem } from '../systems/equipment';
import { claimIdle } from '../systems/idle';
import { upgradePet } from '../systems/pets';
import { finalizeBattle } from '../systems/progression';
import { applyQuestEvent, claimAchievement, claimQuest, refreshQuests } from '../systems/quests';
import { claimableAchievements } from '../systems/quests';

/**
 * Headless progression simulator used by balance tests. It plays the campaign with a simple,
 * reasonable player policy so we can detect walls, soft locks and runaway economy numbers.
 */
export interface SimProfile {
  name: string;
  /** Verified full push-ups per battle (0 = idle-only player). */
  repsPerBattle: number;
  battlesPerSession: number;
  sessionsPerDay: number;
}

export interface SimReport {
  profile: string;
  days: number;
  battles: number;
  highestCleared: number;
  /** Day (fractional) on which each stage was first cleared. */
  clearDay: number[];
  /** Longest streak of consecutive failed attempts on one stage. */
  longestWall: number;
  maxGold: number;
  goldSpent: number;
  heroLevel: number;
  avgCardLevel: number;
  defeats: number;
}

function spend(state: GameState, now: number): number {
  let spent = 0;
  const gold0 = state.resources.gold;
  completeBuildingUpgrades(state, now);
  collectMine(state, now);
  claimIdle(state, now);
  const rng = new Rng(now % 100000);
  while (state.pendingChests.length) openPendingChest(state, 0, rng);
  state.quests.daily.forEach((_, i) => claimQuest(state, 'daily', i));
  state.quests.weekly.forEach((_, i) => claimQuest(state, 'weekly', i));
  for (const a of claimableAchievements(state)) claimAchievement(state, a.def.id);

  // A new sword from the Armory is the biggest single upgrade (hero damage and push-up damage).
  for (let o = nextAffordableSword(state); o; o = nextAffordableSword(state)) buySword(state, o.defId);

  // Buildings first (they compound), then cards, then gear, then pets.
  const priority: BuildingId[] = ['castle', 'barracks', 'gold_mine', 'training_grounds', 'academy', 'blacksmith', 'treasury', 'pet_sanctuary', 'guild_hall'];
  void BUILDINGS;
  for (const id of priority) {
    const c = checkBuildingUpgrade(state, id);
    if (c.ok && c.cost <= state.resources.gold * 0.6) {
      startBuildingUpgrade(state, id, now);
      applyQuestEvent(state, { type: 'buildingUpgraded', amount: 1 });
    }
  }
  state.deck = suggestDeck(state);
  let progress = true;
  while (progress) {
    progress = false;
    const candidates = state.deck.filter((id) => checkCardUpgrade(state, id).ok).sort((a, b) => state.cards[a]!.level - state.cards[b]!.level);
    if (candidates.length && upgradeCard(state, candidates[0]!)) {
      applyQuestEvent(state, { type: 'cardUpgraded', amount: 1 });
      progress = true;
    }
  }
  // Use the shop when gold is plentiful: daily fragment offers for deck cards, then silver chests.
  for (const offer of dailyOffers(state, now)) {
    if (state.deck.includes(offer.cardId) && offer.gold < state.resources.gold * 0.3) buyOffer(state, offer.id, now);
  }
  for (let i = 0; i < 3 && chestPrice('silver', 'gold', state) < state.resources.gold * 0.2; i++) buyChest(state, 'silver', 'gold', rng);
  for (const item of equippedItems(state)) while (checkItemUpgrade(state, item.uid).ok) upgradeItem(state, item.uid);
  if (state.activePet) while (upgradePet(state, state.activePet));
  spent += Math.max(0, gold0 - state.resources.gold);
  return spent;
}

export function simulateProgression(profile: SimProfile, days: number, seed = 1, onDay?: (day: number, state: GameState) => void): SimReport {
  let now = Date.UTC(2026, 0, 5, 8);
  const start = now;
  const state = createInitialState(now, seed);
  state.settings.autoDeploy = true;
  const clearDay: number[] = Array(TOTAL_STAGES).fill(-1);
  let battles = 0;
  let defeats = 0;
  let wall = 0;
  let attempt = 0;
  let longestWall = 0;
  let maxGold = 0;
  let goldSpent = 0;
  const rng = new Rng(seed);

  for (let day = 0; day < days; day++) {
    onDay?.(day, state);
    for (let session = 0; session < profile.sessionsPerDay; session++) {
      now = start + day * 86400_000 + (8 + session * (14 / profile.sessionsPerDay)) * 3600_000;
      refreshQuests(state, now);
      goldSpent += spend(state, now);
      for (let b = 0; b < profile.battlesPerSession; b++) {
        if (state.progress.highestCleared >= TOTAL_STAGES - 1) break;
        const target = state.progress.highestCleared + 1;
        // After repeated failures, farm the previous stage once (a natural player response).
        attempt++;
        const stageIdx = wall >= 3 && attempt % 3 === 0 && target > 0 ? target - 1 : target;
        const setup = campaignSetup(state, stageIdx, 'normal', { startAtBoss: true, attemptSeed: rng.int(1, 1e9) });
        const battle = new Battle(setup);
        const repEvery = profile.repsPerBattle > 0 ? 60 / profile.repsPerBattle : Infinity;
        let nextRep = 3;
        let reps = 0;
        const result = battle.runToEnd(400, (bt) => {
          if (reps < profile.repsPerBattle && bt.time >= nextRep) {
            bt.registerRep('full', true);
            reps++;
            nextRep += repEvery;
          }
          if (bt.canUseSpecial() && (bt.telegraphs.length > 0 || bt.enemies.length >= 6)) bt.useSpecial();
        });
        now += result.duration * 1000;
        battles++;
        finalizeBattle(state, result, now, rng);
        if (stageIdx === target) {
          if (result.outcome === 'victory') {
            clearDay[target] = (now - start) / 86400_000;
            wall = 0;
          } else {
            defeats++;
            wall++;
            longestWall = Math.max(longestWall, wall);
          }
        }
        maxGold = Math.max(maxGold, state.resources.gold);
        goldSpent += spend(state, now);
      }
    }
  }
  const deckLevels = state.deck.map((id) => state.cards[id]!.level);
  return {
    profile: profile.name,
    days,
    battles,
    highestCleared: state.progress.highestCleared,
    clearDay,
    longestWall,
    maxGold,
    goldSpent,
    heroLevel: state.hero.level,
    avgCardLevel: deckLevels.reduce((a, b) => a + b, 0) / Math.max(1, deckLevels.length),
    defeats,
  };
}

export const SIM_PROFILES: Record<'exerciser' | 'idle' | 'casual', SimProfile> = {
  /** Plays 15 battles a day with ~5 push-ups each (~75 reps/day, inside the daily full-reward cap). */
  exerciser: { name: 'exerciser', repsPerBattle: 5, battlesPerSession: 5, sessionsPerDay: 3 },
  /** Same play time, never exercises. */
  idle: { name: 'idle', repsPerBattle: 0, battlesPerSession: 5, sessionsPerDay: 3 },
  /** Two short sessions a day, no exercise. */
  casual: { name: 'casual', repsPerBattle: 0, battlesPerSession: 3, sessionsPerDay: 2 },
};
