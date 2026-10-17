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
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const LIMITS = {
  friends: 100,
  requestsPerDay: 30,
  callsPerMinute: 120,
  challengeInbox: 30,
  pendingIncoming: 50,
  onlineWindowMs: 2 * 60 * 1000,
  /** Devices that can be logged in to one account at the same time. */
  sessions: 10,
  /** Failed logins per username before a short lock-out. */
  loginFailures: 8,
  loginLockMs: 10 * 60 * 1000,
  saveBytes: 900 * 1024,
};

const USER_RE = /^[a-z0-9_.-]{3,20}$/;

const CODE_RE = /^PL-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const CHALLENGE_RE = /^PLC1-[A-Za-z0-9_-]{4,400}-[0-9A-Z]{1,4}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PRIVACY = ['public', 'friends', 'private'];

/** @typedef {{ heroLevel: number; power: number; stage: number; bosses: number; endlessBest: number; verifiedFull: number; verifiedKnee: number; deck: string[]; title: string }} Showcase */
/** @typedef {{ id: string; code: string; tokenHash: string; tokens?: string[]; username?: string; pass?: { salt: string; hash: string }; save?: { data: string; savedAt: number } | null; failed?: { n: number; at: number }; name: string; privacy: string; showcase: Showcase | null; createdAt: number; lastSeen: number; friends: string[]; blocked: string[]; requestsToday: { day: string; n: number }; minute: { at: number; n: number } }} Account */
/** @typedef {{ id: string; from: string; to: string; at: number }} FriendRequest */
/** @typedef {{ id: string; from: string; to: string; code: string; at: number }} Challenge */
/** @typedef {{ accounts: Record<string, Account>; byCode: Record<string, string>; byToken: Record<string, string>; byUser: Record<string, string>; requests: FriendRequest[]; challenges: Challenge[] }} State */
/** @typedef {{ status: number; body: unknown }} Reply */

/** @returns {State} */
export function emptyState() {
  return { accounts: {}, byCode: {}, byToken: {}, byUser: {}, requests: [], challenges: [] };
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

/** @param {string} password */
function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  return { salt, hash: scryptSync(password, salt, 32).toString('base64url') };
}

/** @param {string} password @param {{ salt: string; hash: string }} p */
function checkPassword(password, p) {
  const want = Buffer.from(p.hash, 'base64url');
  const got = scryptSync(password, p.salt, 32);
  return want.length === got.length && timingSafeEqual(want, got);
}

const err = (/** @type {number} */ status, /** @type {string} */ error, /** @type {string} */ message) => ({ status, body: { error, message } });
const ok = (/** @type {unknown} */ body = { ok: true }) => ({ status: 200, body });

export class FriendService {
  /** @param {State} state @param {{ now?: () => number; rand?: () => number }} [opts] */
  constructor(state, opts = {}) {
    state.byToken ??= {};
    state.byUser ??= {};
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

  /** Issues a new login token for a device. @param {Account} a */
  issueToken(a) {
    const token = randomBytes(24).toString('base64url');
    const h = hashToken(token);
    a.tokens ??= a.tokenHash ? [a.tokenHash] : [];
    a.tokens.push(h);
    // Oldest devices are signed out when there are too many
    while (a.tokens.length > LIMITS.sessions) delete this.state.byToken[/** @type {string} */ (a.tokens.shift())];
    a.tokenHash = h;
    this.state.byToken[h] = a.id;
    this.dirty = true;
    return token;
  }

  /** @param {Account} a */
  session(a, /** @type {string} */ token) {
    return { token, code: a.code, name: a.name, username: a.username ?? '', save: a.save ? { savedAt: a.save.savedAt } : null };
  }

  /**
   * Creates an account with username and password. A device that is already connected with an
   * anonymous account (bearer token) is upgraded, keeping its friends.
   * @param {Account | null} current @param {{ username?: unknown; password?: unknown; name?: unknown; code?: unknown }} body @returns {Reply}
   */
  signup(current, body) {
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!USER_RE.test(username)) return err(400, 'bad_username', 'Username: 3-20 letters, numbers, . _ or -');
    if (password.length < 6 || password.length > 200) return err(400, 'bad_password', 'Password: at least 6 characters.');
    if (this.state.byUser[username]) return err(409, 'username_taken', 'That username is taken.');
    let a = current && !current.username ? current : null;
    if (!a) {
      const r = this.register({ code: body.code, name: body.name ?? username });
      const acc = this.byCode(/** @type {{ code: string }} */ (r.body).code);
      if (!acc) return err(500, 'server_error', 'Could not create the account.');
      a = acc;
      // register() issued an anonymous token we do not hand out
      delete this.state.byToken[a.tokenHash];
      a.tokens = [];
    }
    a.username = username;
    a.pass = hashPassword(password);
    if (body.name !== undefined) a.name = cleanName(body.name);
    this.state.byUser[username] = a.id;
    return ok(this.session(a, this.issueToken(a)));
  }

