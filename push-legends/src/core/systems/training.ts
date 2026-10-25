import { BALANCE } from '../config/balance';
import { BOSS_STAGE, MINI_BOSS_STAGE } from '../content/worlds';
import type { GameState, RepDay } from '../state/types';
import { dayKey } from '../util';
import { stageFromIndex } from './economy';

/**
 * Push-up training: the per-stage push-up requirement, the player's push-up log, calorie estimates
 * and the goals that help the player do a little more over time. Only verified push-ups (camera)
 * are logged; developer-simulated reps never count as exercise.
 */

const EX = BALANCE.exercise;
const DAY_MS = 86_400_000;

/**
 * Push-ups needed in a campaign battle before the stage can be claimed. Grows slowly with the
 * stage, more for (mini-)bosses, and never more than a few above the player's own best battle.
 */
export function stageRepsRequired(state: GameState, stageIdx: number): number {
  const r = EX.stageReps;
  const { stage } = stageFromIndex(stageIdx);
  const mult = stage === BOSS_STAGE ? r.bossMult : stage === MINI_BOSS_STAGE ? r.miniBossMult : 1;
  const byStage = Math.min(r.max, Math.round((r.base + r.perStage * stageIdx) * mult));
  const personal = Math.max(r.min, state.stats.bestBattleReps + r.aboveBest);
  return Math.max(1, Math.min(byStage, personal));
}

/** Estimated kilocalories for verified push-ups at the given body weight. */
export function repCalories(full: number, knee: number, bodyWeightKg: number): number {
  return (full + knee * EX.kneeCalorieFactor) * EX.kcalPerKgPerRep * bodyWeightKg;
}

/** Adds one battle's verified push-ups to the log and records. */
export function recordBattleReps(state: GameState, now: number, full: number, knee: number): void {
  const reps = full + knee;
  if (reps <= 0) return;
  const s = state.stats;
  const today = dayKey(now);
  let day = s.repLog[s.repLog.length - 1];
  if (!day || day.day !== today) {
    day = { day: today, full: 0, knee: 0, best: 0, sets: 0 };
    s.repLog.push(day);
    if (s.repLog.length > 366) s.repLog.splice(0, s.repLog.length - 366);
  }
  day.full += full;
  day.knee += knee;
  day.sets += 1;
  day.best = Math.max(day.best, reps);
  s.bestBattleReps = Math.max(s.bestBattleReps, reps);
}

export const RANKS: readonly { name: string; best: number }[] = [
  { name: 'Recruit', best: 0 },
  { name: 'Squire', best: 5 },
  { name: 'Soldier', best: 10 },
  { name: 'Knight', best: 20 },
  { name: 'Champion', best: 30 },
  { name: 'Warlord', best: 50 },
  { name: 'Legend', best: 75 },
  { name: 'Mythic', best: 100 },
];

const MILESTONES = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];

export interface TrainingSummary {
  total: { full: number; knee: number; all: number; kcal: number };
  today: { reps: number; kcal: number; best: number };
  week: { reps: number; kcal: number; activeDays: number };
  /** The last 14 days, oldest first (days without push-ups are zero). */
  days: { day: string; reps: number; best: number }[];
  bestBattle: number;
  bestDay: { day: string; reps: number } | null;
  /** Consecutive days with push-ups, ending today or yesterday. */
  streak: number;
  activeDays: number;
  rank: { name: string; best: number };
  nextRank: { name: string; best: number } | null;
  nextMilestone: number | null;
  /** Average best battle of the last 7 days vs the 7 days before (null without data). */
  trendPct: number | null;
  goals: { battle: number; day: number };
}

export function trainingSummary(state: GameState, now: number): TrainingSummary {
  const s = state.stats;
  const kg = state.settings.bodyWeightKg;
  const byDay = new Map<string, RepDay>(s.repLog.map((d) => [d.day, d]));
  const days: TrainingSummary['days'] = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(now - i * DAY_MS);
    const d = byDay.get(key);
    days.push({ day: key, reps: d ? d.full + d.knee : 0, best: d?.best ?? 0 });
  }
  const last7 = s.repLog.filter((d) => d.day >= dayKey(now - 6 * DAY_MS));
  const prev7 = s.repLog.filter((d) => d.day >= dayKey(now - 13 * DAY_MS) && d.day < dayKey(now - 6 * DAY_MS));
  const avgBest = (list: RepDay[]) => (list.length ? list.reduce((a, d) => a + d.best, 0) / list.length : 0);
  const trendPct = last7.length && prev7.length && avgBest(prev7) > 0 ? Math.round((avgBest(last7) / avgBest(prev7) - 1) * 100) : null;

  const todayDay = byDay.get(dayKey(now));
  const weekFull = last7.reduce((a, d) => a + d.full, 0);
  const weekKnee = last7.reduce((a, d) => a + d.knee, 0);
  let bestDay: TrainingSummary['bestDay'] = null;
  for (const d of s.repLog) if (!bestDay || d.full + d.knee > bestDay.reps) bestDay = { day: d.day, reps: d.full + d.knee };

  let streak = 0;
  const active = new Set(s.repLog.filter((d) => d.full + d.knee > 0).map((d) => d.day));
  for (const d of s.exerciseDays) active.add(d);
  let i = active.has(dayKey(now)) ? 0 : 1;
  while (active.has(dayKey(now - i * DAY_MS))) {
    streak++;
    i++;
  }

  const all = s.verifiedFullReps + s.verifiedKneeReps;
  const rankIdx = RANKS.reduce((best, r, idx) => (s.bestBattleReps >= r.best ? idx : best), 0);
  const weekAvg = last7.length ? (weekFull + weekKnee) / 7 : 0;
  return {
    total: { full: s.verifiedFullReps, knee: s.verifiedKneeReps, all, kcal: repCalories(s.verifiedFullReps, s.verifiedKneeReps, kg) },
    today: { reps: todayDay ? todayDay.full + todayDay.knee : 0, kcal: todayDay ? repCalories(todayDay.full, todayDay.knee, kg) : 0, best: todayDay?.best ?? 0 },
    week: { reps: weekFull + weekKnee, kcal: repCalories(weekFull, weekKnee, kg), activeDays: last7.length },
    days,
    bestBattle: s.bestBattleReps,
    bestDay,
    streak,
    activeDays: active.size,
    rank: RANKS[rankIdx]!,
    nextRank: RANKS[rankIdx + 1] ?? null,
    nextMilestone: MILESTONES.find((m) => m > all) ?? null,
    trendPct,
    // Progressive overload in small steps: one or two more than the best battle, and a daily target
    // about 10% above the recent daily average (never below 10)
    goals: { battle: s.bestBattleReps + Math.max(1, Math.round(s.bestBattleReps * 0.1)), day: Math.max(10, Math.round(weekAvg * 1.1)) },
  };
}
