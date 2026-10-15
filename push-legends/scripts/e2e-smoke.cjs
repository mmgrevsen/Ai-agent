// UI smoke test: plays the intro and first battle, visits every screen, and starts the camera
// pipeline with Chromium's fake camera. Requires Playwright (not a project dependency):
//   npm run build && npx vite preview --port 4173 &
//   NODE_PATH=$(npm root -g) node scripts/e2e-smoke.cjs e2e-shots
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'e2e-shots';
const URL = process.env.E2E_URL ?? 'http://localhost:4173/';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['camera'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  await page.goto(URL);
  await page.waitForTimeout(1200);
  await shot('01-intro');
  await page.getByRole('button', { name: /Begin your legend/ }).click({ force: true });
  await page.waitForTimeout(3000);
  await shot('02-battle-start');
  // deploy a few cards manually
  for (let i = 0; i < 6; i++) {
    const cards = page.locator('.hand-card.ready');
    if (await cards.count()) await cards.first().click({ force: true });
    await page.waitForTimeout(1500);
  }
  await shot('03-battle-mid');
  // wait for result
  await page.waitForSelector('.result', { timeout: 120000 });
  await page.waitForTimeout(800);
  await shot('04-result');
  await page.getByRole('button', { name: /^Back$/ }).click({ force: true });
  await page.waitForTimeout(800);
  await shot('05-home');
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
  await page.locator('.modal-backdrop').click({ position: { x: 10, y: 10 } }).catch(() => {});
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
})().catch((e) => { console.error('E2E FAILED', e); process.exit(1); });
