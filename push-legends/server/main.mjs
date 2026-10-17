// @ts-check
/**
 * Push Legends friend server. Zero dependencies: Node 18+ only.
 *
 *   node server/main.mjs [--port 8787] [--data ./friends-data.json]
 *
 * Everyone who should be friends connects their game to the same server address
 * (Settings in the game: Friends -> Online friends). See FRIENDS_SERVER.md.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { emptyState, FriendService } from './core.mjs';

const arg = (/** @type {string} */ name, /** @type {string} */ fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg('port', process.env.PORT ?? '8787'));
const HOST = arg('host', process.env.HOST ?? '0.0.0.0');
const DATA = resolve(arg('data', process.env.FRIENDS_DATA ?? 'friends-data.json'));
const MAX_BODY = 32 * 1024;
/** Cloud saves are bigger than every other request. */
const MAX_SAVE_BODY = 1024 * 1024;

function load() {
  if (!existsSync(DATA)) return emptyState();
  try {
    return JSON.parse(readFileSync(DATA, 'utf8'));
  } catch (e) {
    // Never overwrite a file we could not read: keep it and start on a copy
    const bad = `${DATA}.unreadable-${Date.now()}`;
    renameSync(DATA, bad);
    console.error(`Could not read ${DATA} (${String(e)}); moved it to ${bad} and started empty.`);
    return emptyState();
  }
}

const service = new FriendService(load());

function save() {
  if (!service.dirty) return;
  service.dirty = false;
  mkdirSync(dirname(DATA), { recursive: true });
  const tmp = `${DATA}.tmp`;
  writeFileSync(tmp, JSON.stringify(service.state));
  renameSync(tmp, DATA); // atomic replace: a crash never leaves a half-written file
}
setInterval(save, 1000).unref();

const server = createServer((req, res) => {
  // The game runs from file://, localhost and app WebViews, so any origin may call the API.
  // Auth is a bearer token (no cookies), which keeps this safe.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  const limit = (req.url ?? '').startsWith('/v1/save') ? MAX_SAVE_BODY : MAX_BODY;
  let size = 0;
  /** @type {Buffer[]} */
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > limit) {
      res.writeHead(413, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'too_large', message: 'Request too large.' }));
      req.destroy();
    } else chunks.push(c);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    /** @type {Record<string, unknown>} */
    let body = {};
    if (chunks.length) {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        body = parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'bad_json', message: 'Body must be JSON.' }));
        return;
      }
    }
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    let reply;
    try {
      reply = service.handle(req.method ?? 'GET', path, token, body);
    } catch (e) {
      console.error(e);
      reply = { status: 500, body: { error: 'server_error', message: 'Something went wrong.' } };
    }
    res.writeHead(reply.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(reply.body));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Push Legends friend server on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (data: ${DATA})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    save();
    process.exit(0);
  });
}
