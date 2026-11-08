// Walks the demo like a guest: table link → a dish with size and spicy → cart → order → tracking.
// Fails if any request goes to an /api/ server instead of the in-browser mock, or the page throws.
//   node tools/test-demo.mjs http://127.0.0.1:8090/demo/   [screenshot folder]
import { createRequire } from 'node:module';
const require = createRequire('D:/tarmez/tarmez-campaign/package.json');
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8090/demo/';
const SHOTS = process.argv[3];
const problems = [];
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ar-SA' });
ctx.on('request', (r) => { if (new URL(r.url()).pathname.includes('/api/')) problems.push('network call to the API: ' + r.method() + ' ' + r.url()); });
await ctx.addInitScript(() => { try { localStorage.setItem('savoria_cookie_consent', JSON.stringify({ necessary: true, analytics: false, at: Date.now() })); localStorage.setItem('savoria_pwa_dismissed', String(Date.now())); } catch (_) {} });
const p = await ctx.newPage();
p.on('pageerror', (e) => problems.push('page error: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|manifest/.test(m.text())) problems.push('console: ' + m.text()); });
const shot = async (n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/demo-${n}.png` }); };

await p.goto(BASE + 'index.html?t=demo&lang=ar', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
const banner = await p.locator('.table-banner').first().textContent().catch(() => '');
console.log('table banner:', (banner || '').replace(/\s+/g, ' ').trim());
await shot('1-menu');
await p.locator('.menu-filter-btn[data-filter="mains"]').first().click().catch(() => {});
await p.waitForTimeout(500);
await p.locator('.add-to-cart-btn[data-id="12"]').scrollIntoViewIfNeeded();
await p.locator('.add-to-cart-btn[data-id="12"]').click();
await p.locator('#choicePicker').waitFor();
await p.locator('#choicePicker input[name="choiceOption"][value="9122"]').check({ force: true });
await p.locator('#choicePicker input[name="choiceSpice"][value="1"]').check({ force: true }).catch(() => {});
await p.waitForTimeout(300);
await shot('2-options');
await p.locator('#choicePicker .choice-picker-add').click();
await p.waitForTimeout(600);
console.log('cart count:', await p.locator('#cartCount').first().textContent());

await p.goto(BASE + 'cart.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
console.log('name/phone prefilled:', await p.locator('#checkoutName').inputValue(), '/', await p.locator('#checkoutPhone').inputValue());
await shot('3-cart');
await p.locator('#placeOrderBtn').click();
await p.locator('#confirmTrackBtn').waitFor({ timeout: 15000 });
await p.waitForTimeout(500);
await shot('4-confirmed');
const confirmText = (await p.locator('.cart-order-confirmed-card').first().textContent().catch(() => '')).replace(/\s+/g, ' ').trim();
console.log('confirmation:', confirmText.slice(0, 160));

await p.locator('#confirmTrackBtn').click();
await p.waitForLoadState('networkidle');
await p.waitForTimeout(1500);
console.log('after confirm opens:', p.url().split('/demo/')[1]);
const t1 = (await p.locator('body').textContent()).replace(/\s+/g, ' ');
console.log('status now:', /قيد الانتظار|بانتظار|pending|جديد/i.test(t1) ? 'pending shown' : 'see screenshot');
await shot('5-tracking');
await p.waitForTimeout(23000);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await shot('6-tracking-later');
const t2 = (await p.locator('body').textContent()).replace(/\s+/g, ' ');
console.log('after ~25 s:', /قيد التحضير|preparing/i.test(t2) ? 'preparing shown' : /مؤكد|confirmed|تم التأكيد/i.test(t2) ? 'confirmed shown' : 'see screenshot');

// a link to a page that is not in the demo stays put
await p.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
const before = p.url();
const login = p.locator('a[href*="login.html"]').first();
if (await login.count()) { await login.click({ force: true }).catch(() => {}); await p.waitForTimeout(500); console.log('login link stays in demo:', p.url() === before); }
await browser.close();
console.log(problems.length ? 'PROBLEMS:\n' + [...new Set(problems)].join('\n') : 'no problems: no API calls left the browser, no page errors');
