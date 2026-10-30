/**
 * Every tunable number in Push Legends lives here. Systems read from this object rather than
 * hardcoding values, so balance can be adjusted (and simulated) in one place.
 * See GAME_DESIGN.md for the reasoning behind each formula.
 */
export const BALANCE = {
  exercise: {
    /** Reward multiplier for a verified full push-up. */
    fullRepMultiplier: 1.0,
    /** Reward multiplier for a verified knee push-up. */
    kneeRepMultiplier: 0.5,
    /** Battle valor (deploy energy) granted per rep, before multipliers. */
    valorPerRep: 1.5,
    /**
     * Each verified push-up makes the hero strike the enemy closest to the gate for this many times
     * hero damage (× push-up power). Better swords raise hero damage, so they raise push-up damage.
     */
    repStrikeDamage: 4,
    /** Nearby enemies take this fraction of a push-up strike as splash damage. */
    repStrikeSplash: 0.4,
    repStrikeSplashRadius: 6,
    /** Push-ups done while no enemy is on the field are saved (up to this many) and released when the next wave arrives. */
    maxBankedStrikes: 5,
    /** Reps inside one battle needed to trigger a War Cry (army-wide damage boost). */
    warCryReps: 10,
    warCryDurationSec: 10,
    warCryDamageBonus: 0.4,
    /** Bonus gold for each verified rep (scaled by stage gold rate, see economy.repGold). */
    repGoldStageSeconds: 6,
    /** Hero XP per verified rep. */
    repHeroXp: 3,
    /** Daily verified reps that grant full direct rewards; above this, rewards drop to the tail rate. */
    dailyRepFullRewardCap: 100,
    dailyRepTailRewardRate: 0.25,
    /**
     * Campaign stages are only claimed after this many push-ups in the battle (full and knee both
     * count). Requirement = base + perStage × stage index (× boss multipliers), capped at `max`, and
     * never more than the player's best push-ups in one battle + `aboveBest` (min `min`), so it
     * grows with the player instead of becoming a wall.
     */
    stageReps: { base: 3, perStage: 0.5, miniBossMult: 1.25, bossMult: 1.5, max: 30, aboveBest: 3, min: 3 },
    /**
     * Calorie estimate per push-up: kcal ≈ kcalPerKg × body weight (from MET ≈ 8 at ~25 reps/min).
     * Knee push-ups move less body weight. Shown to the player as an estimate.
     */
    kcalPerKgPerRep: 0.0055,
    kneeCalorieFactor: 0.6,
  },

  combat: {
    tickSeconds: 0.05,
    heroX: 7,
    enemySpawnX: 102,
    allySpawnX: 12,
    maxValor: 10,
    startValor: 5,
    valorRegenPerSec: 0.5,
    handSize: 4,
    /** Special charges on its own over this many seconds, so non-exercisers can still use it. */
    specialPassiveChargeSec: 50,
    specialDamageMultiplier: 9,
    specialRange: 45,
    specialStunSec: 2,
    /** Time between waves. */
    waveIntervalSec: 2.5,
    /** Seconds between individual enemy spawns inside a wave. */
    spawnSpacingSec: 0.9,
    stageTimeLimitSec: 330,
    /** Campaign stage waves: count = baseWaves + (stage-1)/stagesPerExtraWave; enemies per wave = baseEnemies + stage/2 + world/2 + 2 per wave (max maxEnemies). */
    stageWaves: { baseWaves: 3, stagesPerExtraWave: 2, baseEnemies: 6, maxEnemies: 18 },
    eliteHpMult: 3.2,
    eliteDamageMult: 1.6,
    eliteGoldMult: 5,
    miniBossGoldMult: 20,
    bossGoldMult: 50,
    maxAlliesOnField: 14,
    /** Drag-to-place: cards can be dropped from just in front of the hero up to this far up the lane... */
    deployMinX: 10,
    deployMaxX: 52,
    /** ...but never closer than this to the nearest enemy (no dropping troops behind enemy lines). */
    deployEnemyGap: 4,
  },

  difficulty: {
    /** Baseline multiplier on all enemy health and damage. */
    baseEnemyPower: 3.4,
    /** Global multipliers for boss and mini-boss health and damage (relative to their data values). */
    bossHpMult: 0.8,
    bossDamageMult: 0.65,
    /** Enemy HP and damage multiply by this per global stage (world * 10 + stage). */
    stageGrowth: 1.05,
    /** Extra step multiplier applied at each new world. */
    worldStep: 1.06,
    story: { power: 0.65, rewards: 0.6 },
    normal: { power: 1, rewards: 1 },
    heroic: { power: 1.45, rewards: 1.8 },
    /** Endless: per-wave growth. */
    endlessWaveGrowth: 1.09,
  },

  economy: {
    killGoldBase: 3,
    killGoldGrowth: 1.07,
    stageClearGoldBase: 40,
    firstClearMultiplier: 3,
    stageXpBase: 20,
    stageXpGrowth: 1.06,
    oreFromBossBase: 6,
    oreFromStage: 1,
    /** Gems are earned only through gameplay (achievements, bosses, quests). No real-money purchases exist. */
    gemsFromBossFirstClear: 25,
    fragmentsPerStageClearMin: 2,
    fragmentsPerStageClearMax: 5,
  },

  cards: {
    maxLevel: 20,
    /** Per-level stat growth for card HP and damage. */
    statGrowth: 1.115,
    /** Gold to go from level L to L+1 = base * growth^(L-1). */
    upgradeGoldBase: 25,
    upgradeGoldGrowth: 1.4,
    /** Fragments to go from level L to L+1 = perLevel[rarity] * L. */
    fragmentsPerLevel: { common: 4, rare: 3, epic: 2, legendary: 1, mythic: 1 },
    /** Glory tokens granted per surplus fragment once a card is max level. */
    gloryPerSurplusFragment: { common: 1, rare: 2, epic: 4, legendary: 10, mythic: 15 },
    /** Gold price of one fragment in the shop, per rarity, scaled by world. */
    shopFragmentGold: { common: 12, rare: 30, epic: 80, legendary: 260, mythic: 400 },
    shopFragmentGlory: { common: 2, rare: 5, epic: 12, legendary: 40, mythic: 60 },
    deckSize: 8,
    normalizedPvpLevel: 10,
  },

  hero: {
    baseHp: 420,
    /** Hero health and damage grow geometrically per level so the hero keeps pace with enemy scaling. */
    hpGrowth: 1.055,
    baseDamage: 26,
    damageGrowth: 1.05,
    attackInterval: 1.0,
    attackRange: 9,
    xpToLevelBase: 60,
    xpToLevelGrowth: 1.16,
    maxLevel: 60,
  },

  equipment: {
    maxLevelPerBlacksmithLevel: 5,
    upgradeOreBase: 3,
    upgradeOreGrowth: 1.22,
    upgradeGoldBase: 60,
    upgradeGoldGrowth: 1.28,
    /** Stat growth per item level. */
    statGrowthPerLevel: 0.1,
    maxStars: 5,
    /** Each star adds this fraction to all item stats. */
    starBonus: 0.15,
    /** Ore granted for a duplicate item once it is at max stars (never destroys an item). */
    surplusDuplicateOre: { common: 6, rare: 12, epic: 25, legendary: 60, mythic: 100 },
    /** Armory sword price = this many seconds of the reference gold rate at the sword's unlock stage. */
    armoryPriceSeconds: 240,
  },

  pets: {
    maxLevel: 30,
    treatCostBase: 4,
    treatCostGrowth: 1.18,
    goldCostBase: 80,
    goldCostGrowth: 1.25,
    /** Passive bonus grows linearly with level and stars. */
    perLevelBonus: 0.06,
    perStarBonus: 0.25,
    maxStars: 5,
    surplusDuplicateTreats: 25,
  },

  idle: {
    /**
     * Idle army income = this fraction of the active gold rate at the best cleared stage, per real second.
     * Idle runs for many hours while active play lasts minutes, so the fraction is small: a day of idle
     * income is worth roughly 20 minutes of active play.
     */
    armyIncomeFraction: 0.03,
    /** Offline time at full rate before diminishing returns start. */
    fullRateHours: 2,
    /** Rate after fullRateHours until the cap. */
    diminishedRate: 0.6,
    baseCapHours: 8,
    capHoursPerTreasuryLevel: 1,
    maxCapHours: 24,
    /** Minimum away time before an offline report is shown. */
    minReportSeconds: 60,
    returnBonusAfterHours: 12,
    enemiesPerMinute: 6,
    orePerHour: 0.5,
  },

  buildings: {
    /** Upgrade duration (seconds) = min(cap, base * growth^(level-1)). Level 1 → 2 is quick. */
    durationBaseSec: 10,
    durationGrowth: 1.9,
    durationCapSec: 4 * 3600,
    /** Gems to finish instantly per remaining minute (rounded up, min 1). */
    gemsPerMinuteSkip: 0.5,
    builders: 2,
  },

  quests: {
    dailyCount: 4,
    weeklyCount: 3,
  },

  streak: {
    bonusPerDay: 0.02,
    maxBonus: 0.2,
    /** Rest tokens cover a missed day without breaking the streak bonus. */
    maxRestTokens: 2,
    restTokenEveryDays: 5,
  },

  dungeon: {
    floors: 6,
    fullRewardRunsPerDay: 3,
    reducedRewardRate: 0.3,
    roomPower: { battle: 1, swarm: 1.15, elite: 1.35, boss: 1.6 },
    swarmGoldBonus: 0.6,
    eliteRewardBonus: 1.2,
    restHealBuff: 0.25,
  },

  chests: {
    wooden: { fragments: 12, stacks: 2, goldMult: 20, weights: { common: 74, rare: 22, epic: 4, legendary: 0, mythic: 0 } },
    silver: { fragments: 30, stacks: 3, goldMult: 45, weights: { common: 60, rare: 30, epic: 9, legendary: 1, mythic: 0 } },
    gold: { fragments: 70, stacks: 4, goldMult: 100, weights: { common: 45, rare: 35, epic: 16, legendary: 3.5, mythic: 0.5 } },
    legend: { fragments: 140, stacks: 4, goldMult: 220, weights: { common: 25, rare: 35, epic: 28, legendary: 10, mythic: 2 } },
    /** Chance an item drops from a chest. */
    itemChance: { wooden: 0.15, silver: 0.3, gold: 0.6, legend: 1 },
    goldPrice: { wooden: 0, silver: 400, gold: 1500, legend: 0 },
    gemPrice: { wooden: 0, silver: 20, gold: 60, legend: 160 },
  },
};

export type Balance = typeof BALANCE;
export type Difficulty = 'story' | 'normal' | 'heroic';
