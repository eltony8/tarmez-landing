/* Tarmez demo — answers the site's API inside the browser, so the real guest pages run with no server.
   Loaded before the site's js/api.js (tools/sync-demo.mjs puts it there). Nothing leaves the browser:
   - reads come from data/api.json (recorded from the site, menu edited for the public demo);
   - an order is kept in this browser's storage, and its status moves on by itself so tracking can be seen;
   - anything else that would write (accounts, coupons, reservations…) answers that it is not part of the demo. */
(function () {
  'use strict';
  const realFetch = window.fetch.bind(window);
  const here = new URL('.', document.currentScript ? document.currentScript.src : location.href); // demo/_demo/
  const root = new URL('../', here);                                                               // demo/
  const ORDERS = 'tarmez_demo_orders';
  const COUNTER = 'tarmez_demo_counter';
  const lang = () => { try { return localStorage.getItem('savoria_lang') === 'en' ? 'en' : 'ar'; } catch (_) { return 'ar'; } };
  const ar = () => lang() === 'ar';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* storage blocked: the order lives for this page only */ } },
  };

  /* the demo visitor is a signed-in guest (the real site asks guests to sign in before ordering),
     and the page speaks the language the landing page asked for (?lang=ar|en) */
  const DEMO_USER = { id: 9001, full_name: 'ضيف ترميز', email: 'guest@demo.tarmez', phone: '0500000000', role: 'customer', is_active: 1, created_at: '2026-11-01 12:00:00' };
  try {
    const wanted = new URLSearchParams(location.search).get('lang');
    if (wanted === 'ar' || wanted === 'en') localStorage.setItem('savoria_lang', wanted);
    else if (!localStorage.getItem('savoria_lang')) localStorage.setItem('savoria_lang', 'ar');
    if (!localStorage.getItem('savoria_token')) {
      localStorage.setItem('savoria_token', 'demo-session');
      localStorage.setItem('savoria_user', JSON.stringify(DEMO_USER));
    }
    if (!localStorage.getItem('savoria_cookie_consent')) localStorage.setItem('savoria_cookie_consent', JSON.stringify({ necessary: true, analytics: false, at: Date.now() }));
    localStorage.setItem('savoria_pwa_dismissed', String(Date.now()));
    localStorage.setItem('savoria_nearby_card_hidden_until', String(Date.now() + 9e9));
  } catch (_) { /* storage blocked: the demo still shows the menu */ }

  let dataPromise = null;
  const data = () => dataPromise || (dataPromise = Promise.all([
    realFetch(new URL('data/api.json', root)).then((r) => r.json()),
    realFetch(new URL('data/table.json', root)).then((r) => r.json()),
  ]).then(([api, table]) => ({ api, table })));

  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const ok = (d, message = 'OK') => reply({ success: true, message, data: d, errors: [] });
  const fail = (status, message) => reply({ success: false, message, data: null, errors: [] }, status);
  const notInDemo = () => fail(403, ar() ? 'هذه الخطوة غير متاحة في النسخة التجريبية.' : 'This step is not part of the demo.');
  const round2 = (n) => Math.round(n * 100) / 100;
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const digits = (s) => String(s || '').replace(/\D/g, '');

  /* the order moves on by itself: seconds after it was placed → status */
  const FLOW = [[0, 'pending'], [8, 'confirmed'], [20, 'preparing'], [40, 'out_for_delivery'], [65, 'delivered']];
  const statusAt = (o) => {
    const s = (Date.now() - o.created_ms) / 1000;
    let st = 'pending';
    for (const [t, name] of FLOW) if (s >= t) st = name;
    return st;
  };
  const live = (o) => ({ ...o, status: statusAt(o) });
  const trackCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 8; i++) c += a[Math.floor(Math.random() * a.length)]; return c; };

  async function placeOrder(payload) {
    const { api, table } = await data();
    const menu = api['GET /menu-items'].data;
    const vatRate = Number(api['GET /loyalty/rules']?.data?.vat_rate ?? 15);
    const name = String(payload.customer_name || DEMO_USER.full_name).trim();
    if (!name) return fail(422, 'Please enter your name.');
    if (digits(payload.phone).length < 9) return fail(422, 'Please enter a valid phone number.');
    if (!Array.isArray(payload.items) || !payload.items.length) return fail(422, 'Your cart is empty.');
    const items = [];
    let subtotal = 0;
    for (const line of payload.items) {
      const dish = menu.find((d) => Number(d.id) === Number(line.menu_item_id));
      if (!dish) return fail(422, 'One of the dishes is no longer on the menu.');
      const option = (dish.options || []).find((o) => Number(o.id) === Number(line.option_id)) || null;
      const base = option ? Number(option.price) : Number(dish.price);
      const pct = Number(dish.discount_percent) || 0;
      const unit = round2(pct > 0 && pct <= 100 ? base * (1 - pct / 100) : base);
      const qty = Math.max(1, Number(line.quantity) || 1);
      const lineTotal = round2(unit * qty);
      subtotal += lineTotal;
      items.push({
        menu_item_id: dish.id, name: dish.name, item_name_snapshot: dish.name, item_name_ar: dish.name_ar || null,
        unit_price: unit, quantity: qty, subtotal: lineTotal, instructions: null,
        option_id: option ? option.id : null, option_name: option ? option.name : null, option_name_ar: option ? option.name_ar : null,
        is_spicy: !!line.spicy && (dish.options || []).length > 0,
      });
    }
    subtotal = round2(subtotal);
    const vat = round2(subtotal * vatRate / 100);
    const number = store.get(COUNTER, 1040) + 1;
    store.set(COUNTER, number);
    const now = Date.now();
    const atTable = payload.table_token && payload.order_type === 'dine_in';
    const order = {
      id: number, order_number: number, status: 'pending', order_type: payload.order_type || 'dine_in',
      customer_name: name, phone: String(payload.phone), delivery_address: payload.delivery_address || null,
      table_number: atTable ? table.table_number : (payload.table_number || null),
      table_id: atTable ? table.id : null, table_label: atTable ? table.label : null, table_label_ar: atTable ? table.label_ar : null,
      order_notes: payload.order_notes || null,
      subtotal, vat_amount: vat, vat_rate: vatRate, total_amount: round2(subtotal + vat),
      discount_amount: 0, points_discount: 0, coupon_discount: 0, promo_discount: 0, redeemed_points: 0, redeemed_discount: 0,
      points_used: 0, points_to_earn: 0, coupons: [], earned_coupon_preview: null, earned_coupon_value: 0, earned_coupon_percent: 0,
      track_code: trackCode(), invoice_number: number, created_ms: now, created_at: stamp(now), updated_at: stamp(now), items,
    };
    const all = store.get(ORDERS, []);
    all.unshift(order);
    store.set(ORDERS, all.slice(0, 20));
    return ok(order, 'Order placed successfully.');
  }

  function track(params) {
    const phone = digits(params.get('phone')).slice(-10);
    const code = String(params.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (phone.length < 7) return fail(422, 'Please enter a valid phone number.');
    if (!code) return fail(401, 'Enter the tracking code that came with your order, or log in to your account to see your orders.');
    const orders = store.get(ORDERS, []).filter((o) => digits(o.phone).slice(-10) === phone && o.track_code === code).map(live);
    if (!orders.length) return fail(404, 'No order matches this phone number and tracking code.');
    return ok({ orders });
  }

  async function answer(url, method, body) {
    const p = url.pathname.replace(/^.*\/api(?=\/)/, '');
    if (method === 'GET') {
      if (p === '/tables/resolve') { const { table } = await data(); return ok(table); }
      if (p === '/orders/track') return track(url.searchParams);
      if (p === '/reservations/track') return ok({ reservations: [] });
      if (p === '/coupons/lookup') return ok({ coupons: [], points: null });
      // the signed-in demo guest
      if (p === '/auth/me') return ok(store.get('tarmez_demo_user', null) || DEMO_USER);
      if (p === '/my/orders') return ok(store.get(ORDERS, []).filter((o) => !o.hidden).map(live));
      if (p === '/me/reservations' || p === '/me/coupons') return ok([]);
      if (p === '/me/notifications') return ok({ notifications: [], unread_count: 0 });
      if (p === '/me/notifications/unread-count') return ok({ unread_count: 0 });
      if (p === '/me/ratings') return ok({ pending: [], rated: {} });
      if (p === '/me/loyalty' || p === '/me/points') return fail(404, 'Not part of the demo.');
      const m = p.match(/^\/orders\/(\d+)$/);
      if (m) { const o = store.get(ORDERS, []).find((x) => x.id === Number(m[1])); return o ? ok(live(o)) : fail(404, 'Order not found.'); }
      const { api } = await data();
      const q = new URLSearchParams(url.search); q.delete('lang');
      const key = `GET ${p}${q.toString() ? '?' + q : ''}`;
      if (api[key]) return reply(api[key]);
      if (api[`GET ${p}`]) return reply(api[`GET ${p}`]);
      return fail(404, ar() ? 'غير متاح في النسخة التجريبية.' : 'Not available in the demo.');
    }
    if (method === 'POST' && p === '/orders') return placeOrder(body || {});
    const hide = p.match(/^\/my\/orders\/(\d+)\/hide$/);
    if (hide) { store.set(ORDERS, store.get(ORDERS, []).map((o) => (o.id === Number(hide[1]) ? { ...o, hidden: true } : o))); return ok({}); }
    if (p.startsWith('/me/notifications/') || p === '/auth/logout') return ok({});
    return notInDemo();
  }

  window.fetch = async function (input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!/\/api\//.test(url.pathname) && !(location.protocol === 'file:' && url.port === '8000')) return realFetch(input, init);
    const method = String(init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 160)); // feels like a network
    return answer(url, method, body);
  };

  // inside the landing page's phone, scrolling stays in the phone (scrollIntoView would also scroll the landing page)
  if (window.top !== window) {
    Element.prototype.scrollIntoView = function (opts) {
      const r = this.getBoundingClientRect();
      const block = (opts && typeof opts === 'object' && opts.block) || 'start';
      let y = window.scrollY + r.top;
      if (block === 'center') y -= (window.innerHeight - r.height) / 2;
      else if (block === 'end') y -= window.innerHeight - r.height;
      window.scrollTo({ top: Math.max(0, y), behavior: (opts && opts.behavior) || 'auto' });
    };
  }

  // no service worker or push inside the demo
  if (navigator.serviceWorker) {
    try { navigator.serviceWorker.register = () => Promise.resolve(null); } catch (_) { /* read-only in some browsers */ }
  }

  /* links to pages that are not in the demo (login, account, admin…) stay where they are, with a short note */
  const PAGES = ['', 'index.html', 'cart.html', 'track-order.html', 'account.html'];
  function note(text) {
    let el = document.getElementById('demoNote');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demoNote';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:2147483646;max-width:86%;padding:10px 16px;border-radius:14px;background:rgba(31,27,24,.94);color:#F8F1E7;font:500 13px/1.5 Alexandria,system-ui,sans-serif;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.3);transition:opacity .3s;opacity:0';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 2600);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || /^(mailto:|tel:|https?:\/\/wa\.me)/.test(href)) return;
    let u;
    try { u = new URL(href, location.href); } catch (_) { return; }
    const inDemo = u.origin === location.origin && u.pathname.startsWith(root.pathname) && PAGES.includes(u.pathname.slice(root.pathname.length));
    if (!inDemo) {
      e.preventDefault();
      note(ar() ? 'هذه الصفحة في النسخة الكاملة فقط — جرّب الطلب من المنيو.' : 'This page is in the full version only — try ordering from the menu.');
    }
  }, true);

  /* a small, always-visible demo badge with a reset */
  function badge() {
    if (document.getElementById('demoBadge')) return;
    const b = document.createElement('div');
    b.id = 'demoBadge';
    b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:8px;white-space:nowrap;z-index:2147483646;display:flex;gap:8px;align-items:center;padding:6px 6px 6px 12px;border-radius:999px;background:rgba(31,27,24,.9);color:#F8F1E7;font:500 12px Alexandria,system-ui,sans-serif;direction:' + (ar() ? 'rtl' : 'ltr');
    const label = document.createElement('span');
    label.textContent = ar() ? 'تجربة — الطلبات غير حقيقية' : 'Demo — orders are not real';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = ar() ? 'ابدأ من جديد' : 'Start over';
    reset.style.cssText = 'border:0;border-radius:999px;padding:5px 10px;background:#D9A441;color:#1F1B18;font:600 12px Alexandria,system-ui,sans-serif;cursor:pointer';
    reset.addEventListener('click', () => {
      try { Object.keys(localStorage).filter((k) => /^(savoria_cart|savoria_last|savoria_track|savoria_table|tarmez_demo_orders)/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch (_) { /* fine */ }
      try { sessionStorage.clear(); } catch (_) { /* fine */ }
      location.href = new URL('index.html?t=demo', root).href;
    });
    b.append(label, reset);
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', badge); else badge();
})();
