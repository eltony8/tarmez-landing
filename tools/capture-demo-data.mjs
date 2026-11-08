// Records what the site's guest pages read from the API, for the landing page's offline demo.
// Every request that is not a GET is aborted in the browser, so nothing is ever written to the database.
//   node tools/capture-demo-data.mjs http://localhost:8000
// Writes demo/data/api.raw.json (then run tools/curate-demo-data.mjs): { "GET /path?query-without-lang": responseJson }.
// Needs playwright-core (resolved from the campaign studio) and Chrome.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('D:/tarmez/tarmez-campaign/package.json');
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8000';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'demo', 'data', 'api.raw.json');

const store = {};
const blocked = [];
const keyOf = (u) => {
  const url = new URL(u);
  url.searchParams.delete('lang');
  const qs = url.searchParams.toString();
  return `GET ${url.pathname.replace(/^\/api/, '')}${qs ? '?' + qs : ''}`;
};

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ar-SA' });
await ctx.route('**/*', async (route) => {
  const req = route.request();
  if (req.method() !== 'GET') { blocked.push(`${req.method()} ${req.url()}`); return route.abort(); }
  if (!new URL(req.url()).pathname.startsWith('/api/')) return route.continue();
  const res = await route.fetch();
  try { store[keyOf(req.url())] = await res.json(); } catch (_) { /* not json */ }
  return route.fulfill({ response: res });
});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('savoria_lang', 'ar');
    localStorage.setItem('savoria_cookie_consent', JSON.stringify({ necessary: true, analytics: false, at: Date.now() }));
    localStorage.setItem('savoria_pwa_dismissed', String(Date.now()));
    localStorage.setItem('savoria_nearby_card_hidden_until', String(Date.now() + 9e9));
  } catch (_) {}
});
const p = await ctx.newPage();
const scroll = async () => {
  const h = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 500) { await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(150); }
};

// the menu, as a visitor; open a dish with options and add it, so the cart has something in it
await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await scroll();
const firstAdd = p.locator('.add-to-cart-btn').first();
await firstAdd.scrollIntoViewIfNeeded();
await firstAdd.click();
await p.waitForTimeout(800);
if (await p.locator('#choicePicker .choice-picker-add').count()) { await p.locator('#choicePicker .choice-picker-add').click(); await p.waitForTimeout(600); }
// the English menu too (some answers carry the visitor's language)
await p.evaluate(() => localStorage.setItem('savoria_lang', 'en'));
await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await p.evaluate(() => localStorage.setItem('savoria_lang', 'ar'));
for (const page of ['cart.html', 'track-order.html', 'rate.html']) {
  await p.goto(`${BASE}/${page}`, { waitUntil: 'networkidle' });
  await scroll();
}
await browser.close();

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(store, null, 1));
console.log('recorded', Object.keys(store).length, 'answers:');
for (const k of Object.keys(store)) console.log('  ' + k);
console.log('blocked (never sent):', blocked.length ? '\n  ' + blocked.join('\n  ') : 'none');
