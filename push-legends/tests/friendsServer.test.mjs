import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { emptyState, FriendService, LIMITS } from '../server/core.mjs';

let clock = Date.UTC(2026, 9, 17, 12);
const svc = () => new FriendService(emptyState(), { now: () => clock });
const call = (s, method, path, token, body = {}) => s.handle(method, path, token, body);
const reg = (s, name, code) => {
  const r = call(s, 'POST', '/v1/register', undefined, { name, code });
  expect(r.status).toBe(200);
  return r.body;
};

describe('friend service', () => {
  it('registers accounts, keeps a free friend code and replaces a taken one', () => {
    const s = svc();
    const a = reg(s, 'Ann', 'PL-AAAA-BBBB');
    expect(a.code).toBe('PL-AAAA-BBBB');
    const b = reg(s, 'Bo', 'PL-AAAA-BBBB');
    expect(b.code).not.toBe('PL-AAAA-BBBB');
    expect(b.code).toMatch(/^PL-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(call(s, 'GET', '/v1/me', 'wrong-token').status).toBe(401);
    expect(call(s, 'GET', '/v1/me', a.token).body.me.name).toBe('Ann');
  });

  it('cleans names (no control characters, links or overlong names)', () => {
    const s = svc();
    expect(reg(s, 'Evil\u0000<script>http://x.y', undefined).name).toBe('Evilscripthttpx.');
    expect(reg(s, '   ', undefined).name).toBe('Hero');
  });

  it('request, accept, see each other online with showcase', () => {
    const s = svc();
    const a = reg(s, 'Ann');
    const b = reg(s, 'Bo');
    expect(call(s, 'POST', '/v1/friends/requests', a.token, { code: b.code }).body).toEqual({ status: 'sent' });
    expect(call(s, 'POST', '/v1/friends/requests', a.token, { code: b.code }).status).toBe(409);
    call(s, 'PUT', '/v1/profile', a.token, { showcase: { heroLevel: 7, stage: 12, deck: ['oakshield_knight', 'BAD ID'], power: 1e99 } });
    const inbox = call(s, 'GET', '/v1/me', b.token).body;
    expect(inbox.incoming).toHaveLength(1);
    expect(inbox.incoming[0]).toMatchObject({ code: a.code, name: 'Ann' });
    expect(call(s, 'POST', `/v1/friends/requests/${inbox.incoming[0].id}/respond`, b.token, { accept: true }).body.status).toBe('friends');
    const bView = call(s, 'GET', '/v1/me', b.token).body;
    expect(bView.friends).toHaveLength(1);
    expect(bView.friends[0]).toMatchObject({ code: a.code, online: true });
    expect(bView.friends[0].showcase).toMatchObject({ heroLevel: 7, stage: 12, deck: ['oakshield_knight'], power: 1e12 });
    clock += LIMITS.onlineWindowMs + 1000;
    call(s, 'GET', '/v1/me', b.token);
    expect(call(s, 'GET', '/v1/me', b.token).body.friends[0].online).toBe(false);
  });

  it('mutual requests become a friendship; decline and cancel remove requests', () => {
    const s = svc();
    const a = reg(s, 'Ann');
    const b = reg(s, 'Bo');
    const c = reg(s, 'Cy');
    call(s, 'POST', '/v1/friends/requests', a.token, { code: b.code });
    expect(call(s, 'POST', '/v1/friends/requests', b.token, { code: a.code }).body.status).toBe('friends');
    call(s, 'POST', '/v1/friends/requests', c.token, { code: a.code });
    const req = call(s, 'GET', '/v1/me', a.token).body.incoming[0];
    expect(call(s, 'POST', `/v1/friends/requests/${req.id}/respond`, a.token, { accept: false }).body.status).toBe('declined');
    expect(call(s, 'GET', '/v1/me', c.token).body.outgoing).toHaveLength(0);
    call(s, 'POST', '/v1/friends/requests', c.token, { code: b.code });
    const out = call(s, 'GET', '/v1/me', c.token).body.outgoing[0];
    expect(call(s, 'DELETE', `/v1/friends/requests/${out.id}`, c.token).status).toBe(200);
    expect(call(s, 'GET', '/v1/me', b.token).body.incoming).toHaveLength(0);
  });

  it('privacy: private profiles hide stats and last seen from friends', () => {
    const s = svc();
    const a = reg(s, 'Ann');
    const b = reg(s, 'Bo');
    call(s, 'POST', '/v1/friends/requests', a.token, { code: b.code });
    call(s, 'POST', '/v1/friends/requests', b.token, { code: a.code });
    call(s, 'PUT', '/v1/profile', a.token, { privacy: 'private', showcase: { heroLevel: 3 } });
    const f = call(s, 'GET', '/v1/me', b.token).body.friends[0];
    expect(f.showcase).toBeNull();
    expect(f.lastSeen).toBeNull();
  });

  it('blocking ends the friendship and silently swallows new requests', () => {
    const s = svc();
    const a = reg(s, 'Ann');
    const b = reg(s, 'Bo');
    call(s, 'POST', '/v1/friends/requests', a.token, { code: b.code });
    call(s, 'POST', '/v1/friends/requests', b.token, { code: a.code });
    call(s, 'POST', '/v1/blocks', b.token, { code: a.code });
    expect(call(s, 'GET', '/v1/me', a.token).body.friends).toHaveLength(0);
    expect(call(s, 'POST', '/v1/friends/requests', a.token, { code: b.code }).body.status).toBe('sent');
    expect(call(s, 'GET', '/v1/me', b.token).body.incoming).toHaveLength(0);
    expect(call(s, 'POST', '/v1/friends/requests', b.token, { code: a.code }).body.error).toBe('you_blocked');
  });

  it('duels only go to friends and leave the inbox once acknowledged', () => {
    const s = svc();
    const a = reg(s, 'Ann');
    const b = reg(s, 'Bo');
    const duel = 'PLC1-eyJzIjoxfQ-ABC';
    expect(call(s, 'POST', '/v1/challenges', a.token, { to: b.code, code: duel }).status).toBe(403);
    call(s, 'POST', '/v1/friends/requests', a.token, { code: b.code });
    call(s, 'POST', '/v1/friends/requests', b.token, { code: a.code });
    expect(call(s, 'POST', '/v1/challenges', a.token, { to: b.code, code: 'not a code' }).status).toBe(400);
    expect(call(s, 'POST', '/v1/challenges', a.token, { to: b.code, code: duel }).status).toBe(200);
    const ch = call(s, 'GET', '/v1/me', b.token).body.challenges;
    expect(ch).toHaveLength(1);
    expect(ch[0]).toMatchObject({ from: a.code, fromName: 'Ann', code: duel });
    call(s, 'DELETE', `/v1/challenges/${ch[0].id}`, b.token);
    expect(call(s, 'GET', '/v1/me', b.token).body.challenges).toHaveLength(0);
  });

  it('rate limits friend requests per day', () => {
    const s = svc();
    const a = reg(s, 'Ann');
    let last;
    for (let i = 0; i <= LIMITS.requestsPerDay; i++) last = call(s, 'POST', '/v1/friends/requests', a.token, { code: reg(s, `P${i}`).code });
    expect(last.status).toBe(429);
  });

  it('deleting an account removes it from friends lists', () => {
    const s = svc();
    const a = reg(s, 'Ann');
    const b = reg(s, 'Bo');
    call(s, 'POST', '/v1/friends/requests', a.token, { code: b.code });
    call(s, 'POST', '/v1/friends/requests', b.token, { code: a.code });
    call(s, 'DELETE', '/v1/me', a.token);
    expect(call(s, 'GET', '/v1/me', a.token).status).toBe(401);
    expect(call(s, 'GET', '/v1/me', b.token).body.friends).toHaveLength(0);
  });
});

describe('friend server over HTTP', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plfriends-'));
  let proc;
  afterAll(() => {
    proc?.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves the API with CORS and persists data across restarts', async () => {
    const port = 18000 + Math.floor(Math.random() * 1000);
    const data = join(dir, 'data.json');
    const start = () =>
      new Promise((res) => {
        proc = spawn(process.execPath, ['server/main.mjs', '--port', String(port), '--host', '127.0.0.1', '--data', data]);
        proc.stdout.on('data', (d) => String(d).includes('friend server') && res());
      });
    await start();
    const base = `http://127.0.0.1:${port}`;
    const pre = await fetch(`${base}/v1/me`, { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    const r = await (await fetch(`${base}/v1/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ann', code: 'PL-QQQQ-RRRR' }) })).json();
    expect(r.code).toBe('PL-QQQQ-RRRR');
    expect((await fetch(`${base}/v1/register`, { method: 'POST', body: '{bad' })).status).toBe(400);
    // Persisted on shutdown, readable after restart
    await new Promise((res) => {
      proc.on('exit', res);
      proc.kill('SIGTERM');
    });
    await start();
    const me = await (await fetch(`${base}/v1/me`, { headers: { Authorization: `Bearer ${r.token}` } })).json();
    expect(me.me).toMatchObject({ code: 'PL-QQQQ-RRRR', name: 'Ann' });
  }, 20000);
});
