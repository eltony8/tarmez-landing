/* =========================================================
   Tarmez — Site Management → loyalty points & discount codes
   js/admin-loyalty.js

   · Coupon Settings tab: the points rules (every X SAR = Y points,
     welcome points, value of a point, minimum to use, most of a bill,
     expiry) and the customers' points — history plus add / remove
     with a reason.
   · Coupons tab: the admin's discount codes (percentage or fixed,
     with dates, a minimum bill, a maximum discount, usage limits and
     chosen customers). The older personal coupons stay below.
   Everything here is for admins only; the server checks it too.
   ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const API = typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null;
  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const translateMessage = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const fmtSAR = (v) => (I18N ? I18N.fmtSAR(v) : 'SAR ' + Number(v || 0).toFixed(2));
  const fmtNumber = (v) => (I18N ? I18N.fmtNumber(v) : String(v));
  const fmtDate = (v) => (I18N && v ? I18N.fmtDate(v) : (v || ''));
  const lang = () => (I18N && I18N.getLang ? I18N.getLang() : 'en');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
  const UI = window.SavoriaAdminUI || {};
  const toast = (type, message, detail = '') => (UI.toast ? UI.toast(type, message, detail) : console.warn(message));
  const failDetail = (err) => translateMessage(err.message)
    + (err.errors && Object.keys(err.errors).length ? ' — ' + Object.values(err.errors).map(translateMessage).join(' ') : '');

  if (!API || !$('tab-settings')) return;
  // Who may see or change points and discount codes comes from the permissions
  // table; the tabs are hidden for the others and the server refuses them anyway.

  /* ================= Points rules ================= */
  let RULES = null;
  const RULE_FIELDS = {
    earn_amount: 'ptEarnAmount', earn_points: 'ptEarnPoints', welcome_points: 'ptWelcome',
    point_value: 'ptValue', min_redeem: 'ptMin', max_percent: 'ptMaxPercent', expiry_months: 'ptExpiry',
  };

  function readRules() {
    const out = { points_enabled: $('ptEnabled').checked };
    Object.entries(RULE_FIELDS).forEach(([key, id]) => { out[key] = $(id).value === '' ? null : Number($(id).value); });
    return out;
  }

  function renderExample() {
    const box = $('ptExample');
    if (!box) return;
    const r = readRules();
    const ok = [r.earn_amount, r.earn_points, r.point_value, r.min_redeem, r.max_percent].every((v) => Number.isFinite(v) && v > 0);
    if (!ok) { box.textContent = ''; return; }
    const bill = 200;
    const earned = Math.floor(bill / r.earn_amount) * r.earn_points;
    const ordersToMin = Math.max(1, Math.ceil(r.min_redeem / Math.max(1, earned)));
    box.innerHTML = `
      <strong>${esc(t('points.exampleTitle'))}</strong>
      <span>${esc(t('points.exampleEarn', { bill: fmtSAR(bill), points: fmtNumber(earned) }))}</span>
      <span>${esc(t('points.exampleWorth', { points: fmtNumber(r.min_redeem), worth: fmtSAR(r.min_redeem * r.point_value), orders: fmtNumber(ordersToMin) }))}</span>
      <span>${esc(t('points.exampleCap', { percent: fmtNumber(r.max_percent), bill: fmtSAR(bill), max: fmtSAR(bill * r.max_percent / 100) }))}</span>
      ${r.welcome_points > 0 ? `<span>${esc(t('points.exampleWelcome', { points: fmtNumber(r.welcome_points), worth: fmtSAR(r.welcome_points * r.point_value) }))}</span>` : ''}
      <span>${esc(r.expiry_months > 0 ? t('points.exampleExpiry', { months: fmtNumber(r.expiry_months) }) : t('points.exampleNoExpiry'))}</span>`;
  }

  async function loadRules() {
    try {
      RULES = await API.getPointsSettings();
      $('ptEnabled').checked = !!RULES.enabled;
      Object.entries(RULE_FIELDS).forEach(([key, id]) => { $(id).value = RULES[key] ?? ''; });
      $('ptErrors').textContent = '';
      renderExample();
    } catch (err) { toast('error', t('admin.toasts.settingsLoadFailed'), failDetail(err)); }
  }

  ['ptEnabled', ...Object.values(RULE_FIELDS)].forEach((id) => {
    $(id)?.addEventListener('input', renderExample);
    $(id)?.addEventListener('change', renderExample);
  });

  $('ptSaveBtn')?.addEventListener('click', async () => {
    const btn = $('ptSaveBtn');
    btn.disabled = true;
    $('ptErrors').textContent = '';
    try {
      RULES = await API.savePointsSettings(readRules());
      toast('success', t('points.saved'));
      renderExample();
    } catch (err) {
      $('ptErrors').textContent = err.errors && Object.keys(err.errors).length
        ? Object.values(err.errors).map(translateMessage).join(' ') : translateMessage(err.message);
      toast('error', t('admin.toasts.saveFailed'), failDetail(err));
    } finally { btn.disabled = false; }
  });

  /* ================= Customers' points ================= */
  const TYPES = ['welcome', 'earn', 'redeem', 'refund', 'reverse', 'adjust', 'expire', 'migrate'];
  let searchTimer = null;
  let CURRENT_CUSTOMER = null;

  async function loadCustomers() {
    const body = $('ptCustomersBody');
    if (!body) return;
    try {
      const rows = await API.searchPointsCustomers($('ptCustomerSearch').value.trim());
      body.innerHTML = rows.length ? rows.map((c) => `
        <tr>
          <td>${esc(c.full_name)}<div class="mgmt-note">${esc(c.email || '')}</div></td>
          <td dir="ltr">${esc(c.phone || '—')}</td>
          <td><strong>${esc(fmtNumber(c.balance))}</strong></td>
          <td><button class="btn btn-outline btn-sm" type="button" data-points-customer="${c.id}">${esc(t('points.open'))}</button></td>
        </tr>`).join('')
        : `<tr><td colspan="4">${esc(t('points.noCustomers'))}</td></tr>`;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="4">${esc(translateMessage(err.message))}</td></tr>`;
    }
  }

  $('ptCustomerSearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadCustomers, 300);
  });
  $('ptCustomersBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-points-customer]');
    if (btn) openCustomer(Number(btn.dataset.pointsCustomer));
  });

  function historyRows(history) {
    if (!history || !history.length) return `<p class="mgmt-note">${esc(t('points.noHistory'))}</p>`;
    return history.map((h) => {
      const type = TYPES.includes(h.type) ? h.type : 'adjust';
      const pts = Number(h.points) || 0;
      const order = h.order_id ? t('points.forOrder', { number: h.order_number || h.order_id }) : '';
      return `
        <div class="points-row">
          <span class="points-row-date">${esc(fmtDate(h.created_at))}</span>
          <span class="points-row-what">${esc(t('points.types.' + type))}${order ? ` · ${esc(order)}` : ''}${h.reason ? `<small>${esc(h.reason)}</small>` : ''}</span>
          <span class="points-row-pts ${pts >= 0 ? 'is-plus' : 'is-minus'}" dir="ltr">${pts >= 0 ? '+' : '−'}${esc(fmtNumber(Math.abs(pts)))}</span>
          <span class="points-row-balance">${esc(t('points.balanceAfter', { balance: fmtNumber(h.balance_after) }))}</span>
        </div>`;
    }).join('');
  }

  function renderCustomer(data) {
    CURRENT_CUSTOMER = data;
    const c = data.customer || {};
    $('ptCustomerTitle').textContent = c.full_name || '';
    $('ptCustomerMeta').textContent = [c.phone, c.email].filter(Boolean).join(' · ');
    $('ptCustomerBalance').innerHTML = `
      <div><strong>${esc(fmtNumber(data.balance))}</strong><span>${esc(t('points.unit'))} = ${esc(fmtSAR(data.worth))}</span></div>
      <div><span>${esc(t('points.lifetimeEarned'))}</span><strong>${esc(fmtNumber(data.lifetime_earned || 0))}</strong></div>
      <div><span>${esc(t('points.lifetimeUsed'))}</span><strong>${esc(fmtNumber(data.lifetime_redeemed || 0))}</strong></div>
      ${data.next_expiry ? `<div><span>${esc(t('points.nextExpiry'))}</span><strong>${esc(fmtNumber(data.next_expiry.points))} · ${esc(fmtDate(data.next_expiry.date))}</strong></div>` : ''}`;
    $('ptCustomerHistory').innerHTML = historyRows(data.history);
  }

  async function openCustomer(id) {
    try {
      const data = await API.getPointsCustomer(id);
      $('ptAdjustPoints').value = '';
      $('ptAdjustReason').value = '';
      $('ptAdjustError').textContent = '';
      renderCustomer(data);
      UI.openModal('ptCustomerModal');
    } catch (err) { toast('error', t('admin.toasts.loadFailed'), failDetail(err)); }
  }

  $('ptAdjustBtn')?.addEventListener('click', async () => {
    if (!CURRENT_CUSTOMER) return;
    const points = Number($('ptAdjustPoints').value);
    const reason = $('ptAdjustReason').value.trim();
    const errBox = $('ptAdjustError');
    errBox.textContent = '';
    if (!Number.isInteger(points) || points === 0) { errBox.textContent = t('points.adjustNeedPoints'); return; }
    if (reason.length < 3) { errBox.textContent = t('points.adjustNeedReason'); return; }
    if (points < 0 && -points > Number(CURRENT_CUSTOMER.balance)) {
      errBox.textContent = t('points.adjustTooMany', { balance: fmtNumber(CURRENT_CUSTOMER.balance) });
      return;
    }
    const btn = $('ptAdjustBtn');
    btn.disabled = true;
    try {
      const data = await API.adjustPoints({ user_id: CURRENT_CUSTOMER.customer.id, points, reason });
      renderCustomer(data);
      $('ptAdjustPoints').value = '';
      $('ptAdjustReason').value = '';
      toast('success', points > 0
        ? t('points.added', { points: fmtNumber(points) })
        : t('points.removed', { points: fmtNumber(-points) }));
      loadCustomers();
    } catch (err) {
      errBox.textContent = translateMessage(err.message);
    } finally { btn.disabled = false; }
  });

  /* ================= Discount codes ================= */
  let PROMOS = [];
  let EDITING = null;          // id being edited, or null for a new code
  let CHOSEN = new Map();      // customer id → { id, full_name, phone }
  let pickTimer = null;

  const toLocalInput = (v) => (v ? String(v).replace(' ', 'T').slice(0, 16) : '');
  const fromLocalInput = (v) => (v ? v.replace('T', ' ') + ':00' : null);

  function discountText(p) {
    if (p.discount_type === 'percent') {
      return t('promo.percentOff', { percent: fmtNumber(p.value) })
        + (p.max_discount ? ' · ' + t('promo.upTo', { max: fmtSAR(p.max_discount) }) : '');
    }
    return t('promo.amountOff', { amount: fmtSAR(p.value) });
  }

  function rulesText(p) {
    const parts = [];
    if (Number(p.min_order) > 0) parts.push(t('promo.ruleMin', { amount: fmtSAR(p.min_order) }));
    if (p.starts_at) parts.push(t('promo.ruleFrom', { date: fmtDate(p.starts_at) }));
    if (p.ends_at) parts.push(t('promo.ruleUntil', { date: fmtDate(p.ends_at) }));
    parts.push(t('promo.rulePerCustomer', { count: fmtNumber(p.per_customer_limit || 1) }));
    if (p.customers_only) parts.push(t('promo.ruleChosen'));
    return parts.join(' · ');
  }

  function titleOf(p) {
    return (lang() === 'ar' ? (p.title_ar || p.title) : (p.title || p.title_ar)) || '';
  }

  function renderPromos() {
    const body = $('promoTableBody');
    if (!body) return;
    if (!PROMOS.length) {
      body.innerHTML = `<tr><td colspan="6">${esc(t('promo.empty'))}</td></tr>`;
      return;
    }
    body.innerHTML = PROMOS.map((p) => `
      <tr>
        <td><code class="promo-code" dir="ltr">${esc(p.code)}</code>${titleOf(p) ? `<div class="mgmt-note">${esc(titleOf(p))}</div>` : ''}</td>
        <td>${esc(discountText(p))}</td>
        <td class="promo-rules">${esc(rulesText(p))}</td>
        <td>${esc(fmtNumber(p.uses))}${p.max_uses ? ' / ' + esc(fmtNumber(p.max_uses)) : ''}
          ${Number(p.total_discount) > 0 ? `<div class="mgmt-note">${esc(t('promo.given', { amount: fmtSAR(p.total_discount) }))}</div>` : ''}</td>
        <td><span class="promo-state promo-state-${esc(p.state)}">${esc(t('promo.states.' + p.state))}</span></td>
        <td class="promo-actions">
          <button class="btn btn-outline btn-sm" type="button" data-promo-edit="${p.id}">${esc(t('promo.edit'))}</button>
          <button class="btn btn-outline btn-sm" type="button" data-promo-toggle="${p.id}">${esc(p.is_active ? t('promo.turnOff') : t('promo.turnOn'))}</button>
          ${Number(p.uses) === 0 ? `<button class="btn btn-outline btn-sm btn-danger-outline" type="button" data-promo-delete="${p.id}">${esc(t('promo.delete'))}</button>` : ''}
        </td>
      </tr>`).join('');
  }

  async function loadPromos() {
    try {
      PROMOS = await API.listPromos();
      renderPromos();
    } catch (err) {
      const body = $('promoTableBody');
      if (body) body.innerHTML = `<tr><td colspan="6">${esc(translateMessage(err.message))}</td></tr>`;
    }
  }

  function clearPromoErrors() {
    document.querySelectorAll('#promoModal [data-error-for]').forEach((n) => { n.textContent = ''; });
  }

  function syncTypeFields() {
    const percent = $('prType').value === 'percent';
    $('prValueLabel').textContent = percent ? t('promo.valuePercent') : t('promo.valueFixed');
    $('prValue').max = percent ? '100' : '';
    $('prMaxWrap').style.display = percent ? '' : 'none';
  }

  function renderChips() {
    $('prCustomerChips').innerHTML = [...CHOSEN.values()].map((c) => `
      <span class="promo-chip">${esc(c.full_name)}${c.phone ? ` <small dir="ltr">${esc(c.phone)}</small>` : ''}
        <button type="button" data-unchoose="${c.id}" aria-label="${esc(t('promo.removeCustomer'))}">×</button></span>`).join('')
      || `<span class="mgmt-note">${esc(t('promo.noneChosen'))}</span>`;
  }

  function readPromo() {
    const num = (id) => ($(id).value === '' ? null : Number($(id).value));
    return {
      code: $('prCode').value.trim().toUpperCase(),
      title: $('prTitle').value.trim(),
      title_ar: $('prTitleAr').value.trim(),
      discount_type: $('prType').value,
      value: num('prValue'),
      max_discount: $('prType').value === 'percent' ? num('prMax') : null,
      min_order: num('prMin'),
      starts_at: fromLocalInput($('prStarts').value),
      ends_at: fromLocalInput($('prEnds').value),
      max_uses: num('prMaxUses'),
      per_customer_limit: num('prPerCustomer') ?? 1,
      customers_only: $('prCustomersOnly').checked,
      customer_ids: $('prCustomersOnly').checked ? [...CHOSEN.keys()] : [],
      is_active: $('prActive').checked,
    };
  }

  function renderSummary() {
    const p = readPromo();
    if (!p.value || p.value <= 0) { $('prSummary').textContent = ''; return; }
    const bits = [discountText(p)];
    bits.push(rulesText({ ...p, per_customer_limit: p.per_customer_limit || 1 }));
    if (p.max_uses) bits.push(t('promo.ruleTotal', { count: fmtNumber(p.max_uses) }));
    $('prSummary').textContent = t('promo.summary', { code: p.code || '…' }) + ' ' + bits.join(' · ');
  }

  function fillPromoForm(p) {
    $('promoModalTitle').textContent = p ? t('promo.editTitle', { code: p.code }) : t('promo.newTitle');
    $('prCode').value = p ? p.code : '';
    $('prCode').disabled = !!(p && Number(p.uses) > 0);
    $('prTitle').value = p?.title || '';
    $('prTitleAr').value = p?.title_ar || '';
    $('prType').value = p?.discount_type || 'percent';
    $('prValue').value = p?.value ?? '';
    $('prMax').value = p?.max_discount ?? '';
    $('prMin').value = p && Number(p.min_order) > 0 ? p.min_order : '';
    $('prStarts').value = toLocalInput(p?.starts_at);
    $('prEnds').value = toLocalInput(p?.ends_at);
    $('prMaxUses').value = p?.max_uses ?? '';
    $('prPerCustomer').value = p?.per_customer_limit ?? 1;
    $('prActive').checked = p ? !!p.is_active : true;
    $('prCustomersOnly').checked = !!p?.customers_only;
    $('prCustomersBox').style.display = p?.customers_only ? '' : 'none';
    CHOSEN = new Map((p?.customers || []).map((c) => [Number(c.id), c]));
    $('prCustomerSearch').value = '';
    $('prCustomerResults').innerHTML = '';
    renderChips();
    clearPromoErrors();
    syncTypeFields();
    renderSummary();
  }

  async function openPromo(id) {
    EDITING = id || null;
    try {
      fillPromoForm(id ? await API.getPromo(id) : null);
      UI.openModal('promoModal');
      $('prCode').focus();
    } catch (err) { toast('error', t('admin.toasts.loadFailed'), failDetail(err)); }
  }

  function randomCode() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    bytes.forEach((b) => { s += abc[b % abc.length]; });
    return 'TRZ' + s;
  }

  $('promoNewBtn')?.addEventListener('click', () => openPromo(null));
  $('promoRefreshBtn')?.addEventListener('click', loadPromos);
  $('prGenerate')?.addEventListener('click', () => { if (!$('prCode').disabled) { $('prCode').value = randomCode(); renderSummary(); } });
  $('prType')?.addEventListener('change', () => { syncTypeFields(); renderSummary(); });
  ['prCode', 'prValue', 'prMax', 'prMin', 'prStarts', 'prEnds', 'prMaxUses', 'prPerCustomer'].forEach((id) => {
    $(id)?.addEventListener('input', renderSummary);
  });
  $('prCustomersOnly')?.addEventListener('change', () => {
    $('prCustomersBox').style.display = $('prCustomersOnly').checked ? '' : 'none';
    renderSummary();
  });

  $('prCustomerSearch')?.addEventListener('input', () => {
    clearTimeout(pickTimer);
    pickTimer = setTimeout(async () => {
      const q = $('prCustomerSearch').value.trim();
      const box = $('prCustomerResults');
      if (q.length < 2) { box.innerHTML = ''; return; }
      try {
        const rows = (await API.searchPointsCustomers(q)).slice(0, 8);
        box.innerHTML = rows.length ? rows.map((c) => `
          <button type="button" class="promo-customer-option" data-choose="${c.id}" ${CHOSEN.has(Number(c.id)) ? 'disabled' : ''}>
            ${esc(c.full_name)} <small dir="ltr">${esc(c.phone || c.email || '')}</small></button>`).join('')
          : `<span class="mgmt-note">${esc(t('points.noCustomers'))}</span>`;
        box._rows = rows;
      } catch (err) { box.textContent = translateMessage(err.message); }
    }, 300);
  });
  $('prCustomerResults')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-choose]');
    if (!btn) return;
    const c = ($('prCustomerResults')._rows || []).find((r) => Number(r.id) === Number(btn.dataset.choose));
    if (c) { CHOSEN.set(Number(c.id), c); btn.disabled = true; renderChips(); }
  });
  $('prCustomerChips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-unchoose]');
    if (btn) { CHOSEN.delete(Number(btn.dataset.unchoose)); renderChips(); }
  });

  const ERROR_FIELDS = {
    code: 'prCode', value: 'prValue', discount_type: 'prValue', max_discount: 'prMax', min_order: 'prMax',
    starts_at: 'prEnds', ends_at: 'prEnds', max_uses: 'prEnds', per_customer_limit: 'prEnds',
    customer_ids: 'prCustomers', title: 'prCode',
  };

  $('prSaveBtn')?.addEventListener('click', async () => {
    clearPromoErrors();
    const body = readPromo();
    if (EDITING && $('prCode').disabled) delete body.code;
    const btn = $('prSaveBtn');
    btn.disabled = true;
    try {
      if (EDITING) await API.updatePromo(EDITING, body);
      else await API.createPromo(body);
      UI.closeModal('promoModal');
      toast('success', EDITING ? t('promo.updated') : t('promo.created', { code: body.code }));
      loadPromos();
    } catch (err) {
      const errs = err.errors || {};
      Object.entries(errs).forEach(([key, msg]) => {
        const slot = document.querySelector(`#promoModal [data-error-for="${ERROR_FIELDS[key] || 'prCode'}"]`);
        if (slot) slot.textContent = (slot.textContent ? slot.textContent + ' ' : '') + translateMessage(msg);
      });
      if (!Object.keys(errs).length) toast('error', t('admin.toasts.saveFailed'), translateMessage(err.message));
    } finally { btn.disabled = false; }
  });

  $('promoTableBody')?.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-promo-edit]');
    const toggle = e.target.closest('[data-promo-toggle]');
    const del = e.target.closest('[data-promo-delete]');
    if (edit) { openPromo(Number(edit.dataset.promoEdit)); return; }
    if (toggle) {
      const p = PROMOS.find((x) => x.id === Number(toggle.dataset.promoToggle));
      if (!p) return;
      try {
        await API.setPromoActive(p.id, !p.is_active);
        toast('success', p.is_active ? t('promo.turnedOff', { code: p.code }) : t('promo.turnedOn', { code: p.code }));
        loadPromos();
      } catch (err) { toast('error', t('admin.toasts.saveFailed'), failDetail(err)); }
      return;
    }
    if (del) {
      const p = PROMOS.find((x) => x.id === Number(del.dataset.promoDelete));
      if (!p || !UI.confirmAction) return;
      const ok = await UI.confirmAction({
        title: t('promo.deleteTitle'),
        message: esc(t('promo.deleteMessage', { code: p.code })),
        reasonRequired: false,
        placeholder: t('promo.deleteReason'),
      });
      if (!ok) return;
      try {
        await API.deletePromo(p.id);
        toast('success', t('promo.deleted', { code: p.code }));
        loadPromos();
      } catch (err) { toast('error', t('admin.toasts.saveFailed'), failDetail(err)); }
    }
  });

  /* ================= Loading with the tabs ================= */
  const visible = (id) => { const n = $(id); return !!n && n.style.display !== 'none'; };
  function refresh() {
    if (visible('tab-settings')) { loadRules(); loadCustomers(); }
    if (visible('tab-coupons')) loadPromos();
  }
  // Load whenever one of the two tabs is shown (however the panel switches to it).
  const watch = new MutationObserver((changes) => {
    changes.forEach((c) => {
      if (c.target.style.display === 'none') return;
      if (c.target.id === 'tab-settings') { loadRules(); loadCustomers(); }
      if (c.target.id === 'tab-coupons') loadPromos();
    });
  });
  ['tab-settings', 'tab-coupons'].forEach((id) => { if ($(id)) watch.observe($(id), { attributes: true, attributeFilter: ['style'] }); });
  if (I18N && I18N.onChange) I18N.onChange(() => {
    if (visible('tab-settings')) { renderExample(); loadCustomers(); }
    if (visible('tab-coupons')) renderPromos();
  });
  setTimeout(refresh, 0);
})();
