/**
 * Client for the Push Legends friend server (server/main.mjs). The server is optional: players
 * enter its address under Friends, and everything else in the game works without it.
 */

export interface FriendShowcase {
  heroLevel: number;
  power: number;
  stage: number;
  bosses: number;
  endlessBest: number;
  verifiedFull: number;
  verifiedKnee: number;
  deck: string[];
  title: string;
}

export interface OnlineFriend {
  code: string;
  name: string;
  online: boolean;
  lastSeen: number | null;
  showcase: FriendShowcase | null;
}

export interface FriendRequestView {
  id: string;
  code: string;
  name: string;
  at: number;
}

export interface IncomingDuel {
  id: string;
  from: string;
  fromName: string;
  code: string;
  at: number;
}

export interface FriendsOverview {
  me: { code: string; name: string; privacy: string };
  friends: OnlineFriend[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
  challenges: IncomingDuel[];
  blocked: string[];
}

export interface Session {
  token: string;
  code: string;
  name: string;
  username: string;
  save: { savedAt: number } | null;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string; status: number };

/** Accepts "192.168.1.20:8787", "localhost:8787" or a full URL; returns a URL without a trailing slash. */
export function normalizeServerUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export class FriendsApi {
  constructor(
    readonly base: string,
    private token: string,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${this.base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) return { ok: false, status: res.status, error: String(json.error ?? 'error'), message: String(json.message ?? `Server error (${res.status}).`) };
      return { ok: true, data: json as T };
    } catch {
      return { ok: false, status: 0, error: 'offline', message: "Can't reach the friend server. Check the address and your connection." };
    } finally {
      clearTimeout(timer);
    }
  }

  health() {
    return this.call<{ ok: boolean; service: string }>('GET', '/v1/health');
  }
  register(name: string, code: string) {
    return this.call<{ token: string; code: string; name: string }>('POST', '/v1/register', { name, code });
  }
  signup(username: string, password: string, name: string, code: string) {
    return this.call<Session>('POST', '/v1/signup', { username, password, name, code });
  }
  login(username: string, password: string) {
    return this.call<Session>('POST', '/v1/login', { username, password });
  }
  logout() {
    return this.call('POST', '/v1/logout');
  }
  getSave() {
    return this.call<{ data: string; savedAt: number }>('GET', '/v1/save');
  }
  putSave(data: string, savedAt: number) {
    return this.call<{ savedAt: number }>('PUT', '/v1/save', { data, savedAt });
  }
  overview() {
    return this.call<FriendsOverview>('GET', '/v1/me');
  }
  updateProfile(p: { name?: string; privacy?: string; showcase?: FriendShowcase }) {
    return this.call<{ code: string }>('PUT', '/v1/profile', p);
  }
  sendRequest(code: string) {
    return this.call<{ status: 'sent' | 'friends' }>('POST', '/v1/friends/requests', { code });
  }
  respond(id: string, accept: boolean) {
    return this.call<{ status: string }>('POST', `/v1/friends/requests/${encodeURIComponent(id)}/respond`, { accept });
  }
  cancel(id: string) {
    return this.call('DELETE', `/v1/friends/requests/${encodeURIComponent(id)}`);
  }
  unfriend(code: string) {
    return this.call('DELETE', `/v1/friends/${encodeURIComponent(code)}`);
  }
  block(code: string) {
    return this.call('POST', '/v1/blocks', { code });
  }
  unblock(code: string) {
    return this.call('DELETE', `/v1/blocks/${encodeURIComponent(code)}`);
  }
  sendDuel(to: string, code: string) {
    return this.call('POST', '/v1/challenges', { to, code });
  }
  ackDuel(id: string) {
    return this.call('DELETE', `/v1/challenges/${encodeURIComponent(id)}`);
  }
  deleteAccount() {
    return this.call('DELETE', '/v1/me');
  }
}
