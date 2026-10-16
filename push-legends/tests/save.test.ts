import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/core/state/initial';
import { BACKUP_KEY, CORRUPT_PREFIX, deserializeState, MemoryStorage, sanitizeState, SAVE_KEY, SaveManager, serializeState } from '../src/core/state/save';
import { SAVE_VERSION } from '../src/core/state/types';
import { addItem } from '../src/core/systems/equipment';
import { decodeChallenge, decodeDeck, encodeChallenge, encodeDeck, isValidFriendCode } from '../src/core/social/codes';
import { addLocalFriend, blockCode, importChallenge } from '../src/core/social/service';
import { generateFriendCode } from '../src/core/state/initial';

const NOW = Date.UTC(2026, 9, 15, 12);

describe('save system', () => {
  it('round-trips the full state', () => {
    const s = createInitialState(NOW, 1);
    addItem(s, 'emberbrand');
    s.resources.gold = 12345;
    const r = deserializeState(serializeState(s, NOW), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toEqual(s);
  });

  it('graphics style: default applies until the player chooses one', () => {
    const s = createInitialState(NOW, 1);
    s.settings.graphics = 'pixel';
    expect(sanitizeState(JSON.parse(JSON.stringify(s)), NOW).settings.graphics).toBe('smooth');
    s.settings.graphicsChosen = true;
    expect(sanitizeState(JSON.parse(JSON.stringify(s)), NOW).settings.graphics).toBe('pixel');
    (s.settings as { graphics: string }).graphics = 'bogus';
    expect(sanitizeState(JSON.parse(JSON.stringify(s)), NOW).settings.graphics).toBe('smooth');
  });

  it('save manager persists and reloads', () => {
    const storage = new MemoryStorage();
    const m = new SaveManager(storage);
    const s = createInitialState(NOW, 2);
    s.resources.gems = 77;
    m.save(s, NOW);
    expect(m.load(NOW).state.resources.gems).toBe(77);
  });

  it('falls back to the backup when the main save is corrupted and keeps the corrupt data', () => {
    const storage = new MemoryStorage();
    const m = new SaveManager(storage);
    const s = createInitialState(NOW, 3);
    s.resources.gold = 100;
    m.save(s, NOW);
    s.resources.gold = 200;
    m.save(s, NOW + 1);
    expect(storage.getItem(BACKUP_KEY)).not.toBeNull();
    storage.setItem(SAVE_KEY, storage.getItem(SAVE_KEY)!.slice(0, 50)); // simulate a torn write
    const loaded = m.load(NOW + 2);
    expect(loaded.source).toBe('backup');
    expect(loaded.state.resources.gold).toBe(100);
    expect([...storage.data.keys()].some((k) => k.startsWith(CORRUPT_PREFIX))).toBe(true);
  });

  it('starts fresh (without deleting anything) if no save is readable', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, 'not json');
    const loaded = new SaveManager(storage).load(NOW);
    expect(loaded.source).toBe('new');
    expect(loaded.warnings.length).toBeGreaterThan(0);
    expect([...storage.data.keys()].some((k) => k.startsWith(CORRUPT_PREFIX))).toBe(true);
  });

  it('detects checksum mismatches', () => {
    const raw = JSON.parse(serializeState(createInitialState(NOW, 1), NOW));
    raw.data.resources.gold = 999999;
    expect(deserializeState(JSON.stringify(raw), NOW).ok).toBe(false);
  });

  it('rejects saves from a newer game version instead of mangling them', () => {
    const raw = JSON.parse(serializeState(createInitialState(NOW, 1), NOW));
    raw.version = SAVE_VERSION + 1;
    const r = deserializeState(JSON.stringify(raw), NOW);
    expect(r.ok).toBe(false);
  });

  it('repairs invalid fields while keeping valid progress', () => {
    const s = createInitialState(NOW, 1) as unknown as Record<string, any>;
    s.resources.gold = -50;
    s.resources.gems = 'lots';
    s.cards.not_a_card = { level: 3, fragments: 1 };
    s.cards.oakshield_knight = { level: 999, fragments: 4 };
    s.deck = ['oakshield_knight', 'not_a_card', 'oakshield_knight'];
    s.hero.equipped.weapon = 'missing_uid';
    s.buildings.castle = { level: -3 };
    delete s.settings;
    const repaired: string[] = [];
    const out = sanitizeState(s, NOW, repaired);
    expect(out.resources.gold).toBe(0);
    expect(out.resources.gems).toBe(20);
    expect(out.cards.not_a_card).toBeUndefined();
    expect(out.cards.oakshield_knight!.level).toBe(20);
    expect(out.deck).toEqual(['oakshield_knight']);
    expect(out.hero.equipped.weapon).toBeNull();
    expect(out.buildings.castle.level).toBe(1);
    expect(out.settings.masterVolume).toBeGreaterThan(0);
    expect(repaired.length).toBeGreaterThan(0);
  });

  it('preserves an intentionally empty equipment slot', () => {
    const s = createInitialState(NOW, 1);
    s.hero.equipped.weapon = null;
    const r = deserializeState(serializeState(s, NOW), NOW);
    expect(r.ok && r.state.hero.equipped.weapon).toBeNull();
  });

  it('handles an interrupted building upgrade on reload', () => {
    const s = createInitialState(NOW, 1);
    s.buildings.barracks.upgradeEndsAt = NOW + 5000;
    const r = deserializeState(serializeState(s, NOW), NOW + 10_000);
    expect(r.ok && r.state.buildings.barracks.upgradeEndsAt).toBe(NOW + 5000);
  });
});

describe('social codes (offline)', () => {
  it('friend codes have a stable, validated format', () => {
    const code = generateFriendCode(123);
    expect(isValidFriendCode(code)).toBe(true);
    expect(generateFriendCode(123)).toBe(code);
    expect(isValidFriendCode('PL-0000-OOOO')).toBe(false);
  });

  it('deck codes round-trip and reject typos', () => {
    const deck = ['oakshield_knight', 'thornbow_archer', 'ember_mage'];
    const code = encodeDeck(deck);
    expect(decodeDeck(code)).toEqual(deck);
    expect(decodeDeck(code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A'))).toBeNull();
    expect(decodeDeck('garbage')).toBeNull();
  });

  it('challenge codes round-trip with sanitized names and assisted flag', () => {
    const code = encodeChallenge({ seed: 42, world: 1, score: 37, name: '<b>Ann</b>!!', assisted: true });
    expect(decodeChallenge(code)).toEqual({ v: 1, seed: 42, world: 1, score: 37, name: 'bAnnb', assisted: true });
  });

  it('local friends: validation, no self-add, blocking', () => {
    const s = createInitialState(NOW, 1);
    const other = generateFriendCode(999);
    expect(addLocalFriend(s, 'nope', 'X', NOW)).toBe('invalid');
    expect(addLocalFriend(s, s.profile.friendCode, 'Me', NOW)).toBe('self');
    expect(addLocalFriend(s, other, 'Sam', NOW)).toBe('added');
    expect(addLocalFriend(s, other, 'Sam', NOW)).toBe('duplicate');
    blockCode(s, other);
    expect(s.social.friends).toHaveLength(0);
    expect(addLocalFriend(s, other, 'Sam', NOW)).toBe('blocked');
  });

  it('imports challenge codes once', () => {
    const s = createInitialState(NOW, 1);
    const code = encodeChallenge({ seed: 1, world: 0, score: 10, name: 'Sam', assisted: false });
    expect(importChallenge(s, code, NOW).ok).toBe(true);
    expect(importChallenge(s, code, NOW)).toEqual({ ok: false, reason: 'duplicate' });
  });
});
