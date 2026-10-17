import { useSyncExternalStore } from 'react';
import { decodeChallenge } from '../core/social/codes';
import { powerRating } from '../core/systems/hero';
import { FriendsApi, normalizeServerUrl, type FriendShowcase, type FriendsOverview } from '../platform/friendsApi';
import type { GameState } from '../core/state/types';
import { store } from './store';

/**
 * Online friends: talks to the optional friend server and keeps the latest overview in memory
 * (it is not part of the save). Duels sent by friends are copied into the local challenge list.
 */
interface FriendsView {
  /** Playing without login because the server could not be reached (not saved: the next launch asks again). */
  offline: boolean;
  status: 'off' | 'connecting' | 'online' | 'error';
  message: string;
  overview: FriendsOverview | null;
  updatedAt: number;
}

let view: FriendsView = { offline: false, status: 'off', message: '', overview: null, updatedAt: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<FriendsView>) => {
  view = { ...view, ...patch };
  listeners.forEach((l) => l());
};

export function useFriends(): FriendsView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => view,
  );
}

function api(): FriendsApi | null {
  const o = store.state.social.online;
  return o.server && o.token ? new FriendsApi(o.server, o.token) : null;
}

export function isConnected(): boolean {
  return api() !== null;
}

function showcase(): FriendShowcase {
  const g = store.state;
  return {
    heroLevel: g.hero.level,
    power: powerRating(g),
    stage: g.progress.highestCleared + 1,
    bosses: g.stats.bossesDefeated,
    endlessBest: g.progress.endlessBest,
    verifiedFull: g.stats.verifiedFullReps,
    verifiedKnee: g.stats.verifiedKneeReps,
    deck: g.deck.slice(0, 8),
    title: g.profile.title,
  };
}

/** Default address on the login screen (a build can set VITE_FRIEND_SERVER). */
export const DEFAULT_SERVER: string = (import.meta.env.VITE_FRIEND_SERVER as string | undefined) ?? 'localhost:8787';

/** A save on the server and one on this device that both have progress: the player picks. */
export interface SaveChoice {
  cloud: { savedAt: number; stage: number; heroLevel: number; name: string };
  local: { savedAt: number; stage: number; heroLevel: number; name: string };
  data: string;
}

const hasProgress = (g: GameState) => g.progress.highestCleared >= 0 || g.hero.level > 1;
const summary = (g: GameState, savedAt: number) => ({ savedAt, stage: g.progress.highestCleared + 1, heroLevel: g.hero.level, name: g.profile.name });
const BACKUP_KEY = 'push-legends/replaced-save';

/** Keeps the save that is about to be replaced, so a wrong choice can be undone from a backup. */
function backupLocal(): void {
  try {
    localStorage.setItem(BACKUP_KEY, store.exportSave());
  } catch {
    /* storage unavailable */
  }
}

function adoptCloud(data: string, session: { token: string; username: string; server: string }): boolean {
  backupLocal();
  if (!store.importSave(data)) return false;
  store.update((s) => {
    s.social.online = { server: session.server, token: session.token, username: session.username };
  });
  return true;
}

/**
 * Logs in or creates an account. Returns a SaveChoice when both the server and this device hold
 * progress for different players (or it is unclear which is newer); otherwise it is done.
 */
/**
 * The server is a service the game must never be stuck behind: when it cannot be reached the
 * player may play offline. Progress is saved on the device and joins the account at the next login.
 */
export function playOffline(): void {
  set({ offline: true });
}

/** Back to the login screen from offline play. */
export function leaveOffline(): void {
  set({ offline: false });
}

export async function authenticate(mode: 'login' | 'signup', address: string, username: string, password: string): Promise<{ ok: true; choice: SaveChoice | null } | { ok: false; message: string; unreachable?: boolean }> {
  const base = normalizeServerUrl(address);
  if (!base) return { ok: false, message: 'Enter the server address, e.g. 192.168.1.20:8787' };
  // Remember the address even if the server is down, so the next try (or offline play) keeps it
  if (store.state.social.online.server !== base) {
    store.update((s) => {
      s.social.online = { ...s.social.online, server: base };
    });
  }
  const anon = new FriendsApi(base, '');
  const health = await anon.health();
  if (!health.ok) return { ok: false, message: health.message, unreachable: true };
  if (health.data.service !== 'push-legends-friends') return { ok: false, message: 'That address is not a Push Legends server.' };
  const g = store.state;
  const name = g.profile.name && g.profile.name !== 'Hero' ? g.profile.name : username;
  const r = mode === 'signup' ? await anon.signup(username, password, name, g.profile.friendCode) : await anon.login(username, password);
  if (!r.ok) return { ok: false, message: r.message };
  const session = { token: r.data.token, username: r.data.username, server: base };
  const api2 = new FriendsApi(base, r.data.token);
  let choice: SaveChoice | null = null;
  if (r.data.save) {
    const cloud = await api2.getSave();
    if (cloud.ok) {
      const parsed = parseSave(cloud.data.data);
      const sameOwner = g.social.online.username === r.data.username;
      if (!parsed) {
        /* unreadable cloud save: keep the local one (uploaded below) */
      } else if (!hasProgress(g)) {
        adoptCloud(cloud.data.data, session);
      } else if (sameOwner) {
        // Same player: the newer save wins (the older one stays as a backup)
        if (cloud.data.savedAt > g.lastSeenAt) adoptCloud(cloud.data.data, session);
      } else {
        choice = { cloud: summary(parsed, cloud.data.savedAt), local: summary(g, g.lastSeenAt), data: cloud.data.data };
      }
    }
  }
  if (!choice) finishLogin(session, r.data.code, r.data.name);
  else pendingSession = { ...session, code: r.data.code, name: r.data.name };
  return { ok: true, choice };
}

