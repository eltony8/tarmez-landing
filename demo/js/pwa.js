/* =========================================================
   Tarmez — the installable app (PWA) on every page
   js/pwa.js  (service worker: /sw.js)

   · registers the service worker (offline page, fast loads, push);
   · an "Install the app" bar: Android / desktop use the browser's
     install prompt, iPhone gets the "Share → Add to Home Screen"
     steps. Dismissed for 14 days with "Not now";
   · window.SavoriaPWA: phone notifications on / off for this device.
   ========================================================= */
(function () {
  'use strict';

  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const API = typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null;
  const swOk = 'serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname));
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const DISMISS_KEY = 'savoria_install_dismissed';
  let deferredPrompt = null;
  let registration = null;

  const ready = swOk
    ? navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((r) => { registration = r; return r; }).catch(() => null)
    : Promise.resolve(null);

  /* ---------- install bar ---------- */
  function dismissedRecently() {
    try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < 7 * 864e5; } catch (_) { return false; }
  }

  /* iPhone / iPad have no install button a site can trigger (Apple's rule):
     the visitor adds the site from the Share menu. Which browser decides
     where that menu is — and a browser inside another app (WhatsApp,
     Instagram, Facebook…) cannot add to the home screen at all. */
  function iosBrowser() {
    const ua = navigator.userAgent;
    if (/FBAN|FBAV|Instagram|Line\/|Snapchat|musical_ly|TikTok|Twitter|GSA\//i.test(ua)) return 'inapp';
    if (/CriOS/i.test(ua)) return 'chrome';
    if (/EdgiOS/i.test(ua)) return 'edge';
    if (/FxiOS/i.test(ua)) return 'firefox';
    if (/Safari/i.test(ua) && /Version\//i.test(ua)) return 'safari';
    return 'inapp'; // a web view without Safari's name: most likely inside another app
  }

  const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg>';
  const ADD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

  /** The step-by-step sheet (iPhone), or the browser's own prompt (Android / desktop). */
  async function showInstallGuide() {
    if (deferredPrompt && !isIOS) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      document.getElementById('pwaInstallBar')?.remove();
      return;
    }
    document.getElementById('pwaGuide')?.remove();
    const kind = isIOS ? iosBrowser() : 'other';
    const steps = kind === 'inapp'
      ? [t('pwa.guide.inapp1'), t('pwa.guide.inapp2')]
      : kind === 'safari'
        ? [t('pwa.guide.safari1', { icon: SHARE_ICON }), t('pwa.guide.add', { icon: ADD_ICON }), t('pwa.guide.confirm')]
        : isIOS
          ? [t('pwa.guide.chrome1', { icon: SHARE_ICON }), t('pwa.guide.add', { icon: ADD_ICON }), t('pwa.guide.confirm')]
          : [t('pwa.guide.desktop')];
    const sheet = document.createElement('div');
    sheet.id = 'pwaGuide';
    sheet.className = 'pwa-guide';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'pwaGuideTitle');
    sheet.innerHTML = `
      <div class="pwa-guide-card">
        <button type="button" class="pwa-guide-close" data-guide-close aria-label="${t('pwa.close')}">×</button>
        <img src="assets/icons/icon-192.png" alt="" width="64" height="64">
        <h2 id="pwaGuideTitle">${t('pwa.title')}</h2>
        <ol>${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
        ${isIOS && kind !== 'safari' && kind !== 'inapp' ? `<p class="pwa-guide-note">${t('pwa.guide.oldIos')}</p>` : ''}
        ${isIOS && kind === 'safari' ? `<div class="pwa-guide-arrow" aria-hidden="true">${SHARE_ICON}<span>↓</span></div>` : ''}
        <button type="button" class="btn btn-primary btn-block" data-guide-close>${t('pwa.gotIt')}</button>
      </div>`;
    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('is-in'));
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet || e.target.closest('[data-guide-close]')) sheet.remove();
    });
  }

  function showBar(mode) {
    if (standalone || dismissedRecently() || document.getElementById('pwaInstallBar')) return;
    if (window.SavoriaFeatures && !window.SavoriaFeatures.on('install_bar')) return;
    if (document.body.classList.contains('admin-page') || /(admin|workspace|kitchen)\.html$/.test(location.pathname)) return;
    const bar = document.createElement('div');
    bar.id = 'pwaInstallBar';
    bar.className = 'pwa-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', t('pwa.title'));
    bar.innerHTML = `
      <img src="assets/icons/icon-192.png" alt="" width="44" height="44">
      <div class="pwa-bar-text">
        <strong>${t('pwa.title')}</strong>
        <span>${mode === 'ios' ? t(iosBrowser() === 'inapp' ? 'pwa.iosInapp' : 'pwa.iosShort') : t('pwa.subtitle')}</span>
      </div>
      <button type="button" class="btn btn-primary btn-sm" data-pwa-install>${mode === 'ios' ? t('pwa.howTo') : t('pwa.install')}</button>
      <button type="button" class="pwa-bar-close" data-pwa-dismiss aria-label="${t('pwa.notNow')}">×</button>`;
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('is-in'));
    bar.addEventListener('click', async (e) => {
      if (e.target.closest('[data-pwa-dismiss]')) {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (_) { /* fine */ }
        bar.remove();
      } else if (e.target.closest('[data-pwa-install]')) {
        showInstallGuide();
      }
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(() => showBar('prompt'), 6000);
  });
  window.addEventListener('appinstalled', () => document.getElementById('pwaInstallBar')?.remove());
  // iPhone / iPad: every browser (Safari, Chrome, Edge, Firefox) — and a hint for in-app browsers.
  if (isIOS && !standalone) setTimeout(() => showBar('ios'), 3000);

  /* ---------- phone notifications ---------- */
  function keyBytes(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  /** 'unsupported' | 'ios-install' | 'denied' | 'on' | 'off' */
  async function pushState() {
    if (!swOk || !('PushManager' in window) || !('Notification' in window)) return isIOS && !standalone ? 'ios-install' : 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const reg = await ready;
    if (!reg) return 'unsupported';
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  }

  async function enablePush() {
    const reg = await ready;
    if (!reg || !API) throw new Error(t('pwa.unsupported'));
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error(t('pwa.denied'));
    const { public_key: key } = await API.getPushKey();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    const json = sub.toJSON();
    await API.subscribePush({ endpoint: json.endpoint, keys: json.keys, lang: I18N && I18N.getLang ? I18N.getLang() : 'en' });
    return 'on';
  }

  async function disablePush() {
    const reg = await ready;
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      try { if (API) await API.unsubscribePush(sub.endpoint); } catch (_) { /* the browser side still turns off */ }
      await sub.unsubscribe();
    }
    return 'off';
  }

  // Keep the language of phone notifications in step with the site.
  if (I18N && I18N.onChange) {
    I18N.onChange(async () => {
      try {
        if (!API || !API.isLoggedIn || !API.isLoggedIn()) return;
        const reg = await ready;
        const sub = reg && (await reg.pushManager.getSubscription());
        if (sub) { const j = sub.toJSON(); await API.subscribePush({ endpoint: j.endpoint, keys: j.keys, lang: I18N.getLang() }); }
      } catch (_) { /* best effort */ }
    });
  }

  /* ---------- app navigation (only when installed: there is no browser toolbar) ---------- */
  function appNav() {
    if (!standalone || document.getElementById('appNav')) return;
    document.documentElement.classList.add('is-standalone');
    const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const nav = document.createElement('nav');
    nav.id = 'appNav';
    nav.className = 'app-nav';
    nav.setAttribute('aria-label', t('pwa.navLabel'));
    nav.innerHTML = `
      <button type="button" data-app-nav="back" aria-label="${t('pwa.back')}" title="${t('pwa.back')}">${icon('<path d="M15 18l-6-6 6-6"/>')}</button>
      <button type="button" data-app-nav="home" aria-label="${t('pwa.home')}" title="${t('pwa.home')}">${icon('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>')}</button>
      <button type="button" data-app-nav="reload" aria-label="${t('pwa.reload')}" title="${t('pwa.reload')}">${icon('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>')}</button>
      <button type="button" data-app-nav="forward" aria-label="${t('pwa.forward')}" title="${t('pwa.forward')}">${icon('<path d="M9 18l6-6-6-6"/>')}</button>`;
    document.body.appendChild(nav);
    const nv = window.navigation;
    const sync = () => {
      // Chrome / Android know whether there is a page to go back or forward to.
      if (nv && 'canGoBack' in nv) {
        nav.querySelector('[data-app-nav="back"]').disabled = !nv.canGoBack;
        nav.querySelector('[data-app-nav="forward"]').disabled = !nv.canGoForward;
      }
    };
    sync();
    if (nv) nv.addEventListener('currententrychange', sync);
    // a page restored from the back/forward cache keeps its old buttons: check again when shown
    window.addEventListener('pageshow', sync);
    // labels follow the site language (it may be set up after this bar)
    const label = () => {
      nav.setAttribute('aria-label', t('pwa.navLabel'));
      nav.querySelectorAll('[data-app-nav]').forEach((b) => {
        const text = t('pwa.' + (b.dataset.appNav === 'reload' ? 'reload' : b.dataset.appNav));
        b.setAttribute('aria-label', text);
        b.title = text;
      });
    };
    label();
    window.addEventListener('load', label);
    if (I18N && I18N.onChange) I18N.onChange(label);
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('[data-app-nav]');
      if (!b || b.disabled) return;
      const what = b.dataset.appNav;
      if (what === 'back') history.back();
      else if (what === 'forward') history.forward();
      else if (what === 'home') location.href = '/index.html';
      else { b.classList.add('is-spinning'); location.reload(); }
    });
  }
  if (document.body) appNav(); else document.addEventListener('DOMContentLoaded', appNav);

  window.SavoriaPWA = { pushState, enablePush, disablePush, isIOS, standalone, showInstallGuide, canInstall: () => !standalone };
})();
