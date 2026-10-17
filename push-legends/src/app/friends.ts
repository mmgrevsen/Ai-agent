import { useSyncExternalStore } from 'react';
import { decodeChallenge } from '../core/social/codes';
import { powerRating } from '../core/systems/hero';
import { FriendsApi, normalizeServerUrl, type FriendShowcase, type FriendsOverview } from '../platform/friendsApi';
import { store } from './store';

/**
 * Online friends: talks to the optional friend server and keeps the latest overview in memory
 * (it is not part of the save). Duels sent by friends are copied into the local challenge list.
 */
interface FriendsView {
  status: 'off' | 'connecting' | 'online' | 'error';
  message: string;
  overview: FriendsOverview | null;
  updatedAt: number;
}

let view: FriendsView = { status: 'off', message: '', overview: null, updatedAt: 0 };
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

/** Connects to a server: registers this device (keeping the friend code when it is free). */
export async function connect(address: string): Promise<boolean> {
  const base = normalizeServerUrl(address);
  if (!base) {
    set({ status: 'error', message: 'Enter the server address, e.g. 192.168.1.20:8787' });
    return false;
  }
  set({ status: 'connecting', message: '' });
  const anon = new FriendsApi(base, '');
  const health = await anon.health();
  if (!health.ok || health.data.service !== 'push-legends-friends') {
    set({ status: 'error', message: health.ok ? 'That address is not a Push Legends friend server.' : health.message });
    return false;
  }
  const g = store.state;
  const r = await anon.register(g.profile.name, g.profile.friendCode);
  if (!r.ok) {
    set({ status: 'error', message: r.message });
    return false;
  }
  store.update((s) => {
    s.social.online = { server: base, token: r.data.token };
    // The server reserves friend codes; if ours was taken it handed out a new one
    s.profile.friendCode = r.data.code;
  });
  store.toast(r.data.code === g.profile.friendCode ? 'Connected! Friends can now add you by your code.' : `Connected! Your friend code is now ${r.data.code}.`, 'good');
  await refresh(true);
  return true;
}

/** Signs this device out of the server. Optionally deletes the account there first. */
export async function disconnect(deleteAccount: boolean): Promise<void> {
  const a = api();
  if (a && deleteAccount) await a.deleteAccount();
  store.update((s) => {
    s.social.online = { server: '', token: '' };
  });
  set({ status: 'off', message: '', overview: null });
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
          s.social.online = { server: '', token: '' };
        });
        set({ status: 'error', message: 'The friend server no longer knows this device. Connect again.', overview: null });
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
