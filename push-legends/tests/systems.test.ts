import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/config/balance';
import { CARDS } from '../src/core/content/cards';
import { DAILY_QUESTS } from '../src/core/content/quests';
import { TOTAL_STAGES } from '../src/core/content/worlds';
import { Rng } from '../src/core/rng';
import { createInitialState } from '../src/core/state/initial';
import {
  buildingUpgradeCost,
  checkBuildingUpgrade,
  collectMine,
  completeBuildingUpgrades,
  mineCapacity,
  mineStored,
  skipBuildingUpgrade,
  startBuildingUpgrade,
} from '../src/core/systems/buildings';
import { addCardFragments, checkCardUpgrade, toggleDeckCard, upgradeCard } from '../src/core/systems/cards';
import { chestOdds, openChest } from '../src/core/systems/chests';
import { difficultyMultiplier, goldRatePerSecond, killGold, stageClearGold } from '../src/core/systems/economy';
import { addItem, checkItemUpgrade, upgradeItem } from '../src/core/systems/equipment';
import { computeHeroStats } from '../src/core/systems/hero';
import { claimIdle, creditedSeconds, idleAccrued, idleCapHours, processReturn } from '../src/core/systems/idle';
import { addPet, upgradePet } from '../src/core/systems/pets';
import { applyQuestEvent, claimAchievement, claimQuest, recordActiveDay, refreshQuests, rerollDailyQuest, streakBonus } from '../src/core/systems/quests';
import { buyOffer, dailyOffers } from '../src/core/systems/shop';

const NOW = Date.UTC(2026, 9, 15, 12);
const H = 3600_000;

describe('economy formulas', () => {
  it('are finite, positive and increasing across all stages', () => {
    let prev = { d: 0, g: 0, c: 0 };
    for (let i = 0; i < TOTAL_STAGES; i++) {
      const cur = { d: difficultyMultiplier(i), g: killGold(i), c: stageClearGold(i) };
      for (const v of Object.values(cur)) expect(Number.isFinite(v) && v > 0).toBe(true);
      expect(cur.d).toBeGreaterThan(prev.d);
      expect(cur.g).toBeGreaterThan(prev.g);
      expect(cur.c).toBeGreaterThanOrEqual(prev.c);
      prev = cur;
    }
    // No runaway: the final stage is within a sane multiple of the first.
    expect(difficultyMultiplier(TOTAL_STAGES - 1)).toBeLessThan(2000);
    expect(goldRatePerSecond(TOTAL_STAGES - 1) / goldRatePerSecond(0)).toBeLessThan(500);
  });

  it('story difficulty is easier and pays less, heroic is harder and pays more', () => {
    expect(difficultyMultiplier(5, 'story')).toBeLessThan(difficultyMultiplier(5));
    expect(difficultyMultiplier(5, 'heroic')).toBeGreaterThan(difficultyMultiplier(5));
  });
});

