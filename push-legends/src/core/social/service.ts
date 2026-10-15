import type { GameState, LocalFriend } from '../state/types';
import { decodeChallenge, isValidFriendCode, normalizeFriendCode, sanitizeName } from './codes';

/**
 * Online social features (accounts, friend requests, leaderboards, guilds, co-op bosses) need a
 * server. This interface is what the game will call once that backend exists. Until then the
 * OfflineSocialBackend reports every call as unavailable - the UI labels these features "Planned".
 */
export interface SocialBackend {
  readonly online: boolean;
  sendFriendRequest(code: string): Promise<BackendResult>;
  respondToRequest(requestId: string, accept: boolean): Promise<BackendResult>;
  fetchLeaderboard(board: LeaderboardId): Promise<BackendResult<LeaderboardEntry[]>>;
  submitScore(board: LeaderboardId, runToken: string): Promise<BackendResult>;
}

export type LeaderboardId = 'highest_wave' | 'bosses' | 'verified_full_reps' | 'verified_knee_reps' | 'weekly_improvement' | 'arena_rating';

export interface LeaderboardEntry {
  name: string;
  value: number;
  friendCode: string;
}

export type BackendResult<T = undefined> = { ok: true; data: T } | { ok: false; reason: 'offline' | 'not_implemented' | 'error'; message: string };

export class OfflineSocialBackend implements SocialBackend {
  readonly online = false;
  private unavailable<T>(): Promise<BackendResult<T>> {
    return Promise.resolve({ ok: false, reason: 'not_implemented', message: 'Online features are planned and not available yet.' });
  }
  sendFriendRequest() {
    return this.unavailable<undefined>();
  }
  respondToRequest() {
    return this.unavailable<undefined>();
  }
  fetchLeaderboard() {
    return this.unavailable<LeaderboardEntry[]>();
  }
  submitScore() {
    return this.unavailable<undefined>();
  }
}

// Local contact list (works offline) -------------------------------------------------------------

export type AddFriendResult = 'added' | 'invalid' | 'self' | 'duplicate' | 'blocked' | 'full';

export function addLocalFriend(state: GameState, code: string, name: string, now: number): AddFriendResult {
  const c = normalizeFriendCode(code);
  if (!isValidFriendCode(c)) return 'invalid';
  if (c === state.profile.friendCode) return 'self';
  if (state.social.blocked.includes(c)) return 'blocked';
  if (state.social.friends.some((f) => f.code === c)) return 'duplicate';
  if (state.social.friends.length >= 100) return 'full';
  const friend: LocalFriend = { code: c, name: sanitizeName(name), addedAt: now, note: '' };
  state.social.friends.push(friend);
  return 'added';
}

export function removeLocalFriend(state: GameState, code: string): void {
  state.social.friends = state.social.friends.filter((f) => f.code !== code);
}

/** Blocking removes the contact and hides any challenges they sent. */
export function blockCode(state: GameState, code: string): void {
  const c = normalizeFriendCode(code);
  if (!state.social.blocked.includes(c)) state.social.blocked.push(c);
  removeLocalFriend(state, c);
}

export function unblockCode(state: GameState, code: string): void {
  state.social.blocked = state.social.blocked.filter((b) => b !== code);
}

export type ImportChallengeResult = { ok: true; index: number } | { ok: false; reason: 'invalid' | 'duplicate' };

export function importChallenge(state: GameState, code: string, now: number): ImportChallengeResult {
  const payload = decodeChallenge(code);
  if (!payload) return { ok: false, reason: 'invalid' };
  if (state.social.challenges.some((c) => c.code === code.trim())) return { ok: false, reason: 'duplicate' };
  state.social.challenges.unshift({ code: code.trim(), fromName: payload.name, mode: 'blitz', theirScore: payload.score, myBest: null, receivedAt: now });
  state.social.challenges = state.social.challenges.slice(0, 30);
  return { ok: true, index: 0 };
}

export function recordChallengeScore(state: GameState, code: string, score: number): void {
  const c = state.social.challenges.find((x) => x.code === code);
  if (c) c.myBest = Math.max(c.myBest ?? 0, score);
}
