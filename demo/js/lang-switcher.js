/* =========================================================
   Tarmez — Language switcher
   js/lang-switcher.js — the compact language control that lives in
   the existing navigation bar (and next to the theme toggle on the
   small auth pages).

   The control is generated here instead of being hard-coded in every
   page, so all nine pages stay visually identical and the navbar
   markup is never duplicated. It follows the existing navbar design
   language: same cream colour, same hairline border, same 38px
   control height, same rounded language as the theme toggle.

   Switching is instant: no page reload, no lost state. The engine
   (js/i18n.js) re-translates the DOM, flips the document direction
   and notifies every module so dynamic content (menu, cart, admin
   tables) is re-rendered in the new language.
   ========================================================= */

(function () {
  'use strict';

  const i18n = window.SavoriaI18n;
  if (!i18n) return;

  const GLOBE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>';
  const CHEVRON_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="m6 9 6 6 6-6"/></svg>';

  const LANGUAGES = [
    { code: 'en', label: 'English', short: 'EN', dir: 'ltr' },
    { code: 'ar', label: 'العربية', short: 'AR', dir: 'rtl' },
  ];

  function labelFor(code) {
    const found = LANGUAGES.find((l) => l.code === code);
    return found ? found.label : code;
  }

  function shortFor(code) {
    const found = LANGUAGES.find((l) => l.code === code);
    return found ? found.short : code;
  }

  function build() {
    const wrap = document.createElement('div');
    wrap.className = 'lang-switcher';
    wrap.id = 'langSwitcher';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lang-switcher-btn';
    button.id = 'langSwitcherBtn';
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML =
      `<span class="lang-switcher-icon">${GLOBE_ICON}</span>` +
      '<span class="lang-switcher-label" id="langSwitcherLabel"></span>' +
      '<span class="lang-switcher-code" id="langSwitcherCode"></span>' +
      `<span class="lang-switcher-chevron">${CHEVRON_ICON}</span>`;

    const panel = document.createElement('div');
    panel.className = 'lang-switcher-panel';
    panel.id = 'langSwitcherPanel';
    panel.setAttribute('role', 'menu');
    panel.hidden = true;

    const head = document.createElement('div');
    head.className = 'lang-switcher-head';
    head.id = 'langSwitcherHead';
    panel.appendChild(head);

    LANGUAGES.forEach((lang) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'lang-option';
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('data-lang', lang.code);
      option.setAttribute('lang', lang.code);
      option.setAttribute('dir', lang.dir);
      option.innerHTML =
        `<span class="lang-option-code" aria-hidden="true">${lang.short}</span>` +
        `<span class="lang-option-label">${lang.label}</span>` +
        `<span class="lang-option-check" aria-hidden="true">✓</span>`;
      panel.appendChild(option);
    });

    wrap.appendChild(button);
    wrap.appendChild(panel);
    return wrap;
  }

  /* Decide where the control belongs, without touching the existing
     navbar layout:
       • pages with a .nav-cta  → inside it (after the theme toggle)
       • legal pages (navbar, no .nav-cta) → grouped with the theme
         toggle in a small flex row, so "space-between" keeps working
       • auth pages (no navbar) → floating next to the theme toggle   */
  function mount() {
    const navCta = document.querySelector('.nav-cta');
    const toggle = document.getElementById('themeToggle');

    if (navCta) {
      const el = build();
      if (toggle && toggle.parentElement === navCta) {
        navCta.insertBefore(el, toggle.nextSibling);
      } else {
        navCta.appendChild(el);
      }
      return el;
    }

    if (toggle && toggle.parentElement) {
      const parent = toggle.parentElement;
      if (parent.classList.contains('auth-page')) {
        const el = build();
        el.classList.add('lang-switcher-floating');
        parent.appendChild(el);
        return el;
      }
      // Navbar without .nav-cta — group the two small controls together.
      let tools = parent.querySelector('.nav-tools');
      if (!tools) {
        tools = document.createElement('div');
        tools.className = 'nav-tools';
        parent.insertBefore(tools, toggle);
        tools.appendChild(toggle);
      }
      const el = build();
      tools.appendChild(el);
      return el;
    }

    return null;
  }

  function init() {
    const root = mount();
    if (!root) return;

    const button = root.querySelector('.lang-switcher-btn');
    const panel = root.querySelector('.lang-switcher-panel');
    const label = root.querySelector('.lang-switcher-label');
    if (!button || !panel) return;

    function sync() {
      const lang = i18n.getLang();
      if (label) label.textContent = labelFor(lang);
      const code = root.querySelector('.lang-switcher-code');
      if (code) {
        code.textContent = shortFor(lang);
        code.setAttribute('lang', lang);
        code.setAttribute('dir', 'ltr');
      }
      const head = root.querySelector('.lang-switcher-head');
      if (head) head.textContent = i18n.t('common.chooseLanguage');
      button.setAttribute('aria-label', i18n.t('common.language'));
      button.setAttribute('title', i18n.t('common.language'));
      panel.querySelectorAll('.lang-option').forEach((option) => {
        const active = option.getAttribute('data-lang') === lang;
        option.classList.toggle('is-active', active);
        option.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      root.setAttribute('data-current-lang', lang);
    }

    function open() {
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      root.classList.add('is-open');
    }

    function close() {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      root.classList.remove('is-open');
    }

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      if (panel.hidden) open(); else close();
    });

    panel.addEventListener('click', (e) => {
      const option = e.target.closest('.lang-option');
      if (!option) return;
      const lang = option.getAttribute('data-lang');
      close();
      if (lang && lang !== i18n.getLang()) {
        i18n.setLang(lang);
      } else {
        sync();
      }
    });

    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) {
        close();
        button.focus();
      }
    });

    /* Keep the control in sync when the language changes from anywhere
       (another tab, or programmatically). */
    i18n.onChange(sync);
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
