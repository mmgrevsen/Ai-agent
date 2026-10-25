import { BALANCE } from '../config/balance';
import { CARDS, getCard } from '../content/cards';
import { BOSS_COSMETICS } from '../content/cosmetics';
import type { ChestKind, Reward } from '../content/quests';
import { BOSS_STAGE, getWorld, MINI_BOSS_STAGE, TOTAL_STAGES } from '../content/worlds';
import type { BattleResult } from '../combat/types';
import type { Rng } from '../rng';
import type { GameState } from '../state/types';
import { dayKey, weekKey } from '../util';
import { checkBuildingUpgrade } from './buildings';
import { addCardFragments, upgradeableCards } from './cards';
import { goldRatePerSecond, progressIndex, stageClearGold, stageClearXp, stageFromIndex } from './economy';
import { addItem } from './equipment';
import { computeHeroStats } from './hero';
import { addPet } from './pets';
import { applyQuestEvent, streakBonus } from './quests';
import { recordBattleReps } from './training';
import { addHeroXpRaw, grantReward } from './rewards';
import { academyFragmentBonus } from './battleSetup';

/** Pets granted on the first clear of specific stages (global index). */
export const PET_UNLOCKS: Record<number, string> = { 4: 'ember_fox', 9: 'pebble_golem', 14: 'sparkwing', 19: 'moonmoth', 24: 'frostpup' };

/** Gear granted on the first clear of specific stages. */
export const FIRST_CLEAR_ITEMS: Record<number, string> = {
  1: 'padded_vest',
  3: 'grip_wraps',
  6: 'traveler_boots',
  8: 'lucky_coin',
  12: 'woodcutter_axe',
  16: 'iron_helm',
  22: 'swiftstep',
  28: 'war_banner',
  33: 'gauntlets_might',
  38: 'knight_cuirass',
};

export function cardUnlockedAtStage(stageIdx: number): string[] {
  const { world, stage } = stageFromIndex(stageIdx);
  return CARDS.filter((c) => c.unlock.kind === 'stage' && c.unlock.world === world && c.unlock.stage === stage).map((c) => c.id);
}

export interface Suggestion {
  title: string;
  text: string;
  action: 'cards' | 'base' | 'hero' | 'retry_story' | 'retry_boss' | 'none';
}

export interface BattleSummary {
  outcome: BattleResult['outcome'];
  mode: BattleResult['mode'];
  /** Rewards earned during the battle. Always kept, whatever the outcome. */
  kept: Reward;
  /** Extra rewards for winning (null when not won). */
  victoryBonus: Reward | null;
  repGold: number;
  repXp: number;
  firstClear: boolean;
  unlockedCards: string[];
  fragments: { cardId: string; amount: number; newCard: boolean }[];
  items: { defId: string; result: string }[];
  pets: { petId: string; result: string }[];
  cosmetics: string[];
  chest: ChestKind | null;
  heroLevelsGained: number;
  streakBonus: number;
  newRecord: boolean;
  /** Most push-ups in one battle so far (a new personal best). */
  repRecord: boolean;
  bossCheckpointSaved: boolean;
  suggestions: Suggestion[];
  progressLines: string[];
}

function emptySummary(result: BattleResult): BattleSummary {
  return {
    outcome: result.outcome,
    mode: result.mode,
    kept: {},
    victoryBonus: null,
    repGold: 0,
    repXp: 0,
    firstClear: false,
    unlockedCards: [],
    fragments: [],
    items: [],
    pets: [],
    cosmetics: [],
    chest: null,
    heroLevelsGained: 0,
    streakBonus: 0,
    newRecord: false,
    repRecord: false,
    bossCheckpointSaved: false,
    suggestions: [],
    progressLines: [],
  };
}

/** Gold for verified reps, with a daily soft cap so the game never pushes excessive exercise. */
export function repRewardGold(state: GameState, repUnits: number, now: number): number {
  if (repUnits <= 0) return 0;
  const today = dayKey(now);
  const doneToday = state.stats.repsToday.day === today ? state.stats.repsToday.count : 0;
  const fullRemaining = Math.max(0, BALANCE.exercise.dailyRepFullRewardCap - doneToday);
  const fullUnits = Math.min(repUnits, fullRemaining);
  const tailUnits = repUnits - fullUnits;
  const perRep = goldRatePerSecond(progressIndex(state.progress.highestCleared)) * BALANCE.exercise.repGoldStageSeconds * computeHeroStats(state).repGoldBonus;
  return Math.round(perRep * (fullUnits + tailUnits * BALANCE.exercise.dailyRepTailRewardRate));
}