describe('cards', () => {
  it('upgrades consume gold and fragments, never the card', () => {
    const s = createInitialState(NOW, 1);
    s.cards.oakshield_knight = { level: 1, fragments: 10 };
    s.resources.gold = 1000;
    const check = checkCardUpgrade(s, 'oakshield_knight');
    expect(check.ok).toBe(true);
    expect(upgradeCard(s, 'oakshield_knight')).toBe(true);
    expect(s.cards.oakshield_knight!.level).toBe(2);
    expect(s.cards.oakshield_knight!.fragments).toBe(10 - BALANCE.cards.fragmentsPerLevel.common);
    expect(s.resources.gold).toBe(1000 - check.gold);
  });

  it('failed upgrades change nothing', () => {
    const s = createInitialState(NOW, 1);
    s.resources.gold = 0;
    s.cards.oakshield_knight = { level: 1, fragments: 100 };
    const before = JSON.stringify(s);
    expect(upgradeCard(s, 'oakshield_knight')).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('surplus duplicates at max level become glory tokens', () => {
    const s = createInitialState(NOW, 1);
    s.cards.thornbow_archer = { level: BALANCE.cards.maxLevel, fragments: 0 };
    addCardFragments(s, 'thornbow_archer', 7);
    expect(s.cards.thornbow_archer!.fragments).toBe(0);
    expect(s.resources.glory).toBe(7 * BALANCE.cards.gloryPerSurplusFragment.common);
  });

  it('first fragments of a new card unlock it and add it to a non-full deck', () => {
    const s = createInitialState(NOW, 1);
    expect(s.cards.ember_mage).toBeUndefined();
    expect(addCardFragments(s, 'ember_mage', 3)).toBe(true);
    expect(s.cards.ember_mage).toEqual({ level: 1, fragments: 2 });
    expect(s.deck).toContain('ember_mage');
  });

  it('deck editing enforces size limits and ownership', () => {
    const s = createInitialState(NOW, 1);
    expect(toggleDeckCard(s, 'aurora_drake')).toBe(false);
    for (const c of CARDS) s.cards[c.id] = { level: 1, fragments: 0 };
    while (s.deck.length < BALANCE.cards.deckSize) {
      const next = CARDS.find((c) => !s.deck.includes(c.id))!;
      expect(toggleDeckCard(s, next.id)).toBe(true);
    }
    const extra = CARDS.find((c) => !s.deck.includes(c.id))!;
    expect(toggleDeckCard(s, extra.id)).toBe(false);
  });
});

describe('equipment and pets', () => {
  it('duplicate items add stars and then convert to ore, never removing items', () => {
    const s = createInitialState(NOW, 1);
    addItem(s, 'lucky_coin');
    const count = s.items.length;
    for (let i = 0; i < BALANCE.equipment.maxStars; i++) expect(addItem(s, 'lucky_coin').result).toBe('star');
    const ore = s.resources.ore;
    expect(addItem(s, 'lucky_coin').result).toBe('ore');
    expect(s.resources.ore).toBeGreaterThan(ore);
    expect(s.items.length).toBe(count);
  });

  it('item upgrades respect the blacksmith level cap', () => {
    const s = createInitialState(NOW, 1);
    s.resources.gold = 1e9;
    s.resources.ore = 1e9;
    const uid = s.items[0]!.uid;
    while (upgradeItem(s, uid));
    expect(s.items[0]!.level).toBe(5);
    expect(checkItemUpgrade(s, uid)).toMatchObject({ ok: false, reason: 'max_level' });
  });

  it('equipped gear changes hero stats', () => {
    const s = createInitialState(NOW, 1);
    const base = computeHeroStats(s);
    addItem(s, 'lucky_coin');
    expect(computeHeroStats(s).goldBonus).toBeGreaterThan(base.goldBonus);
  });

  it('pets level up and duplicates become stars, then treats', () => {
    const s = createInitialState(NOW, 1);
    expect(addPet(s, 'ember_fox')).toBe('new');
    expect(s.activePet).toBe('ember_fox');
    s.resources.gold = 1e6;
    s.resources.petTreats = 1e6;
    expect(upgradePet(s, 'ember_fox')).toBe(true);
    expect(s.pets.ember_fox!.level).toBe(2);
    for (let i = 0; i < BALANCE.pets.maxStars; i++) addPet(s, 'ember_fox');
    const treats = s.resources.petTreats;
    expect(addPet(s, 'ember_fox')).toBe('treats');
    expect(s.resources.petTreats).toBe(treats + BALANCE.pets.surplusDuplicateTreats);
  });
});

describe('buildings', () => {
  it('upgrades take time, complete later and never downgrade anything', () => {
    const s = createInitialState(NOW, 1);
    s.resources.gold = 1e6;
    expect(startBuildingUpgrade(s, 'barracks', NOW)).toBe(true);
    expect(s.buildings.barracks.level).toBe(0);
    expect(completeBuildingUpgrades(s, NOW + 1000)).toEqual([]);
    expect(completeBuildingUpgrades(s, NOW + 10_000)).toEqual(['barracks']);
    expect(s.buildings.barracks.level).toBe(1);
  });

  it('limits concurrent upgrades to the number of builders', () => {
    const s = createInitialState(NOW, 1);
    s.resources.gold = 1e6;
    expect(startBuildingUpgrade(s, 'barracks', NOW)).toBe(true);
    expect(startBuildingUpgrade(s, 'training_grounds', NOW)).toBe(true);
    expect(checkBuildingUpgrade(s, 'gold_mine')).toMatchObject({ ok: false, reason: 'no_builder' });
  });

  it('castle level is gated by campaign progress and gates other buildings', () => {
    const s = createInitialState(NOW, 1);
    s.resources.gold = 1e9;
    expect(checkBuildingUpgrade(s, 'castle')).toMatchObject({ ok: false, reason: 'progress_cap' });
    expect(checkBuildingUpgrade(s, 'academy')).toMatchObject({ ok: false, reason: 'locked' });
    s.progress.highestCleared = 4;
    expect(checkBuildingUpgrade(s, 'castle').ok).toBe(true);
    s.buildings.gold_mine.level = 2;
    expect(checkBuildingUpgrade(s, 'gold_mine')).toMatchObject({ ok: false, reason: 'castle_cap' });
  });

  it('can be finished early with gems', () => {
    const s = createInitialState(NOW, 1);
    s.resources.gold = 1e6;
    s.buildings.gold_mine.level = 1;
    s.buildings.castle.level = 3;
    s.progress.highestCleared = 20;
    startBuildingUpgrade(s, 'gold_mine', NOW);
    expect(skipBuildingUpgrade(s, 'gold_mine', NOW)).toBe(true);
    expect(s.buildings.gold_mine.level).toBe(2);
  });

  it('gold mine produces over time up to its capacity', () => {
    const s = createInitialState(NOW, 1);
    expect(mineStored(s, NOW)).toBe(0);
    expect(mineStored(s, NOW + H)).toBeGreaterThan(0);
    expect(mineStored(s, NOW + 1000 * H)).toBe(mineCapacity(s));
    const gold = s.resources.gold;
    const got = collectMine(s, NOW + H);
    expect(s.resources.gold).toBe(gold + got);
    expect(mineStored(s, NOW + H)).toBe(0);
  });

  it('upgrade costs grow but stay finite at max level', () => {
    expect(buildingUpgradeCost('gold_mine', 21)).toBeLessThan(1e12);
    expect(buildingUpgradeCost('gold_mine', 2)).toBeGreaterThan(buildingUpgradeCost('gold_mine', 1));
  });
});

describe('idle and offline rewards', () => {
  it('credits full rate first, then diminishing returns, then caps', () => {
    expect(creditedSeconds(3600, 8)).toBe(3600);
    const full = BALANCE.idle.fullRateHours * 3600;
    expect(creditedSeconds(full + 3600, 8)).toBeCloseTo(full + 3600 * BALANCE.idle.diminishedRate);
    expect(creditedSeconds(100 * 3600, 8)).toBe(creditedSeconds(8 * 3600, 8));
  });

  it('accrues gold while away and can be claimed', () => {
    const s = createInitialState(NOW, 1);
    s.progress.highestCleared = 5;
    const acc = idleAccrued(s, NOW + 3 * H);
    expect(acc.gold).toBeGreaterThan(0);
    const gold = s.resources.gold;
    claimIdle(s, NOW + 3 * H);
    expect(s.resources.gold).toBe(gold + acc.gold);
    expect(idleAccrued(s, NOW + 3 * H).gold).toBe(0);
  });

  it('treasury extends the cap', () => {
    const s = createInitialState(NOW, 1);
    const cap = idleCapHours(s);
    s.buildings.treasury.level = 3;
    expect(idleCapHours(s)).toBe(cap + 3);
  });

  it('a device clock moved backwards grants nothing and removes nothing', () => {
    const s = createInitialState(NOW, 1);
    s.maxSeenAt = NOW;
    s.lastSeenAt = NOW;
    const gold = s.resources.gold;
    const report = processReturn(s, NOW - 48 * H);
    expect(report?.clockWarning).toBe(true);
    expect(report?.idle.gold).toBe(0);
    expect(s.resources.gold).toBe(gold);
  });

  it('a clock jumped far forward is capped and income resumes normally after correction', () => {
    const s = createInitialState(NOW, 1);
    s.progress.highestCleared = 3;
    const future = NOW + 365 * 24 * H;
    const capped = idleAccrued(s, future);
    expect(capped.capped).toBe(true);
    claimIdle(s, future);
    // Clock corrected back to the real time: no negative effects, and income restarts.
    processReturn(s, NOW + H);
    expect(idleAccrued(s, NOW + 2 * H).gold).toBeGreaterThan(0);
  });

  it('returns an offline report after a break, with a welcome-back bonus after a long one', () => {
    const s = createInitialState(NOW, 1);
    const report = processReturn(s, NOW + 20 * H)!;
    expect(report.awaySec).toBeCloseTo(20 * 3600);
    expect(report.returnBonus).not.toBeNull();
    expect(s.pendingChests.length).toBe(1);
    expect(processReturn(s, NOW + 20 * H + 1000)).toBeNull();
  });
});

describe('quests, achievements and streaks', () => {
  it('daily quests are deterministic per day and include at most one exercise quest', () => {
    const a = createInitialState(NOW, 1);
    const b = createInitialState(NOW, 1);
    refreshQuests(a, NOW);
    refreshQuests(b, NOW);
    expect(a.quests.daily.map((q) => q.templateId)).toEqual(b.quests.daily.map((q) => q.templateId));
    const exercise = a.quests.daily.filter((q) => DAILY_QUESTS.find((t) => t.id === q.templateId)!.exercise);
    expect(exercise.length).toBeLessThanOrEqual(1);
  });

  it('progress, claim once, and reward', () => {
    const s = createInitialState(NOW, 1);
    refreshQuests(s, NOW);
    const q = s.quests.daily[0]!;
    const t = DAILY_QUESTS.find((x) => x.id === q.templateId)!;
    applyQuestEvent(s, { type: t.event, amount: q.target });
    const gold = s.resources.gold;
    expect(claimQuest(s, 'daily', 0)).not.toBeNull();
    expect(s.resources.gold).toBeGreaterThanOrEqual(gold);
    expect(claimQuest(s, 'daily', 0)).toBeNull();
  });

  it('rerolling a quest always offers a non-exercise quest (rest days are fine)', () => {
    const s = createInitialState(NOW, 1);
    refreshQuests(s, NOW);
    expect(rerollDailyQuest(s, 0)).toBe(true);
    expect(DAILY_QUESTS.find((t) => t.id === s.quests.daily[0]!.templateId)!.exercise).toBeFalsy();
    expect(rerollDailyQuest(s, 1)).toBe(false);
  });

  it('achievements claim tier by tier', () => {
    const s = createInitialState(NOW, 1);
    s.stats.enemiesDefeated = 1500;
    expect(claimAchievement(s, 'slayer')).not.toBeNull();
    expect(claimAchievement(s, 'slayer')).not.toBeNull();
    expect(claimAchievement(s, 'slayer')).toBeNull();
    expect(s.achievements.slayer).toBe(2);
  });

  it('streaks use rest tokens for missed days and cap their bonus', () => {
    const s = createInitialState(NOW, 1);
    const day = 86400_000;
    recordActiveDay(s, NOW);
    recordActiveDay(s, NOW + day);
    expect(s.streak.count).toBe(2);
    recordActiveDay(s, NOW + 3 * day); // missed one day, one rest token available
    expect(s.streak.count).toBe(3);
    expect(s.streak.restTokens).toBe(0);
    for (let i = 4; i < 40; i++) recordActiveDay(s, NOW + i * day);
    expect(streakBonus(s)).toBe(BALANCE.streak.maxBonus);
  });
});

describe('chests and shop', () => {
  it('displayed odds sum to 1 and exclude rarities with no discoverable cards', () => {
    const s = createInitialState(NOW, 1);
    const odds = chestOdds(s, 'gold');
    expect(odds.rarity.reduce((a, r) => a + r.chance, 0)).toBeCloseTo(1, 10);
    expect(odds.rarity.some((r) => r.rarity === 'mythic')).toBe(false);
  });

  it('observed rarity frequencies match the displayed odds', () => {
    const s = createInitialState(NOW, 1);
    s.progress.highestCleared = 45;
    const odds = chestOdds(s, 'gold');
    const counts: Record<string, number> = {};
    const rng = new Rng(5);
    let stacks = 0;
    for (let i = 0; i < 1500; i++) {
      const copy = structuredClone(s);
      for (const f of openChest(copy, 'gold', rng).fragments) {
        const rarity = CARDS.find((c) => c.id === f.cardId)!.rarity;
        counts[rarity] = (counts[rarity] ?? 0) + 1;
        stacks++;
      }
    }
    // Merged stacks of the same card reduce the count slightly; allow a tolerance.
    for (const r of odds.rarity) expect((counts[r.rarity] ?? 0) / stacks).toBeCloseTo(r.chance, 1);
  });

  it('shop offers can be bought once per day with gold', () => {
    const s = createInitialState(NOW, 1);
    s.resources.gold = 1e6;
    const offer = dailyOffers(s, NOW)[0]!;
    expect(buyOffer(s, offer.id, NOW)).toBe(true);
    expect(buyOffer(s, offer.id, NOW)).toBe(false);
    expect(s.cards[offer.cardId]).toBeDefined();
  });
});
