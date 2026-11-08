/* =========================================================
   Tarmez — Internationalisation engine
   js/i18n.js — dependency-free Arabic/English translation layer.

   Why a hand-rolled engine instead of a library?
   The site is plain HTML + ES6 with no build step and no package.json,
   so there is no bundler to pull a library into. This module keeps the
   same zero-dependency philosophy as the rest of the project while
   providing everything a proper i18n layer needs:

     • SavoriaI18n.t(key, params)      → translate a key
     • SavoriaI18n.apply(root)         → translate the DOM
     • SavoriaI18n.setLang(lang)       → switch language (no reload)
     • SavoriaI18n.getLang()           → current language
     • SavoriaI18n.onChange(fn)        → react to a language switch
     • SavoriaI18n.fmtSAR/fmtNumber/…  → locale-aware formatting

   Markup contract (used across every page):
     data-i18n="nav.home"            → element text
     data-i18n-html="cart.empty"     → element inner HTML (markup allowed)
     data-i18n-attr="placeholder:form.search;aria-label:nav.menu"
                                      → attribute bindings
     data-i18n-title="..."           → title attribute (shortcut)

   The original English copy of every element is remembered on the first
   pass, so a missing translation falls back to the shipped text instead
   of ever showing a raw key to the visitor.

   The chosen language is persisted in localStorage under
   "savoria_lang" and restored on the next visit. The default is the
   site's existing language (English) — the visitor is never forced into
   Arabic, and the browser language is only used until the visitor
   explicitly picks one.
   ========================================================= */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'savoria_lang';
  const DEFAULT_LANG = 'en';
  const SUPPORTED_LANGS = ['en', 'ar'];
  const RTL_LANGS = ['ar'];

  /* Arabic webfonts are only downloaded when Arabic is actually used
     (see ensureArabicFont) so English visitors pay nothing. */
  const ARABIC_FONT_HREF =
    'https://fonts.googleapis.com/css2?family=El+Messiri:wght@400;500;600;700&family=Alexandria:wght@300;400;500;600;700&display=swap';

  /* Locales live in js/locales/*.js and register themselves here. */
  const LOCALES = global.SavoriaI18nLocales || {};

  const listeners = [];
  let currentLang = DEFAULT_LANG;
  let fontRequested = false;

  /* ---------------------------------------------------------
     Storage helpers (private browsing / disabled storage safe)
     --------------------------------------------------------- */
  function readStoredLang() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return SUPPORTED_LANGS.includes(value) ? value : null;
    } catch (_) { return null; }
  }

  function writeStoredLang(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) { /* storage blocked */ }
  }

  /* ---------------------------------------------------------
     Dictionary access
     --------------------------------------------------------- */
  function lookup(dict, key) {
    if (!dict) return undefined;
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
    const parts = key.split('.');
    let node = dict;
    for (const part of parts) {
      if (node === null || typeof node !== 'object') return undefined;
      node = node[part];
    }
    return node;
  }

  function interpolate(template, params) {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
  }

  /**
   * Pick the right plural form.
   * A translation may carry two variants separated by " | ":
   *   "1 order | {count} orders"
   * The first variant is used for a count of exactly 1, the second for
   * everything else.
   */
  function pickPlural(template, params) {
    if (typeof template !== 'string' || template.indexOf(' | ') === -1) return template;
    const parts = template.split(' | ');
    if (parts.length < 2) return template;
    const count = params && params.count !== undefined ? Number(params.count) : 0;
    return count === 1 ? parts[0] : parts[1];
  }

  /**
   * Translate a key.
   * Order of resolution: current language → English → the element's own
   * shipped default (handled by apply()) → the key itself.
   */
  function t(key, params) {
    if (key === null || key === undefined) return '';
    const name = String(key);

    const current = lookup(LOCALES[currentLang], name);
    if (typeof current === 'string') return interpolate(pickPlural(current, params), params);

    if (currentLang !== DEFAULT_LANG) {
      const fallback = lookup(LOCALES[DEFAULT_LANG], name);
      if (typeof fallback === 'string') return interpolate(pickPlural(fallback, params), params);
    }

    return name;
  }

  /** True when the key exists in the given (or current) language. */
  function has(key, lang) {
    return typeof lookup(LOCALES[lang || currentLang], String(key)) === 'string';
  }

  /* ---------------------------------------------------------
     DOM application
     --------------------------------------------------------- */
  /**
   * Optional interpolation parameters for a bound element:
   *   <option data-i18n="reservation.guestCount" data-i18n-params='{"count":2}'>
   */
  function readParams(el) {
    const raw = el.getAttribute('data-i18n-params');
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : undefined;
    } catch (_) {
      return undefined;
    }
  }

  function rememberDefaults(root) {    root.querySelectorAll('[data-i18n]').forEach((el) => {
      if (!el.hasAttribute('data-i18n-default')) {
        el.setAttribute('data-i18n-default', el.textContent);
      }
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      if (!el.hasAttribute('data-i18n-default-html')) {
        el.setAttribute('data-i18n-default-html', el.innerHTML);
      }
    });
  }

  function apply(root) {
    const scope = root || document;
    if (!scope || typeof scope.querySelectorAll !== 'function') return;

    rememberDefaults(scope);

    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const params = readParams(el);
      const translated = has(key) ? t(key, params) : el.getAttribute('data-i18n-default');
      if (translated !== null && translated !== undefined && translated !== '') {
        el.textContent = translated;
      }
    });

    scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html');
      const params = readParams(el);
      const translated = has(key) ? t(key, params) : el.getAttribute('data-i18n-default-html');
      if (translated) el.innerHTML = translated;
    });

    scope.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      const spec = el.getAttribute('data-i18n-attr') || '';
      spec.split(';').forEach((pair) => {
        const [attr, key] = pair.split(':').map((s) => (s || '').trim());
        if (!attr || !key) return;
        if (has(key)) {
          el.setAttribute(attr, t(key));
        } else if (!el.hasAttribute('data-i18n-default-' + attr)) {
          el.setAttribute('data-i18n-default-' + attr, el.getAttribute(attr) || '');
        }
      });
    });

    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (has(key)) el.setAttribute('title', t(key));
    });
  }

  /* ---------------------------------------------------------
     Direction / document state
     --------------------------------------------------------- */
  function isRTL(lang) {
    return RTL_LANGS.includes(lang || currentLang);
  }

  function dir(lang) {
    return isRTL(lang) ? 'rtl' : 'ltr';
  }

  function ensureArabicFont() {
    if (fontRequested) return;
    fontRequested = true;
    if (document.getElementById('savoria-arabic-font')) return;
    const link = document.createElement('link');
    link.id = 'savoria-arabic-font';
    link.rel = 'stylesheet';
    link.href = ARABIC_FONT_HREF;
    document.head.appendChild(link);
  }

  function applyDocumentState(lang) {
    const html = document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', dir(lang));
    if (isRTL(lang)) ensureArabicFont();
  }

  /* ---------------------------------------------------------
     Language switching
     --------------------------------------------------------- */
  function setLang(lang, options) {
    const opts = options || {};
    const next = SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
    const changed = next !== currentLang;
    currentLang = next;
    writeStoredLang(next);
    applyDocumentState(next);
    apply(document);

    if (changed || opts.force) {
      listeners.forEach((fn) => {
        try { fn(next, { changed }); } catch (err) { console.error('[i18n] listener failed', err); }
      });
      document.dispatchEvent(new CustomEvent('savoria:langchange', {
        detail: { lang: next, dir: dir(next) },
      }));
    }
    return currentLang;
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return () => {
      const index = listeners.indexOf(fn);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  /* ---------------------------------------------------------
     Formatting helpers
     --------------------------------------------------------- */
  function fmtNumber(value, options) {
    const num = Number(value);
    if (!isFinite(num)) return String(value ?? '');
    try {
      return new Intl.NumberFormat(currentLang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', options).format(num);
    } catch (_) {
      return String(num);
    }
  }

  function fmtSAR(value) {
    const num = Number(value) || 0;
    const amount = fmtNumber(num, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return currentLang === 'ar' ? `ر.س ${amount}` : `SAR ${amount}`;
  }

  function fmtDate(value, options) {
    const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
    if (isNaN(date.getTime())) return '';
    const locale = currentLang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB';
    try {
      return date.toLocaleDateString(locale, options || { dateStyle: 'medium' });
    } catch (_) {
      return date.toISOString().slice(0, 10);
    }
  }

  function fmtTime(value, options) {
    const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
    if (isNaN(date.getTime())) return '';
    const locale = currentLang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-PK';
    try {
      return date.toLocaleTimeString(locale, options || { timeStyle: 'short' });
    } catch (_) {
      return '';
    }
  }

  function fmtDateTime(value) {
    const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
    if (isNaN(date.getTime())) return '';
    const locale = currentLang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-PK';
    try {
      return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) {
      return '';
    }
  }

  /* ---------------------------------------------------------
     API error messages
     The backend keeps its English messages (they are part of the API
     contract). The interface shows the localised wording instead by
     looking the exact server string up in the dictionary.
     --------------------------------------------------------- */
  function translateApiMessage(message) {
    if (typeof message !== 'string' || !message) return message;
    // messages end with "." — look them up whole, not split into a dotted path
    const table = (LOCALES[currentLang] || {}).api;
    if (table && typeof table[message] === 'string') return table[message];
    const key = `api.${message}`;
    if (has(key)) return t(key);
    return message;
  }

  /* ---------------------------------------------------------
     Boot
     --------------------------------------------------------- */
  function init() {
    const stored = readStoredLang();
    currentLang = stored || DEFAULT_LANG;
    applyDocumentState(currentLang);
    apply(document);
  }

  /**
   * Pick the right language out of a database row.
   * Rows keep their original English columns untouched and gain an
   * "_ar" companion column, so the fallback chain is:
   *   Arabic value → English value → empty string
   */
  function localize(row, field) {
    if (!row) return '';
    if (isRTL()) {
      const translated = row[field + '_ar'];
      if (typeof translated === 'string' && translated.trim() !== '') return translated;
    }
    const original = row[field];
    return original === null || original === undefined ? '' : original;
  }

  /**
   * The untranslated value of a row — used when a value must be matched
   * against a fixed identifier (feature flags, slugs, technical codes).
   */
  /** What the customer chose for an order line — "12 pieces · Spicy" — or "" when nothing.
      Works for cart lines and order lines (is_spicy may be true or 1). */
  function itemChoice(line) {
    if (!line) return '';
    const parts = [];
    const option = localize(line, 'option_name');
    if (option) parts.push(option);
    if (line.is_spicy === true || Number(line.is_spicy) === 1 || line.spicy === true) parts.push(t('menu.spicy'));
    return parts.join(' · ');
  }

  /** The dish name of an order line in the current language (the Arabic name when there is one). */
  function itemName(line) {
    if (!line) return '';
    if (isRTL() && typeof line.item_name_ar === 'string' && line.item_name_ar.trim() !== '') return line.item_name_ar;
    return line.item_name_snapshot || line.name || '';
  }

  function raw(row, field) {
    if (!row) return '';
    const original = row[field];
    return original === null || original === undefined ? '' : original;
  }

  const api = {
    STORAGE_KEY,
    DEFAULT_LANG,
    SUPPORTED_LANGS,
    t,
    has,
    apply,
    init,
    setLang,
    getLang: () => currentLang,
    onChange,
    isRTL,
    dir,
    fmtNumber,
    fmtSAR,
    fmtDate,
    fmtTime,
    fmtDateTime,
    translateApiMessage,
    itemChoice,
    itemName,
    localize,
    raw,
    locales: LOCALES,
  };

  global.SavoriaI18n = api;
  /* Short alias for the inline scripts of the small pages. */
  global.t = t;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
