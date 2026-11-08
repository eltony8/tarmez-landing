/* =========================================================
   Tarmez — Site Management panel
   js/admin.js — Site Management panel logic.
   Depends on js/api.js. All tools below talk to the real backend:
   no fake data, no decorative buttons.

   Every piece of copy comes from the translation layer (js/i18n.js),
   so the whole panel — including the tables, the modals, the toasts
   and the validation messages — follows the manager's language.
   ========================================================= */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const localize = (row, field) => (I18N ? I18N.localize(row, field) : (row ? row[field] : ''));
  const raw = (row, field) => (I18N ? I18N.raw(row, field) : (row ? row[field] : ''));
  const translateMessage = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
  const choiceOf = (line) => (I18N && I18N.itemChoice ? I18N.itemChoice(line) : '');
  const fmtSar = (n) => (I18N ? I18N.fmtSAR(n) : 'SAR ' + Number(n ?? 0).toLocaleString('en-US'));
  const fmtDT = (iso) => (I18N ? I18N.fmtDateTime(iso) : (iso ? new Date(iso.replace(' ', 'T')).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }) : '-'));
  const fmtNum = (n) => (I18N ? I18N.fmtNumber(n ?? 0) : Number(n ?? 0).toLocaleString('en-US'));
  const fmtT = (iso) => (I18N ? I18N.fmtTime(iso) : (iso ? new Date(iso.replace(' ', 'T')).toLocaleTimeString('en-PK', { timeStyle: 'short' }) : '—'));

  const MANAGEMENT_ROLES = ['super_admin', 'admin', 'staff', 'cashier'];
  const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
  const RESERVATION_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];

  /* The human label of an internal status code. The code itself is
     never translated — only the wording the manager reads. */
  function statusLabel(status) {
    const key = String(status || '').replace(/_/g, '_');
    return t(`status.${key}`);
  }

  function roleLabel(role) {
    return t(`role.${String(role || '').replace('_', '_')}`);
  }

  /* Back-office navbar: show the signed-in manager instead of the customer
     "Log In" button, and let the account menu carry the logout. */
  function initManagerNav() {
    const guest = $('navGuestLinks');
    const account = $('navAccount');
    const trigger = $('navAccountTrigger');
    const menu = $('navAccountMenu');
    const nameEl = $('navAccountName');
    const badge = $('navRoleBadge');
    const logoutBtn = $('navLogoutBtn');

    const me = SavoriaAPI.getCurrentUser();
    const signedIn = SavoriaAPI.isLoggedIn() && !!me;
    if (guest) guest.style.display = signedIn ? 'none' : '';
    if (account) account.classList.toggle('visually-hidden', !signedIn);
    if (!signedIn) return;

    if (nameEl) {
      // The translation layer would otherwise rewrite this back to "Account".
      nameEl.removeAttribute('data-i18n');
      nameEl.textContent = me.full_name || me.email || t('nav.account');
    }
    if (badge) {
      const roleKey = `role.${me.role}`;
      badge.textContent = t(roleKey);
      badge.setAttribute('data-i18n', roleKey);
    }
    if (trigger && menu) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('open');
      });
      document.addEventListener('click', () => menu.classList.remove('open'));
    }
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try { await SavoriaAPI.logout(); } catch { SavoriaAPI.clearSession(); }
        window.location.href = 'login.html';
      });
    }
  }
  initManagerNav();

  const user = SavoriaAPI.getCurrentUser();
  if (!SavoriaAPI.isLoggedIn() || !user || !MANAGEMENT_ROLES.includes(user.role)) {
    $('deniedView').style.display = 'block';
    $('panelView').style.display = 'none';
    return;
  }

  const IS_SUPER = user.role === 'super_admin';
  const IS_ADMIN = IS_SUPER || user.role === 'admin';

  // Role gate passed — reveal the panel (it starts hidden in markup).
  $('panelView').style.display = 'block';

  /* ======================================================
     Role-gated tabs (UI convenience — the backend enforces
     the same rules on every endpoint).
     ====================================================== */
  /* Which tabs and actions each person sees comes from the permissions
     table (Site Management → Permissions): js/admin-shell.js loads it
     before the first page and shows only the areas this person may open.
     can(area, 'view' | 'edit') asks it; the server enforces the same. */
  function can(area, need = 'view') {
    const p = window.SavoriaAdminShell && window.SavoriaAdminShell.areas;
    if (!p) return IS_ADMIN; // before the table arrives: admins only
    const level = p[area] || 'none';
    return need === 'edit' ? level === 'edit' : level !== 'none';
  }
  window.SavoriaCan = can;
  {
    // Resetting the invoice counter belongs to "settings" (edit).
    const resetBtn = document.getElementById('invoiceResetBtn');
    if (resetBtn) window.SavoriaAdminShell?.ready.then(() => { resetBtn.style.display = can('settings', 'edit') ? '' : 'none'; });
  }

  /* ======================================================
     Toasts / modals / confirm
     ====================================================== */
  function toast(type, message, detail = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${esc(message)}${detail ? `<span class="toast-detail">${esc(detail)}</span>` : ''}`;
    $('toastStack').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 5200);
    setTimeout(() => el.remove(), 5700);
  }

  function openModal(id) { $(id).classList.add('open'); }
  function closeModal(id) { $(id).classList.remove('open'); }

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
      if (e.target.dataset?.close) overlay.classList.remove('open');
      // Treat Cancel/backdrop on the confirm modal as "not confirmed".
      if (overlay.id === 'confirmModal' && (!e.target.closest('.modal') || e.target.dataset?.close)) {
        if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
      }
    });
  });

  let confirmResolve = null;
  function confirmAction({ title, message, reasonRequired = true, danger = true, placeholder = 'Reason…', select = null }) {
    return new Promise((resolve) => {
      confirmResolve = resolve;
      $('confirmTitle').textContent = title;
      $('confirmMessage').innerHTML = message;

      const reasonBlock = document.getElementById('confirmReason').parentElement;
      if (select) {
        const selectWrap = document.createElement('div');
        selectWrap.className = 'form-group';
        selectWrap.innerHTML = `<label for="confirmOption">${esc(select.label)}</label>
          <select id="confirmOption" style="width:100%;margin-top:6px;padding:0.55rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);">
            ${select.options.map(o => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}
          </select>`;
        reasonBlock.parentNode.insertBefore(selectWrap, reasonBlock);
        reasonBlock.style.display = 'none';
      } else {
        reasonBlock.style.display = 'block';
      }

      const accept = $('confirmAcceptBtn');
      accept.style.background = danger ? 'var(--color-error)' : '';
      accept.style.borderColor = danger ? 'var(--color-error)' : '';
      accept.textContent = danger ? t('common.confirm') : t('common.save');
      $('confirmReason').value = '';
      $('confirmReason').placeholder = placeholder;
      openModal('confirmModal');
    });
  }
  $('confirmAcceptBtn').addEventListener('click', () => {
    const body = {
      reason: $('confirmReason').value.trim(),
      option: $('confirmOption') ? $('confirmOption').value : null,
    };
    const selEl = document.getElementById('confirmOption');
    if (selEl) selEl.parentElement.remove();
    closeModal('confirmModal');
    if (!confirmResolve) return;
    confirmResolve(body);
    confirmResolve = null;
  });

  // Shared with the website-content module so both tools use the exact
  // same toasts, modals and confirmation flow.
  window.SavoriaAdminUI = { toast, openModal, closeModal, confirmAction, t };
  // Do NOT resolve on outside-click: treat it as cancel.
  document.querySelectorAll('.modal-overlay#confirmModal').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (overlay.classList.contains('open') && !e.target.closest('.modal')) {
        overlay.classList.remove('open');
        const selEl = document.getElementById('confirmOption');
        if (selEl) selEl.parentElement.remove();
        if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
      }
    }, true);
  });

  /* ======================================================
     Fresh session info (role/flags may have changed server-side)
     ====================================================== */
  async function refreshMe() {
    try {
      const me = await SavoriaAPI.getMe();
      localStorage.setItem('savoria_user', JSON.stringify(me));
      return me;
    } catch (_) { return null; }
  }

  /* ======================================================
     Forced first-login password change
     ====================================================== */
  async function handleForcedChange(freshUser) {
    const forceFlag = freshUser?.force_password_change || user.force_password_change
      || new URLSearchParams(window.location.search).get('force_change') === '1';
    if (!forceFlag) return true;

    freshUser = freshUser || SavoriaAPI.getCurrentUser();
    $('lockedOverlay').classList.add('open');
    $('panelView').style.opacity = '0.35';
    $('panelView').style.pointerEvents = 'none';

    // Resolves once the new password is saved: the API refuses everything else
    // until then, so the panel must not load its data behind the overlay.
    return new Promise((resolve) => $('lockedForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertBox = $('lockedAlert');
      alertBox.className = 'auth-alert';
      const current = $('lockCurrent').value;
      const next = $('lockNew').value;
      if (next.length < 8 || !/[A-Z]/.test(next) || !/[0-9]/.test(next)) {
        alertBox.className = 'auth-alert error show';
        alertBox.textContent = t('admin.password.weak');
        return;
      }
      try {
        await SavoriaAPI.setUserPassword(freshUser.id, { current_password: current, password: next });
        const merged = { ...freshUser, force_password_change: false };
        localStorage.setItem('savoria_user', JSON.stringify(merged));
        alertBox.className = 'auth-alert success show';
        alertBox.textContent = t('auth.passwordUpdated');
        setTimeout(() => {
          $('lockedOverlay').classList.remove('open');
          $('panelView').style.opacity = '1';
          $('panelView').style.pointerEvents = 'auto';
          toast('success', t('admin.password.updated'), t('admin.password.updatedDetail'));
          resolve(true);
        }, 700);
      } catch (err) {
        alertBox.className = 'auth-alert error show';
        alertBox.textContent = translateMessage(err.message);
      }
    }));
  }

  /* ======================================================
     Tabs
     ====================================================== */
  const tabLoaders = {
    overview: loadOverview,
    orders: loadOrders,
    reservations: loadReservations,
    menu: loadMenuAdmin,
    accounts: loadUsers,
    coupons: loadCoupons,
    settings: loadSettings,
    content: () => window.SavoriaAdminContent?.load(),
    appearance: () => window.SavoriaAdminThemes?.load(),
    invoice: () => window.SavoriaAdminInvoice?.load() || Promise.resolve(),
    ratings: () => window.SavoriaAdminRatings?.load() || Promise.resolve(),
    tables: loadTables,
    platform: () => window.SavoriaAdminPlatform?.loadSwitches() || Promise.resolve(),
    permissions: () => window.SavoriaAdminPlatform?.loadPermissions() || Promise.resolve(),
    activity: () => window.SavoriaAdminPlatform?.loadActivity() || Promise.resolve(),
    offers: () => window.SavoriaAdminOffers?.load() || Promise.resolve(),
  };
  let activeTab = 'overview';

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      ['overview', 'orders', 'reservations', 'menu', 'accounts', 'coupons', 'settings', 'content', 'appearance', 'invoice', 'ratings', 'tables', 'offers', 'platform', 'permissions', 'activity'].forEach(tab => {
        const section = $('tab-' + tab);
        if (section) section.style.display = tab === btn.dataset.tab ? 'block' : 'none';
      });
      tabLoaders[btn.dataset.tab]?.().catch(err => toast('error', t('admin.toasts.loadFailed'), translateMessage(err.message)));
      if (btn.dataset.tab === 'orders') loadInvoiceCounter();
    });
  });

  /* ======================================================
     THE TWO NUMBERS
     · the invoice number is permanent (it is the order's own id)
       and is never affected by the counter reset;
     · the order number is the operational counter the manager
       can reset from the panel.
     ====================================================== */
  const invoiceNumber = (order) => (
    order.invoice_number !== null && order.invoice_number !== undefined && order.invoice_number !== ''
      ? order.invoice_number
      : order.id
  );

  const orderNumber = (order) => (
    order.order_number !== null && order.order_number !== undefined && order.order_number !== ''
      ? order.order_number
      : order.id
  );

  async function loadInvoiceCounter() {
    const note = $('invoiceCounterNote');
    try {
      const data = await SavoriaAPI.getOrderCounter();
      if (note) {
        note.textContent = data.ready
          ? t('admin.orders.currentOrder', { number: data.current })
          : t('admin.orders.counterUnavailable');
      }
    } catch (_) {
      if (note) note.textContent = '';
    }
  }

  $('invoiceResetBtn')?.addEventListener('click', async () => {
    const answer = await confirmAction({
      title: t('admin.orders.resetCounterTitle'),
      message: t('admin.orders.resetCounterMessage'),
      reasonRequired: false,
      danger: true,
    });
    if (!answer) return;
    try {
      await SavoriaAPI.resetOrderCounter();
      toast('success', t('admin.orders.resetCounterDone'));
      await loadInvoiceCounter();
      await loadOrders();
    } catch (err) {
      toast('error', t('admin.orders.resetCounterFailed'), translateMessage(err.message));
    }
  });

  /* ======================================================
     OVERVIEW
     ====================================================== */
  let LOYALTY_SETTINGS = null;

  async function loadOverview() {
    const grid = $('statGrid');
    try {
      const s = await SavoriaAPI.getAdminSummary();
      grid.innerHTML = `
        <div class="stat-card"><div class="stat-label">${t('admin.overview.ordersToday')}</div><div class="stat-value">${s.orders_today}</div></div>
        <div class="stat-card"><div class="stat-label">${t('admin.overview.revenueToday')}</div><div class="stat-value">${fmtSar(s.revenue_today)}</div></div>
        <div class="stat-card"><div class="stat-label">${t('admin.overview.pendingReservations')}</div><div class="stat-value">${s.pending_reservations}</div></div>
      `;
    } catch (err) {
      grid.innerHTML = `<div class="empty-state">${t('admin.overview.statsFailed', { message: esc(translateMessage(err.message)) })}</div>`;
    }

    const statusGrid = $('loyaltyStatusGrid');
    if (can('settings')) {
      try {
        LOYALTY_SETTINGS = await SavoriaAPI.getLoyaltySettings();
        const percent = Number(LOYALTY_SETTINGS.coupon_percent) || 0;
        const minInvoice = Number(LOYALTY_SETTINGS.earn_min_order_amount) || 0;
        const maxPerOrder = Number(LOYALTY_SETTINGS.max_coupons_per_order) || 0;
        statusGrid.innerHTML = `
          <div class="stat-card"><div class="stat-label">${t('admin.overview.loyaltyProgram')}</div>
            <div class="stat-value" style="font-size:1.15rem;">${LOYALTY_SETTINGS.enabled ? t('admin.overview.active') : t('admin.overview.paused')}</div></div>
          <div class="stat-card"><div class="stat-label">${t('admin.overview.couponRule')}</div>
            <div class="stat-value" style="font-size:1.35rem;">${percent}%</div>
            <div class="mgmt-note" style="margin-top:6px;">${t('admin.overview.minInvoice', { amount: fmtSar(minInvoice) })}</div></div>
          <div class="stat-card"><div class="stat-label">${t('admin.overview.maxCouponsLabel')}</div>
            <div class="stat-value" style="font-size:1.35rem;">${maxPerOrder === 0 ? t('admin.overview.noLimit') : maxPerOrder}</div></div>
          <div class="card empty-state" style="background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:var(--space-4);text-align:left;">
            <strong style="display:block;margin-bottom:6px;">${t('admin.overview.howItWorks')}</strong>
            <span class="mgmt-note">${t('admin.overview.howItWorksText')}</span>
          </div>
        `;
        $('loyaltyStatusNote').textContent = LOYALTY_SETTINGS.enabled
          ? t('admin.overview.programLive', { percent, min: fmtSar(minInvoice) })
          : t('admin.overview.programSuspended');
      } catch (err) {
        statusGrid.innerHTML = `<div class="empty-state">${t('admin.overview.settingsFailed', { message: esc(translateMessage(err.message)) })}</div>`;
      }
    } else {
      statusGrid.innerHTML = `<div class="empty-state">${t('admin.overview.rulesAdminOnly')}</div>`;
      $('loyaltyStatusNote').textContent = '';
    }
  }

  /* ======================================================
     TODAY'S ORDERS (real data + auto refresh)
     ====================================================== */
  let ordersTimer = null;

  async function loadOrders() {
    if (!['super_admin', 'admin', 'staff', 'cashier'].includes(user.role)) return;
    const search = $('ordersSearch').value.trim();
    const status = $('ordersStatusFilter').value;
    const params = {};
    if (search) params.search = search;
    if (status) params.status = status;

    const data = await SavoriaAPI.getOrdersToday(params);
    renderOrdersSummary(data.summary);
    renderOrdersTable(data.orders);
    $('ordersLastUpdate').textContent = t('admin.orders.updated', { time: fmtT(new Date().toISOString()) });
  }

  function renderOrdersSummary(s) {
    const inProgress = (s.confirmed || 0) + (s.preparing || 0) + (s.out_for_delivery || 0);
    $('ordersSummary').innerHTML = `
      <div class="stat-card"><div class="stat-label">${t('admin.overview.ordersToday')}</div><div class="stat-value">${s.total_orders}</div></div>
      <div class="stat-card"><div class="stat-label">${t('admin.orders.new')}</div><div class="stat-value">${s.pending}</div></div>
      <div class="stat-card"><div class="stat-label">${t('admin.orders.inProgress')}</div><div class="stat-value">${inProgress}</div></div>
      <div class="stat-card"><div class="stat-label">${t('admin.orders.completed')}</div><div class="stat-value">${s.delivered}</div></div>
      <div class="stat-card"><div class="stat-label">${t('admin.orders.cancelled')}</div><div class="stat-value">${s.cancelled}</div></div>
      <div class="stat-card"><div class="stat-label">${t('admin.orders.revenue')}</div><div class="stat-value" style="font-size:1.08rem;white-space:nowrap;">${fmtSar(s.revenue)}</div></div>
    `;
  }

  const ICON_CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
  const ICON_CARD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>`;
  const ICON_GIFT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/><path d="M12 8S10.5 3 8 4.5 9.5 8 12 8ZM12 8s1.5-5 4-3.5S14.5 8 12 8Z"/></svg>`;
  const ICON_USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/></svg>`;
  const ICON_PHONE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.6 3h2.1l1.4 4-2 1.3a11 11 0 0 0 5.3 5.3l1.3-2 4 1.4v2.1a2 2 0 0 1-2.2 2A16 16 0 0 1 4.6 5.2 2 2 0 0 1 6.6 3Z"/></svg>`;

  /* Compact status stepper shown across the top of each admin order card
     so the current stage reads at a glance, alongside the status dropdown.
     Delivery orders run the full five stages; pickup/dine-in skip the
     "out for delivery" leg. A cancelled order collapses to one red stop. */
  function adminOrderFlow(o) {
    return o.order_type === 'delivery'
      ? ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered']
      : ['pending', 'confirmed', 'preparing', 'delivered'];
  }

  function orderProgressHTML(o) {
    const status = String(o.status || 'pending');
    if (status === 'cancelled') {
      return `<div class="order-progress is-cancelled" title="${esc(t('admin.orders.statusProgress'))}">
        <span class="op-dot">✕</span>
        <span class="op-label">${esc(statusLabel('cancelled'))}</span>
      </div>`;
    }
    const flow = adminOrderFlow(o);
    const current = Math.max(0, flow.indexOf(status));
    let steps = '';
    flow.forEach((s, i) => {
      if (i > 0) steps += `<span class="op-bar${i <= current ? ' is-filled' : ''}"></span>`;
      const cls = i < current ? 'is-done' : i === current ? 'is-current' : '';
      steps += `<div class="op-step ${cls}">
        <span class="op-dot">${i < current ? '✓' : i + 1}</span>
        <span class="op-label">${esc(statusLabel(s))}</span>
      </div>`;
    });
    return `<div class="order-progress" title="${esc(t('admin.orders.statusProgress'))}">${steps}</div>`;
  }

  function couponCodesHTML(o) {
    return (o.coupons_used || [])
      .map(c => `<code class="order-code">${esc(c.code)}</code>`)
      .join('');
  }

  function earnedCouponHTML(o) {
    if (!o.earned_coupon && !o.earned_coupon_pending) return '';
    const issued = Boolean(o.earned_coupon);
    const amount = issued ? o.earned_coupon.value : o.earned_coupon_pending.value;
    const code = issued ? `<code class="order-code">${esc(o.earned_coupon.code)}</code>` : '';
    return `<span class="order-earned" title="${esc(issued ? t('admin.orders.couponEarned') : t('admin.orders.couponPending'))}">
      ${ICON_GIFT}<strong>${t('admin.orders.earnedCoupon')} + ${fmtSar(amount)}</strong>
      ${code}${issued ? '' : `<em>${t('admin.orders.earnedPending')}</em>`}
    </span>`;
  }

  function billHTML(o) {
    const items = o.items || [];
    const subtotal = items.reduce((sum, i) => {
      const line = Number(i.subtotal) || (Number(i.unit_price) || 0) * (Number(i.quantity) || 0);
      return sum + line;
    }, 0);
    const promo = Number(o.discount_amount) || 0;
    const coupon = Number(o.coupon_discount) || 0;
    const vat = Number(o.vat_amount) || 0;
    const rows = [
      `<div class="bill-row"><span>${t('admin.orders.itemsSubtotal')}</span><span>${fmtSar(subtotal)}</span></div>`,
    ];
    if (promo > 0) {
      rows.push(`<div class="bill-row"><span>${t('admin.orders.promoDiscount')}${o.promo_code ? ` <code class="order-code">${esc(o.promo_code)}</code>` : ''}</span><span class="bill-cut">− ${fmtSar(promo)}</span></div>`);
    }
    if (coupon > 0) {
      rows.push(`<div class="bill-row is-discount"><span>${t('admin.orders.couponDiscount')}${couponCodesHTML(o)}</span><span>− ${fmtSar(coupon)}</span></div>`);
    }
    if (vat > 0) {
      rows.push(`<div class="bill-row"><span>${t('admin.orders.vatLabel')}${o.vat_rate ? ` <em>${Number(o.vat_rate)}%</em>` : ''}</span><span>+ ${fmtSar(vat)}</span></div>`);
    }
    return `<aside class="order-bill">
      <span class="order-label">${t('admin.orders.bill')}</span>
      ${rows.join('')}
      <div class="bill-total"><span>${t('admin.orders.paidTotal')}</span><strong>${fmtSar(o.total_amount)}</strong></div>
    </aside>`;
  }

  function paymentLabel(method) {
    if (!method) return t('common.notAvailable');
    const key = String(method).toLowerCase();
    return ['cash', 'card', 'online'].includes(key) ? t('admin.orderModal.' + key) : method;
  }

  function initialsOf(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase();
  }

  function renderOrdersTable(orders) {
    const body = $('ordersTableBody');
    if (!orders.length) {
      body.innerHTML = `<div class="empty-state">${t('admin.orders.noOrders')}${
        !$('ordersSearch').value && !$('ordersStatusFilter').value ? '' : ' ' + t('admin.orders.noOrdersFilter')}</div>`;
      return;
    }
    body.innerHTML = orders.map(o => {
      const items = (o.items || []);
      const typeLabel = o.order_type === 'delivery' ? t('admin.orders.delivery')
        : o.order_type === 'pickup' ? t('admin.orders.pickup')
        : `${t('admin.orders.dineIn')}${o.table_number ? ` · ${t('admin.orders.tableOf', { number: esc(o.table_number) })}` : ''}`;
      const addr = String(o.delivery_address || '').trim();
      const addrLine = addr && o.order_type === 'delivery'
        ? `<span class="order-note" title="${esc(addr)}"><svg class="order-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>${esc(addr)}</span>`
        : '';
      const notesLine = o.order_notes
        ? `<span class="order-note" title="${esc(o.order_notes)}"><svg class="order-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/></svg>${esc(o.order_notes)}</span>`
        : '';
      const dishes = items.map(i => {
        const qty = Number(i.quantity) || 0;
        const unit = Number(i.unit_price) || 0;
        const line = Number(i.subtotal) || unit * qty;
        const note = String(i.special_instructions || '').trim();
        return `<li class="order-dish">
          <span class="order-dish-qty">${qty}×</span>
          <span class="order-dish-name">${esc(i.item_name_snapshot)}${choiceOf(i) ? `<small class="order-dish-choice">${esc(choiceOf(i))}</small>` : ''}${note ? `<small class="order-dish-note">${esc(note)}</small>` : ''}</span>
          <span class="order-dish-unit ltr-value">${fmtSar(unit)}</span>
          <span class="order-dish-price ltr-value">${fmtSar(line)}</span>
        </li>`;
      }).join('');
      const dishHead = items.length
        ? `<li class="order-dish-head" aria-hidden="true"><span></span><span>${esc(t('admin.orders.colItem'))}</span><span>${esc(t('admin.orders.colUnit'))}</span><span>${esc(t('admin.orders.colTotal'))}</span></li>`
        : '';
      return `
      <article class="order-card" data-status="${esc(o.status)}">
        <header class="order-card-head">
          <div class="order-customer">
            <span class="order-avatar">${esc(initialsOf(o.customer_name))}</span>
            <div class="order-customer-text">
              <span class="order-cust-label">${esc(t('admin.orders.placedBy'))}</span>
              <strong title="${esc(o.customer_name)}">${esc(o.customer_name)}</strong>
              <span class="order-phone ltr-value">${ICON_PHONE}${esc(o.phone)}</span>
            </div>
          </div>
          <div class="order-ids">
            <span class="order-no is-invoice"><em>${t('admin.orders.invoiceShort')}</em><strong>#${esc(invoiceNumber(o))}</strong></span>
            <span class="order-no"><em>${t('admin.orders.orderShort')}</em><strong>#${esc(orderNumber(o))}</strong></span>
          </div>
          <div class="order-head-side">
            <span class="order-time">${ICON_CLOCK}${fmtT(o.created_at)}</span>
            <div class="order-status-slot">${statusSelectHTML(o.id, o.status, ORDER_STATUSES, 'orderStatusSelect')}</div>
          </div>
        </header>
        ${orderProgressHTML(o)}
        <div class="order-card-body">
          <div class="order-main">
            <div class="order-dishes">
              <span class="order-label">${t('admin.orderModal.items')} <em>${items.length}</em></span>
              <ul class="order-dish-list">${dishHead}${dishes || `<li class="order-dish-more"><span></span><span>${t('common.notAvailable')}</span><span></span><span></span></li>`}</ul>
            </div>
            <div class="order-fulfilment">
              <div class="order-tags">
                <span class="order-type-tag order-type-${esc(o.order_type)}">${typeLabel}</span>
                <span class="order-payment">${ICON_CARD}${t('admin.orderModal.payment')}: <strong>${esc(paymentLabel(o.payment_method))}</strong></span>
              </div>
              ${addrLine}
              ${notesLine}
              ${earnedCouponHTML(o)}
            </div>
          </div>
          ${billHTML(o)}
        </div>
        <footer class="order-card-foot">
          <span class="order-handler">${ICON_USER}${t('admin.orderModal.handledBy')}: <strong>${esc(o.processed_by_name || t('common.notAvailable'))}</strong></span>
          <button class="btn btn-outline btn-sm" data-order-details="${o.id}">${t('admin.orders.details')}</button>
        </footer>
      </article>`;
    }).join('');

    body.querySelectorAll('select[data-role="orderStatusSelect"]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.id;
        sel.disabled = true;
        try {
          const res = await SavoriaAPI.patchOrder(id, { status: sel.value });
          toast('success', translateMessage(res?.message) || t('admin.orders.orderUpdated'), '#'.concat(id));
          await loadOrders();
        } catch (err) {
          toast('error', t('admin.orders.couldNotUpdate'), translateMessage(err.message));
          await loadOrders();
        } finally { sel.disabled = false; }
      });
    });
    body.querySelectorAll('[data-order-details]').forEach(btn => {
      btn.addEventListener('click', () => {
        const o = orders.find(x => String(x.id) === btn.dataset.orderDetails);
        if (o) openOrderDetails(o);
      });
    });
  }

  function statusSelectHTML(id, current, options, role) {
    return `<select class="status-select" data-id="${id}" data-role="${role}">
      ${options.map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
    </select>`;
  }

  function openOrderDetails(o) {
    $('orderModalTitle').textContent = t('admin.orderModal.title', { id: invoiceNumber(o), type: t('orderType.' + o.order_type) });
    const rows = (o.items || []).map(i => `
      <li><span>${i.quantity}× ${esc(i.item_name_snapshot)}${choiceOf(i) ? ` <small class="order-dish-choice">(${esc(choiceOf(i))})</small>` : ''}${i.special_instructions ? `<br><small class="mgmt-note">${t('admin.orderModal.note')}: ${esc(i.special_instructions)}</small>` : ''}</span><span>${fmtSar(Number(i.unit_price) * Number(i.quantity))}</span></li>
    `).join('');
    const usedCoupons = (o.coupons_used || [])
      .map(c => `${esc(c.code)} (− ${fmtSar(c.value)})`)
      .join(', ');
    const earnedCoupon = o.earned_coupon
      ? `${esc(o.earned_coupon.code)} (+ ${fmtSar(o.earned_coupon.value)})`
      : o.earned_coupon_pending
        ? `${t('admin.orderModal.couponPending')} (+ ${fmtSar(o.earned_coupon_pending.value)})`
        : '';
    $('orderModalBody').innerHTML = `
      <p class="modal-note">${fmtDT(o.created_at)} · ${esc(o.customer_name)} · <span class="ltr-value">${esc(o.phone)}</span> · ${t('admin.orderModal.statusLine', { from: statusLabel('pending'), to: `<strong>${esc(statusLabel(o.status))}</strong>` })}</p>
      <table class="data-table" style="min-width:0;">
        <tbody>
          <tr><th style="width:140px;">${t('admin.orderModal.placed')}</th><td>${fmtDT(o.created_at)}</td></tr>
          <tr><th>${t('admin.orderModal.phone')}</th><td class="ltr-value">${esc(o.phone)}</td></tr>
          <tr><th>${t('admin.orderModal.type')}</th><td>${esc(t('orderType.' + o.order_type))}</td></tr>
          <tr><th>${t('admin.orderModal.table')}</th><td>${o.table_number ? esc(o.table_number) : t('common.notAvailable')}</td></tr>
          ${o.delivery_address ? `<tr><th>${t('admin.orderModal.address')}</th><td>${esc(o.delivery_address)}</td></tr>` : ''}
          <tr><th>${t('admin.orderModal.orderNotes')}</th><td>${o.order_notes ? esc(o.order_notes) : t('common.notAvailable')}</td></tr>
          <tr><th>${t('admin.orderModal.promo')}</th><td>${o.promo_code ? esc(o.promo_code) + ` (${t('admin.orderModal.off', { amount: fmtSar(o.discount_amount) })})` : t('common.notAvailable')}</td></tr>
          <tr><th>${t('admin.orderModal.couponDiscount')}</th><td>${o.coupon_discount > 0 ? fmtSar(o.coupon_discount) : t('common.notAvailable')}</td></tr>
          <tr><th>${t('admin.orderModal.couponsUsed')}</th><td class="ltr-value">${usedCoupons || t('common.notAvailable')}</td></tr>
          <tr><th>${t('admin.orderModal.couponEarned')}</th><td class="ltr-value">${earnedCoupon || t('common.notAvailable')}</td></tr>
          <tr><th>${t('admin.orderModal.payment')}</th><td>${o.payment_method
            ? `<select data-id="${o.id}" data-role="paymentSelect" style="padding:0.3rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-surface);color:var(--text-primary);font-size:0.9rem;">
                 ${['cash', 'card', 'online'].map(p => `<option ${p === o.payment_method ? 'selected' : ''}>${t('admin.orderModal.' + p)}</option>`).join('')}
               </select>`
            : paymentSetterHTML(o)}</td></tr>
          <tr><th>${t('admin.orderModal.handledBy')}</th><td>${esc(o.processed_by_name || t('common.notAvailable'))}</td></tr>
          ${Number(o.vat_amount) > 0 ? `<tr><th>${t('cart.vat')} (${o.vat_rate || 15}%)</th><td>+ ${fmtSar(o.vat_amount)}</td></tr>` : ''}
          <tr><th>${t('admin.orderModal.total')}</th><td><strong>${fmtSar(o.total_amount)}</strong></td></tr>
        </tbody>
      </table>
      <h4 style="margin:14px 0 8px;">${t('admin.orderModal.items')}</h4>
      <ul class="order-items-list">${rows || `<li><span>${t('common.notAvailable')}</span></li>`}</ul>
    `;
    const paySel = document.querySelector('#orderModalBody select[data-role="paymentSelect"]');
    paySel?.addEventListener('change', async () => {
      try {
        const res = await SavoriaAPI.patchOrder(o.id, { payment_method: paySel.value });
        toast('success', translateMessage(res?.message) || t('admin.orderModal.paymentSaved'));
      } catch (err) { toast('error', t('admin.orderModal.couldNotSavePayment'), translateMessage(err.message)); }
    });
    document.getElementById('orderModalBody').insertAdjacentHTML('beforeend', `
      <p style="margin-top:12px;"><a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="invoice.html?order=${encodeURIComponent(o.id)}">${esc(o.status === 'delivered' ? t('invoice.open') : t('invoice.openDraft'))}</a></p>`);
    const payBtn = document.querySelector('#orderModalBody [data-set-payment]');
    payBtn?.addEventListener('click', async () => {
      const v = document.querySelector('#orderModalBody [data-set-payment-value]').value;
      try {
        const res = await SavoriaAPI.patchOrder(o.id, { payment_method: v });
        toast('success', translateMessage(res?.message) || t('admin.orderModal.paymentSaved'));
        closeModal('orderModal'); await loadOrders();
      } catch (err) { toast('error', t('admin.orderModal.couldNotSavePayment'), translateMessage(err.message)); }
    });
    openModal('orderModal');
  }

  function paymentSetterHTML(o) {
    return `<select data-set-payment-value style="padding:0.3rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-surface);color:var(--text-primary);font-size:0.9rem;">
        <option value="">${t('admin.orderModal.selectPayment')}</option><option>cash</option><option>card</option><option>online</option></select>
      <button class="btn btn-outline btn-sm" data-set-payment="${o.id}">${t('admin.orderModal.save')}</button>`;
  }

  let searchDebounce = null;
  $('ordersSearch').addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => loadOrders().catch(e => toast('error', t('admin.toasts.searchFailed'), translateMessage(e.message))), 350);
  });
  $('ordersStatusFilter').addEventListener('change', () => loadOrders().catch(e => toast('error', t('admin.toasts.filterFailed'), translateMessage(e.message))));
  $('ordersRefreshBtn').addEventListener('click', () => loadOrders().catch(e => toast('error', t('admin.toasts.refreshFailed'), translateMessage(e.message))));

  ordersTimer = setInterval(() => {
    const active = document.querySelector('.tab-btn[data-tab="orders"]').classList.contains('active');
    if (active && !document.hidden && !document.querySelector('.modal-overlay.open')) {
      loadOrders().catch(() => {});
    }
  }, 15000);

  /* ======================================================
     RESERVATIONS
     ====================================================== */
  async function loadReservations() {
    const body = $('reservationsTableBody');
    try {
      // Completed reservations leave the working list as soon as they are
      // marked; they stay in the database and in the customer's history.
      const reservations = (await SavoriaAPI.getAllReservations()).filter(r => r.status !== 'completed');
      if (!reservations.length) { body.innerHTML = `<tr><td colspan="7"><div class="empty-state">${t('admin.reservations.none')}</div></td></tr>`; return; }
      body.innerHTML = reservations.map(r => `
        <tr>
          <td>#${r.id}</td>
          <td>${esc(r.full_name)}</td>
          <td class="ltr-value">${esc(r.phone)}</td>
          <td>${r.party_size}</td>
          <td>${esc(String(r.reservation_date))}</td>
          <td>${esc(String(r.reservation_time).slice(0, 5))}</td>
          <td>${statusSelectHTML(r.id, r.status, RESERVATION_STATUSES, 'reservationStatusSelect')}</td>
        </tr>`).join('');
      body.querySelectorAll('select[data-role="reservationStatusSelect"]').forEach(sel => {
        sel.addEventListener('change', async () => {
          sel.disabled = true;
          try {
            const res = await SavoriaAPI.updateReservationStatus(sel.dataset.id, sel.value);
            toast('success', translateMessage(res?.message) || t('admin.reservations.updated'));
          } catch (err) {
            toast('error', t('admin.reservations.couldNotUpdate'), translateMessage(err.message));
          } finally { sel.disabled = false; loadReservations().catch(() => {}); }
        });
      });
    } catch (err) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty-state">${t('admin.reservations.couldNotLoad', { message: esc(translateMessage(err.message)) })}</div></td></tr>`;
    }
  }

  /* ======================================================
     MENU & CATEGORIES
     ====================================================== */
  let CATS = [];
  let ITEMS = [];
  let editingItemId = null;
  let editingCategoryId = null;

  async function loadMenuAdmin() {
    try {
      CATS = await SavoriaAPI.getAdminCategories();
      ITEMS = await SavoriaAPI.getMenuItems({ all_sort: 'true' });
      renderCategoriesTable();
      renderItemsTable();
      $('iCategory').innerHTML = CATS.map(c => `<option value="${c.id}">${esc(localize(c, 'name'))}</option>`).join('');
    } catch (err) {
      toast('error', t('admin.toasts.menuLoadFailed'), translateMessage(err.message));
      $('categoriesTableBody').innerHTML = `<tr><td colspan="6"><div class="empty-state">${esc(translateMessage(err.message))}</div></td></tr>`;
    }
  }

  function renderCategoriesTable() {
    const body = $('categoriesTableBody');
    if (!CATS.length) { body.innerHTML = `<tr><td colspan="6"><div class="empty-state">${t('admin.menu.noCategories')}</div></td></tr>`; return; }
    body.innerHTML = CATS.map((c, idx) => `
      <tr data-cat-id="${c.id}">
        <td style="white-space:nowrap;">
          <button class="btn btn-outline btn-sm cat-move" data-dir="-1" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-outline btn-sm cat-move" data-dir="1" ${idx === CATS.length - 1 ? 'disabled' : ''}>↓</button>
        </td>
        <td><strong>${esc(localize(c, 'name'))}</strong><br><span class="mgmt-note">${esc(localize(c, 'description'))}</span></td>
        <td>${c.item_count}</td>
        <td><label class="switch"><input type="checkbox" data-cat-visible="${c.id}" ${c.is_visible ? 'checked' : ''}><span class="slider"></span></label></td>
        <td>${c.image_url ? `<img class="admin-thumb" src="${esc(c.image_url)}" alt="${esc(localize(c, 'name'))}">` : `<span style="color:var(--text-secondary);">${t('common.notAvailable')}</span>`}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-outline btn-sm cat-edit" data-id="${c.id}">${t('admin.menu.edit')}</button>
          <button class="btn btn-outline btn-sm cat-del" data-id="${c.id}" style="color:var(--color-error);border-color:var(--color-error);">${t('admin.menu.delete')}</button>
        </td>
      </tr>`).join('');

    body.querySelectorAll('.cat-move').forEach(b => b.addEventListener('click', async (e) => {
      const row = e.target.closest('tr'); const idx = CATS.findIndex(c => c.id == row.dataset.catId);
      const dir = Number(b.dataset.dir); const swap = idx + dir;
      if (swap < 0 || swap >= CATS.length) return;
      [CATS[idx], CATS[swap]] = [CATS[swap], CATS[idx]];
      try {
        await SavoriaAPI.reorderCategories(CATS.map(c => c.id));
        renderCategoriesTable();
        toast('success', t('admin.menu.orderSaved'));
      } catch (err) { toast('error', t('admin.menu.reorderFailed'), translateMessage(err.message)); await loadMenuAdmin(); }
    }));

    body.querySelectorAll('[data-cat-visible]').forEach(sw => sw.addEventListener('change', async () => {
      const id = sw.dataset.catVisible;
      try {
        await SavoriaAPI.updateCategory(id, { is_visible: sw.checked });
        toast('success', sw.checked ? t('admin.menu.visibleOn') : t('admin.menu.hiddenFrom'));
      } catch (err) { toast('error', t('admin.menu.updateFailed'), translateMessage(err.message)); }
    }));

    body.querySelectorAll('.cat-edit').forEach(b => b.addEventListener('click', () => {
      const c = CATS.find(x => x.id == b.dataset.id); if (!c) return;
      editingCategoryId = c.id;
      $('categoryModalTitle').textContent = t('admin.menu.editCategoryTitle');
      $('cName').value = raw(c, 'name'); $('cDescription').value = raw(c, 'description') || '';
      $('cNameAr').value = raw(c, 'name_ar') || ''; $('cDescriptionAr').value = raw(c, 'description_ar') || '';
      $('cVisible').checked = !!c.is_visible; $('cImageUrl').value = c.image_url || '';
      refreshUploadPreview('c', c.image_url || '');
      openModal('categoryModal');
    }));

    body.querySelectorAll('.cat-del').forEach(b => b.addEventListener('click', async () => {
      const c = CATS.find(x => x.id == b.dataset.id); if (!c) return;
      if (c.item_count > 0) {
        const others = CATS.filter(x => x.id !== c.id);
        if (!others.length) { toast('error', t('admin.menu.hasDishesNoTarget')); return; }
        const res = await confirmAction({
          title: t('admin.menu.deleteTitle', { name: localize(c, 'name') }),
          message: t('admin.menu.deleteWithDishes', { count: c.item_count }),
          reasonRequired: false,
          select: {
            label: t('admin.menu.moveItemsTo'),
            options: others.map(o => ({ value: o.id, label: localize(o, 'name') })),
          },
        });
        if (!res) return;
        try {
          await SavoriaAPI.deleteCategory(c.id, Number(res.option));
          toast('success', t('admin.menu.deletedReassigned'));
        } catch (err) { toast('error', t('admin.menu.deleteFailed'), translateMessage(err.message)); }
      } else {
        const res = await confirmAction({
          title: t('admin.menu.deleteTitle', { name: localize(c, 'name') }),
          message: t('admin.menu.deleteEmpty'),
          reasonRequired: false,
        });
        if (!res) return;
        try {
          await SavoriaAPI.deleteCategory(c.id);
          toast('success', t('admin.menu.deleted'));
        } catch (err) { toast('error', t('admin.menu.deleteFailed'), translateMessage(err.message)); }
      }
      await loadMenuAdmin();
    }));
  }

  function renderItemsTable() {
    const body = $('menuItemsTableBody');
    if (!ITEMS.length) { body.innerHTML = `<tr><td colspan="7"><div class="empty-state">${t('admin.menu.noItems')}</div></td></tr>`; return; }
    body.innerHTML = ITEMS.map(i => `
      <tr>
        <td>${i.image_url ? `<img class="admin-thumb" src="${esc(i.image_url)}" alt="${esc(localize(i, 'name'))}">` : `<span style="color:var(--text-secondary);">${t('common.notAvailable')}</span>`}</td>
        <td><strong>${esc(localize(i, 'name'))}</strong><br><span class="mgmt-note">${esc(String(localize(i, 'description') || '').slice(0, 60))}</span></td>
        <td>${esc(localize(i, 'category_name'))}</td>
        <td>${Number(i.discount_percent) > 0
            ? `<div><span style="text-decoration:line-through;color:var(--text-secondary);font-size:0.82rem;">${fmtSar(i.price)}</span> <strong style="color:var(--color-primary);">${fmtSar(Math.round(Number(i.price) * (1 - Number(i.discount_percent) / 100) * 100) / 100)}</strong> <span style="display:inline-block;padding:1px 6px;background:#e11d48;color:#fff;border-radius:4px;font-size:0.7rem;font-weight:700;">-${Number(i.discount_percent)}%</span></div>`
            : `<strong>${fmtSar(i.price)}</strong>`}
        ${i.calories !== null && i.calories !== undefined && i.calories !== ''
            ? `<br><span class="mgmt-note">${t('admin.menu.caloriesShort', { value: i.calories })}</span>` : ''}
        ${(i.options || []).length
            ? `<br><span class="mgmt-note">${esc(t('admin.menu.optionsCount', { count: i.options.length }))}: ${esc(i.options.map(o => `${localize(o, 'name')} ${fmtSar(o.price)}${o.calories != null ? ` (${t('admin.menu.caloriesShort', { value: o.calories })})` : ''}`).join(' · '))}</span>` : ''}
        ${i.has_spicy_option ? `<br><span class="mgmt-note">🌶️ ${esc(t('admin.menu.spicyOffered'))}</span>` : ''}</td>
        <td><label class="switch"><input type="checkbox" data-item-available="${i.id}" ${i.is_available ? 'checked' : ''}><span class="slider"></span></label></td>
        <td>${i.prep_time_minutes}${t('common.minutes')}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-outline btn-sm item-image" data-id="${i.id}" title="${esc(t('admin.menu.changeImage'))}">${esc(t('admin.menu.image'))}</button>
          <button class="btn btn-outline btn-sm item-edit" data-id="${i.id}" title="${esc(t('admin.menu.editItemHint'))}">${t('admin.menu.edit')}</button>
          <button class="btn btn-outline btn-sm item-del" data-id="${i.id}">${t('admin.menu.delete')}</button>
        </td>
      </tr>`).join('');

    body.querySelectorAll('[data-item-available]').forEach(sw => sw.addEventListener('change', async () => {
      try {
        await SavoriaAPI.updateMenuItem(sw.dataset.itemAvailable, { is_available: sw.checked });
        toast('success', sw.checked ? t('admin.menu.nowOrderable') : t('admin.menu.nowUnavailable'));
      } catch (err) { toast('error', t('admin.menu.updateFailed'), translateMessage(err.message)); }
    }));

    body.querySelectorAll('.item-edit').forEach(b => b.addEventListener('click', () => {
      const item = ITEMS.find(x => x.id == b.dataset.id); if (!item) return;
      editingItemId = item.id;
      $('itemModalTitle').textContent = t('admin.menu.editItemTitle');
      $('iName').value = raw(item, 'name'); $('iPrice').value = item.price;
      $('iDiscount').value = (Number(item.discount_percent) > 0) ? Number(item.discount_percent) : '';
      $('iDescription').value = raw(item, 'description') || '';
      $('iNameAr').value = raw(item, 'name_ar') || '';
      $('iDescriptionAr').value = raw(item, 'description_ar') || '';
      $('iCalories').value = (item.calories === null || item.calories === undefined) ? '' : item.calories;
      $('iPrep').value = item.prep_time_minutes; $('iSpice').value = item.spice_level;
      $('iAvailable').checked = !!item.is_available;
      $('iSpicyOption').checked = !!item.has_spicy_option;
      setOptionRows(item.options);
      $('iCategory').value = item.category_id;
      $('iImageUrl').value = item.image_url || '';
      refreshUploadPreview('i', item.image_url || '');
      openModal('itemModal');
    }));

    body.querySelectorAll('.item-image').forEach(b => b.addEventListener('click', () => {
      const item = ITEMS.find(x => x.id == b.dataset.id); if (!item) return;
      openItemImageEditor(item);
    }));

    body.querySelectorAll('.item-del').forEach(b => b.addEventListener('click', async () => {
      const item = ITEMS.find(x => x.id == b.dataset.id); if (!item) return;
      const res = await confirmAction({
        title: t('admin.menu.deleteItemTitle', { name: localize(item, 'name') }),
        message: t('admin.menu.deleteItemMessage'),
        reasonRequired: false,
      });
      if (!res) return;
      try {
        await SavoriaAPI.deleteMenuItem(item.id);
        toast('success', t('admin.menu.itemDeleted'));
      } catch (err) {
        toast('info', err.status === 409 ? t('admin.menu.itemArchived') : t('admin.menu.deleteFailed'), translateMessage(err.message));
      }
      await loadMenuAdmin();
    }));
  }

  /* ---------- dish options (sizes / quantities) ----------
     One row per option: English name, Arabic name, price. A dish with
     options is priced by them, so the base price field follows the
     cheapest one and is locked while any row exists. */
  function addOptionRow(option = {}) {
    const row = document.createElement('div');
    row.className = 'item-option-row';
    if (option.id) row.dataset.optionId = option.id;
    row.innerHTML = `
      <input type="text" class="opt-name" maxlength="80" placeholder="${esc(t('admin.menu.optionNamePlaceholder'))}" aria-label="${esc(t('admin.menu.optionName'))}">
      <input type="text" class="opt-name-ar" maxlength="80" dir="rtl" lang="ar" placeholder="${esc(t('admin.menu.optionNameArPlaceholder'))}" aria-label="${esc(t('admin.menu.optionNameAr'))}">
      <input type="number" class="opt-price" min="0" step="0.01" placeholder="${esc(t('admin.menu.optionPrice'))}" aria-label="${esc(t('admin.menu.optionPrice'))}">
      <input type="number" class="opt-calories" min="0" max="5000" step="1" placeholder="${esc(t('admin.menu.optionCalories'))}" aria-label="${esc(t('admin.menu.optionCalories'))}">
      <button type="button" class="item-option-remove" aria-label="${esc(t('admin.menu.removeOption'))}" title="${esc(t('admin.menu.removeOption'))}">×</button>`;
    row.querySelector('.opt-name').value = option.name || '';
    row.querySelector('.opt-name-ar').value = option.name_ar || '';
    row.querySelector('.opt-price').value = option.price ?? '';
    row.querySelector('.opt-calories').value = option.calories ?? '';
    row.querySelector('.item-option-remove').addEventListener('click', () => { row.remove(); syncOptionPrice(); });
    row.querySelector('.opt-price').addEventListener('input', syncOptionPrice);
    $('iOptions').appendChild(row);
    syncOptionPrice();
    return row;
  }

  function setOptionRows(options) {
    $('iOptions').innerHTML = '';
    (options || []).forEach(o => addOptionRow(o));
    syncOptionPrice();
  }

  function syncOptionPrice() {
    const prices = [...$('iOptions').querySelectorAll('.opt-price')]
      .map(i => i.value.trim()).filter(v => v !== '').map(Number).filter(n => n >= 0);
    const hasRows = $('iOptions').children.length > 0;
    $('iPrice').disabled = hasRows;
    $('iPrice').title = hasRows ? t('admin.menu.priceFromOptions') : '';
    if (hasRows && prices.length) $('iPrice').value = Math.min(...prices);
  }

  /** The rows as the API expects them, or a translated error message. */
  function collectOptions() {
    const rows = [...$('iOptions').querySelectorAll('.item-option-row')];
    const options = [];
    const seen = new Set();
    for (const row of rows) {
      const name = row.querySelector('.opt-name').value.trim();
      const nameAr = row.querySelector('.opt-name-ar').value.trim();
      const priceRaw = row.querySelector('.opt-price').value.trim();
      const caloriesRaw = row.querySelector('.opt-calories').value.trim();
      if (!name) return { error: t('admin.menu.optionNameRequired') };
      if (priceRaw === '' || !(Number(priceRaw) >= 0)) return { error: t('admin.menu.optionPriceInvalid', { name }) };
      if (caloriesRaw !== '' && !(Number(caloriesRaw) >= 0 && Number(caloriesRaw) <= 5000)) return { error: t('admin.menu.optionCaloriesInvalid', { name }) };
      if (seen.has(name.toLowerCase())) return { error: t('admin.menu.optionDuplicate', { name }) };
      seen.add(name.toLowerCase());
      const option = { name, name_ar: nameAr, price: Number(priceRaw), calories: caloriesRaw === '' ? null : Number(caloriesRaw) };
      if (row.dataset.optionId) option.id = Number(row.dataset.optionId);
      options.push(option);
    }
    if (options.length > 12) return { error: t('admin.menu.optionsTooMany') };
    return { options };
  }

  $('iAddOption').addEventListener('click', () => addOptionRow().querySelector('.opt-name').focus());

  /* ---------- item & category modals ---------- */
  $('addItemBtn').addEventListener('click', () => {
    editingItemId = null;
    $('itemModalTitle').textContent = t('admin.menu.addItemTitle');
    ['iName', 'iNameAr', 'iPrice', 'iDiscount', 'iCalories', 'iDescription', 'iDescriptionAr', 'iImageUrl'].forEach(id => $(id).value = '');
    $('iPrep').value = 15; $('iSpice').value = 0; $('iAvailable').checked = true;
    $('iSpicyOption').checked = false;
    setOptionRows([]);
    $('iPreview').style.display = 'none';
    openModal('itemModal');
  });

  function bindUpload(prefix) {
    const fileInput = $(prefix === 'i' ? 'iFile' : 'cFile');
    const urlInput = $(prefix === 'i' ? 'iImageUrl' : 'cImageUrl');
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!/\.(jpe?g|png|webp)$/i.test(file.name)) { toast('error', t('admin.upload.onlyImages')); fileInput.value = ''; return; }
      if (file.size > 5 * 1024 * 1024) { toast('error', t('admin.upload.tooLarge')); fileInput.value = ''; return; }

      // Instant local preview (before the server finishes processing).
      const reader = new FileReader();
      reader.onload = () => { setPreview(prefix, reader.result, t('admin.upload.localPreview')); };
      reader.readAsDataURL(file);

      const fd = new FormData();
      fd.append('file', file);
      fd.append('prefix', prefix === 'i' ? 'menu' : 'category');
      SavoriaAPI.uploadImage(fd).then(upload => {
        urlInput.value = upload.url;
        setPreview(prefix, upload.url, t('admin.upload.processed'));
        toast('success', t('admin.upload.processedToast'), upload.url);
      }).catch(err => {
        fileInput.value = '';
        urlInput.value = '';
        toast('error', t('admin.upload.rejected'), translateMessage(err.message));
      });
    });
    urlInput.addEventListener('change', () => {
      if (urlInput.value.trim()) setPreview(prefix, urlInput.value.trim(), t('admin.upload.remotePreview'));
      else refreshUploadPreview(prefix, '');
    });
  }
  bindUpload('i');
  bindUpload('c');

  function setPreview(prefix, url, note) {
    if (!url) { $(prefix + 'Preview').style.display = 'none'; return; }
    $(prefix + 'PreviewImg').src = url;
    $(prefix + 'PreviewNote').textContent = note;
    $(prefix + 'Preview').style.display = 'block';
  }
  function refreshUploadPreview(prefix, url) { setPreview(prefix, url, t('admin.upload.currentImage')); }

  /* ---------- quick image swap for one dish ---------- */
  let imageItemId = null;
  let imageItemUrl = null;

  function openItemImageEditor(item) {
    imageItemId = item.id;
    imageItemUrl = item.image_url || '';
    $('itemImageTitle').textContent = t('admin.menu.imageModalTitle', { name: localize(item, 'name') });
    $('imUrl').value = imageItemUrl;
    $('imAlert').className = 'auth-alert';
    $('imAlert').textContent = '';
    if (imageItemUrl) {
      $('imPreviewImg').src = imageItemUrl;
      $('imPreviewNote').textContent = t('admin.menu.currentImageNote');
      $('imPreview').style.display = 'block';
    } else {
      $('imPreview').style.display = 'none';
    }
    openModal('itemImageModal');
  }

  $('imFile').addEventListener('change', () => {
    const file = $('imFile').files?.[0];
    if (!file) return;
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) { toast('error', t('admin.upload.onlyImages')); $('imFile').value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { toast('error', t('admin.upload.tooLarge')); $('imFile').value = ''; return; }

    // Local preview straight away, then the server crops it to 4:3.
    const reader = new FileReader();
    reader.onload = () => {
      $('imPreviewImg').src = reader.result;
      $('imPreviewNote').textContent = t('admin.upload.localPreview');
      $('imPreview').style.display = 'block';
    };
    reader.readAsDataURL(file);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('prefix', 'menu');
    SavoriaAPI.uploadImage(fd).then(upload => {
      imageItemUrl = upload.url;
      $('imUrl').value = upload.url;
      $('imPreviewImg').src = upload.url;
      $('imPreviewNote').textContent = t('admin.upload.processed');
      $('imPreview').style.display = 'block';
      toast('success', t('admin.upload.processedToast'), upload.url);
    }).catch(err => {
      $('imFile').value = '';
      toast('error', t('admin.upload.rejected'), translateMessage(err.message));
    });
  });

  $('imSaveBtn').addEventListener('click', async () => {
    const url = $('imUrl').value.trim();
    const btn = $('imSaveBtn');
    btn.disabled = true;
    try {
      await SavoriaAPI.updateMenuItem(imageItemId, { image_url: url || null });
      closeModal('itemImageModal');
      await loadMenuAdmin();
      toast('success', t('admin.menu.imageSaved'));
    } catch (err) {
      const alertBox = $('imAlert');
      alertBox.className = 'auth-alert error show';
      alertBox.textContent = translateMessage(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  $('itemSubmitBtn').addEventListener('click', async () => {
    const name = $('iName').value.trim();
    const price = Number($('iPrice').value);
    const caloriesRaw = $('iCalories').value.trim();
    const discountRaw = $('iDiscount').value.trim();
    let bad = false;
    document.querySelectorAll('.form-error[data-error-for]').forEach(e => e.textContent = '');
    if (name.length < 2) { $('itemModal').querySelector('[data-error-for="iName"]').textContent = t('admin.menu.nameTooShort'); bad = true; }
    if (!(price >= 0)) { $('itemModal').querySelector('[data-error-for="iPrice"]').textContent = t('admin.menu.priceInvalid'); bad = true; }
    if (discountRaw !== '' && !(Number(discountRaw) >= 0 && Number(discountRaw) <= 100)) {
      $('itemModal').querySelector('[data-error-for="iDiscount"]').textContent = t('admin.menu.discountInvalid');
      bad = true;
    }
    if (caloriesRaw !== '' && !(Number(caloriesRaw) >= 0 && Number(caloriesRaw) <= 5000)) {
      $('itemModal').querySelector('[data-error-for="iCalories"]').textContent = t('admin.menu.caloriesInvalid');
      bad = true;
    }
    const optionResult = collectOptions();
    if (optionResult.error) {
      $('itemModal').querySelector('[data-error-for="iOptions"]').textContent = optionResult.error;
      bad = true;
    }
    if (bad) return;

    const payload = {
      category_id: Number($('iCategory').value),
      name, price,
      discount_percent: discountRaw === '' ? 0 : Number(discountRaw),
      description: $('iDescription').value.trim(),
      name_ar: $('iNameAr').value.trim(),
      description_ar: $('iDescriptionAr').value.trim(),
      calories: caloriesRaw === '' ? null : Number(caloriesRaw),
      spice_level: Number($('iSpice').value),
      prep_time_minutes: Number($('iPrep').value) || 15,
      is_available: $('iAvailable').checked,
      image_url: $('iImageUrl').value.trim() || null,
      has_spicy_option: $('iSpicyOption').checked,
      options: optionResult.options,
    };
    try {
      if (editingItemId) {
        await SavoriaAPI.updateMenuItem(editingItemId, payload);
        toast('success', t('admin.menu.itemUpdated'), t('admin.menu.itemUpdatedDetail'));
      } else {
        await SavoriaAPI.createMenuItem(payload);
        toast('success', t('admin.menu.itemCreated'), t('admin.menu.itemCreatedDetail'));
      }
      closeModal('itemModal');
      await loadMenuAdmin();
    } catch (err) {
      toast('error', t('admin.toasts.saveFailed'), translateMessage(err.message) + (err.errors && Object.keys(err.errors).length ? ' — ' + Object.values(err.errors).map(translateMessage).join(' ') : ''));
    }
  });

  $('addCategoryBtn').addEventListener('click', () => {
    editingCategoryId = null;
    $('categoryModalTitle').textContent = t('admin.menu.addCategoryTitle');
    $('cName').value = ''; $('cDescription').value = '';
    $('cNameAr').value = ''; $('cDescriptionAr').value = '';
    $('cVisible').checked = true; $('cImageUrl').value = '';
    $('cPreview').style.display = 'none';
    openModal('categoryModal');
  });

  $('categorySubmitBtn').addEventListener('click', async () => {
    const name = $('cName').value.trim();
    if (name.length < 2) { toast('error', t('admin.menu.categoryNameError')); return; }
    const payload = {
      name,
      description: $('cDescription').value.trim(),
      name_ar: $('cNameAr').value.trim(),
      description_ar: $('cDescriptionAr').value.trim(),
      is_visible: $('cVisible').checked,
      image_url: $('cImageUrl').value.trim() || null,
    };
    try {
      if (editingCategoryId) {
        await SavoriaAPI.updateCategory(editingCategoryId, payload);
        toast('success', t('admin.menu.categoryUpdated'));
      } else {
        await SavoriaAPI.createCategory(payload);
        toast('success', t('admin.menu.categoryCreated'));
      }
      closeModal('categoryModal');
      await loadMenuAdmin();
    } catch (err) { toast('error', t('admin.toasts.saveFailed'), translateMessage(err.message)); }
  });

  /* ======================================================
     ACCOUNTS — two separate lists
     ------------------------------------------------------
     Customer emails live in their own list, management emails in
     another. Only the Super Admin can reach this tab (and the
     backend enforces the same rule). A customer account can never
     be promoted into a management role, and management accounts
     are never converted into customers.
     ====================================================== */
  let USERS = [];
  let editingUserId = null;
  let editingUserRole = null;
  let ACCOUNT_SCOPE = 'management';

  const isCustomerAccount = (u) => String(u.role || '') === 'customer';

  function emptyAccountRow(colspan, message) {
    return `<tr><td colspan="${colspan}"><div class="empty-state">${message}</div></td></tr>`;
  }

  function roleOptions(selected) {
    return MANAGEMENT_ROLES.map(r =>
      `<option value="${r}" ${r === selected ? 'selected' : ''}>${esc(roleLabel(r))}</option>`).join('');
  }

  function applyAccountScope() {
    const isManagement = ACCOUNT_SCOPE === 'management';
    $('managementAccountsPanel').style.display = isManagement ? '' : 'none';
    $('customersAccountsPanel').style.display = isManagement ? 'none' : '';
    $('addUserBtn').style.display = isManagement ? '' : 'none';
    document.querySelectorAll('.account-scope-btn').forEach(btn => {
      const active = btn.dataset.accountScope === ACCOUNT_SCOPE;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function accountActionButtons(u) {
    return `<button class="btn btn-outline btn-sm user-pw" data-id="${u.id}" data-name="${esc(u.full_name)}">${t('admin.accounts.password')}</button>
            <button class="btn btn-outline btn-sm user-edit" data-id="${u.id}">${t('admin.accounts.edit')}</button>`;
  }

  function bindAccountRowActions(body) {
    body.querySelectorAll('select[data-user-role]').forEach(sel => sel.addEventListener('change', async () => {
      try {
        await SavoriaAPI.patchAdminUser(sel.dataset.userRole, { role: sel.value });
        toast('success', t('admin.accounts.roleUpdated'), `role: ${sel.value}`);
      } catch (err) { toast('error', t('admin.accounts.roleRejected'), translateMessage(err.message)); loadUsers(); }
    }));

    body.querySelectorAll('[data-user-active]').forEach(sw => sw.addEventListener('change', async () => {
      try {
        await SavoriaAPI.patchAdminUser(sw.dataset.userActive, { is_active: sw.checked });
        toast('success', sw.checked ? t('admin.accounts.activate') : t('admin.accounts.deactivate'));
      } catch (err) { toast('error', t('admin.accounts.updateRejected'), translateMessage(err.message)); loadUsers(); }
    }));

    body.querySelectorAll('.user-edit').forEach(b => b.addEventListener('click', () => {
      const u = USERS.find(x => x.id == b.dataset.id); if (!u) return;
      editingUserId = u.id;
      editingUserRole = u.role;
      const customer = isCustomerAccount(u);
      $('userModalTitle').textContent = t('admin.accounts.editTitle');
      $('userModalNote').textContent = u.email;
      $('uName').value = u.full_name; $('uEmail').value = u.email;
      $('uPhone').value = u.phone || '';
      $('uRole').innerHTML = customer
        ? `<option value="customer">${esc(roleLabel('customer'))}</option>`
        : roleOptions(u.role);
      $('uRole').value = u.role;
      $('uRole').disabled = customer;
      $('uRoleLockNote').style.display = customer ? 'block' : 'none';
      $('uRoleGroup').classList.toggle('is-locked', customer);
      $('uPasswordGroup').style.display = 'none';
      openModal('userModal');
    }));

    body.querySelectorAll('.user-pw').forEach(b => b.addEventListener('click', () => {
      $('passwordModalTitle').textContent = t('admin.accounts.setPasswordTitle', { name: b.dataset.name });
      $('pwNew').value = '';
      $('pwApplyBtn').dataset.target = b.dataset.id;
      openModal('passwordModal');
    }));
  }

  function renderManagementTable(list) {
    const body = $('managementTableBody');
    if (!list.length) { body.innerHTML = emptyAccountRow(7, t('admin.accounts.none')); return; }
    body.innerHTML = list.map(u => {
      const isSelf = String(u.id) === String(user.id);
      return `
      <tr>
        <td><strong>${esc(u.full_name)}</strong>${isSelf ? ` <span class="mgmt-note">${t('admin.accounts.you')}</span>` : ''}<br>
          <span class="badge-role ${esc(u.role)}">${esc(roleLabel(u.role))}</span></td>
        <td class="ltr-value">${esc(u.email)}</td>
        <td class="ltr-value">${esc(u.phone || t('common.notAvailable'))}</td>
        <td><select data-user-role="${u.id}" ${isSelf ? `disabled title="${esc(t('admin.accounts.selfDemote'))}"` : ''}
              style="padding:0.3rem 0.4rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-surface);color:var(--text-primary);font-size:0.82rem;">
            ${roleOptions(u.role)}</select></td>
        <td>${isSelf ? `<span class="mgmt-note">${t('common.activeLabel')}</span>` : `<label class="switch"><input type="checkbox" data-user-active="${u.id}" ${u.is_active ? 'checked' : ''}><span class="slider"></span></label>`}</td>
        <td class="mgmt-note">${fmtDT(u.created_at)}</td>
        <td style="white-space:nowrap;">${accountActionButtons(u)}</td>
      </tr>`;
    }).join('');
    bindAccountRowActions(body);
  }

  function renderCustomersTable(list) {
    const body = $('customersTableBody');
    if (!list.length) { body.innerHTML = emptyAccountRow(6, t('admin.accounts.noCustomers')); return; }
    body.innerHTML = list.map(u => {
      const isSelf = String(u.id) === String(user.id);
      return `
      <tr>
        <td><strong>${esc(u.full_name)}</strong>${isSelf ? ` <span class="mgmt-note">${t('admin.accounts.you')}</span>` : ''}<br>
          <span class="badge-role customer">${esc(roleLabel('customer'))}</span></td>
        <td class="ltr-value">${esc(u.email)}</td>
        <td class="ltr-value">${esc(u.phone || t('common.notAvailable'))}</td>
        <td>${u.is_active
          ? `<label class="switch"><input type="checkbox" data-user-active="${u.id}" checked><span class="slider"></span></label>`
          : `<label class="switch"><input type="checkbox" data-user-active="${u.id}"><span class="slider"></span></label>`}</td>
        <td class="mgmt-note">${fmtDT(u.created_at)}</td>
        <td style="white-space:nowrap;">${accountActionButtons(u)}</td>
      </tr>`;
    }).join('');
    bindAccountRowActions(body);
  }

  async function loadUsers() {
    if (!can('accounts')) return;
    try {
      USERS = await SavoriaAPI.getAdminUsers();
      renderAccountPanels();
    } catch (err) {
      const message = t('admin.accounts.couldNotLoad', { message: esc(translateMessage(err.message)) });
      $('managementTableBody').innerHTML = emptyAccountRow(7, message);
      $('customersTableBody').innerHTML = emptyAccountRow(6, message);
    }
  }

  function renderAccountPanels() {
    const management = USERS.filter(u => !isCustomerAccount(u));
    const customers = USERS.filter(isCustomerAccount);
    $('managementCount').textContent = fmtNum(management.length);
    $('customersCount').textContent = fmtNum(customers.length);

    const filter = $('usersFilter').value.trim().toLowerCase();
    const matches = (u) => !filter || [u.full_name, u.email, u.role, u.phone]
      .some(v => String(v || '').toLowerCase().includes(filter));

    renderManagementTable(management.filter(matches));
    renderCustomersTable(customers.filter(matches));
    applyAccountScope();
  }

  document.querySelectorAll('.account-scope-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ACCOUNT_SCOPE = btn.dataset.accountScope === 'customers' ? 'customers' : 'management';
      applyAccountScope();
    });
  });

  $('usersFilter').addEventListener('input', renderAccountPanels);

  $('addUserBtn').addEventListener('click', () => {
    editingUserId = null;
    editingUserRole = null;
    $('userModalTitle').textContent = t('admin.accounts.createTitle');
    $('userModalNote').textContent = t('admin.accounts.createNote');
    ['uName', 'uEmail', 'uPhone', 'uPassword'].forEach(id => $(id).value = '');
    $('uPasswordGroup').style.display = 'block';
    $('uRole').innerHTML = roleOptions('cashier');
    $('uRole').value = 'cashier';
    $('uRole').disabled = false;
    $('uRoleLockNote').style.display = 'none';
    $('uRoleGroup').classList.remove('is-locked');
    openModal('userModal');
  });

  $('uSubmitBtn').addEventListener('click', async () => {
    const name = $('uName').value.trim();
    const email = $('uEmail').value.trim().toLowerCase();
    const phone = $('uPhone').value.trim();
    const password = $('uPassword').value;
    const role = $('uRole').value;
    document.querySelectorAll('.form-error[data-error-for]').forEach(e => e.textContent = '');
    let bad = false;
    if (name.length < 2) { document.querySelector('[data-error-for="uName"]').textContent = t('admin.accounts.nameRequired'); bad = true; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { document.querySelector('[data-error-for="uEmail"]').textContent = t('admin.accounts.emailRequired'); bad = true; }
    if (editingUserId === null) {
      if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        document.querySelector('[data-error-for="uPassword"]').textContent = t('admin.accounts.passwordRequired'); bad = true;
      }
    }
    if (bad) return;

    try {
      if (editingUserId !== null) {
        // A customer's role is fixed: only the profile fields are sent.
        const payload = { full_name: name, email, phone: phone || undefined };
        if (editingUserRole !== 'customer') payload.role = role;
        await SavoriaAPI.patchAdminUser(editingUserId, payload);
        toast('success', t('admin.accounts.accountUpdated'));
      } else {
        await SavoriaAPI.createAdminUser({ full_name: name, email, password, phone: phone || undefined, role });
        toast('success', t('admin.accounts.accountCreated', { role: roleLabel(role) }), t('admin.accounts.accountCreatedNote'));
      }
      closeModal('userModal');
      await loadUsers();
    } catch (err) {
      toast('error', err.status === 409 ? t('admin.accounts.duplicate') : t('admin.toasts.saveFailed'), translateMessage(err.message)
        + (err.errors && Object.keys(err.errors).length ? ' — ' + Object.values(err.errors).map(translateMessage).join(' ') : ''));
    }
  });

  $('pwApplyBtn').addEventListener('click', async () => {
    const password = $('pwNew').value;
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      toast('error', t('admin.accounts.passwordInvalid'));
      return;
    }
    try {
      await SavoriaAPI.setUserPassword($('pwApplyBtn').dataset.target, { password });
      toast('success', t('admin.accounts.passwordSet'));
      closeModal('passwordModal');
    } catch (err) { toast('error', t('admin.accounts.passwordRejected'), translateMessage(err.message)); }
  });

  /* ======================================================
     COUPONS
     ------------------------------------------------------
     Read is open to every management role; cancelling is an
     admin action. A cancellation never deletes the row — the
     code, owner, value and reason stay on record forever, and
     the lifecycle log keeps every step.
     ====================================================== */
  let COUPON_ROWS = [];

  function couponStatusPill(status, isActive) {
    const colors = {
      available: 'var(--color-success)',
      reserved: 'var(--color-terracotta)',
      used: 'var(--text-secondary)',
      cancelled: 'var(--color-error)',
      expired: 'var(--text-secondary)',
    };
    const activeBadge = (isActive === 0 || isActive === false)
      ? ` <span style="display:inline-block;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.68rem;background:rgba(179,38,30,0.1);color:var(--color-error);font-weight:700;">${I18N && I18N.getLang() === 'ar' ? 'معطّل' : 'Inactive'}</span>`
      : '';
    return `<span style="display:inline-block;padding:0.15rem 0.55rem;border-radius:999px;font-size:0.72rem;font-weight:700;white-space:nowrap;color:${colors[status] || 'inherit'};border:1px solid currentColor;">${esc(t('couponStatus.' + status))}</span>${activeBadge}`;
  }

  function renderCouponTable(rows) {
    const body = $('couponsTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="10" class="empty-state">${t('admin.coupons.empty')}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(c => {
      const canCancel = can('promos', 'edit') && c.status === 'available';
      const isActive = c.is_active !== 0 && c.is_active !== false;
      const discountFormatted = c.discount_type === 'percent'
        ? `<strong style="color:var(--color-success);font-size:1.05rem;">${c.value}%</strong>`
        : `<strong style="color:var(--color-success);font-size:1.05rem;">${fmtSar(c.value)}</strong>`;
      
      const usageFormatted = c.max_uses
        ? `${fmtNum(c.used_count || 0)} / ${fmtNum(c.max_uses)}`
        : `${fmtNum(c.used_count || (c.status === 'used' ? 1 : 0))} / <span style="font-size:1.1rem;line-height:1;">∞</span>`;

      const ownerFormatted = c.phone
        ? `<div>${esc(c.customer_name || '')}</div><div class="mgmt-note ltr-value">${esc(c.phone)}</div>`
        : `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:var(--bg-surface-alt);font-size:0.78rem;color:var(--text-secondary);font-weight:600;">${I18N && I18N.getLang() === 'ar' ? 'عام (للجميع)' : 'Public (All)'}</span>`;

      const titleFormatted = c.title
        ? `<div style="font-weight:600;font-size:0.88rem;">${esc(c.title)}</div>${c.min_order_amount > 0 ? `<div class="mgmt-note">${t('admin.coupons.minOrderLabel')}: ${fmtSar(c.min_order_amount)}</div>` : ''}`
        : (c.min_order_amount > 0 ? `<div class="mgmt-note">${t('admin.coupons.minOrderLabel')}: ${fmtSar(c.min_order_amount)}</div>` : '<span style="color:var(--text-secondary);">—</span>');

      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:6px;">
              <code class="ltr-value" style="font-weight:700;font-size:0.92rem;color:var(--color-terracotta);">${esc(c.code)}</code>
              <button type="button" class="btn btn-outline btn-sm" style="padding:1px 6px;font-size:0.75rem;" data-coupon-copy="${esc(c.code)}" title="${esc(t('admin.coupons.copyBtn'))}">📋</button>
            </div>
          </td>
          <td>${titleFormatted}</td>
          <td>${discountFormatted}</td>
          <td>${couponStatusPill(c.status, c.is_active)}</td>
          <td><span style="font-weight:600;font-size:0.85rem;">${usageFormatted}</span></td>
          <td>${ownerFormatted}</td>
          <td class="mgmt-note">${c.expires_at ? fmtDT(c.expires_at) : '—'}</td>
          <td style="font-size:0.8rem;">${c.issued_for_order_id
            ? t('admin.coupons.sourceOrder', { order: fmtNum(c.issued_invoice_number || c.issued_for_order_id) })
            : t('admin.coupons.sourceAdmin')}</td>
          <td class="mgmt-note">${fmtDT(c.created_at)}</td>
          <td style="white-space:nowrap;text-align:end;">
            <button class="btn btn-outline btn-sm" data-coupon-toggle="${c.id}" data-active="${isActive ? 1 : 0}">
              ${isActive ? (I18N && I18N.getLang() === 'ar' ? 'تعطيل' : 'Disable') : (I18N && I18N.getLang() === 'ar' ? 'تفعيل' : 'Enable')}
            </button>
            <button class="btn btn-outline btn-sm" data-coupon-log="${c.id}">${t('admin.coupons.history')}</button>
            ${canCancel ? `<button class="btn btn-outline btn-sm" data-coupon-cancel="${c.id}" data-coupon-code="${esc(c.code)}">${t('admin.coupons.cancel')}</button>` : ''}
            ${can('promos', 'edit') ? `<button class="btn btn-outline btn-sm" style="color:var(--color-error);" data-coupon-delete="${c.id}" data-coupon-code="${esc(c.code)}">🗑️</button>` : ''}
          </td>
        </tr>
        <tr data-coupon-log-row="${c.id}" style="display:none;">
          <td colspan="10" style="background:var(--bg-surface-alt);"></td>
        </tr>`;
    }).join('');
  }

  async function toggleCouponLog(id) {
    const cell = document.querySelector(`[data-coupon-log-row="${id}"] td`);
    const row = document.querySelector(`[data-coupon-log-row="${id}"]`);
    if (!cell || !row) return;
    if (row.style.display !== 'none') { row.style.display = 'none'; return; }

    cell.innerHTML = `<div class="mgmt-note" style="padding:10px 6px;">${t('common.loading')}</div>`;
    row.style.display = 'table-row';

    try {
      const data = await SavoriaAPI.getAdminCoupon(id);
      const events = data.events || [];
      cell.innerHTML = `
        <div style="padding:10px 6px;">
          <div style="font-weight:700;margin-bottom:6px;">${esc(t('admin.coupons.historyTitle', { code: data.coupon.code }))}</div>
          ${events.length ? `<ol style="margin:0;padding-inline-start:18px;font-size:0.82rem;line-height:1.7;">
            ${events.map(e => `<li>
              <strong>${esc(t('couponEvent.' + e.event))}</strong>
              <span class="mgmt-note">· ${fmtDT(e.created_at)}${e.order_id ? ` · ${t('admin.coupons.orderRef', { id: e.order_id })}` : ''}${e.actor_name ? ` · ${esc(e.actor_name)}` : ''}</span>
              ${e.notes ? `<div class="mgmt-note">${esc(e.notes)}</div>` : ''}
            </li>`).join('')}
          </ol>` : `<div class="mgmt-note">${t('admin.coupons.noHistory')}</div>`}
        </div>`;
    } catch (err) {
      cell.innerHTML = `<div class="mgmt-note" style="padding:10px 6px;">${esc(translateMessage(err.message))}</div>`;
    }
  }

  async function cancelCoupon(id, code) {
    const { reason } = await confirmAction({
      title: t('admin.coupons.cancelTitle'),
      message: t('admin.coupons.cancelMessage', { code: esc(code) }),
      reasonRequired: true,
      danger: true,
      placeholder: t('admin.coupons.cancelReason'),
    });
    if (!reason) {
      toast('error', t('admin.coupons.reasonRequired'));
      return;
    }
    try {
      await SavoriaAPI.cancelAdminCoupon(id, reason);
      toast('success', t('admin.coupons.cancelled'), code);
      await loadCoupons();
    } catch (err) {
      toast('error', t('admin.toasts.saveFailed'), translateMessage(err.message));
    }
  }

  async function deleteCoupon(id, code) {
    const confirmed = await confirmAction({
      title: t('admin.coupons.deleteBtn'),
      message: t('admin.coupons.deleteConfirm', { code: esc(code) }),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await SavoriaAPI.deleteAdminCoupon(id);
      toast('success', t('admin.coupons.deletedSuccess'));
      await loadCoupons();
    } catch (err) {
      toast('error', t('admin.toasts.saveFailed'), translateMessage(err.message));
    }
  }

  async function toggleCouponActive(id, currentActive) {
    try {
      const newActive = currentActive ? 0 : 1;
      await SavoriaAPI.toggleAdminCouponActive(id, newActive);
      toast('success', t('admin.coupons.toggleActive'));
      await loadCoupons();
    } catch (err) {
      toast('error', t('admin.toasts.saveFailed'), translateMessage(err.message));
    }
  }

  async function loadCoupons() {
    const search = $('couponsSearch').value.trim();
    const status = $('couponsStatusFilter').value;
    const params = {};
    if (search) params.search = search;
    if (status) params.status = status;

    const data = await SavoriaAPI.getAdminCoupons(params);
    COUPON_ROWS = data.coupons || [];
    const s = data.stats || {};

    $('couponStats').innerHTML = `
      <div class="stat-card"><div class="stat-label">${t('admin.coupons.statTotal')}</div><div class="stat-value">${fmtNum(s.total || 0)}</div></div>
      <div class="stat-card"><div class="stat-label">${t('admin.coupons.statAvailable')}</div><div class="stat-value">${fmtNum(s.available || 0)}</div></div>
      <div class="stat-card"><div class="stat-label">${t('admin.coupons.statUsed')}</div><div class="stat-value">${fmtNum(s.used || 0)}</div></div>
      <div class="stat-card"><div class="stat-label">${t('admin.coupons.statCancelled')}</div><div class="stat-value">${fmtNum(s.cancelled || 0)}</div></div>
      <div class="stat-card"><div class="stat-label">${t('admin.coupons.statGranted')}</div><div class="stat-value" style="font-size:1.3rem;">${fmtSar(s.granted_value || 0)}</div></div>
      <div class="stat-card"><div class="stat-label">${t('admin.coupons.statConsumed')}</div><div class="stat-value" style="font-size:1.3rem;">${fmtSar(s.used_value || 0)}</div></div>
    `;

    renderCouponTable(COUPON_ROWS);
    $('couponsLastUpdate').textContent = t('admin.coupons.updatedAt', { time: new Date().toLocaleTimeString() });
  }

  $('couponsRefreshBtn')?.addEventListener('click', () => {
    loadCoupons().catch(err => toast('error', t('admin.toasts.loadFailed'), translateMessage(err.message)));
  });
  $('couponsStatusFilter')?.addEventListener('change', () => {
    loadCoupons().catch(err => toast('error', t('admin.toasts.loadFailed'), translateMessage(err.message)));
  });
  let couponSearchTimer = null;
  $('couponsSearch')?.addEventListener('input', () => {
    clearTimeout(couponSearchTimer);
    couponSearchTimer = setTimeout(() => {
      loadCoupons().catch(err => toast('error', t('admin.toasts.loadFailed'), translateMessage(err.message)));
    }, 300);
  });
  $('couponsTableBody')?.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('[data-coupon-copy]');
    if (copyBtn) {
      navigator.clipboard?.writeText(copyBtn.dataset.couponCopy);
      toast('success', t('admin.coupons.copied'), copyBtn.dataset.couponCopy);
      return;
    }
    const toggleBtn = e.target.closest('[data-coupon-toggle]');
    if (toggleBtn) {
      toggleCouponActive(Number(toggleBtn.dataset.couponToggle), Number(toggleBtn.dataset.active));
      return;
    }
    const deleteBtn = e.target.closest('[data-coupon-delete]');
    if (deleteBtn) {
      deleteCoupon(Number(deleteBtn.dataset.couponDelete), deleteBtn.dataset.couponCode);
      return;
    }
    const logBtn = e.target.closest('[data-coupon-log]');
    if (logBtn) { toggleCouponLog(Number(logBtn.dataset.couponLog)); return; }
    const cancelBtn = e.target.closest('[data-coupon-cancel]');
    if (cancelBtn) cancelCoupon(Number(cancelBtn.dataset.couponCancel), cancelBtn.dataset.couponCode);
  });

  // Modal & Creation
  $('addCouponBtn')?.addEventListener('click', () => {
    $('coupCode').value = '';
    $('coupTitle').value = '';
    $('coupDiscountType').value = 'fixed';
    $('coupValue').value = '';
    $('coupMinOrder').value = '';
    $('coupMaxUses').value = '';
    $('coupPhone').value = '';
    $('coupCustomerName').value = '';
    $('coupExpires').value = '';
    $('coupIsActive').checked = true;
    $('couponAlert').className = 'auth-alert';
    $('couponAlert').textContent = '';
    openModal('couponModal');
  });

  $('genCouponCodeBtn')?.addEventListener('click', () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'SAV-';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    $('coupCode').value = code;
  });

  $('saveCouponBtn')?.addEventListener('click', async () => {
    const btn = $('saveCouponBtn');
    const alertBox = $('couponAlert');
    alertBox.className = 'auth-alert';
    alertBox.textContent = '';

    const val = Number($('coupValue').value);
    if (!val || val <= 0) {
      alertBox.className = 'auth-alert error show';
      alertBox.textContent = t('admin.coupons.valueLabel') + ' is required and must be > 0';
      return;
    }

    const payload = {
      code: $('coupCode').value.trim() || undefined,
      title: $('coupTitle').value.trim() || undefined,
      discount_type: $('coupDiscountType').value,
      value: val,
      min_order_amount: Number($('coupMinOrder').value) || 0,
      max_uses: Number($('coupMaxUses').value) || 0,
      phone: $('coupPhone').value.trim() || undefined,
      customer_name: $('coupCustomerName').value.trim() || undefined,
      expires_at: $('coupExpires').value ? $('coupExpires').value + ' 23:59:59' : undefined,
      is_active: $('coupIsActive').checked ? 1 : 0,
    };

    btn.disabled = true;
    try {
      const res = await SavoriaAPI.createAdminCoupon(payload);
      const code = res.data?.code || res.coupon?.code || payload.code;
      toast('success', t('admin.coupons.createdSuccess', { code }));
      closeModal('couponModal');
      await loadCoupons();
    } catch (err) {
      alertBox.className = 'auth-alert error show';
      alertBox.textContent = translateMessage(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  /* ======================================================
     COUPON SETTINGS
     ====================================================== */
  function updateCouponPreview() {
    const out = $('couponPreviewText');
    if (!out) return;
    const enabled = !!$('lsEnabled')?.checked;
    const percent = Number($('lsCouponPercent')?.value) || 0;
    const minInvoice = Number($('lsEarnMin')?.value) || 0;
    const bill = Number($('lsPreviewBill')?.value) || 0;

    if (!enabled) {
      out.textContent = t('admin.settings.previewPaused');
      return;
    }
    if (percent <= 0 || bill < minInvoice) {
      out.textContent = t('admin.settings.previewBelowMin');
      return;
    }
    out.textContent = t('admin.settings.previewResult', {
      bill: fmtSar(bill),
      amount: fmtSar(Math.round(bill * percent) / 100),
    });
  }

  function updateVatNote() {
    const out = $('vatRateNote');
    if (!out) return;
    const rate = Number($('lsVatRate')?.value);
    const shown = Number.isFinite(rate) ? rate : 15;
    out.textContent = t('admin.settings.vatRateNote', { rate: shown });
  }

  async function loadSettings() {
    if (!can('settings')) return;
    try {
      LOYALTY_SETTINGS = await SavoriaAPI.getLoyaltySettings();
      $('lsEnabled').checked = !!LOYALTY_SETTINGS.enabled;
      $('lsCouponPercent').value = LOYALTY_SETTINGS.coupon_percent ?? 10;
      $('lsEarnMin').value = LOYALTY_SETTINGS.earn_min_order_amount ?? 0;
      $('lsMaxCoupons').value = LOYALTY_SETTINGS.max_coupons_per_order ?? 0;
      if ($('lsVatRate')) $('lsVatRate').value = LOYALTY_SETTINGS.vat_rate ?? 15.00;
      updateCouponPreview();
      updateVatNote();
    } catch (err) { toast('error', t('admin.toasts.settingsLoadFailed'), translateMessage(err.message)); }
  }

  ['lsEnabled', 'lsCouponPercent', 'lsEarnMin', 'lsPreviewBill'].forEach(id => {
    $(id)?.addEventListener('input', updateCouponPreview);
    $(id)?.addEventListener('change', updateCouponPreview);
  });

  $('lsVatRate')?.addEventListener('input', updateVatNote);
  $('lsVatRate')?.addEventListener('change', updateVatNote);

  $('saveSettingsBtn').addEventListener('click', async () => {
    const percent = Number($('lsCouponPercent').value);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      toast('error', t('admin.settings.invalidPercent'), t('admin.settings.invalidPercentDetail'));
      return;
    }
    const minInvoice = Number($('lsEarnMin').value);
    if (isNaN(minInvoice) || minInvoice < 0) {
      toast('error', t('admin.settings.invalidCoupon'));
      return;
    }
    const maxCoupons = Number($('lsMaxCoupons').value) || 0;
    if (maxCoupons < 0) {
      toast('error', t('admin.settings.invalidCoupon'));
      return;
    }
    const vatRate = $('lsVatRate') ? Number($('lsVatRate').value) : 15;
    if (isNaN(vatRate) || vatRate < 0 || vatRate > 100) {
      toast('error', t('admin.settings.invalidVatRate'), t('admin.settings.invalidVatRateDetail'));
      return;
    }

    const body = {
      enabled: $('lsEnabled').checked,
      coupon_percent: percent,
      earn_min_order_amount: minInvoice,
      max_coupons_per_order: maxCoupons,
      vat_rate: vatRate,
    };
    try {
      LOYALTY_SETTINGS = await SavoriaAPI.updateLoyaltySettings(body);
      toast('success', t('admin.settings.saved'), t('admin.settings.savedDetail'));
      await loadSettings();
      loadOverview().catch(() => {});
    } catch (err) { toast('error', t('admin.toasts.saveFailed'), translateMessage(err.message)); }
  });

  /* ======================================================
     TABLES & QR CODES
     Every table gets its own unguessable QR token. The QR encodes a
     link carrying only that token — never the table number — so a
     printed code can be scanned but never edited into another table.
     ====================================================== */
  let TABLE_ROWS = [];
  let EDITING_TABLE_ID = null;

  /* The QR always points at the customer menu of the same deployment
     (handles sub-folder installs), carrying the table's token. */
  function tableMenuUrl(token) {
    const dir = location.origin + location.pathname.replace(/[^/]*$/, '');
    return `${dir}index.html?t=${encodeURIComponent(token)}`;
  }

  /* The vendored qrcode-generator library exposes the `qrcode` global. */
  function buildQr(text) {
    if (typeof window.qrcode !== 'function') return null;
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr;
    } catch (_) { return null; }
  }

  function qrSvg(text, cellSize = 4, margin = 2) {
    const qr = buildQr(text);
    if (!qr) return '';
    return qr.createSvgTag({ cellSize, margin, scalable: true });
  }

  /* A real PNG built on a canvas, so the downloaded file matches its
     .png name (the library's own helper emits a GIF data URL). */
  function qrPngDataUrl(text, scale = 8, margin = 4) {
    const qr = buildQr(text);
    if (!qr) return '';
    const count = qr.getModuleCount();
    const size = (count + margin * 2) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < count; r += 1) {
      for (let c = 0; c < count; c += 1) {
        if (qr.isDark(r, c)) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
      }
    }
    try { return canvas.toDataURL('image/png'); } catch (_) { return ''; }
  }

  function restaurantName() {
    const st = window.SavoriaContent && window.SavoriaContent.state;
    const isAr = I18N && I18N.getLang() === 'ar';
    const fromState = st
      ? (isAr ? (st.settings_ar?.restaurant_name || st.settings?.restaurant_name) : st.settings?.restaurant_name)
      : '';
    return fromState || document.querySelector('.nav-logo img')?.alt || 'Tarmez';
  }

  function tableDisplayName(row) {
    const name = localize(row, 'label');
    return (typeof name === 'string' && name.trim() !== '') ? name : t('admin.tables.noName');
  }

  function tableStatusBadge(row) {
    if (row.status === 'disabled') {
      return `<span class="table-badge is-disabled">${esc(t('admin.tables.statusDisabled'))}</span>`;
    }
    const open = Number(row.open_orders || 0);
    if (open > 0) {
      return `<span class="table-badge is-busy">${esc(t('admin.tables.statusBusy', { count: fmtNum(open) }))}</span>`;
    }
    return `<span class="table-badge is-free">${esc(t('admin.tables.statusFree'))}</span>`;
  }

  function renderTablesGrid(rows) {
    const grid = $('tablesGrid');
    if (!grid) return;
    const filter = ($('tablesSearch')?.value || '').trim().toLowerCase();

    const visible = rows.filter((row) => {
      if (!filter) return true;
      const haystack = `${row.table_number} ${row.label || ''} ${row.label_ar || ''}`.toLowerCase();
      return haystack.includes(filter);
    });

    if (!visible.length) {
      grid.innerHTML = `<div class="empty-state">${esc(t(rows.length ? 'admin.tables.emptyFilter' : 'admin.tables.empty'))}</div>`;
      return;
    }

    grid.innerHTML = visible.map((row) => {
      const active = row.status === 'active';
      const url = tableMenuUrl(row.qr_token);
      const svg = qrSvg(url, 4, 2) || `<div class="table-qr-fallback">${esc(t('admin.tables.qrUnavailable'))}</div>`;
      return `
        <article class="table-card${active ? '' : ' is-disabled'}" data-table-id="${row.id}">
          <div class="table-card-qr">${svg}</div>
          <div class="table-card-body">
            <div class="table-card-head">
              <span class="table-card-number">${esc(t('admin.tables.thNumber'))} ${esc(fmtNum(row.table_number))}</span>
              ${tableStatusBadge(row)}
            </div>
            <div class="table-card-name">${esc(tableDisplayName(row))}</div>
            <div class="table-card-meta">${esc(t('admin.tables.seatsValue', { count: fmtNum(row.seats) }))}${row.last_order_at ? ' · ' + esc(t('admin.tables.lastActivity', { time: fmtDT(row.last_order_at) })) : ''}</div>
            <div class="table-card-actions">
              <button type="button" class="btn btn-outline btn-sm" data-table-edit>${esc(t('admin.tables.edit'))}</button>
              <button type="button" class="btn btn-outline btn-sm" data-table-toggle>${esc(t(active ? 'admin.tables.disable' : 'admin.tables.enable'))}</button>
              <button type="button" class="btn btn-outline btn-sm" data-table-download>${esc(t('admin.tables.download'))}</button>
              <button type="button" class="btn btn-outline btn-sm" data-table-print>${esc(t('admin.tables.print'))}</button>
              <button type="button" class="btn btn-outline btn-sm" data-table-copy>${esc(t('admin.tables.copyLink'))}</button>
              <button type="button" class="btn btn-outline btn-sm danger" data-table-delete>${esc(t('admin.tables.delete'))}</button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  async function loadTables() {
    if (!can('tables')) return;
    try {
      const data = await SavoriaAPI.getAdminTables();
      TABLE_ROWS = data?.tables || [];
      renderTablesGrid(TABLE_ROWS);
    } catch (err) {
      $('tablesGrid').innerHTML = `<div class="empty-state">${esc(t('admin.tables.loadFailed'))} — ${esc(translateMessage(err.message))}</div>`;
    }
  }

  function tableById(id) {
    return TABLE_ROWS.find((row) => Number(row.id) === Number(id)) || null;
  }

  function openTableModal(row) {
    EDITING_TABLE_ID = row ? Number(row.id) : null;
    const alertBox = $('tableAlert');
    alertBox.className = 'auth-alert';
    alertBox.textContent = '';

    $('tableModalTitle').textContent = row
      ? t('admin.tables.modalEditTitle', { number: fmtNum(row.table_number) })
      : t('admin.tables.modalAddTitle');

    $('tableNumber').value = row ? row.table_number : '';
    $('tableLabel').value = row ? (row.label || '') : '';
    $('tableLabelAr').value = row ? (row.label_ar || '') : '';
    $('tableSeats').value = row ? row.seats : 4;
    $('tableStatus').value = row ? row.status : 'active';

    const qrBlock = $('tableQrBlock');
    if (row) {
      qrBlock.style.display = 'block';
      const url = tableMenuUrl(row.qr_token);
      $('tableQrPreview').innerHTML = qrSvg(url, 5, 3) || esc(t('admin.tables.qrUnavailable'));
    } else {
      qrBlock.style.display = 'none';
      $('tableQrPreview').innerHTML = '';
    }

    openModal('tableModal');
  }

  $('addTableBtn')?.addEventListener('click', () => openTableModal(null));
  $('tablesRefreshBtn')?.addEventListener('click', () => {
    loadTables().catch(err => toast('error', t('admin.tables.loadFailed'), translateMessage(err.message)));
  });
  $('tablesSearch')?.addEventListener('input', () => renderTablesGrid(TABLE_ROWS));
  $('tablesPrintAllBtn')?.addEventListener('click', () => {
    if (!TABLE_ROWS.length) { toast('error', t('admin.tables.empty')); return; }
    printTableCards(TABLE_ROWS);
  });

  $('tablesGrid')?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-table-id]');
    if (!card) return;
    const row = tableById(card.dataset.tableId);
    if (!row) return;
    if (e.target.closest('[data-table-edit]')) { openTableModal(row); return; }
    if (e.target.closest('[data-table-toggle]')) { toggleTableStatus(row); return; }
    if (e.target.closest('[data-table-delete]')) { deleteTable(row); return; }
    if (e.target.closest('[data-table-copy]')) { copyTableLink(row); return; }
    if (e.target.closest('[data-table-download]')) { downloadTableQr(row); return; }
    if (e.target.closest('[data-table-print]')) { printTableCards([row]); return; }
  });

  $('saveTableBtn')?.addEventListener('click', async () => {
    const btn = $('saveTableBtn');
    const alertBox = $('tableAlert');
    alertBox.className = 'auth-alert';
    alertBox.textContent = '';

    const number = Number($('tableNumber').value);
    if (!number || number < 1 || number > 255) {
      alertBox.className = 'auth-alert error show';
      alertBox.textContent = t('admin.tables.numberNote');
      return;
    }

    const payload = {
      table_number: number,
      label: $('tableLabel').value.trim(),
      label_ar: $('tableLabelAr').value.trim(),
      seats: Number($('tableSeats').value) || 4,
      status: $('tableStatus').value,
    };

    btn.disabled = true;
    try {
      if (EDITING_TABLE_ID) {
        await SavoriaAPI.updateAdminTable(EDITING_TABLE_ID, payload);
        toast('success', t('admin.tables.savedUpdated'), t('admin.tables.thNumber') + ' ' + fmtNum(number));
      } else {
        await SavoriaAPI.createAdminTable(payload);
        toast('success', t('admin.tables.savedCreated'), t('admin.tables.thNumber') + ' ' + fmtNum(number));
      }
      closeModal('tableModal');
      await loadTables();
    } catch (err) {
      alertBox.className = 'auth-alert error show';
      alertBox.textContent = translateMessage(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  $('tableQrDownloadBtn')?.addEventListener('click', () => {
    const row = tableById(EDITING_TABLE_ID);
    if (row) downloadTableQr(row);
  });
  $('tableQrPrintBtn')?.addEventListener('click', () => {
    const row = tableById(EDITING_TABLE_ID);
    if (row) printTableCards([row]);
  });
  $('tableQrCopyBtn')?.addEventListener('click', () => {
    const row = tableById(EDITING_TABLE_ID);
    if (row) copyTableLink(row);
  });

  async function toggleTableStatus(row) {
    const active = row.status === 'active';
    const confirmed = await confirmAction({
      title: t(active ? 'admin.tables.disableTitle' : 'admin.tables.enableTitle'),
      message: esc(t(active ? 'admin.tables.disableMessage' : 'admin.tables.enableMessage')),
      reasonRequired: false,
      danger: active,
    });
    if (!confirmed) return;
    try {
      await SavoriaAPI.updateAdminTable(row.id, { status: active ? 'disabled' : 'active' });
      toast('success', t(active ? 'admin.tables.disabledMsg' : 'admin.tables.enabledMsg'));
      await loadTables();
    } catch (err) {
      toast('error', t('admin.tables.statusFailed'), translateMessage(err.message));
    }
  }

  async function deleteTable(row) {
    const confirmed = await confirmAction({
      title: t('admin.tables.deleteTitle'),
      message: esc(t('admin.tables.deleteMessage')),
      reasonRequired: false,
      danger: true,
    });
    if (!confirmed) return;
    try {
      await SavoriaAPI.deleteAdminTable(row.id);
      toast('success', t('admin.tables.deleted'), t('admin.tables.thNumber') + ' ' + fmtNum(row.table_number));
      await loadTables();
    } catch (err) {
      toast('error', t('admin.tables.deleteFailed'), translateMessage(err.message));
    }
  }

  function copyTableLink(row) {
    const url = tableMenuUrl(row.qr_token);
    const done = () => toast('success', t('admin.tables.linkCopied', { number: fmtNum(row.table_number) }), url);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => window.prompt('', url));
    } else {
      window.prompt('', url);
    }
  }

  function downloadTableQr(row) {
    const dataUrl = qrPngDataUrl(tableMenuUrl(row.qr_token), 10, 4);
    if (!dataUrl) { toast('error', t('admin.tables.qrUnavailable')); return; }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `table-${row.table_number}-qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* Printable cards: name, table number, the QR and a short instruction.
     Saving the print dialog as PDF gives the whole set in one file. */
  function printTableCards(rows) {
    const win = window.open('', '_blank');
    if (!win) { toast('error', t('admin.tables.popupBlocked')); return; }
    const name = restaurantName();
    const cards = rows.map((row) => {
      const svg = qrSvg(tableMenuUrl(row.qr_token), 4, 2);
      const label = (typeof localize(row, 'label') === 'string' && localize(row, 'label').trim() !== '')
        ? `<div class="tbl-label">${esc(localize(row, 'label'))}</div>` : '';
      return `
        <div class="qr-card">
          <div class="qr-card-brand">${esc(name)}</div>
          <div class="qr-card-number">${esc(t('admin.tables.printFooter', { number: fmtNum(row.table_number) }))}</div>
          <div class="qr-card-code">${svg}</div>
          ${label}
          <div class="qr-card-instruction">${esc(t('admin.tables.printInstruction'))}</div>
        </div>`;
    }).join('');

    win.document.write(`<!DOCTYPE html>
<html lang="${I18N ? I18N.getLang() : 'en'}" dir="${I18N && I18N.getLang() === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<title>${esc(t('admin.tables.printTitle'))}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #fff; color: #16181d;
    font-family: "Segoe UI", Tahoma, system-ui, sans-serif; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .hint { color: #666; font-size: 12px; margin: 0 0 20px; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
  .qr-card { border: 1.5px dashed #cfd4dc; border-radius: 14px; padding: 22px 18px;
    text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .qr-card-brand { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #8a6d3b; font-weight: 700; }
  .qr-card-number { font-size: 22px; font-weight: 800; margin: 6px 0 12px; }
  .qr-card-code svg { width: 190px; height: 190px; }
  .qr-card-code { display: flex; justify-content: center; }
  .tbl-label { margin-top: 8px; font-weight: 600; }
  .qr-card-instruction { margin-top: 10px; font-size: 13px; color: #444; }
  @media print { body { padding: 10px; } .hint { display: none; } }
</style>
</head>
<body>
  <h1>${esc(t('admin.tables.printTitle'))}</h1>
  <p class="hint">${esc(t('admin.tables.printHint'))}</p>
  <div class="grid">${cards}</div>
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch (_) { /* user can print manually */ } }, 400);
  }

  /* ======================================================
     Boot
     ====================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
    renderClock();

    /* The modal titles are set by JavaScript when a modal opens, so they
       get their translated default here instead of through data-i18n
       (which would overwrite a live title on a language switch). */
    const modalTitles = {
      orderModalTitle: 'common.order',
      confirmTitle: 'common.confirm',
      userModalTitle: 'admin.accounts.createTitle',
      passwordModalTitle: 'admin.accounts.setPassword',
      itemModalTitle: 'admin.menu.addItemTitle',
      categoryModalTitle: 'admin.menu.addCategoryTitle',
      reviewModalTitle: 'admin.content.addReviewTitle',
      tableModalTitle: 'admin.tables.modalAddTitle',
    };
    Object.entries(modalTitles).forEach(([id, key]) => {
      const el = $(id);
      if (el) el.textContent = t(key);
    });

    (async () => {
      const fresh = await refreshMe();
      await handleForcedChange(fresh);
      await window.SavoriaAdminShell?.ready;
      loadOverview().catch(err => toast('error', t('admin.toasts.overviewFailed'), translateMessage(err.message)));
    })();

    /* A language switch re-renders the open tab in the new language
       without losing the manager's place. */
    if (I18N) {
      I18N.onChange(() => {
        const loader = tabLoaders[activeTab];
        if (loader) loader().catch(() => {});
        // The content module is optional (it only draws once its payload
        // is loaded), so it must never stop the rest of the refresh.
        try { window.SavoriaAdminContent?.renderPanel?.(); } catch (_) { /* not loaded yet */ }
        // The counter note is written by JavaScript, so it is refreshed
        // here to follow the new language.
        if (activeTab === 'orders') loadInvoiceCounter();
      });
    }
  });

  function renderClock() { /* reserved — date comes from data themselves */ }
})();
