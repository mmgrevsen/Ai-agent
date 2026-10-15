import { BALANCE } from '../config/balance';
import { BUILDING_EFFECTS } from '../content/buildings';
import { COSMETIC_BY_ID } from '../content/cosmetics';
import {
  ACHIEVEMENTS,
  achievementReward,
  DAILY_QUESTS,
  WEEKLY_QUESTS,
  type AchievementDef,
  type AchievementMetric,
  type GameEvent,
  type QuestTemplate,
  type Reward,
} from '../content/quests';
import { hashString, Rng } from '../rng';
import type { GameState, QuestInstance } from '../state/types';
import { dayKey, daysBetween, weekKey } from '../util';
import { totalBuildingLevels } from './buildings';
import { goldRatePerSecond, progressIndex } from './economy';
import { grantReward } from './rewards';

function questReward(state: GameState, t: QuestTemplate): Reward {
  const rate = goldRatePerSecond(progressIndex(state.progress.highestCleared));
  const bonus = 1 + BUILDING_EFFECTS.guildQuestBonus(state.buildings.guild_hall.level);
  return { ...t.extra, gold: Math.round(rate * t.goldSeconds * bonus) };
}

function questTarget(state: GameState, t: QuestTemplate): number {
  if (!t.scales) return t.target;
  const world = Math.floor(Math.max(0, state.progress.highestCleared) / 10);
  return Math.round(t.target * (1 + world * 0.25));
}

function instantiate(state: GameState, t: QuestTemplate): QuestInstance {
  return { templateId: t.id, target: questTarget(state, t), progress: 0, claimed: false, reward: questReward(state, t) };
}

function pickQuests(state: GameState, pool: readonly QuestTemplate[], count: number, seedKey: string): QuestInstance[] {
  const rng = new Rng(hashString(seedKey + state.profile.friendCode));
  const shuffled = rng.shuffle([...pool]);
  const chosen: QuestTemplate[] = [];
  let exercise = 0;
  for (const t of shuffled) {
    if (chosen.length >= count) break;
    // At most one exercise quest at a time keeps daily goals healthy and optional.
    if (t.exercise && exercise >= 1) continue;
    if (t.id === 'd_dungeon' && state.buildings.castle.level < 2) continue;
    if (t.exercise) exercise++;
    chosen.push(t);
  }
  return chosen.map((t) => instantiate(state, t));
}

export function refreshQuests(state: GameState, now: number): boolean {
  let changed = false;
  const dk = dayKey(now);
  const wk = weekKey(now);
  if (state.quests.dailyKey !== dk) {
    state.quests.dailyKey = dk;
    state.quests.daily = pickQuests(state, DAILY_QUESTS, BALANCE.quests.dailyCount, dk);
    state.quests.rerollsLeft = 1;
    changed = true;
  }
  if (state.quests.weeklyKey !== wk) {
    state.quests.weeklyKey = wk;
    state.quests.weekly = pickQuests(state, WEEKLY_QUESTS, BALANCE.quests.weeklyCount, wk);
    changed = true;
  }
  return changed;
}

export function applyQuestEvent(state: GameState, event: GameEvent): void {
  const all = [...DAILY_QUESTS, ...WEEKLY_QUESTS];
  for (const q of [...state.quests.daily, ...state.quests.weekly]) {
    if (q.claimed) continue;
    const t = all.find((x) => x.id === q.templateId);
    if (t?.event === event.type) q.progress = Math.min(q.target, q.progress + event.amount);
  }
}

export function claimQuest(state: GameState, list: 'daily' | 'weekly', index: number): Reward | null {
  const q = state.quests[list][index];
  if (!q || q.claimed || q.progress < q.target) return null;
  q.claimed = true;
  grantReward(state, q.reward);
  return q.reward;
}

