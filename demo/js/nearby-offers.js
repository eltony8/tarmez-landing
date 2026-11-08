/* =========================================================
   Tarmez — offers for customers near the restaurant
   js/nearby-offers.js  (index.html, account.html — docs/OFFERS_AR.md)

   · a small card asks to "turn on offers near the restaurant";
     the browser asks for the location only after that tap;
   · the phone works out the distance to the branch itself — the
     location is never sent or stored; it checks when the site is
     opened or comes back, at most every 5 minutes;
   · inside the circle a banner shows the offer (code to copy, a
     button, ×); a signed-in customer's browser tells the server
     "shown", and the server sends the phone notification (once
     per offer, within the admin's daily limit);
   · index.html?offer=ID (from a notification) shows that offer.
   ========================================================= */
(function () {
  'use strict';

  const API = typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null;
  const I18N = window.SavoriaI18n;
  if (!API) return;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const lang = () => (I18N && I18N.getLang ? I18N.getLang() : 'en');
  const pick = (o, f) => (lang() === 'ar' ? (o[f + '_ar'] || o[f]) : (o[f] || o[f + '_ar'])) || '';

  const KEY = {
    on: 'savoria_nearby_on',
    denied: 'savoria_nearby_denied',
    cardHiddenUntil: 'savoria_nearby_card_hidden_until',
    checkedAt: 'savoria_nearby_checked_at',
    hidden: 'savoria_nearby_hidden',       // { offerId: "YYYY-MM-DD" } closed today on this device
    viewed: 'savoria_nearby_viewed',       // { offerId: "YYYY-MM-DD" } counted today
    seen: 'savoria_nearby_seen',           // [offerId] reported to the server
  };
  const CHECK_EVERY = 5 * 60 * 1000;
  const CARD_PAUSE = 14 * 24 * 60 * 60 * 1000;
  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (_) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* storage blocked */ } },
  };
  const today = () => new Date().toLocaleDateString('en-CA');
  const isHome = /(^|\/)(index\.html)?$/.test(location.pathname);

  let INFO = null;      // GET /offers/nearby
  let shown = null;     // the offer in the banner

  /* ---------------- distance (on the phone only) ---------------- */
  function distance(a, b) {
    const R = 6371000;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b[0] - a[0]);
    const dLng = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(Object.assign(new Error('unsupported'), { code: 0 })); return; }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve([p.coords.latitude, p.coords.longitude]),
        (err) => reject(err),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 2 * 60 * 1000 },
      );
    });
  }

  /* ---------------- the "turn on" card ---------------- */
  function cardHost() {
    if (document.body.classList.contains('account-page') || document.getElementById('notifications')) {
      return { el: document.getElementById('notifications'), where: 'afterbegin' };
    }
    const hero = document.getElementById('home');
    return hero ? { el: hero, where: 'afterend' } : null;
  }

  function renderCard(state) {
    document.getElementById('nbCard')?.remove();
    if (!state) return;
    const host = cardHost();
    if (!host || !host.el) return;
    const denied = state === 'denied';
    host.el.insertAdjacentHTML(host.where, `
      <div class="nb-card${denied ? ' is-denied' : ''}" id="nbCard" role="region" aria-label="${esc(t('nearby.cardTitle'))}">
        <span class="nb-card-icon" aria-hidden="true">📍</span>
        <div class="nb-card-text">
          <b>${esc(t('nearby.cardTitle'))}</b>
          <span>${esc(denied ? t('nearby.denied') : t('nearby.cardText'))}</span>
          ${denied ? '' : `<small>${esc(t('nearby.privacy'))}</small>`}
        </div>
        ${denied ? '' : `<button type="button" class="btn btn-primary btn-sm" id="nbEnable">${esc(t('nearby.enable'))}</button>`}
        <button type="button" class="nb-card-close" id="nbCardClose" aria-label="${esc(t('common.close'))}">×</button>
      </div>`);
    document.getElementById('nbCardClose').addEventListener('click', () => {
      store.set(KEY.cardHiddenUntil, Date.now() + CARD_PAUSE);
      renderCard(null);
    });
    document.getElementById('nbEnable')?.addEventListener('click', enable);
  }

  async function enable() {
    const btn = document.getElementById('nbEnable');
    if (btn) btn.disabled = true;
    try {
      const here = await locate();
      store.set(KEY.on, true);
      renderCard(null);
      check(here);
    } catch (err) {
      if (err && err.code === 1) {
        store.set(KEY.denied, true);
        renderCard('denied');
      } else if (btn) {
        btn.disabled = false;
      }
    }
  }

  /* ---------------- the banner ---------------- */
  function actionHref(o) {
    if (o.action === 'menu') return 'index.html#menu';
    if (o.action === 'dish' && o.action_ref) return `index.html?dish=${encodeURIComponent(o.action_ref)}#menu`;
    if (o.action === 'reservation') return 'index.html#reservation';
    return null;
  }

  function bottomOffset() {
    const bar = document.querySelector('.pwa-bar.is-in');
    return bar ? bar.getBoundingClientRect().height + 12 : 0;
  }

  async function renderBanner(o) {
    document.getElementById('nbBanner')?.remove();
    shown = o;
    if (!o) return;
    const href = actionHref(o);
    const signedIn = API.isLoggedIn && API.isLoggedIn();
    let pushLine = '';
    if (signedIn && window.SavoriaPWA && window.SavoriaPWA.pushState) {
      try { if ((await window.SavoriaPWA.pushState()) === 'off') pushLine = `<button type="button" class="nb-push" id="nbPush">🔔 ${esc(t('nearby.turnOnPush'))}</button>`; } catch (_) { /* fine */ }
      // another check may have replaced or closed the banner while we waited
      if (shown !== o) return;
      document.getElementById('nbBanner')?.remove();
    }
    const wrap = document.createElement('div');
    wrap.className = 'nb-banner';
    wrap.id = 'nbBanner';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', pick(o, 'title'));
    wrap.style.setProperty('--nb-offset', bottomOffset() + 'px');
    wrap.innerHTML = `
      ${o.image_url ? `<img class="nb-img" src="${esc(o.image_url)}" alt="" loading="lazy">` : ''}
      <div class="nb-body">
        <span class="nb-eyebrow">📍 ${esc(t('nearby.eyebrow'))}</span>
        <b class="nb-title">${esc(pick(o, 'title'))}</b>
        ${pick(o, 'body') ? `<p class="nb-text">${esc(pick(o, 'body'))}</p>` : ''}
        <div class="nb-row">
          ${o.code ? `<span class="nb-code" dir="ltr">${esc(o.code)}</span><button type="button" class="nb-copy" id="nbCopy">${esc(t('nearby.copy'))}</button>` : ''}
          ${href ? `<a class="nb-cta" href="${esc(href)}" id="nbCta">${esc(t('nearby.action.' + o.action))}</a>` : ''}
        </div>
        ${o.code && !signedIn ? `<a class="nb-signin" href="login.html?next=${encodeURIComponent(location.pathname.replace(/^\//, '') + location.search + location.hash)}">${esc(t('nearby.signInForCode'))}</a>` : ''}
        ${pushLine}
      </div>
      <button type="button" class="nb-close" id="nbClose" aria-label="${esc(t('common.close'))}">×</button>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('is-in'));
    document.getElementById('nbClose').addEventListener('click', () => {
      const hidden = store.get(KEY.hidden, {});
      hidden[o.id] = today();
      store.set(KEY.hidden, hidden);
      renderBanner(null);
    });
    document.getElementById('nbCopy')?.addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(o.code); } catch (_) { /* old browsers: the code stays on screen */ }
      e.target.textContent = t('nearby.copied');
    });
    document.getElementById('nbCta')?.addEventListener('click', (e) => {
      if (!isHome) return;
      e.preventDefault();
      history.replaceState(null, '', e.currentTarget.getAttribute('href'));
      followAction(o);
    });
    document.getElementById('nbPush')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { await window.SavoriaPWA.enablePush(); e.target.remove(); } catch (err) { e.target.textContent = err.message; }
    });
  }

  /** On the home page: scroll to the menu, the dish (highlighted) or the booking form. */
  function followAction(o) {
    const go = (el) => el && el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (o.action === 'reservation') { go(document.getElementById('reservation')); return; }
    if (o.action === 'dish' && o.action_ref) { focusDish(o.action_ref); return; }
    go(document.getElementById('menu'));
  }

  function focusDish(id) {
    let tries = 0;
    const find = () => {
      const btn = document.querySelector(`.add-to-cart-btn[data-id="${CSS.escape(String(id))}"]`);
      const card = btn && btn.closest('article, .menu-card, .dish-card');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('nb-highlight');
        setTimeout(() => card.classList.remove('nb-highlight'), 3500);
      } else if (tries++ < 25) {
        setTimeout(find, 200);
      } else {
        document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    find();
  }

  /* ---------------- checking ---------------- */
  function check(here) {
    if (!INFO || !INFO.branch || !INFO.offers || !INFO.offers.length) return;
    store.set(KEY.checkedAt, Date.now());
    const b = INFO.branch;
    if (distance(here, [b.latitude, b.longitude]) > b.radius_m) { if (shown && !shown.fromLink) renderBanner(null); return; }
    const hidden = store.get(KEY.hidden, {});
    const offer = INFO.offers.find((o) => hidden[o.id] !== today());
    if (!offer) return;
    if (!shown || shown.id !== offer.id) renderBanner(offer);
    report(offer);
  }

  /** Counts the showing (once a day per device) and, signed in, asks the server for the notification. */
  function report(o) {
    const viewed = store.get(KEY.viewed, {});
    if (viewed[o.id] !== today()) {
      viewed[o.id] = today();
      store.set(KEY.viewed, viewed);
      API.request(`/offers/${o.id}/view`, { method: 'POST' }).catch(() => {});
    }
    if (!(API.isLoggedIn && API.isLoggedIn())) return;
    const seen = store.get(KEY.seen, []);
    if (seen.includes(o.id)) return;
    API.request(`/offers/${o.id}/seen`, { method: 'POST', auth: true })
      .then(() => { seen.push(o.id); store.set(KEY.seen, seen.slice(-50)); })
      .catch(() => {});
  }

  async function maybeCheck(force) {
    if (!store.get(KEY.on, false) || !INFO || !INFO.branch || !INFO.offers.length) return;
    if (!force && Date.now() - Number(store.get(KEY.checkedAt, 0)) < CHECK_EVERY) return;
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const p = await navigator.permissions.query({ name: 'geolocation' });
        if (p.state === 'denied') { store.set(KEY.on, false); return; }
      }
      check(await locate());
    } catch (err) {
      if (err && err.code === 1) store.set(KEY.on, false);
    }
  }

  async function start() {
    const params = new URLSearchParams(location.search);
    const linked = params.get('offer');
    if (linked) {
      try {
        const o = await API.request(`/offers/${encodeURIComponent(linked)}`);
        renderBanner({ ...o, fromLink: true });
      } catch (_) { /* the offer ended */ }
    }
    if (isHome && params.get('dish')) focusDish(params.get('dish'));

    try { INFO = await API.request('/offers/nearby'); } catch (_) { return; }
    if (!INFO || !INFO.enabled || !INFO.branch || !INFO.offers || !INFO.offers.length) return;

    if (!store.get(KEY.on, false)) {
      const pausedUntil = Number(store.get(KEY.cardHiddenUntil, 0));
      if (store.get(KEY.denied, false)) return;
      if (Date.now() > pausedUntil) renderCard('ask');
      return;
    }
    maybeCheck(true);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') maybeCheck(false); });
  }

  if (I18N && I18N.onChange) I18N.onChange(() => {
    if (document.getElementById('nbCard')) renderCard(document.getElementById('nbCard').classList.contains('is-denied') ? 'denied' : 'ask');
    if (shown) renderBanner(shown);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.SavoriaNearby = { distance };
})();
