import { BALANCE } from '../config/balance';
import { CARDS } from '../content/cards';
import { hashString } from '../rng';

/**
 * Shareable codes that work fully offline: friend codes, deck codes and asynchronous challenge codes.
 * They carry a checksum to catch typos. They are NOT tamper-proof and never grant competitive rewards;
 * verified leaderboards require the planned server-authoritative backend (see BACKEND_PLAN.md).
 */

const FRIEND_CODE_RE = /^PL-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export function isValidFriendCode(code: string): boolean {
  return FRIEND_CODE_RE.test(code.trim().toUpperCase());
}

export function normalizeFriendCode(code: string): string {
  return code.trim().toUpperCase();
}

const toB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64 = (s: string) => {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const check = (payload: string) => (hashString(payload) % 46656).toString(36).toUpperCase().padStart(3, '0');

function wrap(prefix: string, payload: string): string {
  const body = toB64(payload);
  return `${prefix}-${body}-${check(body)}`;
}

function unwrap(prefix: string, code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(`${prefix}-`)) return null;
  const rest = trimmed.slice(prefix.length + 1);
  const dash = rest.lastIndexOf('-');
  if (dash <= 0) return null;
  const body = rest.slice(0, dash);
  if (check(body) !== rest.slice(dash + 1).toUpperCase()) return null;
  try {
    return fromB64(body);
  } catch {
    return null;
  }
}

export function encodeDeck(deck: string[]): string {
  const idx = deck.map((id) => CARDS.findIndex((c) => c.id === id)).filter((i) => i >= 0);
  return wrap('PLD1', idx.join('.'));
}

export function decodeDeck(code: string): string[] | null {
  const payload = unwrap('PLD1', code);
  if (payload === null) return null;
  const ids = payload
    .split('.')
    .map((s) => CARDS[Number(s)]?.id)
    .filter((id): id is string => !!id);
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.length > BALANCE.cards.deckSize) return null;
  return unique;
}

export interface ChallengePayload {
  v: 1;
  seed: number;
  world: number;
  score: number;
  name: string;
  /** True when the run used developer-simulated reps. Shown to the recipient. */
  assisted: boolean;
}

export function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16);
  return cleaned.length >= 2 ? cleaned : 'Hero';
}

export function encodeChallenge(p: Omit<ChallengePayload, 'v'>): string {
  const payload: ChallengePayload = { v: 1, ...p, name: sanitizeName(p.name), score: Math.max(0, Math.floor(p.score)) };
  return wrap('PLC1', JSON.stringify(payload));
}

export function decodeChallenge(code: string): ChallengePayload | null {
  const payload = unwrap('PLC1', code);
  if (payload === null) return null;
  try {
    const p = JSON.parse(payload) as Partial<ChallengePayload>;
    if (p.v !== 1 || typeof p.seed !== 'number' || typeof p.world !== 'number' || typeof p.score !== 'number' || typeof p.name !== 'string') return null;
    if (p.world < 0 || p.world > 4 || p.score < 0 || p.score > 10_000) return null;
    return { v: 1, seed: p.seed >>> 0, world: Math.floor(p.world), score: Math.floor(p.score), name: sanitizeName(p.name), assisted: !!p.assisted };
  } catch {
    return null;
  }
}
