// Checks the landing hero: the demo loads inside the phone, is scaled to fit, and can be used (add a dish there).
//   node tools/test-hero.mjs http://127.0.0.1:8090/ [screenshot folder]
import { createRequire } from 'node:module';
const require = createRequire('D:/tarmez/tarmez-campaign/package.json');
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8090/';
const SHOTS = process.argv[3];
const problems = [];
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true });
for (const [name, opts] of [['desk', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext(opts);
  ctx.on('request', (r) => { if (new URL(r.url()).pathname.includes('/api/')) problems.push(`${name}: API call ${r.url()}`); });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(4500);
  const k = await p.evaluate(() => getComputedStyle(document.getElementById('demoScreen')).getPropertyValue('--k'));
  const fr = p.frameLocator('#demoFrame');
  const cards = await fr.locator('.add-to-cart-btn').count();
  console.log(`${name}: scale ${Number(k).toFixed(3)}, dishes in the phone ${cards}`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/hero-${name}.png` });
  // order a dish inside the phone
  await fr.locator('.add-to-cart-btn[data-id="5"]').scrollIntoViewIfNeeded();
  await fr.locator('.add-to-cart-btn[data-id="5"]').click();
  await p.waitForTimeout(900);
  console.log(`${name}: cart count in the phone`, await fr.locator('#cartCount').first().textContent());
  if (SHOTS) await p.locator('#heroStage').screenshot({ path: `${SHOTS}/hero-${name}-added.png` });
  // the language switch reloads the demo in English
  if (name === 'desk') {
    await p.click('#langBtn');
    await p.waitForTimeout(2500);
    console.log('desk: demo after switching to English:', (await fr.locator('.table-banner').first().textContent().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 60));
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no problems');
