// @ts-check
/**
 * Push Legends friend service: the logic behind the HTTP API, kept free of I/O so it can be tested
 * directly. State is a plain JSON-serialisable object (persisted by main.mjs).
 *
 * Accounts are anonymous device accounts identified by a bearer token (only its SHA-256 hash is
 * stored). Friends see each other's showcase (respecting privacy), online status and can send duel
 * codes. There is no free-text chat and no search: you can only find someone by their friend code.
 * Nothing here grants game rewards, so a modified client gains nothing competitive.
 */
import { createHash, randomBytes } from 'node:crypto';

export const LIMITS = {
  friends: 100,
  requestsPerDay: 30,
  callsPerMinute: 120,
  challengeInbox: 30,
  pendingIncoming: 50,
  onlineWindowMs: 2 * 60 * 1000,
};

const CODE_RE = /^PL-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const CHALLENGE_RE = /^PLC1-[A-Za-z0-9_-]{4,400}-[0-9A-Z]{1,4}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PRIVACY = ['public', 'friends', 'private'];

/** @typedef {{ heroLevel: number; power: number; stage: number; bosses: number; endlessBest: number; verifiedFull: number; verifiedKnee: number; deck: string[]; title: string }} Showcase */
/** @typedef {{ id: string; code: string; tokenHash: string; name: string; privacy: string; showcase: Showcase | null; createdAt: number; lastSeen: number; friends: string[]; blocked: string[]; requestsToday: { day: string; n: number }; minute: { at: number; n: number } }} Account */
/** @typedef {{ id: string; from: string; to: string; at: number }} FriendRequest */
/** @typedef {{ id: string; from: string; to: string; code: string; at: number }} Challenge */
/** @typedef {{ accounts: Record<string, Account>; byCode: Record<string, string>; byToken: Record<string, string>; requests: FriendRequest[]; challenges: Challenge[] }} State */
/** @typedef {{ status: number; body: unknown }} Reply */

/** @returns {State} */
export function emptyState() {
  return { accounts: {}, byCode: {}, byToken: {}, requests: [], challenges: [] };
}

export const hashToken = (/** @type {string} */ t) => createHash('sha256').update(t).digest('hex');
const id = () => randomBytes(9).toString('base64url');
const dayKey = (/** @type {number} */ now) => new Date(now).toISOString().slice(0, 10);

/** @param {unknown} name */
export function cleanName(name) {
  const s = typeof name === 'string' ? name : '';
  // Letters, numbers, spaces and a few symbols; no control characters, no links
  const out = s.replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return out || 'Hero';
}

/** @param {() => number} rand */
function newCode(rand) {
  let s = 'PL-';
  for (let i = 0; i < 8; i++) {
    if (i === 4) s += '-';
    s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return s;
}

/** @param {unknown} v @param {number} max */
const num = (v, max = 1e12) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);

/** @param {unknown} raw @returns {Showcase} */
function cleanShowcase(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw && typeof raw === 'object' ? raw : {});
  const deck = Array.isArray(r.deck) ? r.deck.filter((d) => typeof d === 'string' && /^[a-z_]{2,32}$/.test(d)).slice(0, 8) : [];
  return {
    heroLevel: num(r.heroLevel, 1000),
    power: num(r.power),
    stage: num(r.stage, 1000),
    bosses: num(r.bosses, 1e6),
    endlessBest: num(r.endlessBest, 1e6),
    verifiedFull: num(r.verifiedFull, 1e8),
    verifiedKnee: num(r.verifiedKnee, 1e8),
    deck,
    title: cleanName(r.title ?? '').slice(0, 24),
  };
}

const err = (/** @type {number} */ status, /** @type {string} */ error, /** @type {string} */ message) => ({ status, body: { error, message } });
const ok = (/** @type {unknown} */ body = { ok: true }) => ({ status: 200, body });

export class FriendService {
  /** @param {State} state @param {{ now?: () => number; rand?: () => number }} [opts] */
  constructor(state, opts = {}) {
    state.byToken ??= {};
    this.state = state;
    this.now = opts.now ?? Date.now;
    this.rand = opts.rand ?? Math.random;
    /** Set whenever state changes, so the server knows to persist. */
    this.dirty = false;
  }

