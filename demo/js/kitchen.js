/* =========================================================
   Tarmez — kitchen screen (kitchen.html)

   Big type for a screen on the kitchen wall: confirmed orders to
   start and orders being cooked, each with its dishes, sizes,
   "spicy" and notes, and a timer that turns amber at 12 minutes
   and red at 25. "Start" and "Ready" move the order on (with
   orders: edit). Refreshes every 10 seconds; chimes on a new order.
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
  let ctx = null;
  let orders = [];
  let known = null;

  function toast(type, msg) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    $('toastStack').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function ticket(o) {
    const m = o.minutes_ago;
    const age = m >= 25 ? 'is-late' : m >= 12 ? 'is-slow' : '';
    const action = !ctx.canEdit ? '' : o.status === 'confirmed'
      ? `<button type="button" class="kit-btn" data-move="preparing">${esc(t('kit.start'))}</button>`
      : `<button type="button" class="kit-btn is-ready" data-move="out_for_delivery">${esc(t('kit.ready'))}</button>`;
    return `
      <article class="kit-ticket ${age}" data-id="${o.id}">
        <header>
          <strong>#${esc(o.order_number || o.id)}</strong>
          <span>${S.typeBadge(o)}</span>
          <span class="kit-timer">${esc(t('kit.min', { m }))}</span>
        </header>
        <ul>
          ${o.items.map((it) => {
            const d = S.dishName(it);
            return `<li><b>${esc(it.quantity)}</b><span>${esc(d.name)}${d.opt ? `<small>${esc(d.opt)}</small>` : ''}${it.is_spicy ? `<em class="kit-spicy">🌶 ${esc(t('ws.spicy'))}</em>` : ''}${it.special_instructions ? `<em>📝 ${esc(it.special_instructions)}</em>` : ''}</span></li>`;
          }).join('')}
        </ul>
        ${o.order_notes ? `<p class="kit-note">📝 ${esc(o.order_notes)}</p>` : ''}
        ${action}
      </article>`;
  }

  function render() {
    const todo = orders.filter((o) => o.status === 'confirmed');
    const cooking = orders.filter((o) => o.status === 'preparing');
    $('kitBoard').innerHTML = `
      <section class="kit-col"><h2>${esc(t('kit.toStart'))} <span>${todo.length}</span></h2>${todo.map(ticket).join('') || `<p class="kit-empty">${esc(t('kit.nothing'))}</p>`}</section>
      <section class="kit-col"><h2>${esc(t('kit.cooking'))} <span>${cooking.length}</span></h2>${cooking.map(ticket).join('') || `<p class="kit-empty">${esc(t('kit.nothing'))}</p>`}</section>`;
  }

  async function refresh() {
    try {
      const res = await S.board();
      orders = (res.orders || []).filter((o) => ['confirmed', 'preparing'].includes(o.status));
      const ids = orders.filter((o) => o.status === 'confirmed').map((o) => o.id);
      if (known && ids.some((id) => !known.has(id))) S.chime();
      known = new Set([...(known || []), ...ids]);
      render();
    } catch (err) { toast('error', tr(err.message)); }
  }

  function soundButton() {
    const on = S.soundOn();
    $('soundBtn').textContent = on ? '🔔' : '🔕';
    $('soundBtn').title = on ? t('ws.soundOn') : t('ws.soundOff');
    $('soundBtn').setAttribute('aria-pressed', String(on));
  }

  async function start() {
    ctx = await S.gate($('kitRoot'));
    if (!ctx) return;
    // the kitchen keeps its room: the menu starts as a narrow icon rail
    S.mountMenu($('kitRoot'), ctx, 'kitchen', { key: 'kitchen', collapsed: true });
    soundButton();
    $('soundBtn').addEventListener('click', () => { S.setSound(!S.soundOn()); soundButton(); });
    $('fullBtn').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    });
    $('kitBoard').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-move]');
      if (!b) return;
      const id = Number(b.closest('.kit-ticket').dataset.id);
      b.disabled = true;
      try { await API.updateOrderStatus(id, b.dataset.move); } catch (err) { toast('error', tr(err.message)); }
      refresh();
    });
    const clock = () => { $('kitClock').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
    clock();
    setInterval(clock, 15000);
    if (I18N && I18N.onChange) I18N.onChange(() => { soundButton(); render(); });
    await refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 10000);
  }

  start();
})();