let pendingSession: { token: string; username: string; server: string; code: string; name: string } | null = null;

/** The player picked which save to keep after logging in. */
export function chooseSave(useCloud: boolean, choice: SaveChoice): void {
  const s = pendingSession;
  if (!s) return;
  pendingSession = null;
  if (useCloud) adoptCloud(choice.data, s);
  finishLogin(s, s.code, s.name);
}

function finishLogin(session: { token: string; username: string; server: string }, code: string, name: string): void {
  store.update((s) => {
    s.social.online = { server: session.server, token: session.token, username: session.username };
    s.profile.friendCode = code;
    if (!s.profile.name || s.profile.name === 'Hero') s.profile.name = name;
  });
  lastUploaded = '';
  set({ offline: false });
  void uploadSave();
  void refresh(true);
}

function parseSave(data: string): GameState | null {
  try {
    const env = JSON.parse(data) as { data?: GameState };
    return env.data && typeof env.data === 'object' && env.data.progress && env.data.hero ? env.data : null;
  } catch {
    return null;
  }
}

/** Logs this device out (the progress stays on the device and in the cloud). */
export async function logout(): Promise<void> {
  await uploadSave();
  const a = api();
  if (a) await a.logout();
  store.update((s) => {
    s.social.online = { ...s.social.online, token: '' };
  });
  set({ status: 'off', message: '', overview: null });
}

/** Deletes the account on the server (friends and cloud save) and logs out. */
export async function deleteServerAccount(): Promise<void> {
  const a = api();
  if (a) await a.deleteAccount();
  store.update((s) => {
    s.social.online = { ...s.social.online, token: '', username: '' };
  });
  set({ status: 'off', message: '', overview: null });
}

// --- Cloud save --------------------------------------------------------------------------------

let lastUploaded = '';
let uploading = false;
/** Uploads the save when it changed since the last upload. */
export async function uploadSave(): Promise<void> {
  const a = api();
  if (!a || uploading) return;
  // Compare the state itself (the export carries a fresh timestamp every time)
  const key = JSON.stringify(store.state);
  if (key === lastUploaded) return;
  uploading = true;
  try {
    const r = await a.putSave(store.exportSave(), store.state.lastSeenAt);
    if (r.ok) lastUploaded = key;
  } finally {
    uploading = false;
  }
}

let refreshing = false;
/** Pulls the overview; also pushes our showcase every time so friends see current progress. */
export async function refresh(pushProfile = false): Promise<void> {
  const a = api();
  if (!a || refreshing) return;
  refreshing = true;
  try {
    if (pushProfile || Date.now() - view.updatedAt > 60_000) {
      const g = store.state;
      await a.updateProfile({ name: g.profile.name, privacy: g.profile.privacy, showcase: showcase() });
    }
    const r = await a.overview();
    if (!r.ok) {
      if (r.status === 401) {
        // The server no longer knows this device (reset or account deleted)
        store.update((s) => {
          s.social.online = { ...s.social.online, token: '' };
        });
        set({ status: 'error', message: 'Your login has expired. Please log in again.', overview: null });
      } else set({ status: 'error', message: r.message });
      return;
    }
    // Duels from friends land in the local duel list, then leave the server inbox
    for (const d of r.data.challenges) {
      if (decodeChallenge(d.code)) store.importChallenge(d.code);
      void a.ackDuel(d.id);
    }
    if (r.data.challenges.length) store.toast(`${r.data.challenges[0]!.fromName} sent you a duel! Find it under Duels.`, 'good');
    set({ status: 'online', message: '', overview: { ...r.data, challenges: [] }, updatedAt: Date.now() });
  } finally {
    refreshing = false;
  }
}

async function act(run: (a: FriendsApi) => Promise<{ ok: boolean; message?: string }>, success?: string): Promise<boolean> {
  const a = api();
  if (!a) return false;
  const r = await run(a);
  if (!r.ok) {
    store.toast(r.message ?? 'Something went wrong.', 'warn');
    return false;
  }
  if (success) store.toast(success, 'good');
  await refresh();
  return true;
}

const msg = <T,>(r: { ok: true; data: T } | { ok: false; message: string }) => (r.ok ? { ok: true } : { ok: false, message: r.message });

export async function sendRequest(code: string): Promise<boolean> {
  const a = api();
  if (!a) return false;
  const r = await a.sendRequest(code);
  if (!r.ok) {
    store.toast(r.message, 'warn');
    return false;
  }
  store.toast(r.data.status === 'friends' ? 'You are now friends!' : 'Friend request sent.', 'good');
  await refresh();
  return true;
}

export const respond = (id: string, accept: boolean) => act(async (a) => msg(await a.respond(id, accept)), accept ? 'Friend added!' : undefined);
export const cancelRequest = (id: string) => act(async (a) => msg(await a.cancel(id)));
export const unfriend = (code: string) => act(async (a) => msg(await a.unfriend(code)), 'Friend removed.');
export const blockOnline = (code: string) => act(async (a) => msg(await a.block(code)), 'Player blocked.');
export const unblockOnline = (code: string) => act(async (a) => msg(await a.unblock(code)));
export const sendDuel = (to: string, code: string, name: string) => act(async (a) => msg(await a.sendDuel(to, code)), `Duel sent to ${name}!`);

/** Keeps the list fresh while the friends screen is open. */
let timer: number | null = null;
let users = 0;
export function startPolling(): () => void {
  users++;
  if (users === 1) {
    void refresh(true);
    timer = window.setInterval(() => void refresh(), 15_000);
  }
  return () => {
    users--;
    if (users === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}
