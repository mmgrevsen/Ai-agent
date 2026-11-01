import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 19700 + Math.floor(Math.random() * 200);
const dir = mkdtempSync(join(tmpdir(), 'pl-static-'));
let proc;

beforeAll(async () => {
  mkdirSync(join(dir, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'index.html'), '<title>game</title>');
  writeFileSync(join(dir, 'dist', 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(join(dir, 'secret.txt'), 'top secret');
  proc = spawn(process.execPath, ['server/main.mjs', '--port', String(PORT), '--host', '127.0.0.1', '--data', join(dir, 'data.json'), '--static', join(dir, 'dist')]);
  await new Promise((r) => proc.stdout.on('data', (d) => String(d).includes('friend server') && r()));
});
afterAll(() => {
  proc.kill();
  rmSync(dir, { recursive: true, force: true });
});

const get = (p) => fetch(`http://127.0.0.1:${PORT}${p}`);

describe('server serves the game next to the API', () => {
  it('serves index.html, assets with the right type, and falls back to index.html', async () => {
    expect(await (await get('/')).text()).toContain('<title>game</title>');
    const js = await get('/assets/app.js');
    expect(js.headers.get('content-type')).toContain('javascript');
    expect(await (await get('/some/unknown/route')).text()).toContain('<title>game</title>');
  });

  it('never serves files outside the game folder', async () => {
    for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/assets/../../secret.txt']) {
      const res = await get(p);
      expect(await res.text(), p).not.toContain('top secret');
    }
  });

  it('the friend API still answers next to it', async () => {
    const res = await get('/v1/health');
    expect((await res.json()).service).toBe('push-legends-friends');
  });
});
