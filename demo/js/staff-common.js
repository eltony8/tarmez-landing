/* =========================================================
   Tarmez — shared helpers for the staff screens
   js/staff-common.js  (workspace.html, kitchen.html)

   Sign-in and permission check, the order board feed, a short
   "new order" chime (after one tap: browsers block sound until the
   person interacts), status labels by order type, and the moves an
   order can make next.
   window.SavoriaStaff
   ========================================================= */
(function () {
  'use strict';

  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const API = typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /** The order's next step: [status, label key]. */
  function nextStep(o) {
    switch (o.status) {
      case 'pending': return ['confirmed', 'ws.actions.confirm'];
      case 'confirmed': return ['preparing', 'ws.actions.start'];
      case 'preparing': return ['out_for_delivery', o.order_type === 'delivery' ? 'ws.actions.send' : 'ws.actions.ready'];
      case 'out_for_delivery': return ['delivered', o.order_type === 'delivery' ? 'ws.actions.delivered' : 'ws.actions.served'];
      default: return null;
    }
  }

  /** "Out for delivery" means "ready" for pickup and dine-in. */
  function statusLabel(o) {
    if (o.status === 'out_for_delivery' && o.order_type !== 'delivery') return t('ws.ready');
    return t('status.' + o.status);
  }

  function typeBadge(o) {
    if (o.order_type === 'delivery') return `🛵 ${esc(t('orderType.delivery'))}`;
    if (o.order_type === 'pickup') return `🛍️ ${esc(t('orderType.pickup'))}`;
    return `🍽️ ${o.table_number ? esc(t('ws.table', { number: o.table_number })) : esc(t('orderType.dine_in'))}`;
  }

  function dishName(it) {
    const ar = I18N && I18N.getLang && I18N.getLang() === 'ar';
    const name = (ar && it.item_name_ar) || it.item_name_snapshot;
    const opt = (ar && it.option_name_ar) || it.option_name;
    return { name, opt };
  }

  /* ---------- sound ---------- */
  let audio = null;
  let soundOn = false;
  try { soundOn = localStorage.getItem('savoria_staff_sound') === '1'; } catch (_) { /* fine */ }
  function chime() {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const now = audio.currentTime;
      [880, 1175, 1568].forEach((f, i) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now + i * 0.16);
        g.gain.exponentialRampToValueAtTime(0.25, now + i * 0.16 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.3);
        o.connect(g).connect(audio.destination);
        o.start(now + i * 0.16);
        o.stop(now + i * 0.16 + 0.32);
      });
    } catch (_) { /* no audio */ }
    try { if (navigator.vibrate) navigator.vibrate([80, 60, 80]); } catch (_) { /* fine */ }
  }
  function setSound(on) {
    soundOn = !!on;
    try { localStorage.setItem('savoria_staff_sound', on ? '1' : '0'); } catch (_) { /* fine */ }
    if (on) {
      try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (_) { /* fine */ }
      chime();
    }
  }

  /** Signed-in management user with at least "orders" view, else a short message and links. */
  async function gate(root) {
    const user = API && API.getCurrentUser ? API.getCurrentUser() : null;
    const deny = (msg) => {
      root.innerHTML = `<div class="staff-denied"><h1>${esc(t('ws.deniedTitle'))}</h1><p>${esc(msg)}</p>
        <a class="btn btn-primary" href="login.html?next=${encodeURIComponent(location.pathname.replace(/^\//, ''))}">${esc(t('nav.logIn'))}</a></div>`;
      return null;
    };
    if (!API || !API.isLoggedIn() || !user || user.role === 'customer') return deny(t('ws.deniedText'));
    try {
      const p = await API.getMyPermissions();
      const level = p.areas && p.areas.orders;
      if (!level || level === 'none') return deny(t('ws.noOrders'));
      return { user, perms: p.areas, canEdit: level === 'edit' };
    } catch (_) {
      return deny(t('ws.deniedText'));
    }
  }

  async function board() {
    const res = await API.getOrderBoard();
    return res;
  }

  /* The side menu of the staff screens: the two screens, then every Site Management page this person may open. */
  const ADMIN_PAGES = [
    ['orders', 'orders', 'orders'], ['reservations', 'reservations', 'reservations'], ['tables', 'tables', 'tables'],
    ['menu', 'menu', 'menu'], ['coupons', 'promos', 'coupons'], ['settings', 'settings', 'points'], ['ratings', 'ratings', 'ratings'], ['offers', 'offers', 'pin'],
    ['accounts', 'accounts', 'accounts'], ['content', 'content', 'content'], ['platform', 'platform', 'platform'],
  ];
  function menuGroups(ctx) {
    const can = (area) => ctx.perms && ctx.perms[area] && ctx.perms[area] !== 'none';
    return [
      { title: t('side.screens'), items: [
        { key: 'workspace', label: t('shell.links.workspace'), icon: 'board', href: 'workspace.html' },
        { key: 'kitchen', label: t('shell.links.kitchen'), icon: 'kitchen', href: 'kitchen.html' },
      ] },
      { title: t('ws.management'), items: [
        { key: 'overview', label: t('admin.tabs.overview'), icon: 'overview', href: 'admin.html#overview' },
        ...ADMIN_PAGES.filter(([, area]) => can(area)).map(([tab, , icon]) => ({ key: 'admin-' + tab, label: t('admin.tabs.' + tab), icon, href: 'admin.html#' + tab })),
      ] },
    ];
  }
  function mountMenu(host, ctx, current, rail) {
    if (!window.SavoriaSideMenu) return null;
    const menu = window.SavoriaSideMenu.mount({ host, groups: menuGroups(ctx), active: current, heading: 'Tarmez', rail });
    if (menu && I18N && I18N.onChange) I18N.onChange(() => menu.refresh(menuGroups(ctx)));
    return menu;
  }

  window.SavoriaStaff = { t, esc, nextStep, statusLabel, typeBadge, dishName, chime, setSound, soundOn: () => soundOn, gate, board, mountMenu };
})();