  /** @param {string | undefined} token @returns {Account | null} */
  auth(token) {
    if (!token) return null;
    const aid = this.state.byToken[hashToken(token)];
    return aid ? this.state.accounts[aid] ?? null : null;
  }

  /** Per-account rate limit. @param {Account} a */
  throttle(a) {
    const now = this.now();
    if (now - a.minute.at > 60_000) a.minute = { at: now, n: 0 };
    a.minute.n++;
    return a.minute.n > LIMITS.callsPerMinute;
  }

  /** @param {{ code?: unknown; name?: unknown }} body @returns {Reply} */
  register(body) {
    let code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    // Keep the player's own code when it is free; otherwise reserve a new one
    if (!CODE_RE.test(code) || this.state.byCode[code]) {
      do code = newCode(this.rand);
      while (this.state.byCode[code]);
    }
    const token = randomBytes(24).toString('base64url');
    const now = this.now();
    /** @type {Account} */
    const acc = {
      id: id(),
      code,
      tokenHash: hashToken(token),
      name: cleanName(body.name),
      privacy: 'friends',
      showcase: null,
      createdAt: now,
      lastSeen: now,
      friends: [],
      blocked: [],
      requestsToday: { day: dayKey(now), n: 0 },
      minute: { at: now, n: 0 },
    };
    this.state.accounts[acc.id] = acc;
    this.state.byCode[code] = acc.id;
    this.state.byToken[acc.tokenHash] = acc.id;
    this.dirty = true;
    return ok({ token, code, name: acc.name });
  }

  /** @param {string} code */
  byCode(code) {
    const aid = this.state.byCode[code];
    return aid ? this.state.accounts[aid] ?? null : null;
  }

  /** @param {Account} a @param {{ name?: unknown; privacy?: unknown; showcase?: unknown }} body @returns {Reply} */
  updateProfile(a, body) {
    if (body.name !== undefined) a.name = cleanName(body.name);
    if (typeof body.privacy === 'string' && PRIVACY.includes(body.privacy)) a.privacy = body.privacy;
    if (body.showcase !== undefined) a.showcase = cleanShowcase(body.showcase);
    a.lastSeen = this.now();
    this.dirty = true;
    return ok({ code: a.code, name: a.name, privacy: a.privacy });
  }

  /** What a friend may see of `b`. @param {Account} b */
  view(b) {
    const now = this.now();
    return {
      code: b.code,
      name: b.name,
      online: now - b.lastSeen < LIMITS.onlineWindowMs,
      lastSeen: b.privacy === 'private' ? null : b.lastSeen,
      showcase: b.privacy === 'private' ? null : b.showcase,
    };
  }

  /** Everything the friends screen needs in one call (also marks the caller online). @param {Account} a @returns {Reply} */
  overview(a) {
    a.lastSeen = this.now();
    this.dirty = true;
    const friends = a.friends.map((c) => this.byCode(c)).filter((b) => b !== null).map((b) => this.view(/** @type {Account} */ (b)));
    const incoming = this.state.requests
      .filter((r) => r.to === a.code)
      .map((r) => ({ id: r.id, code: r.from, name: this.byCode(r.from)?.name ?? 'Hero', at: r.at }));
    const outgoing = this.state.requests.filter((r) => r.from === a.code).map((r) => ({ id: r.id, code: r.to, name: this.byCode(r.to)?.name ?? 'Hero', at: r.at }));
    const challenges = this.state.challenges
      .filter((c) => c.to === a.code)
      .map((c) => ({ id: c.id, from: c.from, fromName: this.byCode(c.from)?.name ?? 'Hero', code: c.code, at: c.at }));
    return ok({ me: { code: a.code, name: a.name, privacy: a.privacy }, friends, incoming, outgoing, challenges, blocked: a.blocked });
  }

  /** @param {Account} a @param {Account} b */
  befriend(a, b) {
    if (!a.friends.includes(b.code)) a.friends.push(b.code);
    if (!b.friends.includes(a.code)) b.friends.push(a.code);
    this.state.requests = this.state.requests.filter((r) => !((r.from === a.code && r.to === b.code) || (r.from === b.code && r.to === a.code)));
  }

