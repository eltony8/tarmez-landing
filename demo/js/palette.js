/* =========================================================
   Tarmez — site colour palettes
   js/palette.js  (loaded in <head> on every page, before first paint)

   The restaurant picks one palette in Site Management → Settings.
   The server only stores its id (GET /site-theme); the colours are
   defined here. The ids must match SiteThemeService.PALETTES.

   Each palette sets the brand variables of css/styles.css. `dark`
   holds the accent used in dark mode: a middle shade chosen so that
   white text on it AND the shade on the dark background both stay
   readable (contrast ≈ 4.3, like the original terracotta).
   ========================================================= */
(function () {
  'use strict';

  const PALETTES = {
    terracotta: {
      name: { en: 'Terracotta (default)', ar: 'تيراكوتا (الافتراضي)' },
      accent: '#C4602E', accentDark: '#A34A21', gold: '#D9A441', goldLight: '#E9C878', sage: '#6B7A5E',
      charcoal: '#1F1B18', charcoalLight: '#2C2621', page: '#FBF6EE', surfaceAlt: '#F1E7D6',
      dark: { accent: '#C4602E', accentDark: '#A34A21', gold: '#E8B959', goldLight: '#F3D48F' },
    },
    olive: {
      name: { en: 'Mediterranean Olive', ar: 'زيتوني متوسطي' },
      accent: '#5E7032', accentDark: '#4A5927', gold: '#C9A227', goldLight: '#E2C766', sage: '#8A7A5A',
      charcoal: '#1B1E16', charcoalLight: '#282C21', page: '#F8F7EF', surfaceAlt: '#E9E8D6',
      dark: { accent: '#708049', accentDark: '#5E7032', gold: '#E2C766', goldLight: '#EFDA9A' },
    },
    burgundy: {
      name: { en: 'Royal Burgundy', ar: 'نبيذي فاخر' },
      accent: '#8E2C3B', accentDark: '#6F1F2C', gold: '#C9A45C', goldLight: '#E3C88E', sage: '#6E7B6B',
      charcoal: '#1E1517', charcoalLight: '#2B1F22', page: '#FBF5F2', surfaceAlt: '#F0E2DE',
      dark: { accent: '#AD6570', accentDark: '#8E2C3B', gold: '#E3C88E', goldLight: '#EFDDB8' },
    },
    emerald: {
      name: { en: 'Emerald Garden', ar: 'زمردي' },
      accent: '#1F6E5A', accentDark: '#175546', gold: '#D4A64A', goldLight: '#E8C87F', sage: '#7A8B6F',
      charcoal: '#121A18', charcoalLight: '#1E2926', page: '#F5F8F5', surfaceAlt: '#E3ECE6',
      dark: { accent: '#438574', accentDark: '#1F6E5A', gold: '#E8C87F', goldLight: '#F2DCAE' },
    },
    navy: {
      name: { en: 'Navy & Gold', ar: 'كحلي وذهبي' },
      accent: '#1F3A5F', accentDark: '#162B47', gold: '#C9A348', goldLight: '#E3C886', sage: '#6C7F8C',
      charcoal: '#11161E', charcoalLight: '#1C2430', page: '#F6F7FA', surfaceAlt: '#E4E8EF',
      dark: { accent: '#697B94', accentDark: '#4D6080', gold: '#E3C886', goldLight: '#EFDCB4' },
    },
    saffron: {
      name: { en: 'Saffron Spice', ar: 'زعفران' },
      accent: '#B5611A', accentDark: '#94500F', gold: '#E2B33C', goldLight: '#F0D27F', sage: '#7B8457',
      charcoal: '#1F1A14', charcoalLight: '#2D261D', page: '#FFF8EE', surfaceAlt: '#F6E6CC',
      dark: { accent: '#B6641F', accentDark: '#94500F', gold: '#F0D27F', goldLight: '#F6E2AE' },
    },
    chili: {
      name: { en: 'Chili Red', ar: 'أحمر حار' },
      accent: '#B3302A', accentDark: '#92251C', gold: '#E0A43A', goldLight: '#EFC77A', sage: '#6F7B5D',
      charcoal: '#1D1513', charcoalLight: '#2B201D', page: '#FCF6F3', surfaceAlt: '#F3E3DC',
      dark: { accent: '#C25955', accentDark: '#B3302A', gold: '#EFC77A', goldLight: '#F5DCAA' },
    },
    charcoal: {
      name: { en: 'Modern Charcoal', ar: 'فحمي مودرن' },
      accent: '#2F2F2F', accentDark: '#151515', gold: '#B08D57', goldLight: '#D2B98D', sage: '#7D7D73',
      charcoal: '#121212', charcoalLight: '#1E1E1E', page: '#F7F6F3', surfaceAlt: '#E8E6E1',
      dark: { accent: '#7A7A7A', accentDark: '#5E5E5E', gold: '#D2B98D', goldLight: '#E5D4B5' },
    },
  };
  const DEFAULT_ID = 'terracotta';
  const STORAGE_KEY = 'savoria_palette';

  const channels = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const rgb = (hex) => channels(hex).join(', ');
  /** hex mixed toward black (to = 0) or white (to = 255) by share t. */
  const mix = (hex, to, t) => '#' + channels(hex).map(c => Math.round(c + (to - c) * t).toString(16).padStart(2, '0')).join('');

  /* Warm dark shades of the default design (backgrounds of the hero, footer,
     dark mode...). For another palette each one is recomputed from its charcoal,
     channel by channel in the same proportion to the default charcoal (#1F1B18),
     so it keeps the same darkness with the palette's own tint. */
  const DARK_BASE = channels('#1F1B18');
  const DARKS = ['120F0D', '14100C', '15110D', '17120E', '171310', '181410', '1B1611', '1E1813', '1E1915', '1F1B18',
    '241D16', '241E18', '241F19', '272019', '27211C', '2A2017', '2B2118', '2C2218', '352C24', '3A3024', '3A3128', '3E342B'];
  // the dark-mode surfaces of css/styles.css
  const DARK_MODE = { 'bg-page': '#15120F', 'bg-surface': '#211C17', 'bg-surface-alt': '#2A231C', 'border-color': '#3A322A', 'input-bg': '#1A1613' };
  const tintDark = (hex, charcoal) => {
    const c = channels(charcoal);
    return '#' + channels(hex).map((v, i) => Math.min(255, Math.round(c[i] * v / DARK_BASE[i])).toString(16).padStart(2, '0')).join('');
  };

  /* ---------------------------------------------------------
     A complete description of a look, light and dark:
       { light: { accent, accentDark, gold, goldLight, sage, charcoal, charcoalLight,
                  page, surface, surfaceAlt, border },
         dark:  { accent, accentDark, gold, goldLight, charcoal,
                  page, surface, surfaceAlt, border, inputBg } }
     Ready palettes and custom themes are both turned into one.
     --------------------------------------------------------- */
  function fromPreset(p) {
    const tint = (hex) => tintDark(hex, p.charcoal);
    return {
      light: { accent: p.accent, accentDark: p.accentDark, gold: p.gold, goldLight: p.goldLight, sage: p.sage,
        charcoal: p.charcoal, charcoalLight: p.charcoalLight, page: p.page, surface: null, surfaceAlt: p.surfaceAlt, border: p.surfaceAlt },
      dark: { accent: p.dark.accent, accentDark: p.dark.accentDark, gold: p.dark.gold, goldLight: p.dark.goldLight, charcoal: p.charcoal,
        charcoalLight: p.charcoalLight, page: tint(DARK_MODE['bg-page']), surface: tint(DARK_MODE['bg-surface']),
        surfaceAlt: tint(DARK_MODE['bg-surface-alt']), border: tint(DARK_MODE['border-color']), inputBg: tint(DARK_MODE['input-bg']) },
    };
  }

  /** A custom theme: six colours per mode; every other shade follows from them. */
  function fromCustom(c) {
    const l = c.light, d = c.dark;
    return {
      light: { accent: l.accent, accentDark: mix(l.accent, 0, 0.17), gold: l.gold, goldLight: mix(l.gold, 255, 0.35), sage: '#6B7A5E',
        charcoal: l.charcoal, charcoalLight: mix(l.charcoal, 255, 0.07), page: l.page, surface: l.surface, surfaceAlt: l.border, border: l.border },
      dark: { accent: d.accent, accentDark: mix(d.accent, 0, 0.17), gold: d.gold, goldLight: mix(d.gold, 255, 0.3), charcoal: d.charcoal,
        charcoalLight: mix(d.charcoal, 255, 0.07), page: d.page, surface: d.surface, surfaceAlt: mix(d.surface, 255, 0.04),
        border: d.border, inputBg: mix(d.page, 255, 0.03) },
    };
  }

  /* The deeper / brighter shades the stylesheet uses (hero, footer, gradients),
     derived in the same proportions as the default palette's own shades. */
  function accentShades(m) {
    return `--accent-deep:${mix(m.accent, 0, 0.12)};--accent-deep-rgb:${rgb(mix(m.accent, 0, 0.12))};`
      + `--accent-deeper:${mix(m.accent, 0, 0.27)};--accent-bright:${mix(m.accent, 255, 0.15)};--accent-bright-rgb:${rgb(mix(m.accent, 255, 0.15))};`
      + `--gold-soft:${mix(m.gold, 0, 0.09)};--gold-soft-rgb:${rgb(mix(m.gold, 0, 0.09))};--gold-deep:${mix(m.gold, 0, 0.42)};`
      + `--gold-light-rgb:${rgb(m.goldLight)};`;
  }
  /** The dark brand sections (hero, footer…) in one mode. */
  function darkSections(m) {
    return `--color-charcoal:${m.charcoal};--color-charcoal-light:${m.charcoalLight};--charcoal-rgb:${rgb(m.charcoal)};`
      + `--dark-1:${mix(m.charcoal, 0, 0.25)};--dark-1-rgb:${rgb(mix(m.charcoal, 0, 0.25))};--dark-2:${m.charcoal};--dark-2-rgb:${rgb(m.charcoal)};`
      + `--dark-3:${mix(m.charcoalLight, 255, 0.05)};--dark-3-rgb:${rgb(mix(m.charcoalLight, 255, 0.05))};`
      + DARKS.map(h => `--dk-${h}:${tintDark('#' + h, m.charcoal)};`).join('');
  }

  /* The rules use doubled :root selectors so they win over css/styles.css
     wherever this <style> sits in the page. */
  function css(look) {
    const l = look.light, d = look.dark;
    return `:root:root{--color-terracotta:${l.accent};--color-terracotta-dark:${l.accentDark};--accent-rgb:${rgb(l.accent)};`
      + `--color-gold:${l.gold};--color-gold-light:${l.goldLight};--gold-rgb:${rgb(l.gold)};--color-sage:${l.sage};`
      + accentShades(l) + darkSections(l)
      + `--accent-on-dark:${d.accent};--accent-on-dark-deep:${d.accentDark};--accent-on-dark-rgb:${rgb(d.accent)};}`
      + `:root:root:not([data-theme="dark"]){--bg-page:${l.page};${l.surface ? `--bg-surface:${l.surface};` : ''}`
      + `--bg-surface-alt:${l.surfaceAlt};--border-color:${l.border};}`
      // the home page has its own, slightly richer parchment and gold (css/home.css)
      + `html body.home-page{--color-gold:${mix(l.gold, 0, 0.09)};--color-gold-light:${l.goldLight};--color-sage:${l.sage};`
      + `--bg-page:${mix(l.page, 0, 0.02)};${l.surface ? `--bg-surface:${l.surface};` : ''}--bg-surface-alt:${mix(l.surfaceAlt, 0, 0.04)};`
      + `--border-color:${mix(l.border, 0, 0.09)};--home-tint:${mix(l.surfaceAlt, 255, 0.35)};--home-tint-deep:${l.surfaceAlt};--about-frame:${l.page};}`
      + `html[data-theme="dark"] body.home-page{--color-terracotta:${d.accent};--color-terracotta-dark:${d.accentDark};`
      + `--color-gold:${d.gold};--color-gold-light:${d.goldLight};--bg-page:${d.page};--bg-surface:${d.surface};`
      + `--bg-surface-alt:${d.surfaceAlt};--border-color:${d.border};--input-bg:${d.inputBg};}`
      + `:root:root[data-theme="dark"]{--bg-page:${d.page};--bg-surface:${d.surface};--bg-surface-alt:${d.surfaceAlt};`
      + `--border-color:${d.border};--input-bg:${d.inputBg};--color-terracotta:${d.accent};--color-terracotta-dark:${d.accentDark};`
      + `--accent-rgb:${rgb(d.accent)};--color-gold:${d.gold};--color-gold-light:${d.goldLight};--gold-rgb:${rgb(d.gold)};`
      + darkSections(d) + '}';
  }

  /* ---------------------------------------------------------
     Helpers the theme editor (admin) uses as well
     --------------------------------------------------------- */
  function luminance(hex) {
    const c = channels(hex).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  /** WCAG contrast ratio between two colours (1 … 21). */
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  /** The six editable colours of a ready palette, for both modes. */
  function toSpec(id) {
    const f = fromPreset(PALETTES[id] || PALETTES[DEFAULT_ID]);
    const up = (h) => h.toUpperCase();
    const pick = (m, surface) => ({ accent: up(m.accent), gold: up(m.gold), charcoal: up(m.charcoal), page: up(m.page), surface: up(surface), border: up(m.border) });
    return { light: pick(f.light, '#FFFFFF'), dark: pick(f.dark, f.dark.surface) };
  }

  /** A dark-mode suggestion for a set of light colours (the admin may change it). */
  function suggestDark(light) {
    const page = tintDark(DARK_MODE['bg-page'], light.charcoal);
    // a middle shade of the accent: white text on it and the shade on the dark page both readable
    let accent = light.accent, best = 0;
    for (let t = 0; t <= 0.8; t += 0.01) {
      const m = mix(light.accent, 255, t);
      const score = Math.min(contrast('#FFFFFF', m), contrast(m, page));
      if (score > best) { best = score; accent = m; }
    }
    return { accent: accent.toUpperCase(), gold: mix(light.gold, 255, 0.25).toUpperCase(), charcoal: light.charcoal,
      page: page.toUpperCase(), surface: tintDark(DARK_MODE['bg-surface'], light.charcoal).toUpperCase(),
      border: tintDark(DARK_MODE['border-color'], light.charcoal).toUpperCase() };
  }

  /* ---------------------------------------------------------
     Applying a look
     --------------------------------------------------------- */
  let current = DEFAULT_ID;

  /**
   * id: a ready palette ("navy") or "custom:<n>" together with its colours.
   * remember=false previews without making it this browser's default.
   */
  function apply(id, remember = true, custom = null) {
    const isCustom = typeof id === 'string' && id.startsWith('custom:') && custom && custom.light && custom.dark;
    const palette = isCustom ? id : (PALETTES[id] ? id : DEFAULT_ID);
    current = palette;
    let style = document.getElementById('savoriaPalette');
    if (!style) {
      style = document.createElement('style');
      style.id = 'savoriaPalette';
      document.head.appendChild(style);
    }
    // The default palette is exactly the stylesheet — nothing to override.
    style.textContent = isCustom ? css(fromCustom(custom)) : (palette === DEFAULT_ID ? '' : css(fromPreset(PALETTES[palette])));
    document.documentElement.setAttribute('data-palette', isCustom ? 'custom' : palette);
    if (remember) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: palette, custom: isCustom ? custom : null })); } catch (_) { /* storage blocked */ }
    }
    return palette;
  }

  // 1. Before first paint: the look this browser saw last time.
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || DEFAULT_ID;
    const saved = raw.startsWith('{') ? JSON.parse(raw) : { id: raw };
    apply(saved.id, false, saved.custom);
  } catch (_) { apply(DEFAULT_ID, false); }

  // 2. Then the restaurant's current choice (changed in the panel since?).
  const base = window.SAVORIA_API_BASE || (location.protocol === 'file:' ? 'http://localhost:8000' : '/api');
  fetch(base + '/site-theme', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null))
    .then(json => {
      if (!json || !json.success || !json.data) return;
      const data = json.data;
      apply(data.palette, true, data.custom || null);
    })
    .catch(() => { /* offline: keep the remembered look */ });

  window.SavoriaPalette = {
    PALETTES, DEFAULT_ID, apply, toSpec, suggestDark, contrast, mix,
    get current() { return current; },
  };
})();
