import { BALANCE } from '../config/balance';

export type BuildingId =
  | 'castle'
  | 'gold_mine'
  | 'barracks'
  | 'academy'
  | 'blacksmith'
  | 'training_grounds'
  | 'treasury'
  | 'pet_sanctuary'
  | 'guild_hall';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  description: string;
  maxLevel: number;
  /** Castle level required before this building can be built (level 0 → 1). */
  unlockCastleLevel: number;
  costBase: number;
  costGrowth: number;
  /** Human readable benefit for a given level. */
  benefit: (level: number) => string;
}

/** Numeric effects per building level; read by systems, never duplicated in UI code. */
export const BUILDING_EFFECTS = {
  mineGoldPerHour: (level: number) => (level <= 0 ? 0 : Math.round(90 * Math.pow(1.24, level - 1))),
  mineCapacityHours: (treasuryLevel: number) => 3 + treasuryLevel * 0.5,
  barracksArmyHp: (level: number) => level * 0.04,
  barracksArmyDamage: (level: number) => level * 0.025,
  academyCardDiscount: (level: number) => Math.min(0.35, level * 0.025),
  academyFragmentBonus: (level: number) => Math.floor(level / 3),
  blacksmithItemMaxLevel: (level: number) => Math.max(BALANCE.equipment.maxLevelPerBlacksmithLevel, level * BALANCE.equipment.maxLevelPerBlacksmithLevel),
  blacksmithDiscount: (level: number) => Math.min(0.3, level * 0.02),
  trainingRepPower: (level: number) => level * 0.05,
  trainingRepGold: (level: number) => level * 0.06,
  treasuryOfflineHours: (level: number) => level,
  sanctuaryPetBonus: (level: number) => level * 0.05,
  guildQuestBonus: (level: number) => level * 0.04,
  /** Castle levels are earned by clearing stages: one castle level per 5 stages cleared. */
  castleMaxLevelForProgress: (highestClearedIndex: number) => 1 + Math.floor((highestClearedIndex + 1) / 5),
  /** Other buildings may be upgraded up to twice the castle level. */
  buildingCapFromCastle: (castleLevel: number) => castleLevel * 2,
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const BUILDINGS: readonly BuildingDef[] = [
  {
    id: 'castle',
    name: 'Castle',
    description: 'The heart of your realm. Raising it unlocks new buildings and higher building levels.',
    maxLevel: 11,
    unlockCastleLevel: 0,
    costBase: 300,
    costGrowth: 2.1,
    benefit: (l) => `Other buildings up to level ${BUILDING_EFFECTS.buildingCapFromCastle(l)}`,
  },
  {
    id: 'gold_mine',
    name: 'Gold Mine',
    description: 'Produces gold around the clock. Collect it from the base.',
    maxLevel: 22,
    unlockCastleLevel: 1,
    costBase: 120,
    costGrowth: 1.42,
    benefit: (l) => `${BUILDING_EFFECTS.mineGoldPerHour(l)} gold per hour`,
  },
  {
    id: 'barracks',
    name: 'Barracks',
    description: 'Trains your troops. Every card unit gains health and damage.',
    maxLevel: 22,
    unlockCastleLevel: 1,
    costBase: 160,
    costGrowth: 1.45,
    benefit: (l) => `+${pct(BUILDING_EFFECTS.barracksArmyHp(l))} army health, +${pct(BUILDING_EFFECTS.barracksArmyDamage(l))} army damage`,
  },
  {
    id: 'training_grounds',
    name: 'Training Grounds',
    description: 'Makes every push-up count for more: more valor, faster specials and more gold per rep.',
    maxLevel: 22,
    unlockCastleLevel: 1,
    costBase: 140,
    costGrowth: 1.43,
    benefit: (l) => `+${pct(BUILDING_EFFECTS.trainingRepPower(l))} push-up power, +${pct(BUILDING_EFFECTS.trainingRepGold(l))} rep gold`,
  },
  {
    id: 'academy',
    name: 'Academy',
    description: 'Scholars study your cards, making upgrades cheaper and finding extra fragments.',
    maxLevel: 22,
    unlockCastleLevel: 2,
    costBase: 220,
    costGrowth: 1.45,
    benefit: (l) => `-${pct(BUILDING_EFFECTS.academyCardDiscount(l))} card upgrade gold, +${BUILDING_EFFECTS.academyFragmentBonus(l)} fragments per stage`,
  },
  {
    id: 'blacksmith',
    name: 'Blacksmith',
    description: 'Upgrades weapons and armor. Higher levels allow stronger gear.',
    maxLevel: 22,
    unlockCastleLevel: 2,
    costBase: 200,
    costGrowth: 1.45,
    benefit: (l) => `Gear up to level ${BUILDING_EFFECTS.blacksmithItemMaxLevel(l)}, -${pct(BUILDING_EFFECTS.blacksmithDiscount(l))} gear upgrade cost`,
  },
  {
    id: 'treasury',
    name: 'Treasury',
    description: 'Stores more. Extends offline rewards and gold mine capacity.',
    maxLevel: 16,
    unlockCastleLevel: 3,
    costBase: 260,
    costGrowth: 1.5,
    benefit: (l) => `+${BUILDING_EFFECTS.treasuryOfflineHours(l)}h offline cap, mine stores ${BUILDING_EFFECTS.mineCapacityHours(l)}h`,
  },
  {
    id: 'pet_sanctuary',
    name: 'Pet Sanctuary',
    description: 'A cozy home for companions. Boosts every pet bonus.',
    maxLevel: 22,
    unlockCastleLevel: 3,
    costBase: 240,
    costGrowth: 1.46,
    benefit: (l) => `+${pct(BUILDING_EFFECTS.sanctuaryPetBonus(l))} pet bonuses`,
  },
  {
    id: 'guild_hall',
    name: 'Guild Hall',
    description: 'Prepares your realm for guilds. Currently boosts quest rewards; online guilds are planned.',
    maxLevel: 16,
    unlockCastleLevel: 4,
    costBase: 400,
    costGrowth: 1.5,
    benefit: (l) => `+${pct(BUILDING_EFFECTS.guildQuestBonus(l))} quest rewards`,
  },
];

export const BUILDING_BY_ID: ReadonlyMap<BuildingId, BuildingDef> = new Map(BUILDINGS.map((b) => [b.id, b]));

export function getBuilding(id: BuildingId): BuildingDef {
  const def = BUILDING_BY_ID.get(id);
  if (!def) throw new Error(`Unknown building ${id}`);
  return def;
}
