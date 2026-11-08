/* =========================================================
   Tarmez — Customer notification centre
   js/notifications.js

   Adds the bell (and the account shortcut) to the navbar for a
   signed-in customer, keeps the unread badge live, and renders the
   real notifications written by the backend for order statuses and
   coupon events.

   The backend has no websocket endpoint, so updates use polling
   (20s) plus an immediate refresh whenever the tab regains focus or
   becomes visible. Nothing on this screen is demo data.
   ========================================================= */

(function () {
  'use strict';

  const I18N = window.SavoriaI18n;
  // api.js declares SavoriaAPI as a top-level const (a global binding, not
  // a window property), so read the binding as a fallback.
  const API = window.SavoriaAPI || (typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null);
  if (!API || !I18N) return;
  if (window.__savoriaNotifInit) return;
  window.__savoriaNotifInit = true;

  const t = (key, params) => I18N.t(key, params);
  const localize = (row, field) => I18N.localize(row, field);
  const fmtWhen = (value) => I18N.fmtDateTime(value);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  const POLL_MS = 15000;
  const OPEN_MS = 15000;

  let wrap = null;
  let panel = null;
  let listEl = null;
  let badgeEl = null;
  let triggerEl = null;
  let markAllBtn = null;
  let items = [];
  let unread = 0;
  let isOpen = false;
  let pollTimer = null;

  const ICONS = {
    order: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    reservation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="M8 15h.01M12 15h.01M16 15h.01"/></svg>',
    coupon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/></svg>',
    loyalty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.2l5.9-.9L12 3Z"/></svg>',
    reward: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
    account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
  };

  function isCustomer() {
    if (!API.isLoggedIn()) return false;
    const user = API.getCurrentUser();
    // Management roles have their own panel and their own navigation.
    return !user || !user.role || user.role === 'customer';
  }

  /* ---------- Markup ---------- */
  function buildMarkup() {
    wrap = document.createElement('div');
    wrap.className = 'notif-wrap';
    wrap.id = 'notifWrap';
    wrap.innerHTML = `
      <button type="button" class="notif-trigger" id="notifTrigger"
        aria-label="${esc(t('notifications.title'))}" aria-haspopup="true" aria-expanded="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span class="notif-badge" id="notifBadge" hidden>0</span>
      </button>
      <div class="notif-panel" id="notifPanel" role="dialog" aria-label="${esc(t('notifications.title'))}" hidden>
        <div class="notif-head">
          <h3 data-i18n="notifications.title">${esc(t('notifications.title'))}</h3>
          <button type="button" class="notif-mark-all" id="notifMarkAll" data-i18n="notifications.markAll">${esc(t('notifications.markAll'))}</button>
        </div>
        <div class="notif-list" id="notifList"></div>
        <a class="notif-foot" href="account.html#notifications" data-i18n="notifications.viewAll">${esc(t('notifications.viewAll'))}</a>
      </div>`;
    return wrap;
  }

  function buildAccountLink() {
    const link = document.createElement('a');
    link.href = 'account.html';
    link.className = 'nav-account-btn';
    link.id = 'navAccountLink';
    link.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>
      <span data-i18n="nav.myAccount">${esc(t('nav.myAccount'))}</span>`;
    return link;
  }

  function inject() {
    if (!isCustomer()) return false;
    const navCta = document.querySelector('.nav-cta');
    if (!navCta) return false;
    if (document.getElementById('notifWrap')) return true;

    const anchor = document.getElementById('navLoginLink') || navCta.querySelector('.nav-toggle') || null;
    navCta.insertBefore(buildAccountLink(), anchor);
    navCta.insertBefore(buildMarkup(), anchor);

    triggerEl = document.getElementById('notifTrigger');
    panel = document.getElementById('notifPanel');
    listEl = document.getElementById('notifList');
    badgeEl = document.getElementById('notifBadge');
    markAllBtn = document.getElementById('notifMarkAll');

    triggerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      isOpen ? close() : open();
    });
    markAllBtn.addEventListener('click', markAllRead);
    document.addEventListener('click', (e) => {
      if (isOpen && wrap && !wrap.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) close();
    });
    listEl.addEventListener('click', onListClick);

    I18N.apply(wrap);
    return true;
  }

  /* ---------- Data ---------- */
  function updateBadge(count) {
    unread = Math.max(0, Number(count) || 0);
    if (!badgeEl) return;
    if (unread > 0) {
      badgeEl.textContent = unread > 99 ? '99+' : String(unread);
      badgeEl.hidden = false;
    } else {
      badgeEl.textContent = '0';
      badgeEl.hidden = true;
    }
    if (markAllBtn) markAllBtn.disabled = unread === 0;
  }

  async function refreshCount() {
    if (!isCustomer()) return;
    try {
      const res = await API.getUnreadNotificationCount();
      updateBadge(res.unread_count);
    } catch (_) { /* offline or signed out — keep the last value */ }
  }

  async function loadList() {
    if (!isCustomer()) return;
    try {
      const res = await API.getNotifications({ limit: 20 });
      items = (res && res.notifications) || [];
      updateBadge(res && res.unread_count);
      renderList();
    } catch (err) {
      if (listEl) {
        listEl.innerHTML = `<div class="notif-empty">${esc(t('notifications.loadFailed'))}</div>`;
      }
    }
  }

  /* ---------- Rendering ---------- */
  function renderList() {
    if (!listEl) return;
    if (!items.length) {
      listEl.innerHTML = `<div class="notif-empty">${esc(t('notifications.empty'))}</div>`;
      return;
    }
    listEl.innerHTML = items.map((n) => {
      const type = ICONS[n.type] ? n.type : 'account';
      const title = localize(n, 'title') || t('notifications.title');
      const body = localize(n, 'body') || '';
      const read = !!n.is_read;
      return `
        <button type="button" class="notif-item${read ? '' : ' is-unread'}" data-id="${n.id}">
          <span class="notif-icon">${ICONS[type]}</span>
          <span class="notif-body">
            <span class="notif-title">${esc(title)}</span>
            ${body ? `<span class="notif-text">${esc(body)}</span>` : ''}
            <span class="notif-time">${esc(fmtWhen(n.created_at))}</span>
          </span>
          ${read ? '' : '<span class="notif-dot" aria-hidden="true"></span>'}
        </button>`;
    }).join('');
  }

  function markAllRead() {
    if (unread === 0) return;
    API.markAllNotificationsRead().then(() => {
      items = items.map((n) => ({ ...n, is_read: true }));
      updateBadge(0);
      renderList();
      window.dispatchEvent(new CustomEvent('savoria:notifications-read-all'));
    }).catch(() => { /* leave the badge as-is on failure */ });
  }

  function destinationFor(n) {
    if (n.link_type === 'rating' && n.link_id) return `rate.html?order=${encodeURIComponent(n.link_id)}`;
    if (n.link_type === 'invoice' && n.link_id) return `invoice.html?order=${encodeURIComponent(n.link_id)}`;
    if (n.link_type === 'order' && n.link_id) return `account.html?order=${encodeURIComponent(n.link_id)}#orders`;
    if (n.link_type === 'reservation' && n.link_id) return `account.html?reservation=${encodeURIComponent(n.link_id)}#reservations`;
    if (n.link_type === 'coupon' || n.link_type === 'coupons') return 'account.html#coupons';
    if (n.link_type === 'offer' && n.link_id) return `index.html?offer=${encodeURIComponent(n.link_id)}`;
    return 'account.html';
  }

  function onListClick(e) {
    const btn = e.target.closest('.notif-item');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const item = items.find((n) => Number(n.id) === id);
    if (!item) return;

    if (!item.is_read) {
      item.is_read = true;
      API.markNotificationRead(id).then((res) => updateBadge(res.unread_count)).catch(() => {});
      renderList();
    }

    const onAccountPage = document.body.classList.contains('account-page');
    if (onAccountPage && item.link_type !== 'invoice' && item.link_type !== 'rating' && item.link_type !== 'offer') {
      close();
      window.dispatchEvent(new CustomEvent('savoria:notification-open', { detail: item }));
      return;
    }
    window.location.href = destinationFor(item);
  }

  /* ---------- Open / close + polling ---------- */
  function open() {
    if (!panel) return;
    isOpen = true;
    panel.hidden = false;
    triggerEl?.setAttribute('aria-expanded', 'true');
    if (markAllBtn) markAllBtn.disabled = unread === 0;
    renderList();
    loadList();
  }

  function close() {
    if (!panel) return;
    isOpen = false;
    panel.hidden = true;
    triggerEl?.setAttribute('aria-expanded', 'false');
  }

  function schedulePoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (document.hidden || !isCustomer()) return;
      isOpen ? loadList() : refreshCount();
    }, POLL_MS);
  }

  function onWake() {
    if (!isCustomer()) return;
    if (!document.getElementById('notifWrap')) inject();
    isOpen ? loadList() : refreshCount();
  }

  function boot() {
    if (!inject()) return;
    refreshCount();
    schedulePoll();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) onWake();
    });
    window.addEventListener('focus', onWake);
    window.addEventListener('storage', (e) => {
      if (e.key === 'savoria_token' || e.key === 'savoria_user') {
        if (isCustomer()) inject();
        else document.getElementById('notifWrap')?.remove();
        refreshCount();
      }
    });
    I18N.onChange(() => {
      if (!wrap) return;
      I18N.apply(wrap);
      renderList();
      triggerEl?.setAttribute('aria-label', t('notifications.title'));
    });
  }

  /* Exposed so the account page can refresh the badge after it marks
     notifications read there. */
  window.SavoriaNotifications = {
    refresh: onWake,
    refreshCount,
    loadList,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
