/* =========================================================
   Tarmez — the side menu shared by every dashboard
   js/side-menu.js  (styles: css/admin-shell.css)

   The same menu as Site Management, for the order board, the
   kitchen screen and the customer account: groups of links with
   icons, the current one highlighted, a drawer on phones, and (where
   asked) a narrow icon rail that the person can expand or collapse.

   SavoriaSideMenu.mount({
     host,                     element whose content becomes the page column
     groups: [{ title, items: [{ key, label, icon, href, external, action }] }],
     active,                   key of the current item
     title,                    page title in the phone top bar
     rail: { key, collapsed }  optional: collapsible, remembered per screen
     onAction(key)             for items with action: true
   }) → { setActive(key), refresh(groups) }
   ========================================================= */
(function () {
  'use strict';

  const I18N = window.SavoriaI18n;
  const t = (key) => (I18N ? I18N.t(key) : key);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const svg = (d) => `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  const ICONS = {
    pin: svg('<path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    board: svg('<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>'),
    kitchen: svg('<path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><path d="M6 17h12"/>'),
    overview: svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
    orders: svg('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'),
    reservations: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    tables: svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3z"/>'),
    menu: svg('<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><path d="M6 1v3M10 1v3M14 1v3"/>'),
    coupons: svg('<path d="M20 12a2 2 0 0 1 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v4a2 2 0 0 1 0 4v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 1-2-2z"/><path d="M13 5v2M13 17v2M13 11v2"/>'),
    points: svg('<path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/>'),
    ratings: svg('<path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/><path d="M12 9v4"/>'),
    accounts: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    content: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    platform: svg('<rect x="2" y="6" width="20" height="12" rx="6"/><circle cx="16" cy="12" r="3"/>'),
    bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
    user: svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    home: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
    track: svg('<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/>'),
    logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'),
  };

  function mount(opts) {
    const host = opts.host;
    if (!host || host.querySelector(':scope > .side-shell')) return null;
    let active = opts.active || null;
    let groups = opts.groups || [];
    const railKey = opts.rail ? 'savoria_rail_' + opts.rail.key : null;
    let collapsed = false;
    if (railKey) {
      try { const v = localStorage.getItem(railKey); collapsed = v === null ? !!opts.rail.collapsed : v === '1'; } catch (_) { collapsed = !!opts.rail.collapsed; }
    }

    const shell = document.createElement('div');
    shell.className = 'admin-shell side-shell' + (opts.rail ? ' has-rail' : '') + (collapsed ? ' is-rail' : '');
    shell.innerHTML = `
      <aside class="admin-side" aria-label="${esc(opts.label || t('shell.menuLabel'))}">
        <div class="admin-side-head">
          ${opts.rail ? `<button type="button" class="side-rail-btn" data-rail aria-label="${esc(t('side.collapse'))}" title="${esc(t('side.collapse'))}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>` : ''}
          <span class="side-head-title">${esc(opts.heading || '')}</span>
          <button type="button" class="admin-side-close" data-close aria-label="${esc(t('pwa.close'))}">×</button>
        </div>
        <nav class="admin-side-nav side-nav"></nav>
      </aside>
      <div class="admin-main">
        <div class="admin-topbar side-topbar">
          <button type="button" class="admin-menu-btn" data-open aria-expanded="false">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            <span>${esc(t('shell.menu'))}</span>
          </button>
          <strong class="admin-page-title side-title"></strong>
        </div>
      </div>
      <div class="admin-scrim" hidden></div>`;
    const side = shell.querySelector('.admin-side');
    const nav = shell.querySelector('.side-nav');
    const main = shell.querySelector('.admin-main');
    const scrim = shell.querySelector('.admin-scrim');
    while (host.firstChild) main.appendChild(host.firstChild);
    host.appendChild(shell);

    function render() {
      nav.innerHTML = groups.filter((g) => g.items && g.items.length).map((g) => `
        <div class="admin-side-group">
          ${g.title ? `<p class="admin-side-title">${esc(g.title)}</p>` : ''}
          ${g.items.map((it) => {
            const inner = `${ICONS[it.icon] || ICONS.overview}<span>${esc(it.label)}</span>${it.badge ? `<span class="side-badge">${esc(it.badge)}</span>` : ''}${it.external ? '<span class="admin-side-ext" aria-hidden="true">↗</span>' : ''}`;
            const cls = `tab-btn${it.key === active ? ' active' : ''}`;
            return it.action
              ? `<button type="button" class="${cls}" data-key="${esc(it.key)}" title="${esc(it.label)}">${inner}</button>`
              : `<a class="${cls}" data-key="${esc(it.key)}" href="${esc(it.href)}"${it.external ? ' target="_blank" rel="noopener"' : ''} title="${esc(it.label)}"${it.key === active ? ' aria-current="page"' : ''}>${inner}</a>`;
          }).join('')}
        </div>`).join('');
      const cur = groups.flatMap((g) => g.items || []).find((i) => i.key === active);
      shell.querySelector('.side-title').textContent = cur ? cur.label : (opts.title || '');
    }

    function open(on) {
      side.classList.toggle('is-open', on);
      scrim.hidden = !on;
      shell.querySelector('[data-open]').setAttribute('aria-expanded', String(on));
    }

    shell.addEventListener('click', (e) => {
      if (e.target.closest('[data-open]')) { open(!side.classList.contains('is-open')); return; }
      if (e.target.closest('[data-close]') || e.target === scrim) { open(false); return; }
      if (e.target.closest('[data-rail]')) {
        collapsed = !collapsed;
        shell.classList.toggle('is-rail', collapsed);
        try { localStorage.setItem(railKey, collapsed ? '1' : '0'); } catch (_) { /* fine */ }
        return;
      }
      const item = e.target.closest('.side-nav [data-key]');
      if (!item) return;
      const def = groups.flatMap((g) => g.items || []).find((i) => i.key === item.dataset.key);
      if (def && def.action) { e.preventDefault(); if (opts.onAction) opts.onAction(def.key); }
      if (def && def.href && def.href.startsWith('#')) { api.setActive(def.key); }
      open(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });

    const api = {
      setActive(key) {
        if (key === active) return;
        active = key;
        nav.querySelectorAll('[data-key]').forEach((a) => {
          const on = a.dataset.key === key;
          a.classList.toggle('active', on);
          if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
        const cur = groups.flatMap((g) => g.items || []).find((i) => i.key === active);
        shell.querySelector('.side-title').textContent = cur ? cur.label : (opts.title || '');
      },
      refresh(newGroups) { groups = newGroups; render(); },
      shell,
    };
    render();
    return api;
  }

  window.SavoriaSideMenu = { mount, ICONS };
})();
