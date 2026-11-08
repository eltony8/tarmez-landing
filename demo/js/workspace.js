/* =========================================================
   Tarmez — staff workspace (workspace.html)

   A live order board: New → Confirmed → Preparing → Ready / on the
   way → Done, filtered by type or searched; one big button moves an
   order to its next step. Refreshes every 10 seconds, chimes when a
   new order arrives, and lists today's table reservations.
   People with "orders: view" only see the board without buttons.
   ========================================================= */
(function () {
  'use strict';

  const S = window.SavoriaStaff;
  const API = typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null;
  const I18N = window.SavoriaI18n;
  if (!S || !API) return;
  const { t, esc } = S;
  const $ = (id) => document.getElementById(id);
  const tr = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const EMBED = document.documentElement.classList.contains('is-embed');

  const COLUMNS = [
    { key: 'pending', statuses: ['pending'] },
    { key: 'confirmed', statuses: ['confirmed'] },
    { key: 'preparing', statuses: ['preparing'] },
    { key: 'ready', statuses: ['out_for_delivery'] },
    { key: 'done', statuses: ['delivered', 'cancelled'] },
  ];
  let ctx = null;
  let orders = [];
  let reservations = [];
  let known = null; // ids already seen (to chime on new ones)
  let filter = 'all';
  const busy = new Set();

  function toast(type, msg) {
    const box = $('toastStack');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function matches(o) {
    if (filter !== 'all' && o.order_type !== filter) return false;
    const q = ($('wsSearch').value || '').trim().toLowerCase();
    if (!q) return true;
    return [o.order_number, o.invoice_number, o.id, o.customer_name, o.phone].join(' ').toLowerCase().includes(q);
  }

  function ageClass(o) {
    if (['delivered', 'cancelled'].includes(o.status)) return '';
    const m = o.minutes_in_status;
    return m >= 25 ? 'is-late' : m >= 12 ? 'is-slow' : '';
  }

  function card(o) {
    const next = ctx.canEdit ? S.nextStep(o) : null;
    const items = o.items.map((it) => {
      const d = S.dishName(it);
      return `<li><b>${esc(it.quantity)}×</b> ${esc(d.name)}${d.opt ? ` <small>${esc(d.opt)}</small>` : ''}${it.is_spicy ? ' <span class="ws-spicy" title="' + esc(t('ws.spicy')) + '">🌶</span>' : ''}${it.special_instructions ? `<em>${esc(it.special_instructions)}</em>` : ''}</li>`;
    }).join('');
    return `
      <article class="ws-card ${ageClass(o)} status-${esc(o.status)}" data-id="${o.id}">
        <header>
          <strong class="ws-no">#${esc(o.order_number || o.id)}</strong>
          <span class="ws-type">${S.typeBadge(o)}</span>
          <span class="ws-age" title="${esc(t('ws.inStatus', { m: o.minutes_in_status }))}">⏱ ${esc(t('ws.minutes', { m: o.minutes_ago }))}</span>
        </header>
        <p class="ws-customer">${esc(o.customer_name || '')}${o.phone ? ` · <a href="tel:${esc(o.phone)}" dir="ltr">${esc(o.phone)}</a>` : ''}</p>
        ${o.order_type === 'delivery' && o.delivery_address ? `<p class="ws-address">📍 ${esc(o.delivery_address)}</p>` : ''}
        <ul class="ws-items">${items}</ul>
        ${o.order_notes ? `<p class="ws-note">📝 ${esc(o.order_notes)}</p>` : ''}
        <footer>
          <span class="ws-total">${esc(Number(o.total_amount).toFixed(2))} ${esc(t('ws.sar'))}</span>
          ${o.status === 'cancelled' ? `<span class="ws-pill is-cancelled">${esc(t('status.cancelled'))}</span>` : ''}
          ${o.status === 'delivered' ? `<a class="ws-link" href="invoice.html?order=${o.id}" target="_blank" rel="noopener">${esc(t('invoice.open'))}</a>` : ''}
          ${next ? `<button type="button" class="btn btn-primary btn-sm ws-next" data-next="${next[0]}" ${busy.has(o.id) ? 'disabled' : ''}>${esc(t(next[1]))}</button>` : ''}
          ${ctx.canEdit && ['pending', 'confirmed'].includes(o.status) ? `<button type="button" class="ws-cancel" data-cancel="1" title="${esc(t('ws.actions.cancel'))}" aria-label="${esc(t('ws.actions.cancel'))}">✕</button>` : ''}
        </footer>
      </article>`;
  }

  function render() {
    const visible = orders.filter(matches);
    $('wsBoard').innerHTML = COLUMNS.map((c) => {
      const list = visible.filter((o) => c.statuses.includes(o.status));
      if (c.key === 'done') list.reverse();
      return `
        <section class="ws-col col-${c.key}">
          <h2>${esc(t('ws.columns.' + c.key))} <span class="ws-count">${list.length}</span></h2>
          <div class="ws-col-body">${list.length ? list.map(card).join('') : `<p class="ws-empty">${esc(t('ws.empty'))}</p>`}</div>
        </section>`;
    }).join('');

    const count = (st) => orders.filter((o) => st.includes(o.status)).length;
    $('wsStats').innerHTML = [
      ['🆕', t('ws.columns.pending'), count(['pending']), count(['pending']) ? 'is-alert' : ''],
      ['👨‍🍳', t('ws.inKitchen'), count(['confirmed', 'preparing']), ''],
      ['🛵', t('ws.columns.ready'), count(['out_for_delivery']), ''],
      ['✅', t('ws.doneRecently'), count(['delivered']), ''],
    ].map(([i, l, n, cls]) => `<div class="ws-stat ${cls}"><span>${i}</span><strong>${n}</strong><small>${esc(l)}</small></div>`).join('');

    const pending = count(['pending']);
    document.title = (pending ? `(${pending}) ` : '') + t('ws.title') + ' — Tarmez';
  }

  function renderReservations() {
    const today = new Date().toISOString().slice(0, 10);
    const list = reservations.filter((r) => String(r.reservation_date || '').slice(0, 10) === today && r.status !== 'cancelled')
      .sort((a, b) => String(a.reservation_time).localeCompare(String(b.reservation_time)));
    $('wsReservations').innerHTML = list.length ? list.map((r) => `
      <div class="ws-res status-${esc(r.status)}">
        <strong dir="ltr">${esc(String(r.reservation_time || '').slice(0, 5))}</strong>
        <span>${esc(r.full_name || r.customer_name || '')} · ${esc(t('ws.guests', { n: r.party_size || '' }))}</span>
        <small>${esc(t('status.' + r.status))}</small>
        ${ctx.canEdit && r.status === 'pending' && ctx.perms.reservations === 'edit' ? `<button type="button" class="btn btn-outline btn-sm" data-res-confirm="${r.id}">${esc(t('ws.actions.confirm'))}</button>` : ''}
      </div>`).join('') : `<p class="ws-empty">${esc(t('ws.noReservations'))}</p>`;
  }

  async function refresh() {
    if (document.hidden) return;
    try {
      const res = await S.board();
      orders = res.orders || [];
      const pendingIds = orders.filter((o) => o.status === 'pending').map((o) => o.id);
      if (known) {
        const fresh = pendingIds.filter((id) => !known.has(id));
        if (fresh.length) { S.chime(); toast('success', t('ws.newOrder', { n: fresh.length })); }
      }
      known = new Set([...(known || []), ...pendingIds]);
      render();
    } catch (err) { toast('error', tr(err.message)); }
    if (ctx.perms.reservations && ctx.perms.reservations !== 'none') {
      try { reservations = await API.getAllReservations() || []; renderReservations(); } catch (_) { /* keep the last list */ }
    } else {
      document.querySelector('.ws-side').hidden = true;
    }
  }

  async function move(id, status) {
    busy.add(id);
    render();
    try {
      await API.updateOrderStatus(id, status);
      const o = orders.find((x) => x.id === id);
      toast('success', t('ws.moved', { number: (o && (o.order_number || o.id)) || id, status: S.statusLabel({ ...o, status }) }));
    } catch (err) {
      toast('error', tr(err.message));
    } finally {
      busy.delete(id);
      refresh();
    }
  }

  function soundButton() {
    const on = S.soundOn();
    $('soundBtn').textContent = on ? '🔔 ' + t('ws.soundOn') : '🔕 ' + t('ws.soundOff');
    $('soundBtn').setAttribute('aria-pressed', String(on));
  }

  async function start() {
    ctx = await S.gate($('wsRoot'));
    if (!ctx) return;
    // inside Site Management (admin.html → Order board) the page around it already has the menu and the top bar
    if (EMBED) $('wsFilters').parentElement.appendChild($('soundBtn'));
    else S.mountMenu($('wsRoot'), ctx, 'workspace', { key: 'workspace', collapsed: false });
    soundButton();
    $('soundBtn').addEventListener('click', () => { S.setSound(!S.soundOn()); soundButton(); });
    $('wsFilters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-type]');
      if (!b) return;
      filter = b.dataset.type;
      $('wsFilters').querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
      render();
    });
    $('wsSearch').addEventListener('input', render);
    $('wsBoard').addEventListener('click', async (e) => {
      const cardEl = e.target.closest('.ws-card');
      if (!cardEl) return;
      const id = Number(cardEl.dataset.id);
      const next = e.target.closest('[data-next]');
      if (next) { move(id, next.dataset.next); return; }
      if (e.target.closest('[data-cancel]') && window.confirm(t('ws.cancelConfirm'))) move(id, 'cancelled');
    });
    $('wsReservations').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-res-confirm]');
      if (!b) return;
      b.disabled = true;
      try { await API.updateReservationStatus(Number(b.dataset.resConfirm), 'confirmed'); refresh(); } catch (err) { toast('error', tr(err.message)); b.disabled = false; }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    if (I18N && I18N.onChange) I18N.onChange(() => { soundButton(); render(); renderReservations(); });
    await refresh();
    setInterval(refresh, 10000);
  }

  start();
})();
