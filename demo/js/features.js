/* =========================================================
   Tarmez — platform switches on the customer pages
   js/features.js  (loaded right after api.js)

   Reads GET /features (what the admin switched on or off in Site
   Management → Platform) and hides what is off: links, buttons,
   sections and order types. The server refuses switched-off parts
   anyway; this keeps the pages honest. Remembered for a minute in
   this tab. window.SavoriaFeatures = { ready, on(key) }
   ========================================================= */
(function () {
  'use strict';

  const API = typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null;
  const I18N = window.SavoriaI18n;
  const t = (key) => (I18N ? I18N.t(key) : key);
  const CACHE = 'savoria_features_v1';
  const isStaffPage = /\/(admin|workspace|kitchen)\.html$/.test(location.pathname);

  /* what each switch hides on the customer pages */
  const HIDE = {
    reservations: ['#reservation', 'a[href$="#reservation"]', 'a[href*="#reservation"]', '#reservations', 'a[href*="#reservations"]'],
    registration: ['a[href*="register.html"]', '.auth-switch-register'],
    whatsapp_ordering: ['#whatsappOrderBtn'],
    invoices: ['a[href*="invoice.html"]', '[data-invoice-order]'],
    ratings: ['.account-order-rate', '.account-order-rated', '[data-rate-order]', '#invoiceRate', '.dish-rating'],
    push_notifications: ['#pushCard'],
    install_bar: ['#installCard', '#pwaInstallBar'],
    points: ['#pointsUseWrap', '#points', 'a[href*="#points"]'],
    ordering: ['.add-to-cart-btn', '.choice-picker-add', '#placeOrderBtn', '#whatsappOrderBtn'],
  };

  let flags = null;
  function read() {
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE) || 'null');
      if (c && Date.now() - c.at < 60000) return c.flags;
    } catch (_) { /* storage blocked */ }
    return null;
  }

  function apply() {
    if (!flags || isStaffPage) return;
    const off = Object.keys(flags).filter((k) => flags[k] === false);
    const selectors = [];
    off.forEach((k) => (HIDE[k] || []).forEach((s) => selectors.push(s)));
    // the coupon box goes only when both kinds of discount are off
    if (flags.promo_codes === false && flags.legacy_coupons === false) selectors.push('.rewards-coupon-input-wrap');
    let style = document.getElementById('featureSwitches');
    if (!style) {
      style = document.createElement('style');
      style.id = 'featureSwitches';
      document.head.appendChild(style);
    }
    style.textContent = selectors.length ? `${selectors.join(',')}{display:none !important}` : '';
    document.documentElement.classList.toggle('ordering-paused', flags.ordering === false);

    // order types that are off leave the checkout list
    const type = document.getElementById('checkoutOrderType');
    if (type) {
      ['delivery', 'pickup', 'dine_in'].forEach((k) => {
        const opt = type.querySelector(`option[value="${k}"]`);
        if (opt) { opt.disabled = flags[k] === false; opt.hidden = flags[k] === false; }
      });
      if (type.selectedOptions[0] && type.selectedOptions[0].disabled) {
        const first = [...type.options].find((o) => !o.disabled);
        if (first) { type.value = first.value; type.dispatchEvent(new Event('change')); }
      }
    }

    // a paused shop says so on the menu and the cart
    const pausedNotice = document.getElementById('orderingPausedNotice');
    if (flags.ordering === false && !pausedNotice && (document.getElementById('menuGrid') || document.body.classList.contains('cart-page'))) {
      const n = document.createElement('div');
      n.id = 'orderingPausedNotice';
      n.className = 'feature-paused-notice';
      n.setAttribute('role', 'status');
      n.textContent = t('feat.orderingPaused');
      (document.getElementById('menu') || document.querySelector('main') || document.body).prepend(n);
    } else if (flags.ordering !== false && pausedNotice) {
      pausedNotice.remove();
    }

    // sign-up closed: the register page explains instead of showing a form that will be refused
    if (flags.registration === false && /register\.html$/.test(location.pathname)) {
      const form = document.querySelector('form');
      if (form && !document.getElementById('registrationClosed')) {
        form.insertAdjacentHTML('beforebegin', `<div id="registrationClosed" class="auth-alert error show">${t('feat.registrationClosed')}</div>`);
        form.style.display = 'none';
      }
    }
  }

  const ready = (async () => {
    flags = read();
    if (!flags && API && API.getFeatures) {
      try {
        flags = await API.getFeatures();
        try { sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), flags })); } catch (_) { /* fine */ }
      } catch (_) { flags = null; }
    }
    if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    apply();
    return flags;
  })();

  if (I18N && I18N.onChange) I18N.onChange(() => { document.getElementById('orderingPausedNotice')?.remove(); apply(); });
  window.SavoriaFeatures = { ready, on: (k) => !flags || flags[k] !== false, apply };
})();
