/* =========================================================
   Tarmez — Site Management → Offers & campaigns
   js/admin-offers.js  (docs/OFFERS_AR.md)

   · the restaurant location and circle on a map (Leaflet +
     OpenStreetMap, loaded the first time this page opens), or
     "use my location", or a pasted Google Maps link;
   · the daily limit of offer notifications per customer;
   · the offers as cards with their numbers, and the editor with
     a live preview of the phone notification and the site banner.
   window.SavoriaAdminOffers = { load }
   ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const tr = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const UI = window.SavoriaAdminUI || {};
  const toast = (type, msg, detail = '') => (UI.toast ? UI.toast(type, msg, detail) : console.warn(msg));
  const API = typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null;
  const canEdit = () => (window.SavoriaCan ? window.SavoriaCan('offers', 'edit') : true);
  if (!API || !$('tab-offers')) return;

  const call = (path, method = 'GET', body = null) => API.request(path, { method, body, auth: true });
  const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
  const RIYADH = [24.7136, 46.6753];

  let DATA = null;
  let DISHES = null;
  let map = null;
  let marker = null;
  let circle = null;
  let point = null;          // [lat, lng] chosen on the map, not saved yet
  let editing = null;        // the offer open in the editor (null = new)
  let previewLang = 'ar';

  const lang = () => (I18N && I18N.getLang ? I18N.getLang() : 'en');
  /** A text in a given language (the preview can show the other language). */
  const tIn = (l, key) => {
    const v = key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), I18N && I18N.locales ? I18N.locales[l] : undefined);
    return typeof v === 'string' ? v : t(key);
  };
  const pick = (o, field) => (lang() === 'ar' ? (o[field + '_ar'] || o[field]) : (o[field] || o[field + '_ar'])) || '';
  const meters = (m) => (m >= 1000 ? t('offers.km', { n: (m / 1000).toLocaleString(lang() === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2 }) }) : t('offers.m', { n: m }));

  /* ---------------- map ---------------- */
  let leaflet = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leaflet) return leaflet;
    leaflet = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET + 'leaflet.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LEAFLET + 'leaflet.js';
      js.onload = () => resolve(window.L);
      js.onerror = () => { leaflet = null; reject(new Error('map')); };
      document.head.appendChild(js);
    });
    return leaflet;
  }

  function radius() {
    return Number($('offRadius').value) || 500;
  }

  function drawPoint(latlng, pan) {
    point = latlng;
    $('offCoords').textContent = latlng ? `${latlng[0].toFixed(6)}, ${latlng[1].toFixed(6)}` : t('offers.branch.notSet');
    if (!map || !latlng) return;
    if (!marker) {
      marker = window.L.marker(latlng, { draggable: canEdit(), keyboard: true }).addTo(map);
      marker.on('dragend', () => { const p = marker.getLatLng(); drawPoint([p.lat, p.lng], false); });
      circle = window.L.circle(latlng, { radius: radius(), color: '#C4602E', weight: 2, fillColor: '#C4602E', fillOpacity: 0.12 }).addTo(map);
    } else {
      marker.setLatLng(latlng);
      circle.setLatLng(latlng);
    }
    circle.setRadius(radius());
    if (pan) map.fitBounds(circle.getBounds(), { padding: [24, 24] });
  }

  async function initMap() {
    const b = DATA.branch || {};
    $('offRadius').value = b.radius_m || 500;
    $('offRadiusValue').textContent = meters(radius());
    const saved = b.latitude != null && b.longitude != null ? [Number(b.latitude), Number(b.longitude)] : null;
    if (map) { drawPoint(saved, !!saved); return; }
    try {
      await loadLeaflet();
    } catch (_) {
      $('offMap').innerHTML = `<p class="mgmt-note off-map-fail">${esc(t('offers.branch.mapFailed'))}</p>`;
      drawPoint(saved, false);
      return;
    }
    map = window.L.map('offMap', { scrollWheelZoom: false }).setView(saved || RIYADH, saved ? 15 : 11);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    if (canEdit()) map.on('click', (e) => drawPoint([e.latlng.lat, e.latlng.lng], false));
    drawPoint(saved, !!saved);
    // the page was hidden while the map was made: measure again once it shows
    setTimeout(() => map.invalidateSize(), 150);
  }

  /** "…/@24.71,46.67,15z", "…?q=24.71,46.67", "24.71, 46.67" → [lat, lng] */
  function parseLocation(text) {
    const s = decodeURIComponent(String(text || ''));
    const m = s.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
      || s.match(/[?&](?:q|ll|query|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
      || s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
      || s.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
  }

  /* ---------------- top cards ---------------- */
  function renderTop() {
    const off = DATA.enabled === false;
    $('offSwitchNote').hidden = !off;
    if (off) $('offSwitchNote').innerHTML = `${esc(t('offers.switchOff'))} <a href="admin.html#platform">${esc(t('admin.tabs.platform'))}</a>`;
    $('offCap').value = (DATA.settings && DATA.settings.daily_cap) || 1;
    ['offSaveBranch', 'offSaveCap', 'offNew', 'offMyLocation', 'offPasteApply'].forEach((id) => { $(id).hidden = !canEdit(); });
    $('offRadius').disabled = !canEdit();
    $('offCap').disabled = !canEdit();
  }

  /* ---------------- list ---------------- */
  const dayName = (d) => new Date(Date.UTC(2024, 0, d)).toLocaleDateString(lang() === 'ar' ? 'ar' : 'en', { weekday: 'short', timeZone: 'UTC' }); // 2024-01-01 = Monday
  const fmtDay = (iso) => (iso ? (I18N && I18N.fmtDate ? I18N.fmtDate(iso + 'T00:00:00') : iso) : '');
  const fmtLocal = (local) => (local ? (I18N && I18N.fmtDate ? I18N.fmtDate(local, { dateStyle: 'medium', timeStyle: 'short' }) : local.replace('T', ' ')) : '');

  function whenText(o) {
    if (o.kind === 'scheduled') {
      if (o.status === 'sent') return t('offers.when.sentAt', { at: fmtLocal(o.sent_at) });
      return o.send_at ? t('offers.when.sendAt', { at: fmtLocal(o.send_at) }) : t('offers.when.noTime');
    }
    const parts = [];
    if (o.starts_on || o.ends_on) parts.push(t('offers.when.dates', { from: fmtDay(o.starts_on) || '…', to: fmtDay(o.ends_on) || '…' }));
    else parts.push(t('offers.when.always'));
    if (o.days && o.days.length) parts.push(o.days.map((d) => dayName(Number(d))).join('، '));
    if (o.from_time && o.to_time) parts.push(t('offers.when.hours', { from: o.from_time, to: o.to_time }));
    return parts.join(' · ');
  }

  function codeText(o) {
    if (!o.promo_code_id) return '';
    const c = (DATA.codes || []).find((x) => Number(x.id) === Number(o.promo_code_id));
    return c ? c.code : '#' + o.promo_code_id;
  }

  function card(o) {
    const edit = canEdit();
    const status = o.status;
    const btn = (act, label, cls = 'btn-outline') => `<button type="button" class="btn ${cls} btn-sm" data-act="${act}" data-id="${o.id}">${esc(label)}</button>`;
    const actions = !edit ? '' : [
      !['sent', 'sending'].includes(status) ? btn('edit', t('offers.act.edit')) : '',
      ['active', 'scheduled'].includes(status) ? btn('pause', t('offers.act.pause')) : '',
      status === 'paused' ? btn('resume', t('offers.act.resume')) : '',
      o.kind === 'scheduled' && ['draft', 'scheduled', 'paused', 'missed'].includes(status) ? btn('send_now', t('offers.act.sendNow'), 'btn-primary') : '',
      btn('duplicate', t('offers.act.duplicate')),
      status === 'draft' ? btn('delete', t('offers.act.delete'), 'btn-outline off-danger') : '',
    ].join('');
    const img = o.image_url ? `<img src="${esc(o.image_url)}" alt="" loading="lazy">` : '<span class="off-card-ph" aria-hidden="true">📍</span>';
    const code = codeText(o);
    return `
      <article class="off-offer is-${esc(status)}">
        <div class="off-offer-img">${img}</div>
        <div class="off-offer-main">
          <div class="off-offer-tags">
            <span class="off-kind-tag">${esc(t('offers.kind.' + o.kind))}</span>
            <span class="off-status s-${esc(status)}">${esc(t('offers.status.' + status))}</span>
            ${code ? `<span class="off-code-tag">🏷️ ${esc(code)}</span>` : ''}
          </div>
          <h5>${esc(pick(o, 'title'))}</h5>
          ${pick(o, 'body') ? `<p>${esc(pick(o, 'body'))}</p>` : ''}
          <p class="off-when-line">🕒 ${esc(whenText(o))}</p>
          <div class="off-stats">
            ${o.kind === 'nearby' ? `<span><b>${Number(o.views || 0)}</b> ${esc(t('offers.stats.views'))}</span>` : `<span><b>${Number(o.recipients || 0)}</b> ${esc(t('offers.stats.recipients'))}</span>`}
            <span><b>${Number(o.pushed || 0)}</b> ${esc(t('offers.stats.pushed'))}</span>
            ${o.promo_code_id ? `<span><b>${Number(o.code_uses || 0)}</b> ${esc(t('offers.stats.codeUses'))}</span>` : ''}
          </div>
          <div class="off-offer-actions">${actions}</div>
        </div>
      </article>`;
  }

  function renderList() {
    const list = DATA.offers || [];
    $('offList').innerHTML = list.length ? list.map(card).join('') : `<p class="mgmt-note off-empty">${esc(t('offers.list.empty'))}</p>`;
  }

  async function load() {
    try {
      DATA = await call('/admin/offers');
    } catch (err) {
      $('offList').innerHTML = `<p class="mgmt-note">${esc(tr(err.message))}</p>`;
      throw err;
    }
    renderTop();
    renderList();
    initMap();
  }

  /* ---------------- editor ---------------- */
  const FIELDS = ['title', 'title_ar', 'body', 'body_ar', 'image_url', 'promo_code_id', 'action', 'action_ref', 'starts_on', 'ends_on', 'from_time', 'to_time', 'send_at'];

  function kind() {
    return document.querySelector('input[name="offKind"]:checked').value;
  }

  function payload(intent) {
    const days = [...$('offDays').querySelectorAll('input:checked')].map((i) => i.value);
    return {
      kind: kind(),
      intent,
      title: $('offTitle').value.trim(),
      title_ar: $('offTitleAr').value.trim(),
      body: $('offBody').value.trim(),
      body_ar: $('offBodyAr').value.trim(),
      image_url: $('offImage').value.trim(),
      promo_code_id: $('offCode').value || null,
      action: $('offAction').value,
      action_ref: $('offAction').value === 'dish' ? ($('offDish').value || null) : null,
      starts_on: $('offStarts').value,
      ends_on: $('offEnds').value,
      days,
      from_time: $('offFrom').value,
      to_time: $('offTo').value,
      send_at: $('offSendAt').value,
    };
  }

  function showKind() {
    const k = kind();
    $('offWhenNearby').hidden = k !== 'nearby';
    $('offWhenScheduled').hidden = k !== 'scheduled';
    $('offActivate').textContent = k === 'nearby' ? t('offers.edit.start') : t('offers.edit.schedule');
    preview();
  }

  function clearErrors() {
    document.querySelectorAll('[data-off-err]').forEach((e) => { e.textContent = ''; });
  }

  function showErrors(errors) {
    Object.entries(errors || {}).forEach(([k, v]) => {
      const el = document.querySelector(`[data-off-err="${k}"]`) || document.querySelector('[data-off-err="title"]');
      if (el) el.textContent = tr(String(v));
    });
  }

  function previewText(field) {
    const ar = previewLang === 'ar';
    const v = (id) => $(id).value.trim();
    const texts = { title: ar ? v('offTitleAr') || v('offTitle') : v('offTitle') || v('offTitleAr'), body: ar ? v('offBodyAr') || v('offBody') : v('offBody') || v('offBodyAr') };
    return texts[field];
  }

  function preview() {
    const ar = previewLang === 'ar';
    const tt = (key) => tIn(previewLang, key);
    const title = previewText('title') || (ar ? 'عنوان العرض' : 'Offer title');
    const body = previewText('body');
    const codeId = $('offCode').value;
    const code = codeId ? ((DATA.codes || []).find((c) => String(c.id) === codeId) || {}).code : '';
    const img = $('offImage').value.trim();
    const actionLabel = { menu: tt('nearby.action.menu'), dish: tt('nearby.action.dish'), reservation: tt('nearby.action.reservation') }[$('offAction').value];
    const dir = ar ? 'rtl' : 'ltr';
    $('offPvPush').innerHTML = `
      <div class="off-pv-label">${esc(t('offers.edit.pvPush'))}</div>
      <div class="off-pv-notif" dir="${dir}">
        <img src="assets/icons/icon-192.png" alt="">
        <div><b>${esc(title)}</b><span>${esc([body, code ? (ar ? 'الكود: ' : 'Code: ') + code : ''].filter(Boolean).join(' — '))}</span></div>
      </div>`;
    $('offPvBanner').innerHTML = `
      <div class="off-pv-label">${esc(t('offers.edit.pvBanner'))}</div>
      <div class="nb-banner is-preview" dir="${dir}">
        ${img ? `<img class="nb-img" src="${esc(img)}" alt="">` : ''}
        <div class="nb-body">
          <span class="nb-eyebrow">📍 ${esc(tt('nearby.eyebrow'))}</span>
          <b class="nb-title">${esc(title)}</b>
          ${body ? `<p class="nb-text">${esc(body)}</p>` : ''}
          <div class="nb-row">
            ${code ? `<span class="nb-code">${esc(code)}</span><span class="nb-copy">${esc(tt('nearby.copy'))}</span>` : ''}
            ${actionLabel ? `<span class="nb-cta">${esc(actionLabel)}</span>` : ''}
          </div>
        </div>
        <span class="nb-close" aria-hidden="true">×</span>
      </div>`;
  }

  async function fillDishes(selected) {
    if (!DISHES) {
      try {
        const res = await API.getMenuItems();
        DISHES = Array.isArray(res) ? res : (res.items || res.menu_items || []);
      } catch (_) { DISHES = []; }
    }
    $('offDish').innerHTML = `<option value="">—</option>` + DISHES.map((d) => `<option value="${d.id}" ${Number(selected) === Number(d.id) ? 'selected' : ''}>${esc(pick(d, 'name'))}</option>`).join('');
  }

  function fillCodes(selected) {
    $('offCode').innerHTML = `<option value="">${esc(t('offers.edit.noCode'))}</option>` + (DATA.codes || []).map((c) => {
      const off = !Number(c.is_active);
      const label = `${c.code}${pick(c, 'title') ? ' — ' + pick(c, 'title') : ''}${off ? ' (' + t('offers.edit.codeOff') + ')' : ''}`;
      return `<option value="${c.id}" ${Number(selected) === Number(c.id) ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');
  }

  function open(o) {
    editing = o || null;
    clearErrors();
    $('offModalTitle').textContent = o ? t('offers.edit.editTitle') : t('offers.edit.newTitle');
    document.querySelectorAll('input[name="offKind"]').forEach((r) => {
      r.checked = r.value === ((o && o.kind) || 'nearby');
      r.disabled = !!o;
    });
    $('offTitle').value = (o && o.title) || '';
    $('offTitleAr').value = (o && o.title_ar) || '';
    $('offBody').value = (o && o.body) || '';
    $('offBodyAr').value = (o && o.body_ar) || '';
    $('offImage').value = (o && o.image_url) || '';
    fillCodes(o && o.promo_code_id);
    $('offAction').value = (o && o.action) || 'menu';
    $('offDishWrap').hidden = $('offAction').value !== 'dish';
    fillDishes(o && o.action_ref);
    $('offStarts').value = (o && o.starts_on) || '';
    $('offEnds').value = (o && o.ends_on) || '';
    const days = (o && o.days) || [];
    $('offDays').innerHTML = [1, 2, 3, 4, 5, 6, 7].map((d) => `<label class="off-day"><input type="checkbox" value="${d}" ${days.includes(String(d)) ? 'checked' : ''}><span>${esc(dayName(d))}</span></label>`).join('');
    $('offFrom').value = (o && o.from_time) || '';
    $('offTo').value = (o && o.to_time) || '';
    $('offSendAt').value = (o && o.send_at) || '';
    $('offTest').hidden = !o;
    $('offSaveDraft').hidden = !!o && !['draft', 'paused', 'missed'].includes(o.status);
    previewLang = lang() === 'ar' ? 'ar' : 'en';
    document.querySelectorAll('.off-preview-lang button').forEach((b) => b.classList.toggle('is-on', b.dataset.lang === previewLang));
    showKind();
    UI.openModal ? UI.openModal('offerModal') : $('offerModal').classList.add('open');
    setTimeout(() => $('offTitleAr').focus(), 50);
  }

  function close() {
    UI.closeModal ? UI.closeModal('offerModal') : $('offerModal').classList.remove('open');
  }

  async function save(intent) {
    clearErrors();
    const body = payload(intent);
    const buttons = [$('offSaveDraft'), $('offActivate')];
    buttons.forEach((b) => { b.disabled = true; });
    try {
      if (editing) await call(`/admin/offers/${editing.id}`, 'PUT', body);
      else await call('/admin/offers', 'POST', body);
      toast('success', intent === 'activate' ? (body.kind === 'nearby' ? t('offers.toast.started') : t('offers.toast.scheduled')) : t('offers.toast.saved'));
      close();
      await load();
    } catch (err) {
      showErrors(err.errors);
      toast('error', tr(err.message));
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  /* ---------------- events ---------------- */
  $('offRadius').addEventListener('input', () => {
    $('offRadiusValue').textContent = meters(radius());
    if (circle) circle.setRadius(radius());
  });
  $('offMyLocation').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('error', t('offers.branch.noGeo')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => drawPoint([p.coords.latitude, p.coords.longitude], true),
      () => toast('error', t('offers.branch.geoDenied')),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
  $('offPasteApply').addEventListener('click', () => {
    const p = parseLocation($('offPaste').value);
    if (!p) { toast('error', t('offers.branch.badLink')); return; }
    drawPoint(p, true);
    $('offPaste').value = '';
  });
  $('offSaveBranch').addEventListener('click', async () => {
    if (!point) { toast('error', t('offers.branch.notSet')); return; }
    try {
      DATA.branch = await call('/admin/offers/branch', 'PUT', { latitude: point[0], longitude: point[1], radius_m: radius() });
      toast('success', t('offers.toast.branch'));
    } catch (err) { toast('error', tr(err.message)); }
  });
  $('offSaveCap').addEventListener('click', async () => {
    try {
      DATA.settings = await call('/admin/offers/settings', 'PUT', { daily_cap: Number($('offCap').value) });
      toast('success', t('offers.toast.cap'));
    } catch (err) { toast('error', tr((err.errors && err.errors.daily_cap) || err.message)); }
  });
  $('offNew').addEventListener('click', () => open(null));

  $('offList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = Number(b.dataset.id);
    const o = (DATA.offers || []).find((x) => Number(x.id) === id);
    const act = b.dataset.act;
    if (act === 'edit') { open(o); return; }
    if (act === 'delete' || act === 'send_now') {
      const ok = UI.confirmAction ? await UI.confirmAction({
        title: act === 'delete' ? t('offers.confirm.deleteTitle') : t('offers.confirm.sendTitle'),
        message: esc(act === 'delete' ? t('offers.confirm.delete') : t('offers.confirm.send')),
        reasonRequired: false, danger: act === 'delete', placeholder: t('offers.confirm.note'),
      }) : true;
      if (!ok) return;
    }
    b.disabled = true;
    try {
      if (act === 'delete') await call(`/admin/offers/${id}`, 'DELETE');
      else if (act === 'duplicate') await call(`/admin/offers/${id}/duplicate`, 'POST', {});
      else {
        const res = await call(`/admin/offers/${id}/status`, 'PATCH', { action: act });
        if (act === 'send_now') toast('success', t('offers.toast.sent', { n: Number(res.recipients || 0) }));
      }
      if (act !== 'send_now') toast('success', t('offers.toast.done'));
      await load();
    } catch (err) {
      toast('error', tr(err.message), err.errors ? Object.values(err.errors).map((v) => tr(String(v))).join(' ') : '');
      b.disabled = false;
    }
  });

  document.querySelectorAll('input[name="offKind"]').forEach((r) => r.addEventListener('change', showKind));
  $('offAction').addEventListener('change', () => {
    $('offDishWrap').hidden = $('offAction').value !== 'dish';
    preview();
  });
  ['offTitle', 'offTitleAr', 'offBody', 'offBodyAr', 'offImage', 'offCode'].forEach((id) => $(id).addEventListener('input', preview));
  $('offCode').addEventListener('change', preview);
  document.querySelectorAll('.off-preview-lang button').forEach((b) => b.addEventListener('click', () => {
    previewLang = b.dataset.lang;
    document.querySelectorAll('.off-preview-lang button').forEach((x) => x.classList.toggle('is-on', x === b));
    preview();
  }));
  $('offImageFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('prefix', 'menu');
    try {
      const up = await API.uploadImage(fd);
      $('offImage').value = up.url;
      preview();
    } catch (err) { toast('error', tr(err.message)); }
    e.target.value = '';
  });
  $('offSaveDraft').addEventListener('click', () => save('draft'));
  $('offActivate').addEventListener('click', () => save('activate'));
  $('offCancel').addEventListener('click', close);
  $('offTest').addEventListener('click', async () => {
    if (!editing) return;
    try {
      const res = await call(`/admin/offers/${editing.id}/test`, 'POST', {});
      toast('success', t('offers.toast.test'), res.has_subscription ? '' : t('offers.toast.testNoPhone'));
    } catch (err) { toast('error', tr(err.message)); }
  });

  if (I18N && I18N.onChange) I18N.onChange(() => {
    if (!DATA) return;
    renderTop();
    renderList();
    $('offRadiusValue').textContent = meters(radius());
    if (point) drawPoint(point, false);
  });

  window.SavoriaAdminOffers = { load, parseLocation };
})();
