/* =========================================================
   Tarmez — Customer account page
   js/account.js

   Everything on this page comes from the customer's own rows:
   /auth/me, /my/orders, /me/reservations, /me/loyalty,
   /me/coupons and /me/notifications. Every request carries the
   JWT, so one customer can never read another customer's data.
   ========================================================= */

(function () {
  'use strict';

  const I18N = window.SavoriaI18n;
  // api.js declares SavoriaAPI as a top-level const (a global binding, not
  // a window property), so read the binding as a fallback.
  const API = window.SavoriaAPI || (typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null);
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const tr = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const localize = (row, field) => (I18N ? I18N.localize(row, field) : (row ? row[field] : ''));
  const fmtSAR = (value) => (I18N ? I18N.fmtSAR(value) : 'SAR ' + Number(value || 0).toLocaleString('en-US'));
  const fmtNumber = (value) => (I18N ? I18N.fmtNumber(value) : Number(value || 0).toLocaleString('en-US'));
  const fmtDate = (value) => (I18N ? I18N.fmtDate(value) : String(value || ''));
  const fmtTime = (value) => (I18N ? I18N.fmtTime(value) : String(value || ''));
  const fmtDateTime = (value) => (I18N ? I18N.fmtDateTime(value) : String(value || ''));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  const FINAL_STATUSES = ['delivered', 'completed', 'cancelled'];
  const DELIVERY_FLOW = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];
  // pickup and dine-in: ready (out_for_delivery), then picked up / served (delivered)
  const SERVICE_FLOW = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];
  const RESERVATION_FLOW = ['pending', 'confirmed', 'completed'];

  const ICONS = {
    order: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    reservation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="M8 15h.01M12 15h.01M16 15h.01"/></svg>',
    coupon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/></svg>',
    loyalty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.2l5.9-.9L12 3Z"/></svg>',
    reward: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
    account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
  };

  if (!API || !I18N) return;

  // The page only exists for a signed-in customer.
  if (!API.isLoggedIn()) {
    window.location.replace('login.html?next=' + encodeURIComponent('account.html'));
    return;
  }

  const state = {
    me: null,
    orders: [],
    reservations: [],
    loyalty: null,
    wallet: null,
    notifications: [],
    unread: 0,
  };

  const el = (id) => document.getElementById(id);
  const orderNumberOf = (order) => {
    const n = order && order.order_number;
    return (n !== null && n !== undefined && n !== '') ? n : (order ? order.id : '');
  };

  function statusLabel(status) {
    return t('status.' + String(status || 'pending'));
  }
  /* Pickup and dine-in orders are never "on the way" or "delivered": they are ready, then picked up / served. */
  function orderStatusLabel(status, type) {
    if (type && type !== 'delivery' && status === 'out_for_delivery') return t('ws.ready');
    if (type && type !== 'delivery' && (status === 'delivered' || status === 'completed')) return t('ws.actions.served');
    return statusLabel(status);
  }
  function couponStatusLabel(status) {
    const key = 'couponStatus.' + String(status || '');
    return I18N.has(key) ? t(key) : String(status || '');
  }
  function orderTypeLabel(type) {
    const key = 'orderType.' + String(type || '');
    return I18N.has(key) ? t(key) : String(type || '');
  }

  function showAlert(message, isError) {
    const box = el('accountAlert');
    if (!box) return;
    box.className = 'auth-alert show ' + (isError ? 'error' : 'success');
    box.textContent = message;
  }

  /* ---------- Data ---------- */
  async function load() {
    const results = await Promise.allSettled([
      API.getMe(),
      API.getMyOrders(),
      API.getMyLoyalty(),
      API.getMyCoupons(),
      API.getNotifications({ limit: 50 }),
      API.getMyReservations(),
      API.getMyPoints(),
      API.getMyRatings ? API.getMyRatings() : Promise.resolve(null),
    ]);

    const meResult = results[0];
    if (meResult.status === 'rejected') {
      const status = meResult.reason && meResult.reason.status;
      if (status === 401 || status === 403) {
        API.clearSession();
        window.location.replace('login.html?next=' + encodeURIComponent('account.html'));
        return;
      }
    }

    state.me = meResult.status === 'fulfilled' ? meResult.value : (API.getCurrentUser() || null);
    state.orders = results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : [];
    state.loyalty = results[2].status === 'fulfilled' ? results[2].value : null;
    state.wallet = results[3].status === 'fulfilled' ? results[3].value : null;
    const notif = results[4].status === 'fulfilled' ? results[4].value : null;
    state.notifications = (notif && notif.notifications) || [];
    state.unread = (notif && notif.unread_count) || 0;
    state.reservations = results[5] && results[5].status === 'fulfilled' && Array.isArray(results[5].value)
      ? results[5].value : [];
    state.points = results[6] && results[6].status === 'fulfilled' ? results[6].value : null;
    state.ratings = results[7] && results[7].status === 'fulfilled' && results[7].value ? results[7].value : { pending: [], rated: {} };

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed >= 3) {
      showAlert(t('account.loadFailed'), true);
    }

    renderAll();

    // A notification (or an explicit link) can open one order or one
    // reservation directly.
    const params = new URLSearchParams(window.location.search);
    const requestedOrder = params.get('order');
    const requestedReservation = params.get('reservation');
    if (requestedOrder) focusOrder(Number(requestedOrder));
    else if (requestedReservation) focusReservation(Number(requestedReservation));
    else if (window.location.hash === '#orders') scrollToSection('orders');
    else if (window.location.hash === '#reservations') scrollToSection('reservations');
  }

  /* ---------- Hero + stats ---------- */
  function renderHeading() {
    const me = state.me || {};
    const name = String(me.full_name || '').trim();
    const greeting = el('accountGreeting');
    if (greeting) {
      greeting.textContent = name ? t('account.greeting', { name }) : t('account.eyebrow');
    }
    const subtitle = el('accountSubtitle');
    if (subtitle) {
      const contact = [me.phone, isRealEmail(me.email) ? me.email : null].filter(Boolean).join(' · ');
      subtitle.textContent = contact || t('account.subtitle');
    }
  }

  function renderStats() {
    const active = state.orders.filter((o) => !FINAL_STATUSES.includes(String(o.status || ''))).length;
    const coupons = availableCoupons().length;
    const points = (state.points && Number(state.points.balance)) || 0;

    if (el('statOrders')) el('statOrders').textContent = fmtNumber(state.orders.length);
    if (el('statActive')) el('statActive').textContent = fmtNumber(active);
    if (el('statPoints')) el('statPoints').textContent = fmtNumber(points);
    if (el('statCoupons')) el('statCoupons').textContent = fmtNumber(coupons);
  }

  /* ---------- Orders ---------- */
  function orderFlow(order) {
    return order.order_type === 'delivery' ? DELIVERY_FLOW : SERVICE_FLOW;
  }

  function timelineMarkup(flow, status, type) {
    const current = flow.indexOf(status);
    const isFinal = status === 'delivered' || status === 'completed';
    const effective = Math.max(0, isFinal ? flow.length - 1 : current);
    const count = flow.length;
    const edge = count > 0 ? 100 / (count * 2) : 0;
    const span = count > 1 ? 100 - edge * 2 : 0;
    const ratio = count > 1 ? effective / (count - 1) : 0;
    const progress = Math.max(0, Math.min(span, span * ratio));

    return `<div class="account-timeline" style="--timeline-steps:${count};--timeline-start:${edge}%;--timeline-span:${span}%;--timeline-progress:${progress}%">${flow.map((step, index) => {
      const done = index < effective || (isFinal && index === effective);
      const cls = done ? 'is-done' : index === effective ? 'is-current' : '';
      return `<div class="account-step ${cls}">
        <span class="account-step-dot">${done ? '✓' : index + 1}</span>
        <span class="account-step-label">${esc(orderStatusLabel(step, type))}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function timeline(order) {
    const status = String(order.status || 'pending');
    if (status === 'cancelled') {
      return `<div class="account-timeline is-cancelled">
        <span class="account-step-dot">✕</span>
        <span class="account-step-label">${esc(statusLabel('cancelled'))}</span>
      </div>`;
    }
    return timelineMarkup(orderFlow(order), status, order.order_type);
  }

  function orderCard(order) {
    const status = String(order.status || 'pending');
    const isPast = FINAL_STATUSES.includes(status);
    const items = (order.items || []).map((item) => `
      <li>
        <span class="account-order-item-name">${esc(window.SavoriaI18n?.itemName?.(item) || item.item_name_snapshot || item.name || '')}${window.SavoriaI18n?.itemChoice?.(item) ? ` <small class="order-dish-choice">${esc(window.SavoriaI18n.itemChoice(item))}</small>` : ''}<small class="account-order-qty">× ${esc(item.quantity)}</small></span>
        <span class="account-order-item-price">${fmtSAR(item.subtotal)}</span>
      </li>`).join('');

    const tableNumber = order.table_number || null;
    const tableLabel = localize(order, 'table_label');
    const tableLine = (order.table_id || tableNumber || tableLabel)
      ? `<p class="account-order-table">${esc(t('account.tableServed', {
          number: tableNumber || tableLabel || order.table_id || '',
        }))}${tableLabel && tableNumber ? ' · ' + esc(tableLabel) : ''}</p>`
      : '';

    const discount = Number(order.coupon_discount) || 0;
    const vat = Number(order.vat_amount) || 0;

    return `
      <article class="account-order-card${isPast ? ' is-past' : ''}" id="account-order-${esc(order.id)}" data-order-id="${esc(order.id)}" data-status="${esc(status)}">
        <div class="account-order-head">
          <div class="account-order-title">
            <h3>${esc(t('account.orderNumber', { id: orderNumberOf(order) }))}</h3>
            <p class="account-order-meta">${esc(fmtDateTime(order.created_at))} · ${esc(orderTypeLabel(order.order_type))}</p>
          </div>
          <span class="status-pill ${esc(status)}">${esc(orderStatusLabel(status, order.order_type))}</span>
          <button type="button" class="account-order-dismiss" data-dismiss-order="${esc(order.id)}"
                  aria-label="${esc(t('account.hideOrder'))}" title="${esc(t('account.hideOrderHint'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <div class="account-order-body">
          ${tableLine}
          ${timeline(order)}
          <ul class="account-order-items">${items}</ul>
          <div class="account-order-foot">
            <div class="account-order-totals">
              ${discount > 0 ? `<span>${esc(t('rewards.couponDiscount'))} <strong>− ${fmtSAR(discount)}</strong></span>` : ''}
              ${vat > 0 ? `<span>${esc(t('cart.vat'))} <strong>+ ${fmtSAR(vat)}</strong></span>` : ''}
            </div>
            <span class="account-order-total">${esc(t('cart.total'))} <strong>${fmtSAR(order.total_amount)}</strong></span>
            ${status === 'delivered' ? rateButton(order) : ''}
            ${status === 'delivered' ? `<a class="btn btn-outline btn-sm account-order-invoice" href="invoice.html?order=${encodeURIComponent(order.id)}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/><path d="M12 9v0"/></svg><span>${esc(t('invoice.open'))}</span></a>` : ''}
          </div>
        </div>
      </article>`;
  }

  /* A completed order: "Rate your order" while the window is open, or the stars given. */
  function rateButton(order) {
    const r = state.ratings || { pending: [], rated: {} };
    const given = r.rated && r.rated[String(order.id)];
    const href = `rate.html?order=${encodeURIComponent(order.id)}`;
    if (given) {
      return `<a class="btn btn-outline btn-sm account-order-invoice account-order-rated" href="${href}" title="${esc(t('rate.editHint'))}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/></svg><span>${esc(t('rate.yourRating', { stars: given }))}</span></a>`;
    }
    if ((r.pending || []).map(Number).includes(Number(order.id))) {
      return `<a class="btn btn-primary btn-sm account-order-rate" href="${href}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/></svg><span>${esc(t('rate.rateOrder'))}</span></a>`;
    }
    return '';
  }

  function renderOrders() {
    const box = el('accountOrders');
    if (!box) return;

    if (!state.orders.length) {
      box.innerHTML = `<div class="account-empty">${ICONS.order}<p>${esc(t('account.noOrders'))}</p>
        <a href="index.html#menu" class="btn btn-primary btn-sm">${esc(t('account.orderNow'))}</a></div>`;
      return;
    }

    const active = state.orders.filter((o) => !FINAL_STATUSES.includes(String(o.status || '')));
    const past = state.orders.filter((o) => FINAL_STATUSES.includes(String(o.status || '')));

    box.innerHTML = `
      ${active.length ? `
        <h3 class="account-list-subtitle">${esc(t('account.activeOrders'))}</h3>
        ${active.map(orderCard).join('')}
      ` : `<p class="account-inline-note">${esc(t('account.noActiveOrders'))}</p>`}
      ${past.length ? `
        <h3 class="account-list-subtitle">${esc(t('account.pastOrders'))}</h3>
        ${past.map(orderCard).join('')}
      ` : ''}`;
  }

  function focusOrder(id) {
    if (!id) return;
    const card = document.getElementById('account-order-' + id);
    if (!card) {
      showAlert(t('account.orderNotFound'), true);
      return;
    }
    scrollToSection('orders');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('is-highlight');
    void card.offsetWidth;
    card.classList.add('is-highlight');
    setTimeout(() => card.classList.remove('is-highlight'), 2600);
  }

  /* The × on an order card hides the order for this account only.
     The server keeps the order for management; this page removes the card
     and every notification that pointed at it right away, then refreshes
     the bell badge so the count matches the shortened list. */
  async function hideOrder(orderId, button) {
    const id = Number(orderId);
    if (!id) return;

    if (button) {
      button.disabled = true;
      button.classList.add('is-loading');
    }

    try {
      await API.hideMyOrder(id);

      const removedUnread = state.notifications.filter((n) =>
        n.link_type === 'order' && Number(n.link_id) === id && !n.is_read
      ).length;

      state.orders = state.orders.filter((order) => Number(order.id) !== id);
      state.notifications = state.notifications.filter(
        (n) => !(n.link_type === 'order' && Number(n.link_id) === id)
      );
      state.unread = Math.max(0, state.unread - removedUnread);

      window.SavoriaNotifications?.refreshCount();
      renderAll();
      showAlert(t('account.orderHidden'));
    } catch (_) {
      if (button) {
        button.disabled = false;
        button.classList.remove('is-loading');
      }
      showAlert(t('account.hideOrderFailed'), true);
    }
  }

  /* ---------- Table reservations ----------
     A reservation is only allowed for a signed-in customer, so every row
     here belongs to the account. Management confirms or cancels it, and
     the change also arrives as a notification. */
  function reservationWhen(reservation) {
    const rawDate = String(reservation.reservation_date || '');
    const date = rawDate ? fmtDate(rawDate + 'T12:00:00') : '';
    const rawTime = String(reservation.reservation_time || '').slice(0, 5);
    const time = rawTime ? fmtTime(`2000-01-01T${rawTime}:00`) : '';
    return [date, time].filter(Boolean).join(' · ');
  }

  function reservationTimeline(reservation) {
    const status = String(reservation.status || 'pending');
    if (status === 'cancelled') {
      return `<div class="account-timeline is-cancelled">
        <span class="account-step-dot">✕</span>
        <span class="account-step-label">${esc(statusLabel('cancelled'))}</span>
      </div>`;
    }
    return timelineMarkup(RESERVATION_FLOW, status);
  }

  function reservationCard(reservation) {
    const status = String(reservation.status || 'pending');
    const isPast = ['completed', 'cancelled'].includes(status);
    const notes = String(reservation.notes || '').trim();
    return `
      <article class="account-order-card account-reservation-card${isPast ? ' is-past' : ''}" id="account-reservation-${esc(reservation.id)}" data-reservation-id="${esc(reservation.id)}" data-status="${esc(status)}">
        <div class="account-order-head">
          <div>
            <h3>${esc(t('account.reservationNumber', { id: reservation.id }))}</h3>
            <p class="account-order-meta">${esc(reservationWhen(reservation))}</p>
          </div>
          <span class="status-pill ${esc(status)}">${esc(statusLabel(status))}</span>
        </div>
        <div class="account-reservation-details">
          <span>${esc(t('account.partySizeLabel'))}: <strong>${esc(fmtNumber(reservation.party_size))}</strong></span>
          ${notes ? `<span>${esc(t('account.reservationNotes'))}: <strong>${esc(notes)}</strong></span>` : ''}
        </div>
        ${reservationTimeline(reservation)}
      </article>`;
  }

  function renderReservations() {
    const box = el('accountReservations');
    if (!box) return;

    if (!state.reservations.length) {
      box.innerHTML = `<div class="account-empty">${ICONS.reservation}<p>${esc(t('account.noReservations'))}</p>
        <a href="index.html#reservation" class="btn btn-primary btn-sm">${esc(t('account.bookTable'))}</a></div>`;
      return;
    }

    const isPast = (r) => ['completed', 'cancelled'].includes(String(r.status || ''));
    const active = state.reservations.filter((r) => !isPast(r));
    const past = state.reservations.filter(isPast);

    box.innerHTML = `
      ${active.length ? `
        <h3 class="account-list-subtitle">${esc(t('account.activeReservations'))}</h3>
        ${active.map(reservationCard).join('')}
      ` : `<p class="account-inline-note">${esc(t('account.noActiveReservations'))}</p>`}
      ${past.length ? `
        <h3 class="account-list-subtitle">${esc(t('account.pastReservations'))}</h3>
        ${past.map(reservationCard).join('')}
      ` : ''}`;
  }

  function focusReservation(id) {
    if (!id) return;
    const card = document.getElementById('account-reservation-' + id);
    if (!card) {
      showAlert(t('account.reservationNotFound'), true);
      return;
    }
    scrollToSection('reservations');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('is-highlight');
    void card.offsetWidth;
    card.classList.add('is-highlight');
    setTimeout(() => card.classList.remove('is-highlight'), 2600);
  }

  /* ---------- Side menu (same as Site Management): the sections, then shortcuts; follows the scroll ---------- */
  // built once the page language is applied (i18n sets it on DOMContentLoaded)
  function sideMenu() {
    const host = document.querySelector('.account-container');
    if (!host || !window.SavoriaSideMenu) return;
    const groups = () => [
      { title: t('acct.side.mine'), items: [
        { key: 'orders', label: t('account.ordersTitle'), icon: 'orders', href: '#orders' },
        { key: 'reservations', label: t('acct.nav.reservations'), icon: 'reservations', href: '#reservations' },
        { key: 'points', label: t('points.title'), icon: 'points', href: '#points' },
        { key: 'coupons', label: t('account.couponsTitle'), icon: 'coupons', href: '#coupons' },
        { key: 'notifications', label: t('account.notificationsTitle'), icon: 'bell', href: '#notifications' },
        { key: 'profile', label: t('acct.nav.profile'), icon: 'user', href: '#profile' },
      ] },
      { title: t('acct.side.shortcuts'), items: [
        { key: 'order', label: t('account.orderNow'), icon: 'menu', href: 'index.html#menu' },
        { key: 'track', label: t('acct.side.track'), icon: 'track', href: 'track-order.html' },
        { key: 'logout', label: t('account.logout'), icon: 'logout', action: true },
      ] },
    ];
    const menu = window.SavoriaSideMenu.mount({
      host, groups: groups(), active: 'orders', heading: t('account.eyebrow'),
      onAction: (key) => { if (key === 'logout') el('accountLogout')?.click(); },
    });
    if (!menu) return;
    if (I18N && I18N.onChange) I18N.onChange(() => menu.refresh(groups()));
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) menu.setActive(visible[0].target.id);
    }, { rootMargin: '-120px 0px -60% 0px' });
    ['orders', 'reservations', 'points', 'coupons', 'notifications', 'profile'].forEach((id) => { const s = el(id); if (s) io.observe(s); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sideMenu); else sideMenu();

  /* ---------- Phone notifications (this device) ---------- */
  async function renderPush() {
    const card = el('pushCard');
    const PWA = window.SavoriaPWA;
    if (!card || !PWA) return;
    const stateNow = await PWA.pushState();
    card.hidden = stateNow === 'unsupported';
    const btn = el('pushToggle');
    el('pushStatus').textContent = t('pwa.push.' + stateNow);
    btn.style.display = stateNow === 'denied' || stateNow === 'ios-install' ? 'none' : '';
    btn.textContent = stateNow === 'on' ? t('pwa.pushOff') : t('pwa.pushOn');
    btn.className = 'btn btn-sm ' + (stateNow === 'on' ? 'btn-outline push-off' : 'btn-primary');
    btn.dataset.state = stateNow;
  }
  el('pushToggle')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      if (btn.dataset.state === 'on') await window.SavoriaPWA.disablePush();
      else await window.SavoriaPWA.enablePush();
    } catch (err) {
      el('pushStatus').textContent = err.message;
    } finally {
      btn.disabled = false;
      renderPush();
    }
  });
  window.addEventListener('load', renderPush);
  window.addEventListener('load', () => {
    const PWA = window.SavoriaPWA;
    if (!PWA || !PWA.canInstall()) return;
    el('installCard').hidden = false;
    el('installAppBtn').addEventListener('click', () => PWA.showInstallGuide());
  });

  /* ---------- Loyalty points ---------- */
  const POINT_TYPES = ['welcome', 'earn', 'redeem', 'refund', 'reverse', 'adjust', 'expire', 'migrate'];

  function renderPoints() {
    const box = el('accountPoints');
    if (!box) return;
    const p = state.points;
    if (!p) {
      box.innerHTML = `<p class="account-inline-note">${esc(t('points.unavailable'))}</p>`;
      return;
    }
    const balance = Number(p.balance) || 0;
    const min = Number(p.min_redeem) || 0;
    const status = !p.enabled
      ? t('points.paused')
      : p.can_redeem
        ? t('points.canUse', { worth: fmtSAR(p.worth) })
        : t('points.needMore', { missing: fmtNumber(p.missing), min: fmtNumber(min) });
    const progress = min > 0 ? Math.min(100, Math.round((balance / min) * 100)) : 100;
    const expiry = p.next_expiry
      ? `<p class="points-fact points-expiry">⏳ ${esc(t('points.expiring', { points: fmtNumber(p.next_expiry.points), date: fmtDate(p.next_expiry.date) }))}</p>`
      : (Number(p.expiry_months) > 0 ? '' : `<p class="points-fact">${esc(t('points.noExpiry'))}</p>`);
    const history = Array.isArray(p.history) ? p.history : [];

    box.innerHTML = `
      <div class="points-hero">
        <div class="points-balance">
          <strong>${esc(fmtNumber(balance))}</strong>
          <span>${esc(t('points.unit'))}</span>
          <small>= ${esc(fmtSAR(p.worth))}</small>
        </div>
        <div class="points-facts">
          <p class="points-fact points-status">${esc(status)}</p>
          ${p.enabled && !p.can_redeem ? `<div class="points-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${min}" aria-valuenow="${balance}"><span style="width:${progress}%"></span></div>` : ''}
          <p class="points-fact">${esc(t('points.rule', { amount: fmtSAR(p.earn_amount), points: fmtNumber(p.earn_points), value: fmtSAR(p.point_value) }))}</p>
          ${expiry}
        </div>
      </div>
      <h3 class="account-list-subtitle">${esc(t('points.historyTitle'))}</h3>
      ${history.length ? `
        <div class="points-history">
          ${history.map((h) => {
            const type = POINT_TYPES.includes(h.type) ? h.type : 'adjust';
            const pts = Number(h.points) || 0;
            const order = h.order_id ? t('points.forOrder', { number: h.order_number || h.order_id }) : '';
            const reason = type === 'adjust' && h.reason ? h.reason : '';
            return `
              <div class="points-row">
                <span class="points-row-date">${esc(fmtDate(h.created_at))}</span>
                <span class="points-row-what">${esc(t('points.types.' + type))}${order ? ` · ${esc(order)}` : ''}${reason ? `<small>${esc(reason)}</small>` : ''}</span>
                <span class="points-row-pts ${pts >= 0 ? 'is-plus' : 'is-minus'}" dir="ltr">${pts >= 0 ? '+' : '−'}${esc(fmtNumber(Math.abs(pts)))}</span>
                <span class="points-row-balance">${esc(t('points.balanceAfter', { balance: fmtNumber(h.balance_after) }))}</span>
              </div>`;
          }).join('')}
        </div>` : `<p class="account-inline-note">${esc(t('points.noHistory'))}</p>`}`;
  }

  /* ---------- Coupons ---------- */
  function availableCoupons() {
    return ((state.wallet && state.wallet.coupons) || []).filter((c) => c.status === 'available');
  }

  function couponValue(coupon) {
    return coupon.discount_type === 'percent'
      ? `${fmtNumber(coupon.value)}%`
      : fmtSAR(coupon.value);
  }

  function couponCard(coupon) {
    const min = Number(coupon.min_order_amount) || 0;
    const expiry = coupon.expires_at ? fmtDate(coupon.expires_at) : '';
    return `
      <article class="account-coupon-card">
        <div class="account-coupon-top">
          <code class="account-coupon-code">${esc(coupon.code)}</code>
          <button type="button" class="account-coupon-copy" data-copy="${esc(coupon.code)}"
            aria-label="${esc(t('account.copyCode'))}" title="${esc(t('account.copyCode'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          </button>
        </div>
        <strong class="account-coupon-value">− ${couponValue(coupon)}</strong>
        ${coupon.title ? `<p class="account-coupon-title">${esc(coupon.title)}</p>` : ''}
        <div class="account-coupon-meta">
          ${min > 0 ? `<span>${esc(t('account.minOrder', { amount: fmtSAR(min) }))}</span>` : ''}
          ${expiry ? `<span>${esc(t('account.expiresOn', { date: expiry }))}</span>` : ''}
        </div>
      </article>`;
  }

  function renderCoupons() {
    const box = el('accountCoupons');
    if (!box) return;

    const coupons = (state.wallet && state.wallet.coupons) || [];
    const available = coupons.filter((c) => c.status === 'available');
    const history = coupons.filter((c) => c.status !== 'available');

    if (!coupons.length) {
      box.innerHTML = `<div class="account-empty">${ICONS.coupon}<p>${esc(t('account.noCoupons'))}</p></div>`;
      return;
    }

    box.innerHTML = `
      ${available.length ? `
        <h3 class="account-list-subtitle">${esc(t('account.availableCoupons'))}</h3>
        <div class="account-coupon-grid">${available.map(couponCard).join('')}</div>
      ` : `<p class="account-inline-note">${esc(t('account.noAvailableCoupons'))}</p>`}
      ${history.length ? `
        <h3 class="account-list-subtitle">${esc(t('account.couponHistory'))}</h3>
        <div class="account-coupon-history">
          ${history.map((c) => `
            <div class="account-coupon-row">
              <code>${esc(c.code)}</code>
              <span class="account-coupon-row-value">${esc(couponValue(c))}</span>
              <span class="coupon-status ${esc(c.status)}">${esc(couponStatusLabel(c.status))}</span>
              <span class="account-coupon-row-date">${esc(fmtDate(c.used_at || c.cancelled_at || c.created_at))}</span>
            </div>`).join('')}
        </div>
      ` : ''}`;
  }

  async function copyCoupon(code, button) {
    try {
      await navigator.clipboard.writeText(code);
      const original = button.innerHTML;
      button.innerHTML = '✓';
      button.setAttribute('title', t('account.copied'));
      setTimeout(() => { button.innerHTML = original; }, 1400);
    } catch (_) { /* clipboard unavailable */ }
  }

  /* ---------- Notifications ---------- */
  function renderNotifications() {
    const box = el('accountNotifications');
    const markAll = el('accountMarkAll');
    if (markAll) markAll.disabled = state.unread === 0;
    if (!box) return;

    if (!state.notifications.length) {
      box.innerHTML = `<div class="account-empty">${ICONS.account}<p>${esc(t('account.noNotifications'))}</p></div>`;
      return;
    }

    box.innerHTML = state.notifications.map((n) => {
      const type = ICONS[n.type] ? n.type : 'account';
      const title = localize(n, 'title');
      const body = localize(n, 'body');
      return `
        <button type="button" class="notif-item${n.is_read ? '' : ' is-unread'}" data-notif-id="${esc(n.id)}">
          <span class="notif-icon">${ICONS[type]}</span>
          <span class="notif-body">
            <span class="notif-title">${esc(title)}</span>
            ${body ? `<span class="notif-text">${esc(body)}</span>` : ''}
            <span class="notif-time">${esc(fmtDateTime(n.created_at))}</span>
          </span>
          ${n.is_read ? '' : '<span class="notif-dot" aria-hidden="true"></span>'}
        </button>`;
    }).join('');
  }

  function localizeNotification(id) {
    return state.notifications.find((n) => Number(n.id) === Number(id));
  }

  async function openNotification(id) {
    const notification = localizeNotification(id);
    if (!notification) return;

    if (!notification.is_read) {
      notification.is_read = true;
      state.unread = Math.max(0, state.unread - 1);
      renderNotifications();
      try {
        await API.markNotificationRead(notification.id);
        window.SavoriaNotifications?.refreshCount();
      } catch (_) { /* the same notification can be retried later */ }
    }

    if (notification.link_type === 'invoice' && notification.link_id) window.location.href = `invoice.html?order=${encodeURIComponent(notification.link_id)}`;
    else if (notification.link_type === 'rating' && notification.link_id) window.location.href = `rate.html?order=${encodeURIComponent(notification.link_id)}`;
    else if (notification.link_type === 'offer' && notification.link_id) window.location.href = `index.html?offer=${encodeURIComponent(notification.link_id)}`;
    else if (notification.link_type === 'order' && notification.link_id) focusOrder(Number(notification.link_id));
    else if (notification.link_type === 'reservation' && notification.link_id) focusReservation(Number(notification.link_id));
    else if (notification.link_type === 'coupon' || notification.link_type === 'coupons') scrollToSection('coupons');
    else scrollToSection('profile');
  }

  async function markAllRead() {
    if (state.unread === 0) return;
    try {
      await API.markAllNotificationsRead();
      state.notifications = state.notifications.map((n) => ({ ...n, is_read: true }));
      state.unread = 0;
      renderNotifications();
      window.SavoriaNotifications?.refreshCount();
    } catch (_) {
      showAlert(t('account.loadFailed'), true);
    }
  }

  /* ---------- Profile ----------
     Name and email are editable here; the phone is the restaurant's
     identity key (orders, loyalty and coupons hang off it) so it is
     shown read-only with a note. Internal stand-in addresses
     (@customer.tarmez.local) are never shown to the customer. */
  const INTERNAL_EMAIL_SUFFIX = '@customer.tarmez.local';
  const isRealEmail = (email) => {
    const value = String(email || '');
    return value !== '' && !value.endsWith(INTERNAL_EMAIL_SUFFIX);
  };

  function renderProfile() {
    const box = el('accountProfile');
    if (!box) return;
    const me = state.me || {};
    const points = (state.points && Number(state.points.balance)) || 0;
    const settings = (state.loyalty && state.loyalty.settings) || {};
    const pointValue = (state.points && Number(state.points.point_value)) || Number(settings.redeem_point_value) || 0;

    box.innerHTML = `
      <form class="account-profile-form" id="accountProfileForm" novalidate>
        <div class="account-profile-field">
          <label for="profileFullName">${esc(t('account.fullName'))}</label>
          <input type="text" id="profileFullName" name="full_name" autocomplete="name" required
                 value="${esc(me.full_name || '')}" placeholder="${esc(t('account.namePlaceholder'))}">
        </div>
        <div class="account-profile-field">
          <label for="profileEmail">${esc(t('account.email'))}</label>
          <input type="email" id="profileEmail" name="email" autocomplete="email" dir="ltr"
                 value="${esc(isRealEmail(me.email) ? me.email : '')}" placeholder="${esc(t('account.emailPlaceholder'))}">
          ${isRealEmail(me.email) ? '' : `<small class="account-profile-hint">${esc(t('account.noEmailYet'))}</small>`}
        </div>
        <div class="account-profile-field">
          <label>${esc(t('account.phone'))}</label>
          <div class="account-profile-static" dir="ltr">${esc(me.phone || '—')}</div>
          <small class="account-profile-hint">${esc(t('account.phoneLocked'))}</small>
        </div>
        <div class="account-profile-meta">
          <div class="account-profile-item">
            <span>${esc(t('account.memberSince'))}</span>
            <strong>${esc(me.created_at ? fmtDate(me.created_at) : '—')}</strong>
          </div>
          <div class="account-profile-item">
            <span>${esc(t('account.points'))}</span>
            <strong>${esc(fmtNumber(points))}${pointValue > 0 ? ` <small>(${esc(t('account.pointsWorth', { amount: fmtSAR(points * pointValue) }))})</small>` : ''}</strong>
          </div>
        </div>
        <div class="account-profile-actions">
          <button type="submit" class="btn btn-primary btn-sm" id="profileSaveBtn">${esc(t('account.saveChanges'))}</button>
        </div>
      </form>`;
  }

  async function saveProfile(event) {
    event.preventDefault();
    const btn = el('profileSaveBtn');
    const fullName = String(el('profileFullName').value || '').trim();
    const email = String(el('profileEmail').value || '').trim();

    if (fullName.length < 2) {
      showAlert(t('account.nameTooShort'), true);
      return;
    }
    if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showAlert(t('account.emailInvalid'), true);
      return;
    }

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('account.saving');
    try {
      const updated = await API.updateMyProfile({ full_name: fullName, email });
      state.me = Object.assign({}, state.me, updated);
      renderHeading();
      renderProfile();
      showAlert(t('account.profileSaved'));
    } catch (err) {
      showAlert(tr(err && err.message) || t('account.profileSaveFailed'), true);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  /* ---------- Shared ---------- */
  function scrollToSection(id) {
    const section = document.getElementById(id);
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Live order status (every 15 s while the page is open) ---------- */
  async function refreshOrders() {
    const [orders, ratings] = await Promise.all([API.getMyOrders(), API.getMyRatings ? API.getMyRatings().catch(() => null) : null]);
    if (!Array.isArray(orders)) return;
    const before = window.SavoriaLive.statuses(state.orders);
    const after = window.SavoriaLive.statuses(orders);
    const changed = Object.keys(after).filter((id) => before[id] !== after[id]);
    if (!changed.length) return;
    state.orders = orders;
    if (ratings) state.ratings = ratings;
    renderOrders();
    if (typeof renderStats === 'function') renderStats();
    changed.forEach((id) => document.getElementById('account-order-' + id)?.classList.add('is-status-updated'));
    const first = orders.find((o) => String(o.id) === changed[0]);
    if (first && before[changed[0]] !== undefined) {
      window.SavoriaLive.announce(t('live.orderNow', { number: orderNumberOf(first), status: orderStatusLabel(first.status, first.order_type) }));
    }
  }
  if (window.SavoriaLive) {
    window.SavoriaLive.every(refreshOrders);
    const mark = el('ordersLive');
    if (mark) mark.hidden = false;
  }

  function renderAll() {
    renderHeading();
    renderStats();
    renderOrders();
    renderReservations();
    renderPoints();
    renderCoupons();
    renderNotifications();
    renderProfile();
  }

  /* ---------- Events ---------- */
  function bind() {
    el('accountLogout')?.addEventListener('click', async () => {
      try { await API.logout(); } catch (_) { API.clearSession(); }
      window.location.href = 'index.html';
    });

    el('accountMarkAll')?.addEventListener('click', markAllRead);

    el('accountProfile')?.addEventListener('submit', saveProfile);

    el('accountOrders')?.addEventListener('click', (e) => {
      const button = e.target.closest('[data-dismiss-order]');
      if (!button) return;
      e.preventDefault();
      hideOrder(button.dataset.dismissOrder, button);
    });

    el('accountNotifications')?.addEventListener('click', (e) => {
      const button = e.target.closest('[data-notif-id]');
      if (button) openNotification(button.dataset.notifId);
    });

    el('accountCoupons')?.addEventListener('click', (e) => {
      const button = e.target.closest('[data-copy]');
      if (button) copyCoupon(button.dataset.copy, button);
    });

    // Clicking a notification in the navbar panel while this page is open
    // jumps to the matching order or coupon instead of reloading the page.
    window.addEventListener('savoria:notification-open', (e) => {
      const notification = e.detail;
      if (!notification) return;
      if (notification.link_type === 'order' && notification.link_id) focusOrder(Number(notification.link_id));
      else if (notification.link_type === 'reservation' && notification.link_id) focusReservation(Number(notification.link_id));
      else if (notification.link_type === 'coupon' || notification.link_type === 'coupons') scrollToSection('coupons');
      else scrollToSection('profile');
    });

    I18N.onChange(() => {
      renderAll();
      const subtitle = el('accountSubtitle');
      if (subtitle && !(state.me && (state.me.phone || state.me.email))) {
        subtitle.textContent = t('account.subtitle');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const year = el('year');
    if (year) year.textContent = new Date().getFullYear();
    bind();
    load();
  });
})();
