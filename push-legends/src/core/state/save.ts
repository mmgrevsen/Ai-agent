import { CARD_BY_ID } from '../content/cards';
import { COSMETIC_BY_ID } from '../content/cosmetics';
import { EQUIP_SLOTS, ITEM_BY_ID } from '../content/equipment';
import { PET_BY_ID } from '../content/pets';
import { BUILDINGS } from '../content/buildings';
import { BALANCE } from '../config/balance';
import { hashString } from '../rng';
import { createInitialState } from './initial';
import { SAVE_VERSION, type GameState } from './types';

/** Abstract key-value storage so the save system can target localStorage, Capacitor Preferences or a cloud backend later. */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageAdapter {
  readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

interface SaveEnvelope {
  format: 'push-legends';
  version: number;
  savedAt: number;
  checksum: number;
  data: unknown;
}

export const SAVE_KEY = 'push-legends/save';
export const BACKUP_KEY = 'push-legends/save-backup';
export const CORRUPT_PREFIX = 'push-legends/corrupt-';

/**
 * Migrations upgrade raw save data from version N to N+1. Add an entry whenever the save shape
 * changes in a way sanitizeState cannot fill with defaults (renames, unit changes, restructuring).
 */
export const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

export function serializeState(state: GameState, now: number): string {
  const json = JSON.stringify(state);
  const envelope: SaveEnvelope = { format: 'push-legends', version: SAVE_VERSION, savedAt: now, checksum: hashString(json), data: state };
  return JSON.stringify(envelope);
}

export type LoadResult =
  | { ok: true; state: GameState; repaired: string[] }
  | { ok: false; reason: string };

export function deserializeState(raw: string, now: number): LoadResult {
  let envelope: SaveEnvelope;
  try {
    envelope = JSON.parse(raw) as SaveEnvelope;
  } catch {
    return { ok: false, reason: 'Save data is not valid JSON' };
  }
  if (!envelope || envelope.format !== 'push-legends' || typeof envelope.data !== 'object' || envelope.data === null) {
    return { ok: false, reason: 'Save data has an unknown format' };
  }
  if (typeof envelope.version !== 'number' || envelope.version > SAVE_VERSION) {
    return { ok: false, reason: `Save was written by a newer game version (${String(envelope.version)})` };
  }
  if (hashString(JSON.stringify(envelope.data)) !== envelope.checksum) {
    return { ok: false, reason: 'Save checksum mismatch (incomplete write or corruption)' };
  }
  let data = envelope.data as Record<string, unknown>;
  for (let v = envelope.version; v < SAVE_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (migrate) data = migrate(data);
  }
  const repaired: string[] = [];
  const state = sanitizeState(data, now, repaired);
  return { ok: true, state, repaired };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Recursively overlays `saved` onto `defaults`, keeping only values whose type matches the default. */
function overlay(defaults: unknown, saved: unknown, path: string, repaired: string[]): unknown {
  if (saved === undefined) return defaults;
  if (isObj(defaults)) {
    if (!isObj(saved)) {
      repaired.push(path);
      return defaults;
    }
    const out: Obj = {};
    for (const key of Object.keys(defaults)) out[key] = overlay(defaults[key], saved[key], `${path}.${key}`, repaired);
    return out;
  }
  if (Array.isArray(defaults)) {
    if (!Array.isArray(saved)) {
      repaired.push(path);
      return defaults;
    }
    return saved;
  }
  if (typeof defaults === 'number') {
    if (typeof saved !== 'number' || !Number.isFinite(saved)) {
      repaired.push(path);
      return defaults;
    }
    return saved;
  }
  if (defaults === null) return saved;
  if (typeof saved !== typeof defaults) {
    repaired.push(path);
    return defaults;
  }
  return saved;
}

const nonNeg = (n: unknown, fallback = 0) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : fallback);
const intIn = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;

/** Produces a fully valid GameState from untrusted data. Never throws. */
export function sanitizeState(raw: unknown, now: number, repaired: string[] = []): GameState {
  const defaults = createInitialState(now, 1);
  const data = isObj(raw) ? raw : {};
  // Dynamic-key records are handled separately; overlay would drop their keys.
  const base = overlay(defaults, { ...data, cards: undefined, pets: undefined, achievements: undefined, buildings: undefined }, 'state', repaired) as GameState;

  // Graphics: unknown values fall back, and players who never chose get the current default.
  if (base.settings.graphics !== 'pixel' && base.settings.graphics !== 'smooth') base.settings.graphics = 'smooth';
  if (!base.settings.graphicsChosen) base.settings.graphics = 'smooth';
  // Auto-deploy used to default to on (and the in-battle button used to save it), which spent valor
  // before players could pick their own cards. It now stays off unless switched on in Settings.
  if (!base.settings.autoDeployOptIn) base.settings.autoDeploy = false;

  // Keep the original friend code when present, otherwise generate a fresh one.
  if (!isObj(data.profile) || typeof data.profile.friendCode !== 'string') base.profile.friendCode = createInitialState(now).profile.friendCode;

  for (const key of Object.keys(base.resources) as (keyof GameState['resources'])[]) {
    base.resources[key] = Math.floor(nonNeg(base.resources[key]));
  }

  // Cards
  const cards: GameState['cards'] = {};
  if (isObj(data.cards)) {
    for (const [id, value] of Object.entries(data.cards)) {
      if (!CARD_BY_ID.has(id) || !isObj(value)) {
        repaired.push(`cards.${id}`);
        continue;
      }
      cards[id] = { level: intIn(value.level, 1, BALANCE.cards.maxLevel, 1), fragments: Math.floor(nonNeg(value.fragments)) };
    }
  }
  if (Object.keys(cards).length === 0) Object.assign(cards, defaults.cards);
  base.cards = cards;
  base.deck = [...new Set(base.deck.filter((id) => typeof id === 'string' && cards[id]))].slice(0, BALANCE.cards.deckSize);
  if (base.deck.length === 0) base.deck = Object.keys(cards).slice(0, BALANCE.cards.deckSize);

  // Items
  const seenUids = new Set<string>();
  base.items = base.items.filter((it): it is GameState['items'][number] => {
    if (!isObj(it) || typeof it.uid !== 'string' || typeof it.defId !== 'string' || !ITEM_BY_ID.has(it.defId) || seenUids.has(it.uid)) {
      repaired.push('items');
      return false;
    }
    seenUids.add(it.uid);
    return true;
  });
  for (const it of base.items) {
    it.level = intIn(it.level, 1, 200, 1);
    it.stars = intIn(it.stars, 0, BALANCE.equipment.maxStars, 0);
  }
  const savedEquipped = isObj(data.hero) && isObj(data.hero.equipped) ? data.hero.equipped : null;
  for (const slot of EQUIP_SLOTS) {
    if (savedEquipped) {
      const v = savedEquipped[slot];
      base.hero.equipped[slot] = typeof v === 'string' ? v : null;
    }
    const uid = base.hero.equipped[slot];
    const item = base.items.find((i) => i.uid === uid);
    if (uid !== null && (!item || ITEM_BY_ID.get(item.defId)!.slot !== slot)) {
      base.hero.equipped[slot] = null;
      repaired.push(`hero.equipped.${slot}`);
    }
  }
  base.hero.level = intIn(base.hero.level, 1, BALANCE.hero.maxLevel, 1);
  base.hero.xp = nonNeg(base.hero.xp);
  base.hero.cosmetics = [...new Set(base.hero.cosmetics.filter((c) => COSMETIC_BY_ID.has(c)).concat(defaults.hero.cosmetics))];
  if (!base.hero.cosmetics.includes(base.hero.cape)) base.hero.cape = defaults.hero.cape;
  if (!base.hero.cosmetics.includes(base.hero.aura)) base.hero.aura = defaults.hero.aura;

  // Pets
  const pets: GameState['pets'] = {};
  if (isObj(data.pets)) {
    for (const [id, value] of Object.entries(data.pets)) {
      if (!PET_BY_ID.has(id) || !isObj(value)) continue;
      pets[id] = { level: intIn(value.level, 1, BALANCE.pets.maxLevel, 1), stars: intIn(value.stars, 0, BALANCE.pets.maxStars, 0) };
    }
  }
  base.pets = pets;
  if (typeof base.activePet !== 'string' || !pets[base.activePet]) base.activePet = null;

  const d = base.dungeon as unknown;
  if (d !== null && (!isObj(d) || !Array.isArray(d.nodes) || !Array.isArray(d.visited) || typeof d.seed !== 'number' || !isObj(d.banked))) {
    base.dungeon = null;
    repaired.push('dungeon');
  }

  // Buildings
  const savedBuildings = isObj(data.buildings) ? data.buildings : {};
  for (const def of BUILDINGS) {
    const saved = savedBuildings[def.id];
    const fallback = defaults.buildings[def.id];
    if (!isObj(saved)) {
      base.buildings[def.id] = { ...fallback };
      continue;
    }
    base.buildings[def.id] = {
      level: intIn(saved.level, 0, def.maxLevel, fallback.level),
      upgradeEndsAt: typeof saved.upgradeEndsAt === 'number' && Number.isFinite(saved.upgradeEndsAt) ? saved.upgradeEndsAt : null,
    };
  }
  if (base.buildings.castle.level < 1) base.buildings.castle.level = 1;

  // Achievements: tier index claimed per achievement.
  const achievements: GameState['achievements'] = {};
  if (isObj(data.achievements)) {
    for (const [id, tier] of Object.entries(data.achievements)) achievements[id] = intIn(tier, 0, 20, 0);
  }
  base.achievements = achievements;

  // Tutorial flags and push-up calibration are dynamic-key records too: the overlay above only keeps
  // keys present in the defaults (none), so they are restored here.
  const tutorial: GameState['tutorial'] = {};
  if (isObj(data.tutorial)) {
    for (const [k, v] of Object.entries(data.tutorial)) if (typeof v === 'boolean' && k.length <= 40) tutorial[k] = v;
  }
  base.tutorial = tutorial;
  const calibration: GameState['settings']['calibration'] = {};
  const savedCal = isObj(data.settings) && isObj(data.settings.calibration) ? data.settings.calibration : {};
  for (const mode of ['full', 'knee'] as const) {
    const c = savedCal[mode];
    if (isObj(c) && typeof c.topAngle === 'number' && typeof c.bottomAngle === 'number' && Number.isFinite(c.topAngle) && Number.isFinite(c.bottomAngle)) {
      calibration[mode] = { topAngle: c.topAngle, bottomAngle: c.bottomAngle, calibratedAt: nonNeg(c.calibratedAt) };
    }
  }
  base.settings.calibration = calibration;

  // The push-up log is an array of records: keep only well-formed days (newest 366)
  const log = isObj(data.stats) && Array.isArray(data.stats.repLog) ? data.stats.repLog : [];
  base.stats.repLog = log
    .filter((d): d is Obj => isObj(d) && typeof d.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.day))
    .map((d) => ({ day: d.day as string, full: intIn(d.full, 0, 1e6, 0), knee: intIn(d.knee, 0, 1e6, 0), best: intIn(d.best, 0, 1e5, 0), sets: intIn(d.sets, 0, 1e5, 0) }))
    .slice(-366);
  base.stats.bestBattleReps = intIn(base.stats.bestBattleReps, 0, 1e5, 0);
  base.settings.bodyWeightKg = Math.min(250, Math.max(30, nonNeg(base.settings.bodyWeightKg, 75) || 75));

  base.progress.highestCleared = intIn(base.progress.highestCleared, -1, 10_000, -1);
  base.progress.selectedStage = intIn(base.progress.selectedStage, 0, base.progress.highestCleared + 1, 0);
  base.version = SAVE_VERSION;
  base.maxSeenAt = Math.max(nonNeg(base.maxSeenAt), nonNeg(base.lastSeenAt));
  return base;
}