/**
 * Applies a finished battle to the game state.
 *
 * NO-LOSS RULE: this function only ever adds to the player's state. Whatever the outcome, every
 * reward earned during the battle is kept, and nothing (cards, items, resources, levels, buildings,
 * progress) is removed or reduced. Defeats additionally produce suggestions and save boss checkpoints.
 */
export function finalizeBattle(state: GameState, result: BattleResult, now: number, rng: Rng): BattleSummary {
  const summary = emptySummary(result);
  const s = state.stats;
  const won = result.outcome === 'victory';
  const verifiedReps = result.reps.full + result.reps.knee;

  // --- Stats & quests ---------------------------------------------------------------------
  s.battlesPlayed++;
  if (won) s.battlesWon++;
  s.enemiesDefeated += result.enemiesDefeated;
  s.specialsUsed += result.specialsUsed;
  s.interrupts += result.interrupts;
  s.warCries += result.warCries;
  s.simulatedReps += result.reps.simulated;
  s.verifiedFullReps += result.reps.full;
  s.verifiedKneeReps += result.reps.knee;
  const bossKills = result.bossDefeated ? result.bossIds.length : 0;
  s.bossesDefeated += bossKills;

  applyQuestEvent(state, { type: 'battlePlayed', amount: 1 });
  applyQuestEvent(state, { type: 'enemyDefeated', amount: result.enemiesDefeated });
  applyQuestEvent(state, { type: 'cardDeployed', amount: result.cardsDeployed });
  applyQuestEvent(state, { type: 'specialUsed', amount: result.specialsUsed });
  applyQuestEvent(state, { type: 'warCry', amount: result.reps.simulated > 0 ? 0 : result.warCries });
  applyQuestEvent(state, { type: 'interrupt', amount: result.interrupts });
  if (won) applyQuestEvent(state, { type: 'battleWon', amount: 1 });
  if (bossKills) applyQuestEvent(state, { type: 'bossDefeated', amount: bossKills });
  if (result.mode === 'endless' || result.mode === 'weekly') applyQuestEvent(state, { type: 'endlessWave', amount: result.wavesCleared });

  // --- Kept rewards (always) ---------------------------------------------------------------
  const hero = computeHeroStats(state);
  const streak = streakBonus(state);
  summary.streakBonus = streak;
  const keptGold = Math.round(result.goldEarned * hero.goldBonus * (1 + streak));
  summary.kept = { gold: keptGold, heroXp: result.xpEarned };

  // Verified exercise rewards (simulated reps never earn these).
  if (verifiedReps > 0) {
    summary.repGold = repRewardGold(state, result.reps.repUnits, now);
    summary.repXp = Math.round(result.reps.repUnits * BALANCE.exercise.repHeroXp);
    summary.kept.gold = (summary.kept.gold ?? 0) + summary.repGold;
    summary.kept.heroXp = (summary.kept.heroXp ?? 0) + summary.repXp;
    const today = dayKey(now);
    if (s.repsToday.day !== today) s.repsToday = { day: today, count: 0 };
    s.repsToday.count += verifiedReps;
    if (!s.exerciseDays.includes(today)) s.exerciseDays.push(today);
    summary.repRecord = verifiedReps > s.bestBattleReps;
    recordBattleReps(state, now, result.reps.full, result.reps.knee);
    applyQuestEvent(state, { type: 'verifiedRep', amount: verifiedReps });
  }

  const levelBefore = state.hero.level;
  grantReward(state, { ...summary.kept, heroXp: 0 });
  addHeroXpRaw(state, summary.kept.heroXp ?? 0);

  // --- Mode specific -------------------------------------------------------------------------
  if (result.mode === 'campaign') finalizeCampaign(state, result, summary, rng);
  else if (result.mode === 'endless') {
    summary.newRecord = result.wavesCleared > state.progress.endlessBest;
    state.progress.endlessBest = Math.max(state.progress.endlessBest, result.wavesCleared);
    const bonus: Reward = { ore: Math.floor(result.wavesCleared / 4), gems: summary.newRecord && result.wavesCleared >= 5 ? 5 : 0 };
    grantReward(state, bonus);
    summary.victoryBonus = bonus;
  } else if (result.mode === 'blitz') {
    summary.newRecord = result.score > state.progress.blitzBest;
    state.progress.blitzBest = Math.max(state.progress.blitzBest, result.score);
    const bonus: Reward = { ore: Math.floor(result.score / 15), petTreats: Math.floor(result.score / 20) };
    grantReward(state, bonus);
    summary.victoryBonus = bonus;
  } else if (result.mode === 'weekly') {
    const wk = weekKey(now);
    if (state.progress.weekly.weekKey !== wk) state.progress.weekly = { weekKey: wk, best: 0 };
    summary.newRecord = result.wavesCleared > state.progress.weekly.best;
    if (summary.newRecord) {
      // Rewards only for the improvement over this week's best, so replays never lose anything and never farm.
      const improvement = result.wavesCleared - state.progress.weekly.best;
      const bonus: Reward = { gems: improvement * 2, ore: improvement * 2 };
      grantReward(state, bonus);
      summary.victoryBonus = bonus;
      state.progress.weekly.best = result.wavesCleared;
    }
  }

  summary.heroLevelsGained = state.hero.level - levelBefore;
  // Waves all beaten (the stage only lacked its push-ups): army advice would be beside the point
  const beatenWaves = result.wavesCleared >= result.totalWaves;
  if (!won && !beatenWaves && result.mode !== 'endless' && result.mode !== 'blitz' && result.mode !== 'weekly' && result.mode !== 'challenge') {
    summary.suggestions = buildSuggestions(state, result);
  }
  summary.progressLines = progressLines(result);
  return summary;
}

