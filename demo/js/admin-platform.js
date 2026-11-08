/* =========================================================
   Tarmez — Site Management → Platform
   js/admin-platform.js

   · Platform switches: every part of the platform on / off, in
     groups, saved at once (switching off all online ordering asks
     first);
   · Permissions: staff and cashier × each area → none / view / edit;
   · Activity log: every change made in Site Management.
   ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const tr = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtDT = (v) => (I18N && I18N.fmtDate && v ? I18N.fmtDate(v, { dateStyle: 'medium', timeStyle: 'short' }) : (v || ''));
  const UI = window.SavoriaAdminUI || {};
  const toast = (type, msg, detail = '') => (UI.toast ? UI.toast(type, msg, detail) : console.warn(msg));
  const API = typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null;
  const canEdit = (area) => (window.SavoriaCan ? window.SavoriaCan(area, 'edit') : true);
  if (!API || !$('tab-platform')) return;

  const ICONS = {
    ordering: '🛒', delivery: '🛵', pickup: '🛍️', dine_in: '🍽️', guest_checkout: '👤', whatsapp_ordering: '💬',
    reservations: '📅', points: '⭐', promo_codes: '🏷️', legacy_coupons: '🎟️', ratings: '💯',
    offers: '📍', registration: '📝', invoices: '🧾', push_notifications: '🔔', install_bar: '📱',
  };

  /* ---------------- switches ---------------- */
  let FEATURES = null;

  function renderSwitches() {
    const editable = canEdit('platform');
    const groups = FEATURES.groups;
    $('platGroups').innerHTML = groups.map((g) => {
      const keys = Object.entries(FEATURES.features).filter(([, v]) => v.group === g);
      return `
        <section class="plat-group">
          <h4>${esc(t('plat.groups.' + g))}</h4>
          ${keys.map(([k, v]) => `
            <label class="plat-switch${v.enabled ? ' is-on' : ''}${k === 'ordering' ? ' is-master' : ''}">
              <span class="plat-icon" aria-hidden="true">${ICONS[k] || '•'}</span>
              <span class="plat-text"><strong>${esc(t('plat.keys.' + k + '.name'))}</strong><small>${esc(t('plat.keys.' + k + '.hint'))}</small></span>
              <span class="plat-state">${esc(v.enabled ? t('plat.on') : t('plat.off'))}</span>
              <span class="switch"><input type="checkbox" data-feature="${k}" ${v.enabled ? 'checked' : ''} ${editable ? '' : 'disabled'}><span class="slider"></span></span>
            </label>`).join('')}
        </section>`;
    }).join('');
  }

  async function loadSwitches() {
    try {
      FEATURES = await API.getAdminFeatures();
      renderSwitches();
    } catch (err) { $('platGroups').innerHTML = `<p class="mgmt-note">${esc(tr(err.message))}</p>`; }
  }

  $('platGroups').addEventListener('change', async (e) => {
    const box = e.target.closest('[data-feature]');
    if (!box) return;
    const key = box.dataset.feature;
    const on = box.checked;
    if (key === 'ordering' && !on && UI.confirmAction) {
      const ok = await UI.confirmAction({ title: t('plat.confirmTitle'), message: esc(t('plat.confirmOrdering')), reasonRequired: false, placeholder: t('plat.confirmNote') });
      if (!ok) { box.checked = true; return; }
    }
    box.disabled = true;
    try {
      FEATURES = await API.saveFeatures({ [key]: on });
      renderSwitches();
      toast('success', t(on ? 'plat.turnedOn' : 'plat.turnedOff', { name: t('plat.keys.' + key + '.name') }));
    } catch (err) {
      box.checked = !on;
      box.disabled = false;
      toast('error', t('admin.toasts.saveFailed'), tr(err.message));
    }
  });

  /* ---------------- permissions ---------------- */
  let MATRIX = null;
  const DEFAULTS = {
    staff: { orders: 'edit', reservations: 'edit', tables: 'view', menu: 'view', promos: 'view', points: 'view', ratings: 'none', accounts: 'none', content: 'none', settings: 'none', platform: 'none' },
    cashier: { orders: 'edit', reservations: 'edit', tables: 'view', menu: 'view', promos: 'view', points: 'view', ratings: 'none', accounts: 'none', content: 'none', settings: 'none', platform: 'none' },
  };

  function segment(role, area, value, editable) {
    const opts = area === 'platform' ? ['none', 'view'] : ['none', 'view', 'edit'];
    return `<div class="perm-seg" role="radiogroup" aria-label="${esc(t('role.' + role))} · ${esc(t('perm.areas.' + area + '.name'))}">
      ${opts.map((o) => `<button type="button" role="radio" aria-checked="${o === value}" class="${o === value ? 'is-on' : ''} perm-${o}" data-role="${role}" data-area="${area}" data-level="${o}" ${editable ? '' : 'disabled'}>${esc(t('perm.levels.' + o))}</button>`).join('')}
    </div>`;
  }

  function renderPermissions() {
    const editable = canEdit('platform');
    $('permBody').innerHTML = MATRIX.areas.map((a) => `
      <tr>
        <td><strong>${esc(t('perm.areas.' + a + '.name'))}</strong><small class="perm-hint">${esc(t('perm.areas.' + a + '.hint'))}</small></td>
        <td>${segment('staff', a, MATRIX.roles.staff[a], editable)}</td>
        <td>${segment('cashier', a, MATRIX.roles.cashier[a], editable)}</td>
      </tr>`).join('');
    $('permSave').hidden = !editable;
    $('permReset').hidden = !editable;
  }

  async function loadPermissions() {
    try {
      MATRIX = await API.getPermissions();
      renderPermissions();
    } catch (err) { $('permBody').innerHTML = `<tr><td colspan="3">${esc(tr(err.message))}</td></tr>`; }
  }

  $('permBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-level]');
    if (!b || b.disabled) return;
    MATRIX.roles[b.dataset.role][b.dataset.area] = b.dataset.level;
    renderPermissions();
    $('permSave').classList.add('is-dirty');
  });
  $('permReset').addEventListener('click', () => {
    MATRIX.roles = JSON.parse(JSON.stringify(DEFAULTS));
    renderPermissions();
    $('permSave').classList.add('is-dirty');
  });
  $('permSave').addEventListener('click', async () => {
    const btn = $('permSave');
    btn.disabled = true;
    try {
      MATRIX = await API.savePermissions(MATRIX.roles);
      renderPermissions();
      btn.classList.remove('is-dirty');
      toast('success', t('perm.saved'));
    } catch (err) { toast('error', t('admin.toasts.saveFailed'), tr(err.message)); }
    finally { btn.disabled = false; }
  });

  /* ---------------- activity ---------------- */
  let ACTIVITY = [];

  function renderActivity() {
    const q = ($('actSearch').value || '').trim().toLowerCase();
    const rows = ACTIVITY.filter((r) => !q || [r.actor_name, r.action, r.entity_type].join(' ').toLowerCase().includes(q));
    $('actList').innerHTML = rows.length ? rows.map((r) => `
      <div class="act-row">
        <span class="act-when">${esc(fmtDT(r.created_at))}</span>
        <span class="act-who">${esc(r.actor_name || t('act.system'))}</span>
        <span class="act-what"><code>${esc(r.action)}</code>${r.entity_type ? ` · ${esc(r.entity_type)}${r.entity_id ? ' #' + esc(r.entity_id) : ''}` : ''}</span>
      </div>`).join('') : `<p class="mgmt-note">${esc(t('act.empty'))}</p>`;
  }

  async function loadActivity() {
    try {
      const res = await API.getAuditLog(200);
      ACTIVITY = Array.isArray(res) ? res : (res && (res.entries || res.items)) || [];
      renderActivity();
    } catch (err) { $('actList').innerHTML = `<p class="mgmt-note">${esc(tr(err.message))}</p>`; }
  }
  $('actSearch').addEventListener('input', renderActivity);
  $('actRefresh').addEventListener('click', loadActivity);

  if (I18N && I18N.onChange) I18N.onChange(() => {
    if (FEATURES && $('tab-platform').style.display !== 'none') renderSwitches();
    if (MATRIX && $('tab-permissions').style.display !== 'none') renderPermissions();
    if ($('tab-activity').style.display !== 'none') renderActivity();
  });

  window.SavoriaAdminPlatform = { loadSwitches, loadPermissions, loadActivity };
})();
