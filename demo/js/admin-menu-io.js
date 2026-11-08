/* =========================================================
   Tarmez — Site Management → Menu: Excel import / export
   js/admin-menu-io.js

   · "Download template": an .xlsx with the columns, two example
     dishes and a sheet of instructions;
   · "Export to Excel": the whole menu in the same columns (edit it
     and import it back to change many dishes at once);
   · "Import from Excel": the browser reads the file (SheetJS), the
     server checks every row (POST /admin/menu-import, apply:false)
     and shows new / updated / errors; "Import" saves all rows, or
     nothing when a row has an error.
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
  const can = (level) => (window.SavoriaCan ? window.SavoriaCan('menu', level) : true);
  if (!API || !$('menuImportBtn')) return;

  const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const lang = () => (I18N && I18N.getLang ? I18N.getLang() : 'en');
  const call = (path, method = 'GET', body = null) => API.request(path, { method, body, auth: true });

  /* the columns: key, English heading, Arabic heading, width */
  const COLS = [
    ['category', 'Category (English)', 'الفئة (إنجليزي)', 18],
    ['category_ar', 'Category (Arabic)', 'الفئة (عربي)', 18],
    ['name', 'Dish name (English)', 'اسم الطبق (إنجليزي)', 26],
    ['name_ar', 'Dish name (Arabic)', 'اسم الطبق (عربي)', 26],
    ['description', 'Description (English)', 'الوصف (إنجليزي)', 36],
    ['description_ar', 'Description (Arabic)', 'الوصف (عربي)', 36],
    ['price', 'Price (SAR)', 'السعر (ر.س)', 12],
    ['options', 'Sizes', 'المقاسات', 40],
    ['calories', 'Calories', 'السعرات', 10],
    ['prep_time_minutes', 'Prep time (min)', 'وقت التحضير (دقيقة)', 12],
    ['discount_percent', 'Discount %', 'الخصم %', 10],
    ['is_available', 'Available', 'متاح', 10],
    ['has_spicy_option', 'Spicy choice', 'اختيار سبايسي', 12],
    ['image_url', 'Image link', 'رابط الصورة', 40],
  ];
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s_\-().%|/:]+/g, '');
  const ALIASES = new Map();
  COLS.forEach(([key, en, ar]) => [key, en, ar, `${ar} | ${en}`, `${en} | ${ar}`].forEach((h) => ALIASES.set(norm(h), key)));
  const heading = ([, en, ar]) => `${ar} | ${en}`;

  let sheetjs = null;
  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (sheetjs) return sheetjs;
    sheetjs = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SHEETJS;
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { sheetjs = null; reject(new Error(t('menuio.libFailed'))); };
      document.head.appendChild(s);
    });
    return sheetjs;
  }

  const yesNo = (b) => (lang() === 'ar' ? (b ? 'نعم' : 'لا') : (b ? 'yes' : 'no'));

  function book(XLSX, rows, withHelp) {
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: lang() === 'ar' }] };
    const ws = XLSX.utils.aoa_to_sheet([COLS.map(heading), ...rows]);
    ws['!cols'] = COLS.map((c) => ({ wch: c[3] }));
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, lang() === 'ar' ? 'القائمة' : 'Menu');
    if (withHelp) {
      const help = XLSX.utils.aoa_to_sheet(t('menuio.help').split('\n').map((line) => [line]));
      help['!cols'] = [{ wch: 110 }];
      XLSX.utils.book_append_sheet(wb, help, lang() === 'ar' ? 'تعليمات' : 'Instructions');
    }
    return wb;
  }

  async function downloadTemplate() {
    try {
      const XLSX = await loadSheetJS();
      const examples = [
        ['Grills', 'مشويات', 'Mixed Grill', 'مشويات مشكلة', 'Lamb, chicken and kofta', 'لحم ودجاج وكفتة', '', 'Small / صغير : 49 : 650 | Large / كبير : 89 : 1100', '', '25', '0', yesNo(true), yesNo(true), 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&q=80'],
        ['Desserts', 'حلويات', 'Saffron Kunafa', 'كنافة بالزعفران', '', '', '29', '', '470', '10', '10', yesNo(true), yesNo(false), ''],
      ];
      XLSX.writeFile(book(XLSX, examples, true), 'tarmez-menu-template.xlsx');
    } catch (err) { toast('error', tr(err.message)); }
  }

  async function exportMenu() {
    const btn = $('menuExportBtn');
    btn.disabled = true;
    try {
      const [XLSX, rows] = await Promise.all([loadSheetJS(), call('/admin/menu-export')]);
      const data = rows.map((r) => COLS.map(([key]) => {
        const v = r[key];
        if (key === 'is_available' || key === 'has_spicy_option') return yesNo(!!v);
        return v === null || v === undefined ? '' : v;
      }));
      XLSX.writeFile(book(XLSX, data, false), `tarmez-menu-${new Date().toLocaleDateString('en-CA')}.xlsx`);
      toast('success', t('menuio.exported', { n: rows.length }));
    } catch (err) {
      toast('error', tr(err.message));
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------------- import ---------------- */
  let ROWS = null;

  function step(review) {
    $('mioPick').hidden = review;
    $('mioReview').hidden = !review;
    $('mioAnother').hidden = !review;
    $('mioApply').hidden = !review;
  }

  function openImport() {
    ROWS = null;
    $('mioFile').value = '';
    $('mioPickError').textContent = '';
    step(false);
    UI.openModal ? UI.openModal('menuImportModal') : $('menuImportModal').classList.add('open');
  }

  function closeImport() {
    UI.closeModal ? UI.closeModal('menuImportModal') : $('menuImportModal').classList.remove('open');
  }

  /** The first sheet → [{ key: value, _row }], by the heading row (Arabic, English or both). */
  function readRows(XLSX, buffer, fileName) {
    const wb = XLSX.read(buffer, { type: 'array', codepage: 65001 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: true });
    const headerAt = grid.findIndex((r) => r.some((c) => ALIASES.has(norm(c))));
    if (headerAt < 0) throw new Error(t('menuio.noHeader'));
    const keys = grid[headerAt].map((c) => ALIASES.get(norm(c)) || null);
    if (!keys.includes('name') && !keys.includes('name_ar')) throw new Error(t('menuio.noHeader'));
    const rows = [];
    for (let i = headerAt + 1; i < grid.length; i++) {
      const r = { _row: i + 1 };
      let any = false;
      keys.forEach((k, j) => {
        if (!k) return;
        const v = String(grid[i][j] ?? '').trim();
        if (v !== '') any = true;
        r[k] = v;
      });
      if (any) rows.push(r);
    }
    if (!rows.length) throw new Error(t('menuio.empty'));
    $('mioFileName').textContent = `📄 ${fileName}`;
    return rows;
  }

  /** The row's name in the page language (the file may give one language only). */
  const pickName = (r, f) => (lang() === 'ar' ? (r[f + '_ar'] || r[f + '_en']) : (r[f + '_en'] || r[f + '_ar'])) || r[f] || '';

  function render(res) {
    const s = res.summary;
    const chip = (cls, n, label) => `<span class="mio-chip ${cls}"><b>${Number(n)}</b> ${esc(label)}</span>`;
    $('mioSummary').innerHTML = [
      chip('is-new', s.create, t('menuio.sum.create')),
      chip('is-update', s.update, t('menuio.sum.update')),
      s.new_categories ? chip('is-cat', s.new_categories, t('menuio.sum.categories')) : '',
      chip(s.errors ? 'is-error' : 'is-ok', s.errors, t('menuio.sum.errors')),
    ].join('');
    const rows = [...res.results].sort((a, b) => (b.action === 'error') - (a.action === 'error') || a.row - b.row);
    $('mioRows').innerHTML = rows.map((r) => `
      <tr class="mio-${esc(r.action)}">
        <td>${Number(r.row)}</td>
        <td>${esc(pickName(r, 'name') || '—')}</td>
        <td>${esc(pickName(r, 'category'))}${r.new_category ? ` <span class="mio-tag">${esc(t('menuio.newCategory'))}</span>` : ''}</td>
        <td>${r.action === 'error'
          ? `<ul class="mio-errors">${(r.errors || []).map((e) => `<li>${esc(tr(e))}</li>`).join('')}</ul>`
          : `<span class="mio-badge">${esc(t('menuio.action.' + r.action))}</span>`}</td>
      </tr>`).join('');
    $('mioApply').disabled = s.errors > 0 || s.rows === 0;
    $('mioApply').textContent = s.errors > 0 ? t('menuio.fixFirst') : t('menuio.applyN', { n: s.create + s.update });
  }

  async function onFile(file) {
    if (!file) return;
    $('mioPickError').textContent = '';
    try {
      const XLSX = await loadSheetJS();
      ROWS = readRows(XLSX, await file.arrayBuffer(), file.name);
      const res = await call('/admin/menu-import', 'POST', { rows: ROWS, apply: false });
      render(res);
      step(true);
    } catch (err) {
      $('mioPickError').textContent = tr(err.message);
    }
  }

  async function apply() {
    if (!ROWS) return;
    const btn = $('mioApply');
    btn.disabled = true;
    try {
      const res = await call('/admin/menu-import', 'POST', { rows: ROWS, apply: true });
      closeImport();
      toast('success', t('menuio.done', { create: res.summary.create, update: res.summary.update }));
      document.querySelector('#adminSideNav .tab-btn[data-tab="menu"], .tab-btn[data-tab="menu"]')?.click();
    } catch (err) {
      if (err.errors && err.errors.rows) render({ summary: summarize(err.errors.rows), results: err.errors.rows });
      toast('error', tr(err.message));
      btn.disabled = false;
    }
  }

  function summarize(rows) {
    const c = (a) => rows.filter((r) => r.action === a).length;
    return { rows: rows.length, create: c('create'), update: c('update'), errors: c('error'), new_categories: rows.filter((r) => r.new_category).length };
  }

  /* ---------------- events ---------------- */
  function permissions() {
    $('menuImportBtn').hidden = !can('edit');
    $('menuTemplateBtn').hidden = !can('edit');
  }
  permissions();
  window.SavoriaAdminShell?.ready?.then?.(permissions);

  $('menuTemplateBtn').addEventListener('click', downloadTemplate);
  $('menuExportBtn').addEventListener('click', exportMenu);
  $('menuImportBtn').addEventListener('click', openImport);
  $('mioFile').addEventListener('change', (e) => onFile(e.target.files && e.target.files[0]));
  const drop = $('mioDrop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    onFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  $('mioCancel').addEventListener('click', closeImport);
  $('mioAnother').addEventListener('click', () => { $('mioFile').value = ''; step(false); });
  $('mioApply').addEventListener('click', apply);

  window.SavoriaMenuIO = { readRows, COLS };
})();