  /** @param {Account} a @param {{ code?: unknown }} body @returns {Reply} */
  sendRequest(a, body) {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!CODE_RE.test(code)) return err(400, 'invalid_code', 'That is not a valid friend code (PL-XXXX-XXXX).');
    if (code === a.code) return err(400, 'self', "That's your own code.");
    if (a.blocked.includes(code)) return err(400, 'you_blocked', 'You blocked this player. Unblock them first.');
    const b = this.byCode(code);
    if (!b) return err(404, 'not_found', 'No player with that code on this server.');
    if (a.friends.includes(code)) return err(409, 'already_friends', 'You are already friends.');
    if (a.friends.length >= LIMITS.friends) return err(409, 'full', 'Your friend list is full.');
    const now = this.now();
    if (a.requestsToday.day !== dayKey(now)) a.requestsToday = { day: dayKey(now), n: 0 };
    if (a.requestsToday.n >= LIMITS.requestsPerDay) return err(429, 'rate_limited', 'Too many friend requests today. Try again tomorrow.');
    // They already asked you: accept straight away
    const reverse = this.state.requests.find((r) => r.from === code && r.to === a.code);
    if (reverse) {
      if (b.friends.length >= LIMITS.friends) return err(409, 'their_list_full', "That player's friend list is full.");
      this.befriend(a, b);
      this.dirty = true;
      return ok({ status: 'friends' });
    }
    if (this.state.requests.some((r) => r.from === a.code && r.to === code)) return err(409, 'already_requested', 'Request already sent.');
    a.requestsToday.n++;
    this.dirty = true;
    // A player who blocked you never sees your request (and you are not told)
    if (b.blocked.includes(a.code)) return ok({ status: 'sent' });
    if (this.state.requests.filter((r) => r.to === code).length >= LIMITS.pendingIncoming) return ok({ status: 'sent' });
    this.state.requests.push({ id: id(), from: a.code, to: code, at: now });
    return ok({ status: 'sent' });
  }

  /** @param {Account} a @param {string} rid @param {{ accept?: unknown }} body @returns {Reply} */
  respond(a, rid, body) {
    const r = this.state.requests.find((x) => x.id === rid && x.to === a.code);
    if (!r) return err(404, 'not_found', 'That request is gone.');
    const from = this.byCode(r.from);
    if (body.accept === true && from) {
      if (a.friends.length >= LIMITS.friends) return err(409, 'full', 'Your friend list is full.');
      if (from.friends.length >= LIMITS.friends) return err(409, 'their_list_full', "That player's friend list is full.");
      this.befriend(a, from);
    } else this.state.requests = this.state.requests.filter((x) => x.id !== rid);
    this.dirty = true;
    return ok({ status: body.accept === true ? 'friends' : 'declined' });
  }

  /** @param {Account} a @param {string} rid @returns {Reply} */
  cancel(a, rid) {
    const before = this.state.requests.length;
    this.state.requests = this.state.requests.filter((x) => !(x.id === rid && x.from === a.code));
    if (this.state.requests.length === before) return err(404, 'not_found', 'That request is gone.');
    this.dirty = true;
    return ok();
  }

  /** @param {Account} a @param {string} code @returns {Reply} */
  unfriend(a, code) {
    const b = this.byCode(code);
    a.friends = a.friends.filter((c) => c !== code);
    if (b) b.friends = b.friends.filter((c) => c !== a.code);
    this.state.challenges = this.state.challenges.filter((c) => !((c.from === a.code && c.to === code) || (c.from === code && c.to === a.code)));
    this.dirty = true;
    return ok();
  }

  /** Blocking also ends the friendship and removes requests and duels both ways. @param {Account} a @param {{ code?: unknown }} body @returns {Reply} */
  block(a, body) {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!CODE_RE.test(code) || code === a.code) return err(400, 'invalid_code', 'That is not a valid friend code.');
    if (!a.blocked.includes(code)) a.blocked.push(code);
    this.unfriend(a, code);
    this.state.requests = this.state.requests.filter((r) => !((r.from === a.code && r.to === code) || (r.from === code && r.to === a.code)));
    this.dirty = true;
    return ok();
  }

  /** @param {Account} a @param {string} code @returns {Reply} */
  unblock(a, code) {
    a.blocked = a.blocked.filter((c) => c !== code);
    this.dirty = true;
    return ok();
  }

  /** Send a duel code to a friend's inbox. @param {Account} a @param {{ to?: unknown; code?: unknown }} body @returns {Reply} */
  sendChallenge(a, body) {
    const to = typeof body.to === 'string' ? body.to.trim().toUpperCase() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!a.friends.includes(to)) return err(403, 'not_friends', 'You can only send duels to friends.');
    if (!CHALLENGE_RE.test(code)) return err(400, 'invalid_challenge', 'That is not a valid challenge code.');
    if (this.state.challenges.some((c) => c.from === a.code && c.to === to && c.code === code)) return ok({ status: 'sent' });
    this.state.challenges.push({ id: id(), from: a.code, to, code, at: this.now() });
    // Keep each inbox bounded (oldest dropped)
    const inbox = this.state.challenges.filter((c) => c.to === to);
    if (inbox.length > LIMITS.challengeInbox) {
      const drop = new Set(inbox.slice(0, inbox.length - LIMITS.challengeInbox).map((c) => c.id));
      this.state.challenges = this.state.challenges.filter((c) => !drop.has(c.id));
    }
    this.dirty = true;
    return ok({ status: 'sent' });
  }

  /** The client saved the duel locally: remove it from the inbox. @param {Account} a @param {string} cid @returns {Reply} */
  ackChallenge(a, cid) {
    this.state.challenges = this.state.challenges.filter((c) => !(c.id === cid && c.to === a.code));
    this.dirty = true;
    return ok();
  }

  /** Deletes the account and everything that refers to it. @param {Account} a @returns {Reply} */
  deleteAccount(a) {
    for (const code of a.friends) {
      const b = this.byCode(code);
      if (b) b.friends = b.friends.filter((c) => c !== a.code);
    }
    this.state.requests = this.state.requests.filter((r) => r.from !== a.code && r.to !== a.code);
    this.state.challenges = this.state.challenges.filter((c) => c.from !== a.code && c.to !== a.code);
    delete this.state.byCode[a.code];
    delete this.state.byToken[a.tokenHash];
    delete this.state.accounts[a.id];
    this.dirty = true;
    return ok();
  }

  /**
   * Routes one API call. `token` is the bearer token, `body` the parsed JSON body.
   * @param {string} method @param {string} path @param {string | undefined} token @param {Record<string, unknown>} body
   * @returns {Reply}
   */
  handle(method, path, token, body) {
    if (method === 'GET' && path === '/v1/health') return ok({ ok: true, service: 'push-legends-friends', version: 1 });
    if (method === 'POST' && path === '/v1/register') return this.register(body);
    const a = this.auth(token);
    if (!a) return err(401, 'unauthorized', 'Not signed in to this friend server.');
    if (this.throttle(a)) return err(429, 'rate_limited', 'Slow down a little.');
    const seg = path.split('/').filter(Boolean); // ['v1', ...]
    const p = '/' + seg.slice(1).join('/');
    if (method === 'GET' && p === '/me') return this.overview(a);
    if (method === 'PUT' && p === '/profile') return this.updateProfile(a, body);
    if (method === 'DELETE' && p === '/me') return this.deleteAccount(a);
    if (method === 'POST' && p === '/friends/requests') return this.sendRequest(a, body);
    if (seg[1] === 'friends' && seg[2] === 'requests' && seg[3]) {
      if (method === 'POST' && seg[4] === 'respond') return this.respond(a, seg[3], body);
      if (method === 'DELETE' && !seg[4]) return this.cancel(a, seg[3]);
    }
    if (method === 'DELETE' && seg[1] === 'friends' && seg[2] && !seg[3]) return this.unfriend(a, decodeURIComponent(seg[2]).toUpperCase());
    if (method === 'POST' && p === '/blocks') return this.block(a, body);
    if (method === 'DELETE' && seg[1] === 'blocks' && seg[2]) return this.unblock(a, decodeURIComponent(seg[2]).toUpperCase());
    if (method === 'POST' && p === '/challenges') return this.sendChallenge(a, body);
    if (method === 'DELETE' && seg[1] === 'challenges' && seg[2]) return this.ackChallenge(a, seg[2]);
    return err(404, 'not_found', 'Unknown endpoint.');
  }
}
