// Renders units with the dev unit viewer to a PNG (needs `npx vite --port 5181` running).
//   NODE_PATH=$(npm root -g) node scripts/render-units.cjs out.png oakshield_knight,hero,enemy:armored:2
const { chromium } = require('playwright');
(async () => {
  const [out, units] = process.argv.slice(2);
  const port = process.env.VIEWER_PORT ?? '5181';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/dev/unit-viewer.html?units=${encodeURIComponent(units)}`);
  await page.waitForFunction(() => window.done, null, { timeout: 300000 });
  const canvas = page.locator('canvas').last();
  await canvas.screenshot({ path: out });
  if (errors.length) console.log('ERRORS', JSON.stringify(errors));
  else console.log('ok', out);
  await browser.close();
})();