/** Swap a daily quest for a different one (once per day, free) - e.g. replace the push-up quest on a rest day. */
export function rerollDailyQuest(state: GameState, index: number): boolean {
  const q = state.quests.daily[index];
  if (!q || q.claimed || state.quests.rerollsLeft <= 0) return false;
  const used = new Set(state.quests.daily.map((x) => x.templateId));
  // Rerolls always offer a non-exercise quest, so a rest day never blocks quest rewards.
  const candidates = DAILY_QUESTS.filter((t) => !used.has(t.id) && !t.exercise && !(t.id === 'd_dungeon' && state.buildings.castle.level < 2));
  if (candidates.length === 0) return false;
  const rng = new Rng(hashString(`${state.quests.dailyKey}-reroll-${index}`));
  state.quests.daily[index] = instantiate(state, rng.pick(candidates));
  state.quests.rerollsLeft -= 1;
  return true;
}

// Achievements -----------------------------------------------------------------

export function achievementMetric(state: GameState, metric: AchievementMetric): number {
  const s = state.stats;
  switch (metric) {
    case 'enemiesDefeated':
      return s.enemiesDefeated;
    case 'bossesDefeated':
      return s.bossesDefeated;
    case 'verifiedReps':
      return s.verifiedFullReps + s.verifiedKneeReps;
    case 'exerciseDays':
      return s.exerciseDays.length;
    case 'cardsOwned':
      return Object.keys(state.cards).length;
    case 'buildingLevels':
      return totalBuildingLevels(state);
    case 'stagesCleared':
      return state.progress.highestCleared + 1;
    case 'endlessBest':
      return state.progress.endlessBest;
    case 'interrupts':
      return s.interrupts;
    case 'warCries':
      return s.warCries;
    case 'heroLevel':
      return state.hero.level;
    case 'dungeonsCompleted':
      return s.dungeonsCompleted;
  }
}

export interface AchievementStatus {
  def: AchievementDef;
  claimedTiers: number;
  value: number;
  nextTarget: number | null;
  claimable: boolean;
}

export function achievementStatus(state: GameState, def: AchievementDef): AchievementStatus {
  const claimedTiers = state.achievements[def.id] ?? 0;
  const value = achievementMetric(state, def.metric);
  const nextTarget = def.tiers[claimedTiers] ?? null;
  return { def, claimedTiers, value, nextTarget, claimable: nextTarget !== null && value >= nextTarget };
}

export function claimableAchievements(state: GameState): AchievementStatus[] {
  return ACHIEVEMENTS.map((a) => achievementStatus(state, a)).filter((a) => a.claimable);
}

export function claimAchievement(state: GameState, id: string): { reward: Reward; cosmetic: string | null } | null {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return null;
  const status = achievementStatus(state, def);
  if (!status.claimable) return null;
  const reward = achievementReward(status.claimedTiers);
  grantReward(state, reward);
  state.achievements[id] = status.claimedTiers + 1;
  let cosmetic: string | null = null;
  if (state.achievements[id] === def.tiers.length && def.cosmetic && COSMETIC_BY_ID.has(def.cosmetic) && !state.hero.cosmetics.includes(def.cosmetic)) {
    state.hero.cosmetics.push(def.cosmetic);
    cosmetic = def.cosmetic;
  }
  return { reward, cosmetic };
}

// Streaks ------------------------------------------------------------------------

/**
 * Records an active day. Missed days consume rest tokens; if none remain, only the streak *bonus*
 * resets. Streaks never remove cards, resources, levels or equipment.
 */
export function recordActiveDay(state: GameState, now: number): void {
  const today = dayKey(now);
  const st = state.streak;
  if (st.lastDay === today) return;
  if (st.lastDay === null) {
    st.count = 1;
  } else {
    const gap = daysBetween(st.lastDay, today);
    if (gap <= 0) return; // clock moved backwards: ignore
    const missed = gap - 1;
    if (missed === 0) st.count += 1;
    else if (missed <= st.restTokens) {
      st.restTokens -= missed;
      st.count += 1;
    } else st.count = 1;
  }
  st.lastDay = today;
  st.best = Math.max(st.best, st.count);
  if (st.count % BALANCE.streak.restTokenEveryDays === 0) st.restTokens = Math.min(BALANCE.streak.maxRestTokens, st.restTokens + 1);
}

export function streakBonus(state: GameState): number {
  return Math.min(BALANCE.streak.maxBonus, Math.max(0, state.streak.count - 1) * BALANCE.streak.bonusPerDay);
}