/**
 * Persists the game with a rolling backup. On load, a corrupt main save falls back to the
 * backup; unreadable data is preserved under a "corrupt-" key instead of being deleted.
 */
export class SaveManager {
  constructor(private readonly storage: StorageAdapter) {}

  save(state: GameState, now: number): void {
    const serialized = serializeState(state, now);
    const previous = this.storage.getItem(SAVE_KEY);
    if (previous && deserializeState(previous, now).ok) this.storage.setItem(BACKUP_KEY, previous);
    this.storage.setItem(SAVE_KEY, serialized);
  }

  load(now: number): { state: GameState; source: 'main' | 'backup' | 'new'; warnings: string[] } {
    const warnings: string[] = [];
    for (const [key, source] of [
      [SAVE_KEY, 'main'],
      [BACKUP_KEY, 'backup'],
    ] as const) {
      const raw = this.storage.getItem(key);
      if (!raw) continue;
      const result = deserializeState(raw, now);
      if (result.ok) {
        if (result.repaired.length) warnings.push(`Repaired ${result.repaired.length} invalid field(s) in ${source} save`);
        return { state: result.state, source, warnings };
      }
      warnings.push(`${source} save unreadable: ${result.reason}`);
      this.storage.setItem(`${CORRUPT_PREFIX}${source}-${now}`, raw);
    }
    return { state: createInitialState(now), source: 'new', warnings };
  }

  exportSave(state: GameState, now: number): string {
    return serializeState(state, now);
  }

  reset(): void {
    this.storage.removeItem(SAVE_KEY);
    this.storage.removeItem(BACKUP_KEY);
  }
}
