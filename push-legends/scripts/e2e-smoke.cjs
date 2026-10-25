// UI smoke test: creates an account on a fresh friend server (started here), plays the intro and
// first battle, visits every screen, and starts the camera pipeline with Chromium's fake camera.
// Requires Playwright (not a project dependency):
//   npm run build && npx vite preview --port 4173 &
//   NODE_PATH=$(npm root -g) node scripts/e2e-smoke.cjs e2e-shots
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'e2e-shots';
const URL = process.env.E2E_URL ?? 'http://localhost:4173/';
require('fs').mkdirSync(OUT, { recursive: true });
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const PORT = 18700 + Math.floor(Math.random() * 200);
const dataFile = path.join(os.tmpdir(), `pl-smoke-${PORT}.json`);
const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'main.mjs'), '--port', String(PORT), '--host', '127.0.0.1', '--data', dataFile]);
let failPage = null;
const stopServer = () => {
  server.kill('SIGTERM');
  require('fs').rmSync(dataFile, { force: true });
};
(async () => {
  await new Promise((res) => server.stdout.on('data', (d) => String(d).includes('friend server') && res()));
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['camera'] });
  const page = await ctx.newPage();
  failPage = page;
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  await page.goto(URL);
  await page.waitForTimeout(1200);
  // Login screen first: create an account
  await shot('00-login');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Server address').fill(`127.0.0.1:${PORT}`);
  await page.getByLabel('Username').fill('smoketester');
  await page.getByLabel('Password', { exact: true }).fill('secret123');
  await page.getByLabel('Repeat password').fill('secret123');
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await page.waitForSelector('text=Begin your legend', { timeout: 15000 });
  await page.waitForTimeout(600);
  await shot('01-intro');
  await page.getByRole('button', { name: /Begin your legend/ }).click({ force: true });
  await page.waitForTimeout(800);
  // Stages are claimed with push-ups: the camera setup comes first (skipped here)
  await shot('01b-camera-prompt');
  await page.getByRole('button', { name: /Fight without the camera/ }).click({ force: true });
  await page.waitForTimeout(3000);
  await shot('02-battle-start');
  // deploy a few cards manually
  for (let i = 0; i < 6; i++) {
    const cards = page.locator('.hand-card.ready');
    if (await cards.count()) await cards.first().click({ force: true });
    await page.waitForTimeout(1500);
  }
  await shot('03-battle-mid');
  // Keep playing cards until the battle ends (slow software rendering stretches the battle)
  for (let i = 0; i < 160 && !(await page.locator('.result').count()); i++) {
    // All waves beaten without push-ups: the stage is sealed; retreat (rewards are kept)
    if (await page.locator('.seal-panel').count()) {
      await shot('03b-sealed');
      await page.getByRole('button', { name: /Retreat and keep rewards/ }).click({ force: true });
      await page.waitForTimeout(1000);
      continue;
    }
    const cards = page.locator('.hand-card.ready');
    if (await cards.count()) await cards.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  await page.waitForSelector('.result', { timeout: 30000 });
  await page.waitForTimeout(800);
  await shot('04-result');
  await page.getByRole('button', { name: /^Back$/ }).click({ force: true });
  await page.waitForTimeout(800);
  await shot('05-home');
  // Training log (push-up totals, calories, history, goals)
  await page.locator('button.modes-entry', { hasText: 'Training' }).click({ force: true });
  await page.waitForTimeout(600);
  await shot('05a-training');
  await page.getByRole('button', { name: 'Back' }).first().click({ force: true });
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(400);
  await shot('05b-home-scrolled');
  for (const [tab, name] of [['Cards', '06-cards'], ['Hero', '07-hero'], ['Base', '08-base'], ['Quests', '09-quests']]) {
    await page.getByRole('navigation').getByRole('button', { name: new RegExp(tab) }).click({ force: true });
    await page.waitForTimeout(700);
    await shot(name);
  }
  // card modal
  await page.getByRole('navigation').getByRole('button', { name: /Cards/ }).click({ force: true });
  await page.locator('.deck-grid .tile').first().click({ force: true });
  await page.waitForTimeout(600);
  await shot('10-card-modal');
  await page.locator('.modal-backdrop').click({ position: { x: 10, y: 10 } });
  // shop
  await page.getByRole('tab', { name: 'Shop' }).click({ force: true });
  await page.waitForTimeout(500);
  await shot('11-shop');
  // building modal
  await page.getByRole('navigation').getByRole('button', { name: /Base/ }).click({ force: true });
  await page.locator('.building-card').nth(2).click({ force: true });
  await page.waitForTimeout(500);
  await shot('12-building-modal');
  await page.getByRole('button', { name: /^Upgrade$/ }).click().catch(() => {});
  await page.waitForTimeout(300);
  // Close the sheet if it is still open (e.g. not enough gold): tap the dimmed area above it
  if (await page.locator('.modal-backdrop').count()) {
    await page.mouse.click(195, 400);
    await page.waitForTimeout(400);
  }
  // modes + social + settings
  await page.getByRole('navigation').getByRole('button', { name: /Battle/ }).click({ force: true });
  await page.getByRole('button', { name: /Battle Modes/ }).click({ force: true });
  await page.waitForTimeout(500);
  await shot('13-modes');
  await page.getByRole('button', { name: 'Back' }).first().click({ force: true });
  await page.getByRole('button', { name: 'Friends and profile' }).click({ force: true });
  await page.waitForTimeout(500);
  await shot('14-social');
  await page.getByRole('button', { name: 'Back' }).first().click({ force: true });
  await page.getByRole('button', { name: 'Settings' }).click({ force: true });
  await page.waitForTimeout(500);
  await shot('15-settings');
  await page.getByRole('button', { name: 'Back' }).first().click({ force: true });
  // prebattle with camera
  await page.getByRole('button', { name: /^Battle$/ }).first().click({ force: true });
  await page.waitForTimeout(500);
  await shot('16-prebattle');
  await page.getByRole('tab', { name: 'Full push-ups' }).click({ force: true });
  await page.getByRole('button', { name: /Fight!/ }).click({ force: true });
  await page.waitForTimeout(800);
  await shot('17-camera-intro');
  await page.getByRole('button', { name: /^Continue$/ }).click({ force: true });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Start camera/ }).click({ force: true });
  // wait for pose model to load
  try {
    await page.waitForFunction(() => /Tracking:/.test(document.body.innerText), null, { timeout: 60000 });
    console.log('POSE PIPELINE: running');
  } catch {
    console.log('POSE PIPELINE: not running ->', await page.locator('.cam-hud').innerText().catch(() => '?'));
  }
  await page.waitForTimeout(1500);
  await shot('18-camera-preview');
  await page.getByRole('button', { name: /Looks good - fight!/ }).click({ force: true });
  await page.waitForTimeout(5000);
  await shot('19-battle-camera');
  console.log('ERRORS:\n' + (errors.join('\n') || 'none'));
  await browser.close();
  stopServer();
})().catch(async (e) => {
  console.error('E2E FAILED', e);
  await failPage?.screenshot({ path: `${OUT}/99-failure.png` }).catch(() => {});
  stopServer();
  process.exit(1);
});
