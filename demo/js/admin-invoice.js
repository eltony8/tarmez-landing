/* =========================================================
   Tarmez — Site Management → Invoice design (admins only)
   js/admin-invoice.js  (renderer: js/invoice-render.js)

   · ready designs + "use the site colours";
   · every colour, the texture, the line drawings and the title;
   · the logo and the photo under the text (a dish from the order,
     or an uploaded image), its size, place, shape and angle;
   · what appears on the invoice, the texts, payment lines and
     extra fields;
   · the seller's registered details for the Saudi tax invoice
     (ZATCA): name, VAT number, CR number and national address.
   A live preview with a sample order follows every change.
   ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const tr = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const lang = () => (I18N && I18N.getLang ? I18N.getLang() : 'en');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const UI = window.SavoriaAdminUI || {};
  const toast = (type, msg, detail = '') => (UI.toast ? UI.toast(type, msg, detail) : console.warn(msg));
  const API = typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null;
  const INV = window.SavoriaInvoice;
  if (!API || !INV || !$('tab-invoice')) return;

  const HEX = /^#[0-9A-Fa-f]{6}$/;
  const COLOR_KEYS = ['page', 'ink', 'muted', 'accent', 'accentInk', 'line', 'title', 'decor'];
  const SHOW_KEYS = ['title', 'subtitle', 'customer', 'meta', 'seller', 'vatNumber', 'crNumber', 'sellerAddress', 'itemNo',
    'itemOptions', 'itemNotes', 'arabicNames', 'payment', 'discounts', 'taxable', 'qr', 'zatcaNote', 'uuid', 'terms', 'thanks', 'footer'];
  const TEXT_KEYS = ['title_en', 'title_ar', 'terms_en', 'terms_ar', 'thanks_en', 'thanks_ar', 'footer_en', 'footer_ar'];
  const SELLER_KEYS = ['seller_name', 'seller_name_ar', 'vat_number', 'cr_number', 'building_no', 'street', 'street_ar', 'district',
    'district_ar', 'city', 'city_ar', 'postal_code', 'additional_no', 'phone', 'email'];
  const EXTRA_SUGGESTIONS = [
    { label_en: 'Branch', label_ar: 'الفرع', value: '' },
    { label_en: 'Cashier', label_ar: 'الكاشير', value: '' },
    { label_en: 'Buyer VAT no.', label_ar: 'الرقم الضريبي للمشتري', value: '' },
    { label_en: 'Supply date', label_ar: 'تاريخ التوريد', value: '' },
  ];

  let design = INV.designOf(null);
  let seller = {};
  let saved = '';
  let loaded = false;

  /* ---------- building the controls ---------- */
  const group = (key, body, open = false) => `
    <details class="invd-group"${open ? ' open' : ''}>
      <summary>${esc(t('invd.groups.' + key))}</summary>
      <div class="invd-group-body">${body}</div>
    </details>`;
  const field = (label, input, hint = '') => `<label class="invd-field"><span>${esc(label)}</span>${input}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  const select = (id, options) => `<select id="${id}">${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;

  function buildControls() {
    const presets = Object.entries(INV.PRESETS).map(([id, p]) => `
      <button type="button" class="invd-preset" data-preset="${id}" style="--a:${p.colors.page};--b:${p.colors.accent};--c:${p.colors.ink}">
        <span class="invd-preset-swatch"><i></i><i></i><i></i></span>
        <span>${esc(p.label[lang()] || p.label.en)}</span>
      </button>`).join('');

    const colors = COLOR_KEYS.map((k) => `
      <label class="invd-color">
        <input type="color" data-color="${k}">
        <span><strong>${esc(t('invd.colors.' + k))}</strong><input type="text" data-color-hex="${k}" maxlength="7" dir="ltr" spellcheck="false"></span>
      </label>`).join('');

    const shows = SHOW_KEYS.map((k) => `
      <label class="invd-check"><input type="checkbox" data-show="${k}"><span>${esc(t('invd.show.' + k))}</span></label>`).join('');

    const texts = TEXT_KEYS.filter((k) => !k.startsWith('title')).map((k) => field(t('invd.texts.' + k),
      k.startsWith('footer') ? `<input type="text" data-text="${k}" maxlength="160"${k.endsWith('_ar') ? ' dir="rtl" lang="ar"' : ''}>`
        : `<textarea data-text="${k}" rows="2" maxlength="400"${k.endsWith('_ar') ? ' dir="rtl" lang="ar"' : ''}></textarea>`)).join('');

    const sellerField = (k, extra = '') => field(t('invd.seller.' + k), `<input type="text" data-seller="${k}" ${extra}>`);

    $('invdControls').innerHTML = `
      ${group('style', `<div class="invd-presets">${presets}</div>
        <button type="button" class="btn btn-outline btn-sm" id="invdSiteColors">${esc(t('invd.useSiteColors'))}</button>`, true)}
      ${group('colors', `<div class="invd-colors">${colors}</div>`)}
      ${group('look', `
        <div class="invd-row">
          ${field(t('invd.texture'), select('invdTexture', [['chalk', t('invd.textures.chalk')], ['paper', t('invd.textures.paper')], ['none', t('invd.textures.none')]]))}
          ${field(t('invd.decor'), select('invdDecor', [['herbs', t('invd.decors.herbs')], ['olive', t('invd.decors.olive')], ['spices', t('invd.decors.spices')], ['none', t('invd.decors.none')]]))}
        </div>
        <div class="invd-row">
          ${field(t('invd.titleStyle'), select('invdTitleStyle', [['chalk', t('invd.titleStyles.chalk')], ['outline', t('invd.titleStyles.outline')], ['solid', t('invd.titleStyles.solid')]]))}
        </div>
        <div class="invd-row">
          ${field(t('invd.texts.title_en'), '<input type="text" data-text="title_en" maxlength="24">')}
          ${field(t('invd.texts.title_ar'), '<input type="text" data-text="title_ar" maxlength="24" dir="rtl" lang="ar">')}
        </div>`)}
      ${group('images', `
        <label class="invd-check"><input type="checkbox" id="invdLogoShow"><span>${esc(t('invd.logoShow'))}</span></label>
        <div class="invd-upload">
          <img id="invdLogoThumb" alt="">
          <label class="btn btn-outline btn-sm">${esc(t('invd.upload'))}<input type="file" accept="image/*" id="invdLogoFile" hidden></label>
          <button type="button" class="btn btn-outline btn-sm" id="invdLogoReset">${esc(t('invd.useDefault'))}</button>
        </div>
        <hr class="invd-sep">
        <label class="invd-check"><input type="checkbox" id="invdPhotoShow"><span>${esc(t('invd.photoShow'))}</span></label>
        ${field(t('invd.photoSource'), select('invdPhotoSource', [['order', t('invd.photoSources.order')], ['custom', t('invd.photoSources.custom')]]))}
        <div class="invd-upload" id="invdPhotoUploadRow">
          <img id="invdPhotoThumb" alt="">
          <label class="btn btn-outline btn-sm">${esc(t('invd.upload'))}<input type="file" accept="image/*" id="invdPhotoFile" hidden></label>
        </div>
        <div class="invd-row">
          ${field(t('invd.photoSize'), '<input type="range" id="invdPhotoSize" min="110" max="320" step="5">')}
          ${field(t('invd.photoRotate'), '<input type="range" id="invdPhotoRotate" min="-30" max="30" step="1">')}
        </div>
        <div class="invd-row">
          ${field(t('invd.photoPosition'), select('invdPhotoPosition', [['end', t('invd.positions.end')], ['start', t('invd.positions.start')]]))}
          ${field(t('invd.photoShape'), select('invdPhotoShape', [['circle', t('invd.shapes.circle')], ['rounded', t('invd.shapes.rounded')], ['none', t('invd.shapes.none')]]))}
        </div>`)}
      ${group('show', `<div class="invd-checks">${shows}</div>`)}
      ${group('texts', texts)}
      ${group('lines', `
        <h4 class="invd-sub">${esc(t('invd.paymentLines'))}</h4>
        <p class="mgmt-note">${esc(t('invd.paymentLinesNote'))}</p>
        <div id="invdPayLines" class="invd-lines"></div>
        <button type="button" class="btn btn-outline btn-sm" data-add-line="paymentLines">${esc(t('invd.addLine'))}</button>
        <h4 class="invd-sub">${esc(t('invd.extraFields'))}</h4>
        <p class="mgmt-note">${esc(t('invd.extraFieldsNote'))}</p>
        <div id="invdExtraLines" class="invd-lines"></div>
        <div class="invd-suggest">${EXTRA_SUGGESTIONS.map((s, i) => `<button type="button" class="invd-chip" data-suggest="${i}">+ ${esc(lang() === 'ar' ? s.label_ar : s.label_en)}</button>`).join('')}
          <button type="button" class="invd-chip" data-add-line="extraFields">+ ${esc(t('invd.addField'))}</button></div>`)}
      ${group('zatca', `
        <div class="invd-zatca-status" id="invdZatcaStatus"></div>
        <div class="invd-row">${sellerField('seller_name')}${sellerField('seller_name_ar', 'dir="rtl" lang="ar"')}</div>
        <div class="invd-row">${sellerField('vat_number', 'dir="ltr" inputmode="numeric" maxlength="15" placeholder="3XXXXXXXXXXXXX3"')}${sellerField('cr_number', 'dir="ltr" inputmode="numeric" maxlength="10"')}</div>
        <h4 class="invd-sub">${esc(t('invd.nationalAddress'))}</h4>
        <div class="invd-row">${sellerField('building_no', 'dir="ltr" inputmode="numeric" maxlength="4"')}${sellerField('additional_no', 'dir="ltr" inputmode="numeric" maxlength="4"')}</div>
        <div class="invd-row">${sellerField('street')}${sellerField('street_ar', 'dir="rtl" lang="ar"')}</div>
        <div class="invd-row">${sellerField('district')}${sellerField('district_ar', 'dir="rtl" lang="ar"')}</div>
        <div class="invd-row">${sellerField('city')}${sellerField('city_ar', 'dir="rtl" lang="ar"')}</div>
        <div class="invd-row">${sellerField('postal_code', 'dir="ltr" inputmode="numeric" maxlength="5"')}${sellerField('phone', 'dir="ltr"')}</div>
        ${sellerField('email', 'dir="ltr" type="email"')}
        <div class="form-error" id="invdSellerErrors"></div>
        <p class="mgmt-note invd-phase2">${esc(t('invd.phase2Note'))}</p>`)}
    `;
  }

  /* ---------- design ⇄ controls ---------- */
  function fill() {
    const root = $('invdControls');
    root.querySelectorAll('[data-color]').forEach((el) => { el.value = design.colors[el.dataset.color]; });
    root.querySelectorAll('[data-color-hex]').forEach((el) => { el.value = design.colors[el.dataset.colorHex]; });
    root.querySelectorAll('[data-show]').forEach((el) => { el.checked = !!design.show[el.dataset.show]; });
    root.querySelectorAll('[data-text]').forEach((el) => { el.value = design.texts[el.dataset.text] || ''; });
    root.querySelectorAll('[data-seller]').forEach((el) => { el.value = seller[el.dataset.seller] || ''; });
    $('invdTexture').value = design.texture;
    $('invdDecor').value = design.decor;
    $('invdTitleStyle').value = design.titleStyle;
    $('invdLogoShow').checked = !!design.logo.show;
    $('invdPhotoShow').checked = !!design.photo.show;
    $('invdPhotoSource').value = design.photo.source;
    $('invdPhotoSize').value = design.photo.size;
    $('invdPhotoRotate').value = design.photo.rotate;
    $('invdPhotoPosition').value = design.photo.position;
    $('invdPhotoShape').value = design.photo.shape;
    root.querySelectorAll('.invd-preset').forEach((b) => b.classList.toggle('is-active', b.dataset.preset === design.preset));
    renderLines();
    syncImages();
    zatcaStatus();
  }

  function renderLines() {
    const line = (list, f, i) => `
      <div class="invd-line" data-list="${list}" data-index="${i}">
        <input type="text" data-line="label_en" placeholder="${esc(t('invd.lineLabelEn'))}" value="${esc(f.label_en || '')}" maxlength="40">
        <input type="text" data-line="label_ar" placeholder="${esc(t('invd.lineLabelAr'))}" value="${esc(f.label_ar || '')}" maxlength="40" dir="rtl" lang="ar">
        <input type="text" data-line="value" placeholder="${esc(t('invd.lineValue'))}" value="${esc(f.value || '')}" maxlength="80">
        <button type="button" class="invd-line-remove" data-remove-line aria-label="${esc(t('invd.removeLine'))}">×</button>
      </div>`;
    $('invdPayLines').innerHTML = (design.paymentLines || []).map((f, i) => line('paymentLines', f, i)).join('');
    $('invdExtraLines').innerHTML = (design.extraFields || []).map((f, i) => line('extraFields', f, i)).join('');
  }

  function syncImages() {
    $('invdLogoThumb').src = design.logo.url || 'assets/favicon.svg';
    const custom = design.photo.source === 'custom';
    $('invdPhotoUploadRow').style.display = custom ? '' : 'none';
    $('invdPhotoThumb').src = design.photo.url || '';
    $('invdPhotoThumb').style.visibility = design.photo.url ? 'visible' : 'hidden';
  }

  function zatcaStatus() {
    const missing = [];
    if (!seller.seller_name && !seller.seller_name_ar) missing.push(t('invd.seller.seller_name'));
    if (!seller.vat_number) missing.push(t('invd.seller.vat_number'));
    if (!seller.cr_number) missing.push(t('invd.seller.cr_number'));
    if (!seller.building_no || !seller.street || !seller.city || !seller.postal_code) missing.push(t('invd.nationalAddress'));
    const box = $('invdZatcaStatus');
    box.className = 'invd-zatca-status ' + (missing.length ? 'is-missing' : 'is-ready');
    box.textContent = missing.length ? t('invd.zatcaMissing', { list: missing.join('، ') }) : t('invd.zatcaReady');
  }

  /* ---------- preview ---------- */
  let timer = 0;
  function preview() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const sample = JSON.parse(JSON.stringify(INV.SAMPLE));
      sample.seller = { ...seller };
      sample.invoice.issued_at = new Date().toISOString();
      const qr = seller.vat_number ? 'Sample ' + seller.vat_number : 'Sample invoice';
      $('invdStage').innerHTML = `<div class="invd-scale" id="invdScale">${INV.render(sample, design, { sampleQr: qr, fallbackPhoto: firstMenuPhoto() })}</div>`;
      fitPreview();
      $('invdStage').querySelectorAll('img').forEach((img) => img.addEventListener('load', fitPreview, { once: true }));
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPreview);
      $('invdSaveBtn').classList.toggle('is-dirty', JSON.stringify({ design, seller }) !== saved);
    }, 40);
  }
  // The sample order shows a real dish photo from the menu.
  let menuPhoto = '';
  function firstMenuPhoto() { return menuPhoto; }
  async function loadMenuPhoto() {
    try {
      const items = await API.getMenuItems();
      const list = Array.isArray(items) ? items : (items && items.items) || [];
      const dish = list.filter((i) => i && i.image_url).sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0))[0];
      menuPhoto = dish ? dish.image_url : '';
      preview();
    } catch (_) { /* the preview simply shows no photo */ }
  }
  function fitPreview() {
    const box = $('invdScale');
    if (!box) return;
    const k = Math.min(1, $('invdStage').clientWidth / 794);
    box.style.transform = `translateX(-50%) scale(${k})`;
    $('invdStage').style.height = (box.firstElementChild ? box.firstElementChild.offsetHeight : 1123) * k + 'px';
  }

  /* ---------- events ---------- */
  function onInput(e) {
    const el = e.target;
    if (el.type === 'file') {
      if (e.type === 'change') upload(el.files[0], el.id === 'invdLogoFile' ? 'logo' : 'photo');
      return;
    }
    if (el.dataset.color) {
      design.colors[el.dataset.color] = el.value.toUpperCase();
      const hex = $('invdControls').querySelector(`[data-color-hex="${el.dataset.color}"]`);
      if (hex) hex.value = el.value.toUpperCase();
      design.preset = 'custom';
    } else if (el.dataset.colorHex) {
      const v = el.value.trim();
      if (!HEX.test(v)) return;
      design.colors[el.dataset.colorHex] = v.toUpperCase();
      const pick = $('invdControls').querySelector(`[data-color="${el.dataset.colorHex}"]`);
      if (pick) pick.value = v;
      design.preset = 'custom';
    } else if (el.dataset.show) design.show[el.dataset.show] = el.checked;
    else if (el.dataset.text) design.texts[el.dataset.text] = el.value;
    else if (el.dataset.seller) { seller[el.dataset.seller] = el.value.trim(); zatcaStatus(); }
    else if (el.dataset.line) {
      const row = el.closest('.invd-line');
      design[row.dataset.list][Number(row.dataset.index)][el.dataset.line] = el.value;
    } else {
      switch (el.id) {
        case 'invdTexture': design.texture = el.value; break;
        case 'invdDecor': design.decor = el.value; break;
        case 'invdTitleStyle': design.titleStyle = el.value; break;
        case 'invdLogoShow': design.logo.show = el.checked; break;
        case 'invdPhotoShow': design.photo.show = el.checked; break;
        case 'invdPhotoSource': design.photo.source = el.value; syncImages(); break;
        case 'invdPhotoSize': design.photo.size = Number(el.value); break;
        case 'invdPhotoRotate': design.photo.rotate = Number(el.value); break;
        case 'invdPhotoPosition': design.photo.position = el.value; break;
        case 'invdPhotoShape': design.photo.shape = el.value; break;
        default: return;
      }
    }
    $('invdControls').querySelectorAll('.invd-preset').forEach((b) => b.classList.toggle('is-active', b.dataset.preset === design.preset));
    preview();
  }

  function applyPreset(id) {
    const p = INV.PRESETS[id];
    if (!p) return;
    design.preset = id;
    design.colors = { ...p.colors };
    design.texture = p.texture;
    design.decor = p.decor;
    design.titleStyle = p.titleStyle;
    fill();
    preview();
  }

  function useSiteColors() {
    const css = getComputedStyle(document.documentElement);
    const get = (name, fallback) => {
      const v = css.getPropertyValue(name).trim();
      return HEX.test(v) ? v.toUpperCase() : fallback;
    };
    const charcoal = get('--color-charcoal', '#1F1B18');
    design.colors = {
      page: charcoal, ink: '#FBF6EE', muted: '#C9BFB2', accent: get('--color-terracotta', '#C4602E'), accentInk: '#FFFFFF',
      line: '#5A4A3E', title: '#FBF6EE', decor: get('--color-gold', '#D9A441'),
    };
    design.preset = 'custom';
    fill();
    preview();
  }

  async function upload(file, target) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('prefix', 'invoice');
    try {
      const res = await API.uploadImage(fd);
      if (target === 'logo') design.logo.url = res.url;
      else { design.photo.url = res.url; design.photo.source = 'custom'; $('invdPhotoSource').value = 'custom'; }
      syncImages();
      preview();
      toast('success', t('invd.uploaded'));
    } catch (err) { toast('error', t('admin.toasts.saveFailed'), tr(err.message)); }
  }

  function wire() {
    const root = $('invdControls');
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('click', (e) => {
      if (e.target.closest('#invdSiteColors')) { useSiteColors(); return; }
      if (e.target.closest('#invdLogoReset')) { design.logo.url = ''; syncImages(); preview(); return; }
      const preset = e.target.closest('[data-preset]');
      if (preset) { applyPreset(preset.dataset.preset); return; }
      const add = e.target.closest('[data-add-line]');
      if (add) {
        const list = add.dataset.addLine;
        if ((design[list] || []).length >= (list === 'paymentLines' ? 6 : 8)) { toast('error', t('invd.tooMany')); return; }
        design[list] = [...(design[list] || []), { label_en: '', label_ar: '', value: '' }];
        renderLines();
        preview();
        return;
      }
      const sug = e.target.closest('[data-suggest]');
      if (sug) {
        if ((design.extraFields || []).length >= 8) { toast('error', t('invd.tooMany')); return; }
        design.extraFields = [...(design.extraFields || []), { ...EXTRA_SUGGESTIONS[Number(sug.dataset.suggest)] }];
        renderLines();
        preview();
        return;
      }
      const rm = e.target.closest('[data-remove-line]');
      if (rm) {
        const row = rm.closest('.invd-line');
        design[row.dataset.list].splice(Number(row.dataset.index), 1);
        renderLines();
        preview();
      }
    });
    $('invdResetBtn').addEventListener('click', () => applyPreset(INV.PRESETS[design.preset] ? design.preset : 'chalk'));
    $('invdSaveBtn').addEventListener('click', save);
    window.addEventListener('resize', fitPreview);
  }

  async function save() {
    const btn = $('invdSaveBtn');
    btn.disabled = true;
    $('invdSellerErrors').textContent = '';
    try {
      const res = await API.saveInvoiceSettings({ seller, design });
      seller = { ...(res.seller || {}) };
      saved = JSON.stringify({ design, seller });
      fill();
      preview();
      toast('success', t('invd.saved'));
    } catch (err) {
      const errs = err.errors || {};
      $('invdSellerErrors').textContent = Object.values(errs).map(tr).join(' ');
      if (Object.keys(errs).some((k) => SELLER_KEYS.includes(k))) {
        const zatca = $('invdControls').querySelectorAll('.invd-group')[7];
        if (zatca) zatca.open = true;
      }
      toast('error', t('admin.toasts.saveFailed'), Object.values(errs).map(tr).join(' ') || tr(err.message));
    } finally { btn.disabled = false; }
  }

  async function load() {
    try {
      const res = await API.getInvoiceSettings();
      design = INV.designOf(res.design);
      seller = {};
      SELLER_KEYS.forEach((k) => { seller[k] = (res.seller && res.seller[k]) || ''; });
      if (!loaded) { buildControls(); wire(); loaded = true; loadMenuPhoto(); }
      fill();
      saved = JSON.stringify({ design, seller });
      preview();
    } catch (err) { toast('error', t('admin.toasts.loadFailed'), tr(err.message)); }
  }

  if (I18N && I18N.onChange) I18N.onChange(() => {
    if (!loaded || $('tab-invoice').style.display === 'none') return;
    buildControls();
    fill();
    preview();
  });

  window.SavoriaAdminInvoice = { load };
})();
