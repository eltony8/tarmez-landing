/* =========================================================
   Tarmez — Site Management → Site Colours
   js/admin-themes.js

   · ready palettes (js/palette.js) and the admins' own themes;
   · clicking one previews it on this page, "Save palette" puts it
     on the whole site;
   · the theme editor: six colours for light mode and six for dark
     mode, a free colour picker + hex code, shades that suit a
     restaurant, live previews and readability warnings. Dark mode
     follows the light colours automatically until the admin sets
     a dark colour by hand.
   ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const translateMessage = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
  const UI = window.SavoriaAdminUI || {};
  const toast = (type, message, detail = '') => (UI.toast ? UI.toast(type, message, detail) : console.warn(message));
  const P = () => window.SavoriaPalette;
  const lang = () => (I18N && I18N.getLang ? I18N.getLang() : 'en');

  const KEYS = ['accent', 'gold', 'charcoal', 'page', 'surface', 'border'];
  const HEX = /^#[0-9A-Fa-f]{6}$/;

  /* Shades that suit a restaurant site, per colour and mode. */
  const SUGGESTIONS = {
    light: {
      accent: ['#C4602E', '#B5442A', '#B3302A', '#8E2C3B', '#6B4226', '#B5611A', '#5E7032', '#3F6B47', '#1F6E5A', '#1F3A5F'],
      gold: ['#D9A441', '#C9A227', '#C69C46', '#E0A43A', '#C77D3A', '#B08D57', '#D4A64A', '#9C7A3C'],
      charcoal: ['#1F1B18', '#2A1F1A', '#1E1517', '#1B1E16', '#121A18', '#11161E', '#1D2328', '#121212'],
      page: ['#FBF6EE', '#FFF8EE', '#FCF6F3', '#F8F7EF', '#F5F8F5', '#F6F7FA', '#F7F6F3', '#FFFFFF'],
      surface: ['#FFFFFF', '#FFFCF6', '#FFFDF8', '#FDFBF7', '#FBFAF7', '#FAFBFC'],
      border: ['#F1E7D6', '#EADBC4', '#F3E3DC', '#E9E8D6', '#E3ECE6', '#E4E8EF', '#E8E6E1', '#DED6CB'],
    },
    dark: {
      accent: ['#C4602E', '#D27345', '#E08A4F', '#C25955', '#AD6570', '#B6641F', '#708049', '#438574', '#697B94', '#8C8C8C'],
      gold: ['#E8B959', '#F0C674', '#E3C886', '#EFC77A', '#F0D27F', '#E2C766', '#D2B98D', '#C9A96E'],
      charcoal: ['#1F1B18', '#2A1F1A', '#1E1517', '#1B1E16', '#121A18', '#11161E', '#1D2328', '#121212'],
      page: ['#15120F', '#17120F', '#14110F', '#101614', '#0F1418', '#121212', '#0E0E10', '#1A1410'],
      surface: ['#211C17', '#241E18', '#221A1C', '#1A221F', '#1A2026', '#1E1E1E', '#262019', '#1C1A17'],
      border: ['#3A322A', '#403528', '#3E2C30', '#2C3A34', '#2C3540', '#333333', '#4A3F33', '#35302A'],
    },
  };

  /* Readability checks (WCAG contrast). Text colours are the site's own. */
  const TEXT = { light: '#2C2621', dark: '#F3EDE1', onDark: '#FBF6EE' };
  const CHECKS = [
    ['buttonText', (c) => ['#FFFFFF', c.accent], 3],
    ['accentOnPage', (c) => [c.accent, c.page], 3],
    ['textOnPage', (c, m) => [TEXT[m], c.page], 4.5],
    ['textOnSurface', (c, m) => [TEXT[m], c.surface], 4.5],
    ['goldOnDark', (c) => [c.gold, c.charcoal], 3],
    ['textOnDark', (c) => [TEXT.onDark, c.charcoal], 4.5],
  ];

  let SAVED = null;        // { palette, custom? } from the server
  let PREVIEW = null;      // the id being previewed: "navy" or "custom:12"
  let CUSTOMS = [];        // the admins' themes
  let loaded = false;

  const customOf = (id) => CUSTOMS.find(c => `custom:${c.id}` === id) || null;
  const previewSelection = () => P()?.apply(PREVIEW, false, customOf(PREVIEW));

  /* ======================================================
     Palette list
     ====================================================== */
  function swatches(colors) {
    return `<span class="palette-swatches" aria-hidden="true">${colors.map(c => `<span style="background:${c}"></span>`).join('')}</span>`;
  }
  function sample(m) {
    return `<span class="palette-sample" aria-hidden="true" style="background:${m.page};">
      <span class="palette-sample-btn" style="background:${m.accent};">${esc(t('admin.appearance.sampleButton'))}</span>
      <span class="palette-sample-price" style="color:${m.accent};">SAR 95</span>
      <span class="palette-sample-dark" style="background:${m.charcoal};color:${m.gold};">★ 4.9</span>
    </span>`;
  }

  function render() {
    const palettes = P()?.PALETTES || {};
    $('paletteGrid').innerHTML = Object.entries(palettes).map(([id, p]) => {
      const selected = id === PREVIEW;
      return `<button type="button" class="palette-card${selected ? ' is-selected' : ''}" role="radio" aria-checked="${selected}" data-palette="${id}">
        ${swatches([p.accent, p.gold, p.sage, p.charcoal, p.page])}
        <span class="palette-name">${esc(p.name[lang()] || p.name.en)}</span>
        ${sample(p)}
        ${id === SAVED?.palette ? `<span class="palette-badge">${esc(t('admin.appearance.current'))}</span>` : ''}
      </button>`;
    }).join('');

    $('customThemeEmpty').style.display = CUSTOMS.length ? 'none' : '';
    $('customThemeGrid').innerHTML = CUSTOMS.map(c => {
      const id = `custom:${c.id}`;
      const selected = id === PREVIEW;
      return `<div class="palette-card custom-theme-card${selected ? ' is-selected' : ''}" role="radio" tabindex="0" aria-checked="${selected}" data-palette="${id}">
        ${swatches([c.light.accent, c.light.gold, c.light.charcoal, c.light.page])}
        ${swatches([c.dark.accent, c.dark.gold, c.dark.surface, c.dark.page])}
        <span class="palette-name">${esc(c.name)}</span>
        <span class="custom-theme-actions">
          <button type="button" class="btn btn-outline btn-sm" data-edit="${c.id}">${esc(t('admin.appearance.edit'))}</button>
          <button type="button" class="btn btn-outline btn-sm" data-copy="${c.id}">${esc(t('admin.appearance.duplicate'))}</button>
          <button type="button" class="btn btn-outline btn-sm danger" data-delete="${c.id}">${esc(t('admin.appearance.delete'))}</button>
        </span>
        ${id === SAVED?.palette ? `<span class="palette-badge">${esc(t('admin.appearance.current'))}</span>` : ''}
      </div>`;
    }).join('');

    document.querySelectorAll('#tab-appearance [data-palette]').forEach(card => {
      const pick = () => { PREVIEW = card.dataset.palette; previewSelection(); render(); document.querySelector(`#tab-appearance [data-palette="${PREVIEW}"]`)?.focus(); };
      card.addEventListener('click', (e) => { if (!e.target.closest('button[data-edit],button[data-delete],button[data-copy]')) pick(); });
      card.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); pick(); } });
    });
    document.querySelectorAll('#customThemeGrid [data-edit]').forEach(b => b.addEventListener('click', () => openEditor(CUSTOMS.find(c => c.id == b.dataset.edit))));
    document.querySelectorAll('#customThemeGrid [data-copy]').forEach(b => b.addEventListener('click', () => {
      const c = CUSTOMS.find(x => x.id == b.dataset.copy);
      openEditor(null, { light: { ...c.light }, dark: { ...c.dark } }, t('admin.appearance.copyName', { name: c.name }));
    }));
    document.querySelectorAll('#customThemeGrid [data-delete]').forEach(b => b.addEventListener('click', () => removeTheme(CUSTOMS.find(c => c.id == b.dataset.delete))));

    const unchanged = PREVIEW === SAVED?.palette;
    $('paletteSaveBtn').disabled = unchanged;
    $('paletteResetBtn').disabled = unchanged;
  }

  async function load() {
    const [current, customs] = await Promise.all([SavoriaAPI.getSiteTheme(), SavoriaAPI.listSiteThemes()]);
    SAVED = current;
    CUSTOMS = customs || [];
    if (!loaded || !PREVIEW) PREVIEW = SAVED.palette;
    loaded = true;
    render();
  }

  async function useSelection() {
    try {
      SAVED = await SavoriaAPI.saveSiteTheme(PREVIEW);
      PREVIEW = SAVED.palette;
      P()?.apply(SAVED.palette, true, SAVED.custom || null);
      render();
      toast('success', t('admin.appearance.saved'), t('admin.appearance.savedDetail'));
    } catch (err) {
      toast('error', t('admin.toasts.saveFailed'), translateMessage(err.message));
    }
  }

  async function removeTheme(c) {
    if (!c) return;
    const ok = UI.confirmAction ? await UI.confirmAction({
      title: t('admin.appearance.deleteTitle', { name: c.name }), message: t('admin.appearance.deleteMessage'), reasonRequired: false,
    }) : window.confirm(t('admin.appearance.deleteTitle', { name: c.name }));
    if (!ok) return;
    try {
      await SavoriaAPI.deleteSiteTheme(c.id);
      if (PREVIEW === `custom:${c.id}`) { PREVIEW = SAVED.palette; previewSelection(); }
      toast('success', t('admin.appearance.deleted'));
      await load();
    } catch (err) {
      toast('error', t('admin.appearance.deleteFailed'), translateMessage(err.message));
    }
  }

  /* ======================================================
     Theme editor
     ====================================================== */
  const ED = { id: null, spec: null, mode: 'light', darkTouched: new Set() };

  function startOptions() {
    const palettes = P()?.PALETTES || {};
    return Object.entries(palettes).map(([id, p]) => `<option value="${id}">${esc(p.name[lang()] || p.name.en)}</option>`).join('')
      + CUSTOMS.map(c => `<option value="custom:${c.id}">${esc(c.name)}</option>`).join('');
  }

  function specFrom(source) {
    if (source.startsWith('custom:')) {
      const c = customOf(source);
      return { light: { ...c.light }, dark: { ...c.dark } };
    }
    return P().toSpec(source);
  }

  function openEditor(theme = null, spec = null, name = '') {
    ED.id = theme ? theme.id : null;
    ED.spec = theme ? { light: { ...theme.light }, dark: { ...theme.dark } } : (spec || specFrom(PREVIEW || 'terracotta'));
    // an existing theme was set by hand in both modes; a new one follows light until edited
    ED.darkTouched = new Set(theme || spec ? KEYS : []);
    ED.mode = 'light';
    $('themeModalTitle').textContent = t(theme ? 'admin.themeEditor.editTitle' : 'admin.themeEditor.newTitle');
    $('themeName').value = theme ? theme.name : name;
    document.querySelector('[data-error-for="themeName"]').textContent = '';
    $('themeStartFrom').innerHTML = `<option value="">${esc(t('admin.themeEditor.startKeep'))}</option>` + startOptions();
    $('themeStartFrom').value = '';
    renderEditor();
    UI.openModal ? UI.openModal('themeModal') : $('themeModal').classList.add('open');
    setTimeout(() => $('themeName').focus(), 50);
  }

  function closeEditor() {
    UI.closeModal ? UI.closeModal('themeModal') : $('themeModal').classList.remove('open');
    previewSelection();
  }

  function renderEditor() {
    document.querySelectorAll('.theme-mode-tab').forEach(b => {
      const on = b.dataset.mode === ED.mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    $('themeModeNote').textContent = t(ED.mode === 'light' ? 'admin.themeEditor.lightNote' : 'admin.themeEditor.darkNote');
    const colors = ED.spec[ED.mode];
    $('themeColorRows').innerHTML = KEYS.map(key => {
      const auto = ED.mode === 'dark' && !ED.darkTouched.has(key);
      return `<div class="theme-color-row" data-key="${key}">
        <div class="theme-color-label">
          <label for="tc-${key}">${esc(t(`admin.themeEditor.colors.${key}`))}</label>
          <small>${esc(t(`admin.themeEditor.hints.${key}`))}</small>
          ${auto ? `<span class="theme-auto-badge">${esc(t('admin.themeEditor.auto'))}</span>` : ''}
        </div>
        <div class="theme-color-inputs">
          <input type="color" id="tc-${key}" value="${colors[key]}" aria-label="${esc(t(`admin.themeEditor.colors.${key}`))}">
          <input type="text" class="theme-hex" value="${colors[key]}" maxlength="7" spellcheck="false" dir="ltr" aria-label="${esc(t('admin.themeEditor.hex'))}">
          ${ED.mode === 'dark' && !auto ? `<button type="button" class="btn btn-outline btn-sm theme-reauto">${esc(t('admin.themeEditor.fromLight'))}</button>` : ''}
        </div>
        <div class="theme-suggestions" role="group" aria-label="${esc(t('admin.themeEditor.suggestions'))}">
          ${SUGGESTIONS[ED.mode][key].map(h => `<button type="button" class="theme-swatch${h.toUpperCase() === colors[key].toUpperCase() ? ' is-current' : ''}" style="background:${h}" data-hex="${h}" title="${h}" aria-label="${h}"></button>`).join('')}
        </div>
      </div>`;
    }).join('');

    $('themeColorRows').querySelectorAll('.theme-color-row').forEach(row => {
      const key = row.dataset.key;
      row.querySelector('input[type="color"]').addEventListener('input', (e) => setColor(key, e.target.value, row));
      const hex = row.querySelector('.theme-hex');
      hex.addEventListener('input', () => {
        let v = hex.value.trim();
        if (!v.startsWith('#')) v = '#' + v;
        const ok = HEX.test(v);
        hex.classList.toggle('is-invalid', !ok);
        if (ok) setColor(key, v, row);
      });
      row.querySelectorAll('.theme-swatch').forEach(s => s.addEventListener('click', () => { setColor(key, s.dataset.hex, row); renderEditor(); }));
      row.querySelector('.theme-reauto')?.addEventListener('click', () => {
        ED.darkTouched.delete(key);
        ED.spec.dark[key] = P().suggestDark(ED.spec.light)[key];
        renderEditor();
      });
    });
    refreshLive();
  }

  function setColor(key, value, row) {
    const v = value.toUpperCase();
    ED.spec[ED.mode][key] = v;
    if (ED.mode === 'light') {
      // dark mode follows the light colours for everything not set by hand
      const suggestion = P().suggestDark(ED.spec.light);
      KEYS.forEach(k => { if (!ED.darkTouched.has(k)) ED.spec.dark[k] = suggestion[k]; });
    } else {
      ED.darkTouched.add(key);
    }
    if (row) {
      row.querySelector('input[type="color"]').value = v.toLowerCase();
      const hex = row.querySelector('.theme-hex');
      if (document.activeElement !== hex) hex.value = v;
      row.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('is-current', s.dataset.hex.toUpperCase() === v));
    }
    refreshLive();
  }

  function previewBox(m, mode) {
    const text = TEXT[mode];
    return `<div class="theme-preview-title">${esc(t(mode === 'light' ? 'admin.themeEditor.light' : 'admin.themeEditor.dark'))}</div>
      <div class="theme-mock" style="background:${m.page};color:${text};">
        <div class="theme-mock-hero" style="background:${m.charcoal};color:${TEXT.onDark};">
          <strong>Tarmez</strong> <em style="color:${m.gold};">★ 4.9</em>
          <span class="theme-mock-btn" style="background:${mode === 'light' ? ED.spec.dark.accent : m.accent};">${esc(t('admin.themeEditor.mockReserve'))}</span>
        </div>
        <div class="theme-mock-card" style="background:${m.surface};border-color:${m.border};">
          <div class="theme-mock-row"><strong>${esc(t('admin.themeEditor.mockDish'))}</strong><span style="color:${m.accent};font-weight:700;">SAR 95</span></div>
          <small style="opacity:.75;">${esc(t('admin.themeEditor.mockDesc'))}</small>
          <span class="theme-mock-btn" style="background:${m.accent};">${esc(t('admin.appearance.sampleButton'))}</span>
        </div>
      </div>`;
  }

  function refreshLive() {
    $('themePreviewLight').innerHTML = previewBox(ED.spec.light, 'light');
    $('themePreviewDark').innerHTML = previewBox(ED.spec.dark, 'dark');
    const problems = [];
    ['light', 'dark'].forEach(mode => CHECKS.forEach(([id, pair, min]) => {
      const [a, b] = pair(ED.spec[mode], mode);
      const ratio = P().contrast(a, b);
      if (ratio < min) problems.push({ mode, id, ratio });
    }));
    $('themeWarnings').innerHTML = problems.length
      ? `<strong>⚠ ${esc(t('admin.themeEditor.warningsTitle'))}</strong><ul>${problems.map(p => `<li>${esc(t(`admin.themeEditor.modeShort.${p.mode}`))}: ${esc(t(`admin.themeEditor.checks.${p.id}`))} <span dir="ltr">(${p.ratio.toFixed(1)}:1)</span></li>`).join('')}</ul><small>${esc(t('admin.themeEditor.warningsNote'))}</small>`
      : `<span class="theme-all-good">✓ ${esc(t('admin.themeEditor.allGood'))}</span>`;
    $('themeWarnings').classList.toggle('has-problems', problems.length > 0);
    // the whole panel previews the theme while editing
    P()?.apply('custom:editing', false, ED.spec);
  }

  async function saveEditor(andUse) {
    const name = $('themeName').value.trim();
    const err = document.querySelector('[data-error-for="themeName"]');
    err.textContent = '';
    if (!name) { err.textContent = t('admin.themeEditor.nameRequired'); $('themeName').focus(); return; }
    const body = { name, light: ED.spec.light, dark: ED.spec.dark };
    try {
      const saved = ED.id ? await SavoriaAPI.updateSiteTheme(ED.id, body) : await SavoriaAPI.createSiteTheme(body);
      CUSTOMS = await SavoriaAPI.listSiteThemes();
      PREVIEW = `custom:${saved.id}`;
      UI.closeModal ? UI.closeModal('themeModal') : $('themeModal').classList.remove('open');
      if (andUse) {
        await useSelection();
      } else {
        previewSelection();
        render();
        toast('success', t('admin.themeEditor.saved'), t('admin.themeEditor.savedDetail'));
      }
    } catch (e) {
      const detail = e.errors && Object.keys(e.errors).length ? ' — ' + Object.values(e.errors).map(translateMessage).join(' ') : '';
      toast('error', t('admin.toasts.saveFailed'), translateMessage(e.message) + detail);
    }
  }

  /* ---------------- wiring ---------------- */
  function init() {
    if (!$('tab-appearance')) return;
    $('paletteSaveBtn').addEventListener('click', useSelection);
    $('paletteResetBtn').addEventListener('click', () => { PREVIEW = SAVED.palette; previewSelection(); render(); });
    $('themeNewBtn').addEventListener('click', () => openEditor());
    $('themeCancelBtn').addEventListener('click', closeEditor);
    $('themeModal').addEventListener('click', (e) => { if (e.target === $('themeModal')) previewSelection(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('themeModal').classList.contains('open')) closeEditor(); });
    $('themeSaveBtn').addEventListener('click', () => saveEditor(false));
    $('themeSaveUseBtn').addEventListener('click', () => saveEditor(true));
    $('themeStartFrom').addEventListener('change', (e) => {
      if (!e.target.value) return;
      ED.spec = specFrom(e.target.value);
      ED.darkTouched = new Set(KEYS);
      renderEditor();
    });
    document.querySelectorAll('.theme-mode-tab').forEach(b => b.addEventListener('click', () => { ED.mode = b.dataset.mode; renderEditor(); }));
    if (I18N && I18N.onChange) I18N.onChange(() => { if (loaded) render(); if ($('themeModal').classList.contains('open')) renderEditor(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.SavoriaAdminThemes = { load };
})();