function finalizeCampaign(state: GameState, result: BattleResult, summary: BattleSummary, rng: Rng): void {
  const idx = result.stageIndex;
  const p = state.progress;
  if (result.outcome !== 'victory') {
    if (result.reachedBoss && !p.bossCheckpoints.includes(idx)) {
      p.bossCheckpoints.push(idx);
      summary.bossCheckpointSaved = true;
    } else if (result.reachedBoss) summary.bossCheckpointSaved = true;
    return;
  }

  const firstClear = idx > p.highestCleared;
  summary.firstClear = firstClear;
  const mult = BALANCE.difficulty[result.difficulty].rewards;
  const bonus: Reward = {
    gold: Math.round(stageClearGold(idx) * mult * (firstClear ? BALANCE.economy.firstClearMultiplier : 1) * computeHeroStats(state).goldBonus),
    heroXp: Math.round(stageClearXp(idx) * mult),
    ore: BALANCE.economy.oreFromStage + (result.bossIds.length ? BALANCE.economy.oreFromBossBase : 0),
  };
  const { stage } = stageFromIndex(idx);
  const isBoss = stage === BOSS_STAGE;
  const isMini = stage === MINI_BOSS_STAGE;
  if (firstClear && isBoss) bonus.gems = BALANCE.economy.gemsFromBossFirstClear;
  if (firstClear && isMini) bonus.gems = Math.round(BALANCE.economy.gemsFromBossFirstClear / 2);
  if (isBoss || isMini) {
    summary.chest = firstClear ? (isBoss ? 'gold' : 'silver') : isBoss ? 'silver' : 'wooden';
    bonus.chest = summary.chest;
  }
  if (result.difficulty === 'heroic' && !p.heroicCleared.includes(idx)) {
    p.heroicCleared.push(idx);
    bonus.gems = (bonus.gems ?? 0) + 5;
  }
  grantReward(state, bonus);
  summary.victoryBonus = bonus;

  // Card fragments: a few random stacks from the deck and owned cards. New cards come from their
  // scheduled first-clear stage (and chests), so the "New card!" moments stay special.
  const pool = Object.keys(state.cards).sort();
  const stacks = rng.int(1, 2);
  const total = rng.int(BALANCE.economy.fragmentsPerStageClearMin, BALANCE.economy.fragmentsPerStageClearMax) + academyFragmentBonus(state);
  for (let i = 0; i < stacks; i++) {
    const preferDeck = rng.chance(0.65) && state.deck.length > 0;
    const cardId = preferDeck ? rng.pick(state.deck) : rng.pick(pool);
    const amount = Math.max(1, Math.round((total / stacks) * (getCard(cardId).rarity === 'common' ? 1 : 0.6)));
    const newCard = addCardFragments(state, cardId, amount);
    summary.fragments.push({ cardId, amount, newCard });
  }

  if (firstClear) {
    p.highestCleared = Math.max(p.highestCleared, idx);
    p.selectedStage = Math.min(TOTAL_STAGES - 1, idx + 1);
    for (const cardId of cardUnlockedAtStage(idx)) {
      if (!state.cards[cardId]) {
        addCardFragments(state, cardId, 1);
        summary.unlockedCards.push(cardId);
      }
    }
    const petId = PET_UNLOCKS[idx];
    if (petId) summary.pets.push({ petId, result: addPet(state, petId) });
    const itemId = FIRST_CLEAR_ITEMS[idx];
    if (itemId) summary.items.push({ defId: itemId, result: addItem(state, itemId).result });
  }
  for (const bossId of result.bossIds) {
    if (!p.bossesDefeated.includes(bossId)) {
      p.bossesDefeated.push(bossId);
      const cosmetic = BOSS_COSMETICS[bossId];
      if (cosmetic && !state.hero.cosmetics.includes(cosmetic)) {
        state.hero.cosmetics.push(cosmetic);
        summary.cosmetics.push(cosmetic);
      }
    }
  }
  p.bossCheckpoints = p.bossCheckpoints.filter((i) => i !== idx);
}