  /** @param {{ username?: unknown; password?: unknown }} body @returns {Reply} */
  login(body) {
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const aid = this.state.byUser[username];
    const a = aid ? this.state.accounts[aid] : undefined;
    const now = this.now();
    if (a?.failed && a.failed.n >= LIMITS.loginFailures && now - a.failed.at < LIMITS.loginLockMs) return err(429, 'locked', 'Too many wrong passwords. Try again in a few minutes.');
    if (!a || !a.pass || !checkPassword(password, a.pass)) {
      if (a) a.failed = { n: (a.failed && now - a.failed.at < LIMITS.loginLockMs ? a.failed.n : 0) + 1, at: now };
      this.dirty = true;
      return err(401, 'bad_login', 'Wrong username or password.');
    }
    a.failed = { n: 0, at: now };
    a.lastSeen = now;
    return ok(this.session(a, this.issueToken(a)));
  }

  /** Signs out this device only. @param {Account} a @param {string} token @returns {Reply} */
  logout(a, token) {
    const h = hashToken(token);
    a.tokens = (a.tokens ?? []).filter((t) => t !== h);
    delete this.state.byToken[h];
    this.dirty = true;
    return ok();
  }

  /** @param {Account} a @returns {Reply} */
  getSave(a) {
    if (!a.save) return err(404, 'no_save', 'No cloud save yet.');
    return ok(a.save);
  }

  /** @param {Account} a @param {{ data?: unknown; savedAt?: unknown }} body @returns {Reply} */
  putSave(a, body) {
    if (typeof body.data !== 'string' || !body.data.length) return err(400, 'bad_save', 'Missing save data.');
    if (body.data.length > LIMITS.saveBytes) return err(413, 'too_large', 'Save is too large.');
    a.save = { data: body.data, savedAt: num(body.savedAt, 1e14) || this.now() };
    this.dirty = true;
    return ok({ savedAt: a.save.savedAt });
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
    for (const t of a.tokens ?? []) delete this.state.byToken[t];
    if (a.username) delete this.state.byUser[a.username];
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
    if (method === 'POST' && path === '/v1/login') return this.login(body);
    if (method === 'POST' && path === '/v1/signup') return this.signup(this.auth(token), body);
    const a = this.auth(token);
    if (!a) return err(401, 'unauthorized', 'Not signed in to this friend server.');
    if (this.throttle(a)) return err(429, 'rate_limited', 'Slow down a little.');
    const seg = path.split('/').filter(Boolean); // ['v1', ...]
    const p = '/' + seg.slice(1).join('/');
    if (method === 'GET' && p === '/me') return this.overview(a);
    if (method === 'PUT' && p === '/profile') return this.updateProfile(a, body);
    if (method === 'DELETE' && p === '/me') return this.deleteAccount(a);
    if (method === 'POST' && p === '/logout') return this.logout(a, /** @type {string} */ (token));
    if (method === 'GET' && p === '/save') return this.getSave(a);
    if (method === 'PUT' && p === '/save') return this.putSave(a, body);
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
