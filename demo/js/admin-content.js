/* =========================================================
   Tarmez — Site Management panel
   js/admin-content.js — Website Content Management.

   Controls everything the public website shows (restaurant
   details, images, our story, contact details, reviews and the
   section texts). Every value is stored in the database through
   the /admin/site-content API and applied to the storefront
   through /site-content.

   ── Languages ────────────────────────────────────────────
   Every editable text has an English and an Arabic version.
   The form shows both side by side, each field keeping its own
   value, and both are saved in one request (values / values_ar).
   An empty Arabic field simply means "use the shipped Arabic
   default", so a half-translated section is never a problem.
   ========================================================= */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const localize = (row, field) => (I18N ? I18N.localize(row, field) : (row ? row[field] : ''));
  const translateMessage = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

  const UI = window.SavoriaAdminUI || {};
  const toast = (type, message, detail = '') => {
    if (UI.toast) return UI.toast(type, message, detail);
    console.warn('[content] toast fallback', type, message);
  };
  const confirmAction = (opts) => (UI.confirmAction ? UI.confirmAction(opts) : Promise.resolve(false));

  const GROUP_LABELS = {
    restaurant: 'admin.content.subRestaurant',
    images: 'admin.content.subImages',
    story: 'admin.content.subStory',
    contact: 'admin.content.subContact',
    reviews: 'admin.content.subReviews',
    texts: 'admin.content.subTexts',
  };
  const TEXT_GROUPS = ['restaurant', 'story', 'contact', 'texts'];

  let DATA = null;          // the full CMS payload from the server
  let activeGroup = 'restaurant';
  let dirty = false;        // unsaved changes in the open form
  let saving = false;       // guards double submits
  let editingReviewId = null;
  let hoursRows = [];
  let hoursRowsAr = [];

  const groupLabel = (group) => t(GROUP_LABELS[group] || 'common.none');

  /* The picture slots carry an Arabic label, so the panel reads the same
     in both languages. */
  const slotLabel = (slot) => (I18N && I18N.isRTL() && slot.label_ar) ? slot.label_ar : slot.label;

  /* ======================================================
     Guard: this tool is admin-only (the server enforces it too)
     ====================================================== */
  const user = SavoriaAPI.getCurrentUser();
  if (!SavoriaAPI.isLoggedIn() || !user || !['super_admin', 'admin'].includes(user.role)) {
    window.SavoriaAdminContent = { load: async () => {} };
    return;
  }

  /* ======================================================
     Loading
     ====================================================== */
  async function load(force = false) {
    const panel = $('contentPanel');
    if (!panel) return;

    if (!DATA || force) {
      panel.innerHTML = `<div class="empty-state">${t('admin.content.loading')}</div>`;
      try {
        DATA = await SavoriaAPI.getAdminSiteContent();
      } catch (err) {
        panel.innerHTML = `<div class="empty-state">${t('admin.content.loadFailed', { message: esc(translateMessage(err.message)) })}</div>`;
        return;
      }
    }
    renderPanel();
  }

  function renderPanel() {
    // The payload is only there once the panel has loaded it — before
    // that there is nothing to draw (and nothing may throw).
    if (!DATA) return;
    if (activeGroup === 'reviews') return renderReviews();
    if (activeGroup === 'images') return renderImages();
    renderForm(activeGroup);
  }

  /* ======================================================
     Text groups — a form built from the server schema
     ====================================================== */
  function fieldLabel(field) {
    if (I18N && I18N.isRTL() && field.label_ar) return field.label_ar;
    return field.label || field.key;
  }

  function fieldInputHTML(field) {
    const value = DATA.settings[field.key] ?? field.default ?? '';
    const valueAr = DATA.settings_ar?.[field.key] ?? field.default_ar ?? '';
    const id = `cf_${field.key}`;

    if (field.type === 'json') {
      // Opening hours: one row per line, edited as label + time.
      hoursRows = parseHours(value);
      hoursRowsAr = parseHours(valueAr);
      return `
        <div class="content-lang-block">
          <span class="content-lang-tag">${t('admin.content.english')}</span>
          ${hoursEditorHTML('en', hoursRows)}
        </div>
        <div class="content-lang-block">
          <span class="content-lang-tag">${t('admin.content.arabic')}</span>
          ${hoursEditorHTML('ar', hoursRowsAr)}
        </div>`;
    }

    const type = field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text';

    const input = (value, extra) => (field.type === 'multiline'
      ? `<textarea ${extra} rows="3">${esc(value)}</textarea>`
      : `<input type="${type}" ${extra} value="${esc(value)}">`);

    const enAttrs = `id="${id}" data-content-key="${esc(field.key)}"`;
    const arAttrs = `id="${id}_ar" data-content-key-ar="${esc(field.key)}" dir="rtl" lang="ar"`;

    return `
      <div class="content-lang-block">
        <span class="content-lang-tag">${t('admin.content.english')}</span>
        ${input(value, enAttrs)}
      </div>
      <div class="content-lang-block">
        <span class="content-lang-tag">${t('admin.content.arabic')}</span>
        ${input(valueAr, arAttrs)}
        <div class="mgmt-note">${esc(t('admin.content.arabicHint'))}</div>
      </div>`;
  }

  function hoursEditorHTML(lang, rows) {
    const rowsAttr = lang === 'ar' ? 'data-hours-rows-ar' : 'data-hours-rows';
    const labelAttr = lang === 'ar' ? 'data-hours-label-ar' : 'data-hours-label';
    const valueAttr = lang === 'ar' ? 'data-hours-value-ar' : 'data-hours-value';
    const removeAttr = lang === 'ar' ? 'data-hours-remove-ar' : 'data-hours-remove';
    const addId = lang === 'ar' ? 'contentHoursAddAr' : 'contentHoursAdd';
    return `<div class="content-hours" ${rowsAttr}>
        ${rows.map((row, i) => `
          <div class="content-hours-row">
            <input type="text" ${labelAttr}="${i}" value="${esc(row.label)}" placeholder="Mon – Thu" ${lang === 'ar' ? 'dir="rtl" lang="ar"' : ''}>
            <input type="text" ${valueAttr}="${i}" value="${esc(row.value)}" placeholder="5:00 PM – 11:00 PM" ${lang === 'ar' ? 'dir="rtl" lang="ar"' : ''}>
            <button type="button" class="btn btn-outline btn-sm" ${removeAttr}="${i}">&times;</button>
          </div>`).join('')}
        <button type="button" class="btn btn-outline btn-sm" id="${addId}">+ ${t('admin.content.addRow')}</button>
      </div>`;
  }

  function fieldHTML(field) {
    const customised = Object.prototype.hasOwnProperty.call(DATA.overrides || {}, field.key);
    const customisedAr = Object.prototype.hasOwnProperty.call(DATA.overrides_ar || {}, field.key);
    const hint = I18N && I18N.isRTL() ? (field.hint_ar || field.hint) : field.hint;
    return `
      <div class="form-group">
        <label for="cf_${esc(field.key)}">${esc(fieldLabel(field))}${field.required ? ' <span style="color:var(--color-error);">*</span>' : ''}</label>
        ${fieldInputHTML(field)}
        <div class="form-error" data-error-for="cf_${esc(field.key)}"></div>
        ${hint ? `<div class="mgmt-note">${esc(hint)}</div>` : ''}
        ${customised ? `<div class="mgmt-note" style="color:var(--color-success);">${esc(t('admin.content.customisedBadge'))}</div>` : ''}
        ${customisedAr ? `<div class="mgmt-note" style="color:var(--color-success);">${esc(t('admin.content.customisedBadge'))} (${esc(t('admin.content.arabic'))})</div>` : ''}
      </div>`;
  }

  function renderForm(group) {
    const panel = $('contentPanel');
    if (!panel || !DATA) return;
    const fields = (DATA.schema || []).filter((f) => f.group === group);

    if (!fields.length) {
      panel.innerHTML = `<div class="empty-state">${t('admin.content.nothingToEdit')}</div>`;
      return;
    }

    const customised = fields.filter((f) => Object.prototype.hasOwnProperty.call(DATA.overrides || {}, f.key)).length;
    const customisedAr = fields.filter((f) => Object.prototype.hasOwnProperty.call(DATA.overrides_ar || {}, f.key)).length;

    panel.innerHTML = `
      <div class="order-card">
        <div class="admin-toolbar" style="margin-bottom:16px;">
          <strong>${esc(groupLabel(group))}</strong>
          <span class="mgmt-note" id="contentStatus">${t('admin.content.customised', { count: customised, total: fields.length })}</span>
          <span class="mgmt-note">${t('admin.content.customisedAr', { count: customisedAr, total: fields.length })}</span>
          <span style="flex:1"></span>
          <button class="btn btn-outline btn-sm" id="contentResetBtn">${t('admin.content.restoreDefaults')}</button>
          <button class="btn btn-primary" id="contentSaveBtn">${t('admin.content.saveChanges')}</button>
        </div>
        <div class="auth-alert" id="contentAlert"></div>
        <div class="content-grid">${fields.map(fieldHTML).join('')}</div>
      </div>`;

    // Dirty tracking + the opening-hours row editors.
    const form = panel.querySelector('.order-card');
    form.addEventListener('input', () => setDirty(true));
    form.addEventListener('change', () => setDirty(true));

    bindHoursEditor(panel, 'en', 'hoursRows');
    bindHoursEditor(panel, 'ar', 'hoursRowsAr');

    $('contentSaveBtn').addEventListener('click', saveGroup);
    $('contentResetBtn').addEventListener('click', () => resetGroup(group));
  }

  function bindHoursEditor(panel, lang, rowsVar) {
    const rowsAttr = lang === 'ar' ? '[data-hours-rows-ar]' : '[data-hours-rows]';
    const hoursWrap = panel.querySelector(rowsAttr);
    if (!hoursWrap) return;

    const labelAttr = lang === 'ar' ? 'data-hours-label-ar' : 'data-hours-label';
    const valueAttr = lang === 'ar' ? 'data-hours-value-ar' : 'data-hours-value';
    const removeAttr = lang === 'ar' ? 'data-hours-remove-ar' : 'data-hours-remove';
    const addId = lang === 'ar' ? 'contentHoursAddAr' : 'contentHoursAdd';

    hoursWrap.addEventListener('click', (e) => {
      const removeBtn = e.target.closest(`[${removeAttr}]`);
      if (removeBtn) {
        const index = Number(removeBtn.getAttribute(removeAttr));
        if (lang === 'ar') hoursRowsAr.splice(index, 1); else hoursRows.splice(index, 1);
        renderForm(activeGroup);
        setDirty(true);
        return;
      }
    });

    const addBtn = $(addId);
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (lang === 'ar') hoursRowsAr.push({ label: '', value: '' }); else hoursRows.push({ label: '', value: '' });
        renderForm(activeGroup);
        setDirty(true);
      });
    }
  }

  function parseHours(value) {
    try {
      const rows = JSON.parse(value);
      if (Array.isArray(rows)) {
        return rows.map((r) => ({
          label: String(r.label ?? ''),
          value: String(r.value ?? ''),
        }));
      }
    } catch (_) { /* fall through to the shipped default */ }
    return [{ label: '', value: '' }];
  }

  function collectValues() {
    const panel = $('contentPanel');
    const values = {};
    const valuesAr = {};

    panel.querySelectorAll('[data-content-key]').forEach((input) => {
      values[input.dataset.contentKey] = input.value.trim();
    });
    panel.querySelectorAll('[data-content-key-ar]').forEach((input) => {
      valuesAr[input.dataset.contentKeyAr] = input.value.trim();
    });

    const hoursWrap = panel.querySelector('[data-hours-rows]');
    if (hoursWrap) {
      const rows = [];
      hoursWrap.querySelectorAll('.content-hours-row').forEach((row) => {
        const label = row.querySelector('[data-hours-label]').value.trim();
        const value = row.querySelector('[data-hours-value]').value.trim();
        if (label === '' && value === '') return;
        rows.push({ label, value });
      });
      values.contact_hours = JSON.stringify(rows);
    }

    const hoursWrapAr = panel.querySelector('[data-hours-rows-ar]');
    if (hoursWrapAr) {
      const rowsAr = [];
      hoursWrapAr.querySelectorAll('.content-hours-row').forEach((row) => {
        const label = row.querySelector('[data-hours-label-ar]').value.trim();
        const value = row.querySelector('[data-hours-value-ar]').value.trim();
        if (label === '' && value === '') return;
        rowsAr.push({ label, value });
      });
      valuesAr.contact_hours = JSON.stringify(rowsAr);
    }

    return { values, valuesAr };
  }

  function setDirty(value) {
    dirty = value;
    const status = $('contentStatus');
    if (status && value) {
      status.textContent = t('admin.content.unsaved');
      status.style.color = 'var(--color-terracotta)';
    }
  }

  function showFieldErrors(errors) {
    const panel = $('contentPanel');
    panel.querySelectorAll('.form-error[data-error-for]').forEach((el) => { el.textContent = ''; });
    let first = null;
    Object.entries(errors || {}).forEach(([key, message]) => {
      const slot = panel.querySelector(`[data-error-for="cf_${CSS.escape(key)}"]`);
      if (slot) { slot.textContent = translateMessage(message); if (!first) first = slot; }
    });
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function saveGroup() {
    if (saving) return;
    const btn = $('contentSaveBtn');
    const alertBox = $('contentAlert');
    const { values, valuesAr } = collectValues();

    // Client-side required check before hitting the server — only the
    // fields of the section that is open are part of this form.
    const missing = (DATA.schema || [])
      .filter((f) => f.group === activeGroup && f.required && (values[f.key] ?? '') === '')
      .map((f) => f.key);
    if (missing.length) {
      const errors = {};
      missing.forEach((k) => { errors[k] = t('admin.content.fieldRequired'); });
      showFieldErrors(errors);
      alertBox.className = 'auth-alert error show';
      alertBox.textContent = t('admin.content.requiredFields');
      return;
    }

    saving = true;
    btn.disabled = true;
    btn.textContent = t('common.saving');
    alertBox.className = 'auth-alert';

    try {
      await SavoriaAPI.saveSiteContent({ values, values_ar: valuesAr, version: DATA.version });
      setDirty(false);
      await load(true);
      toast('success', t('admin.content.saved'), t('admin.content.savedDetail'));
    } catch (err) {
      if (err.status === 409) {
        alertBox.className = 'auth-alert error show';
        alertBox.textContent = translateMessage(err.message);
      } else if (err.errors && Object.keys(err.errors).length) {
        showFieldErrors(err.errors);
        alertBox.className = 'auth-alert error show';
        alertBox.textContent = translateMessage(err.message);
      } else {
        alertBox.className = 'auth-alert error show';
        alertBox.textContent = translateMessage(err.message) || t('admin.content.loadFailed', { message: '' });
      }
    } finally {
      saving = false;
      const currentBtn = $('contentSaveBtn');
      if (currentBtn) { currentBtn.disabled = false; currentBtn.textContent = t('admin.content.saveChanges'); }
    }
  }

  async function resetGroup(group) {
    const answer = await confirmAction({
      title: t('admin.content.restoreTitle'),
      message: t('admin.content.restoreMessage', { group: esc(groupLabel(group)) }),
      reasonRequired: false,
      danger: false,
      placeholder: t('admin.content.restorePlaceholder'),
    });
    if (!answer) return;

    try {
      await SavoriaAPI.resetSiteContent(group);
      setDirty(false);
      await load(true);
      toast('success', t('admin.content.defaultsRestored'), t('admin.content.defaultsRestoredDetail'));
    } catch (err) {
      toast('error', t('admin.content.defaultsRestored'), translateMessage(err.message));
    }
  }

  /* ======================================================
     Website images
     ====================================================== */
  function renderImages() {
    const panel = $('contentPanel');
    const slots = DATA.image_slots || [];
    const images = DATA.images || {};

    panel.innerHTML = `
      <div class="order-card">
        <div class="admin-toolbar" style="margin-bottom:16px;">
          <strong>${esc(t('admin.content.subImages'))}</strong>
          <span class="mgmt-note">${esc(t('admin.content.imagesNote'))}</span>
        </div>
        <div class="content-image-grid">
          ${slots.map((slot) => {
            const current = images[slot.key] || { url: slot.default_url, alt: slot.alt };
            const isCustom = current.url !== slot.default_url;
            // The preview uses the slot's own ratio, so the manager sees
            // exactly the shape the picture gets on the website.
            const ratio = `${Number(slot.width) || 4} / ${Number(slot.height) || 3}`;
            return `
              <div class="content-image-card">
                <div class="content-image-preview" style="aspect-ratio:${ratio};">
                  <img src="${esc(current.url)}" alt="${esc(current.alt || slot.label)}" loading="lazy">
                </div>
                <div class="content-image-meta">
                  <strong>${esc(slotLabel(slot))}</strong>
                  <span class="mgmt-note">${slot.width} × ${slot.height} px</span>
                  <span class="content-badge ${isCustom ? 'is-custom' : ''}">${isCustom ? esc(t('admin.content.customImage')) : esc(t('admin.content.defaultImage'))}</span>
                </div>
                <div class="content-image-actions">
                  <label class="file-label btn btn-outline btn-sm">
                    ${esc(t('admin.content.uploadNew'))}
                    <input type="file" accept="image/jpeg,image/png,image/webp" data-image-upload="${esc(slot.key)}" style="display:none;">
                  </label>
                  <button class="btn btn-outline btn-sm" data-image-reset="${esc(slot.key)}" ${isCustom ? '' : 'disabled'}>${esc(t('admin.content.useDefault'))}</button>
                </div>
                <div class="form-group" style="margin:0;">
                  <label for="alt_${esc(slot.key)}">${esc(t('admin.content.altText'))}</label>
                  <div style="display:flex;gap:8px;">
                    <input type="text" id="alt_${esc(slot.key)}" value="${esc(current.alt || '')}" data-alt-key="${esc(slot.key)}">
                    <button class="btn btn-outline btn-sm" data-alt-save="${esc(slot.key)}">${esc(t('common.save'))}</button>
                  </div>
                </div>
                <div class="preview-note" data-image-note="${esc(slot.key)}"></div>
              </div>`;
          }).join('')}
        </div>
      </div>`;

    panel.querySelectorAll('[data-image-upload]').forEach((input) => {
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
          toast('error', t('admin.content.onlyImages'));
          input.value = '';
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast('error', t('admin.content.tooLarge'));
          input.value = '';
          return;
        }
        uploadImage(input.dataset.imageUpload, file, input);
      });
    });
    panel.querySelectorAll('[data-image-reset]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const answer = await confirmAction({
          title: t('admin.content.restoreImageTitle'),
          message: t('admin.content.restoreImageMessage'),
          reasonRequired: false,
          danger: false,
        });
        if (!answer) return;
        try {
          await SavoriaAPI.resetSiteImage(btn.dataset.imageReset);
          await load(true);
          toast('success', t('admin.content.defaultImageRestored'));
        } catch (err) {
          toast('error', t('admin.content.defaultImageFailed'), translateMessage(err.message));
        }
      });
    });

    panel.querySelectorAll('[data-alt-save]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.altSave;
        const alt = panel.querySelector(`[data-alt-key="${CSS.escape(key)}"]`).value.trim();
        try {
          await SavoriaAPI.setSiteImage({ key, alt });
          await load(true);
          toast('success', t('admin.content.altSaved'));
        } catch (err) {
          toast('error', t('admin.content.altSaveFailed'), translateMessage(err.message));
        }
      });
    });
  }

  async function uploadImage(key, file, input) {
    const fd = new FormData();
    fd.append('key', key);
    fd.append('file', file);

    // Show the picked file straight away, then let the server crop it to
    // the exact size of the slot it belongs to.
    const card = input.closest('.content-image-card');
    const note = card ? card.querySelector(`[data-image-note="${CSS.escape(key)}"]`) : null;
    if (card) {
      const reader = new FileReader();
      reader.onload = () => {
        const img = card.querySelector('.content-image-preview img');
        if (img) img.src = reader.result;
        if (note) note.textContent = t('admin.upload.localPreview');
      };
      reader.readAsDataURL(file);
    }

    try {
      const res = await SavoriaAPI.uploadSiteImage(fd);
      if (res && res.images) DATA.images = res.images;
      await load(true);
      toast('success', t('admin.content.imageUploaded'), t('admin.content.imageUploadedDetail'));
    } catch (err) {
      input.value = '';
      toast('error', t('admin.content.uploadRejected'), translateMessage(err.message));
    }
  }

  /* ======================================================
     Reviews
     ====================================================== */
  const SOURCE_LABELS = { seed: 'admin.content.sourceSeed', customer: 'admin.content.sourceCustomer', editorial: 'admin.content.sourceEditorial' };

  function renderReviews() {
    const panel = $('contentPanel');
    const reviews = DATA.reviews || [];

    panel.innerHTML = `
      <div class="order-card">
        <div class="admin-toolbar" style="margin-bottom:16px;">
          <strong>${esc(t('admin.content.subReviews'))}</strong>
          <span class="mgmt-note">${esc(t('admin.content.reviewsNote'))}</span>
          <span style="flex:1"></span>
          <button class="btn btn-primary" id="addReviewBtn">${esc(t('admin.content.addReview'))}</button>
        </div>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>${esc(t('admin.content.thGuest'))}</th><th>${esc(t('admin.content.thRating'))}</th><th>${esc(t('admin.content.thText'))}</th><th>${esc(t('admin.content.thSource'))}</th><th>${esc(t('admin.content.thStatus'))}</th><th>${esc(t('admin.content.thFeatured'))}</th><th>${esc(t('admin.content.thOrder'))}</th><th></th>
            </tr></thead>
            <tbody id="reviewsTableBody">${reviews.length
              ? reviews.map(reviewRow).join('')
              : `<tr><td colspan="8"><div class="empty-state">${esc(t('admin.content.noReviews'))}</div></td></tr>`}</tbody>
          </table>
        </div>
      </div>`;

    $('addReviewBtn').addEventListener('click', () => openReviewEditor(null));

    panel.querySelectorAll('[data-review-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const review = reviews.find((r) => String(r.id) === btn.dataset.reviewEdit);
        if (review) openReviewEditor(review);
      });
    });

    panel.querySelectorAll('[data-review-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.reviewToggle);
        const review = reviews.find((r) => r.id === id);
        const next = review && review.status === 'published' ? 'hidden' : 'published';
        try {
          await SavoriaAPI.updateReview(id, { status: next });
          await load(true);
          toast('success', next === 'published' ? t('admin.content.reviewPublished') : t('admin.content.reviewHidden'));
        } catch (err) {
          toast('error', t('admin.content.reviewUpdatedFailed'), translateMessage(err.message));
        }
      });
    });

    panel.querySelectorAll('[data-review-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.reviewDelete);
        const answer = await confirmAction({
          title: t('admin.content.reviewDeleteTitle'),
          message: t('admin.content.reviewDeleteMessage'),
          reasonRequired: false,
        });
        if (!answer) return;
        try {
          await SavoriaAPI.deleteReview(id);
          await load(true);
          toast('success', t('admin.content.reviewDeleted'));
        } catch (err) {
          toast('error', t('admin.content.reviewUpdatedFailed'), translateMessage(err.message));
        }
      });
    });
  }

  function reviewRow(r) {
    const stars = '★'.repeat(Math.max(0, Math.min(5, r.rating))) + '☆'.repeat(5 - Math.max(0, Math.min(5, r.rating)));
    const text = String(localize(r, 'content') || '').length > 70
      ? String(localize(r, 'content')).slice(0, 70) + '…'
      : (localize(r, 'content') || t('common.notAvailable'));
    const statusLabel = { published: 'admin.content.statusPublished', pending: 'admin.content.statusPending', hidden: 'admin.content.statusHidden' }[r.status] || null;
    return `
      <tr>
        <td><strong>${esc(r.author_name)}</strong><br><span class="mgmt-note">${esc(localize(r, 'author_meta'))}</span></td>
        <td>${stars}</td>
        <td class="mgmt-note">${esc(text)}</td>
        <td><span class="content-badge ${r.source === 'seed' ? 'is-seed' : ''}">${esc(t(SOURCE_LABELS[r.source] || r.source))}</span></td>
        <td><span class="status-pill ${esc(r.status === 'published' ? 'delivered' : r.status === 'pending' ? 'pending' : 'cancelled')}">${esc(statusLabel ? t(statusLabel) : r.status)}</span></td>
        <td>${r.is_featured ? '★' : t('common.notAvailable')}</td>
        <td>${r.display_order}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-outline btn-sm" data-review-edit="${r.id}">${esc(t('admin.content.editReview'))}</button>
          <button class="btn btn-outline btn-sm" data-review-toggle="${r.id}">${r.status === 'published' ? esc(t('admin.content.hide')) : esc(t('admin.content.publish'))}</button>
          <button class="btn btn-outline btn-sm item-del" data-review-delete="${r.id}">${esc(t('common.delete'))}</button>
        </td>
      </tr>`;
  }

  function openReviewEditor(review) {
    editingReviewId = review ? review.id : null;
    $('reviewModalTitle').textContent = review
      ? t('admin.content.editReviewTitle', { name: review.author_name })
      : t('admin.content.addReviewTitle');
    $('rvName').value = review ? review.author_name : '';
    $('rvMeta').value = review ? (review.author_meta || '') : '';
    $('rvMetaAr').value = review ? (review.author_meta_ar || '') : '';
    $('rvAvatar').value = review ? (review.author_avatar || '') : '';
    $('rvRating').value = review ? String(review.rating) : '5';
    $('rvContent').value = review ? (review.content || '') : '';
    $('rvContentAr').value = review ? (review.content_ar || '') : '';
    $('rvSource').value = review ? review.source : 'editorial';
    $('rvStatus').value = review ? review.status : 'published';
    $('rvFeatured').checked = review ? !!review.is_featured : false;
    $('rvOrder').value = review ? review.display_order : ((DATA.reviews || []).length + 1);
    document.querySelectorAll('#reviewModal .form-error[data-error-for]').forEach((el) => { el.textContent = ''; });
    UI.openModal ? UI.openModal('reviewModal') : $('reviewModal').classList.add('open');
  }

  async function saveReview() {
    const btn = $('reviewSaveBtn');
    if (btn.disabled) return;

    const payload = {
      author_name: $('rvName').value.trim(),
      author_meta: $('rvMeta').value.trim(),
      author_meta_ar: $('rvMetaAr').value.trim(),
      author_avatar: $('rvAvatar').value.trim(),
      rating: Number($('rvRating').value),
      content: $('rvContent').value.trim(),
      content_ar: $('rvContentAr').value.trim(),
      source: $('rvSource').value,
      status: $('rvStatus').value,
      is_featured: $('rvFeatured').checked,
      display_order: Number($('rvOrder').value) || 0,
    };

    btn.disabled = true;
    btn.textContent = t('common.saving');
    try {
      if (editingReviewId) await SavoriaAPI.updateReview(editingReviewId, payload);
      else await SavoriaAPI.createReview(payload);
      UI.closeModal ? UI.closeModal('reviewModal') : $('reviewModal').classList.remove('open');
      await load(true);
      toast('success', editingReviewId ? t('admin.content.reviewUpdated') : t('admin.content.reviewAdded'));
    } catch (err) {
      document.querySelectorAll('#reviewModal .form-error[data-error-for]').forEach((el) => { el.textContent = ''; });
      if (err.errors) {
        Object.entries(err.errors).forEach(([key, message]) => {
          const slot = document.querySelector(`#reviewModal [data-error-for="${CSS.escape(key)}"]`);
          if (slot) slot.textContent = translateMessage(message);
        });
      }
      toast('error', t('admin.content.reviewSaveFailed'), translateMessage(err.message));
    } finally {
      btn.disabled = false;
      btn.textContent = t('admin.content.saveReview');
    }
  }

  /* ======================================================
     Sub-tabs + unsaved-changes guard
     ====================================================== */
  function bindSubtabs() {
    const wrap = $('contentSubtabs');
    if (!wrap) return;
    wrap.addEventListener('click', async (e) => {
      const btn = e.target.closest('.content-subtab');
      if (!btn || btn.dataset.group === activeGroup) return;

      if (dirty) {
        const answer = await confirmAction({
          title: t('admin.content.leaveSection'),
          message: t('admin.content.leaveSectionMessage', { group: esc(groupLabel(activeGroup)) }),
          reasonRequired: false,
          danger: false,
        });
        if (!answer) return;
        setDirty(false);
      }

      activeGroup = btn.dataset.group;
      wrap.querySelectorAll('.content-subtab').forEach((b) => b.classList.toggle('active', b === btn));
      renderPanel();
    });
  }

  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  document.addEventListener('DOMContentLoaded', () => {
    bindSubtabs();
    const saveBtn = $('reviewSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveReview);
  });

  window.SavoriaAdminContent = { load, renderPanel };
})();