function progressLines(result: BattleResult): string[] {
  const lines: string[] = [];
  if (result.mode === 'campaign' || result.mode === 'dungeon') {
    lines.push(`Waves cleared: ${Math.min(result.wavesCleared, result.totalWaves)} / ${result.totalWaves}`);
  } else if (result.mode === 'blitz' || result.mode === 'challenge') {
    lines.push(`Enemies defeated in 90 seconds: ${result.score}`);
  } else lines.push(`Waves survived: ${result.wavesCleared}`);
  if (result.reachedBoss && result.bossTotalPhases > 0) {
    lines.push(
      result.bossDefeated
        ? 'Boss defeated!'
        : `Boss phases broken: ${result.bossPhasesCleared} / ${result.bossTotalPhases} (boss at ${Math.round(result.bossHpFraction * 100)}% health)`,
    );
  }
  lines.push(`Enemies defeated: ${result.enemiesDefeated}${result.elitesDefeated ? ` (${result.elitesDefeated} elite)` : ''}`);
  if (result.interrupts) lines.push(`Boss attacks interrupted: ${result.interrupts}`);
  const reps = result.reps.full + result.reps.knee;
  if (reps) lines.push(`Verified push-ups: ${result.reps.full} full, ${result.reps.knee} knee`);
  if (result.repDamage > 0) lines.push(`Push-up strike damage: ${Math.round(result.repDamage).toLocaleString('en-US')}`);
  if (result.reps.simulated) lines.push(`Simulated reps (developer mode): ${result.reps.simulated}`);
  return lines;
}

/** Turns a defeat into concrete, actionable advice. Never blames the player. */
export function buildSuggestions(state: GameState, result: BattleResult): Suggestion[] {
  const a = result.analysis;
  const out: Suggestion[] = [];
  const owned = (pred: (id: string) => boolean) => Object.keys(state.cards).filter(pred).map((id) => getCard(id).name);

  if (result.reachedBoss && !result.bossDefeated) {
    const { world, stage } = stageFromIndex(result.stageIndex);
    const w = getWorld(world);
    const boss = stage === BOSS_STAGE ? w.boss : w.miniBoss;
    out.push({ title: `${boss.name}'s weakness`, text: boss.hint, action: 'retry_boss' });
  }
  if (a.flyingReachedHero > 1.5 && !a.deckHasAntiAir) {
    const aa = owned((id) => getCard(id).targetsAir && getCard(id).role !== 'support');
    out.push({ title: 'Guard the skies', text: `Flying enemies slipped past your army. Add an anti-air card${aa.length ? ` such as ${aa[0]}` : ''} to your deck.`, action: 'cards' });
  }
  if (!a.deckHasTank) {
    const tanks = owned((id) => getCard(id).role === 'tank');
    out.push({ title: 'Add a frontline', text: `A tank${tanks.length ? ` like ${tanks[0]}` : ''} keeps enemies away from your damage dealers.`, action: 'cards' });
  }
  if (a.maxEnemiesAlive >= 8 && !a.deckHasSplash) {
    out.push({ title: 'Break up the crowds', text: 'Large groups overwhelmed you. Area damage (the Ashen Herald, Blackpowder Sapper, the Rime Widow) clears swarms fast.', action: 'cards' });
  }
  if (a.killedByBoss && result.interrupts === 0) {
    out.push({ title: 'Perfect timing', text: 'When the ground glows red, unleash your Legend Strike to interrupt the boss attack.', action: 'none' });
  }
  if (a.timeWithFullValor > 15) {
    out.push({ title: 'Spend your valor', text: `Your valor sat full for ${Math.round(a.timeWithFullValor)}s. Drag cards onto the field as soon as you can afford them (or tap AUTO in battle).`, action: 'none' });
  }
  const up = upgradeableCards(state);
  if (up.length) out.push({ title: 'Upgrade ready', text: `You can upgrade ${up.map((id) => getCard(id).name).slice(0, 2).join(' and ')} right now.`, action: 'cards' });
  if (checkBuildingUpgrade(state, 'barracks').ok) out.push({ title: 'Train your troops', text: 'Upgrading the Barracks boosts the health and damage of every unit.', action: 'base' });
  if (result.difficulty !== 'story') {
    out.push({ title: 'Try Story difficulty', text: 'Enemies are 35% weaker. Clearing it still unlocks the next stage, with smaller rewards.', action: 'retry_story' });
  }
  if (out.length < 3) {
    out.push({ title: 'Your army keeps growing', text: 'Idle income and the Gold Mine keep working. Come back stronger anytime - nothing was lost.', action: 'none' });
  }
  return out.slice(0, 4);
}
