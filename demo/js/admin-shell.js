/* =========================================================
   Tarmez — Site Management layout
   js/admin-shell.js  (loads before js/admin.js)

   · a side menu in groups — Dashboard, Operations, Menu,
     Customers & loyalty, Website, Platform — with a search box;
     on phones it is a drawer opened from the top bar;
   · each page shows only if the permissions table lets this
     person open it; a view-only page says so at the top;
   · the existing tab buttons are moved into the menu, so every
     page keeps working exactly as before;
   · the order board opens here as a page of its own (in a frame).
   window.SavoriaAdminShell = { ready, areas }
   ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const API = typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null;
  const shell = { areas: null, role: null };
  window.SavoriaAdminShell = shell;

  /* tab → permissions area (overview: everyone with Site Management access) */
  const AREA = {
    overview: null, orders: 'orders', reservations: 'reservations', tables: 'tables', menu: 'menu',
    accounts: 'accounts', settings: 'settings', coupons: 'promos', ratings: 'ratings',
    content: 'content', appearance: 'content', invoice: 'content',
    platform: 'platform', permissions: 'platform', activity: 'platform',
    board: 'orders', offers: 'offers',
  };
  const GROUPS = [
    { key: 'dashboard', tabs: ['overview'] },
    { key: 'operations', tabs: ['orders', 'reservations', 'tables', 'board'] },
    { key: 'menu', tabs: ['menu'] },
    { key: 'customers', tabs: ['accounts', 'settings', 'coupons', 'ratings'] },
    { key: 'marketing', tabs: ['offers'] },
    { key: 'website', tabs: ['content', 'appearance', 'invoice'] },
    { key: 'platform', tabs: ['platform', 'permissions', 'activity'] },
  ];
  const BOARD_ICON = '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/></svg>';

  /* The order board as a page of its own here: workspace.html in a frame, loaded the first time it is opened. */
  function addBoard(buttons, panel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.dataset.tab = 'board';
    btn.innerHTML = `${BOARD_ICON}<span>${t('shell.links.workspace')}</span>`;
    const section = document.createElement('section');
    section.id = 'tab-board';
    section.style.display = 'none';
    section.innerHTML = '<iframe class="admin-board-frame" title="" loading="lazy"></iframe>';
    panel.appendChild(section);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#adminMain > section[id^="tab-"]').forEach((s) => { s.style.display = s === section ? 'block' : 'none'; });
      const frame = section.querySelector('iframe');
      frame.title = t('shell.links.workspace');
      if (!frame.getAttribute('src')) frame.src = 'workspace.html?embed=1';
    });
    buttons.board = btn;
  }

  function levelOf(tab) {
    const area = AREA[tab];
    if (!area) return 'edit';
    return (shell.areas && shell.areas[area]) || 'none';
  }

  function build() {
    const row = document.querySelector('#panelView .tab-row');
    const panel = $('panelView');
    if (!row || !panel || $('adminShell')) return;
    const buttons = {};
    row.querySelectorAll('.tab-btn[data-tab]').forEach((b) => { buttons[b.dataset.tab] = b; });
    addBoard(buttons, panel);

    const wrap = document.createElement('div');
    wrap.id = 'adminShell';
    wrap.className = 'admin-shell';
    wrap.innerHTML = `
      <aside class="admin-side" id="adminSide" aria-label="${t('shell.menuLabel')}">
        <div class="admin-side-head">
          <input type="search" id="adminSearch" class="admin-search" placeholder="${t('shell.search')}" aria-label="${t('shell.search')}">
          <button type="button" class="admin-side-close" id="adminSideClose" aria-label="${t('pwa.close')}">×</button>
        </div>
        <nav class="admin-side-nav" id="adminSideNav"></nav>
        <a class="admin-side-site" href="index.html" target="_blank" rel="noopener">${t('shell.viewSite')} ↗</a>
      </aside>
      <div class="admin-main" id="adminMain">
        <div class="admin-topbar">
          <button type="button" class="admin-menu-btn" id="adminMenuBtn" aria-controls="adminSide" aria-expanded="false">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            <span>${t('shell.menu')}</span>
          </button>
          <strong class="admin-page-title" id="adminPageTitle"></strong>
          <span class="admin-readonly-pill" id="adminReadonly" hidden>${t('shell.viewOnly')}</span>
        </div>
      </div>
      <div class="admin-scrim" id="adminScrim" hidden></div>`;

    const nav = wrap.querySelector('#adminSideNav');
    GROUPS.forEach((g) => {
      const box = document.createElement('div');
      box.className = 'admin-side-group';
      box.dataset.group = g.key;
      box.innerHTML = `<p class="admin-side-title">${t('shell.groups.' + g.key)}</p>`;
      g.tabs.forEach((tab) => { if (buttons[tab]) box.appendChild(buttons[tab]); });
      nav.appendChild(box);
    });
    // anything not placed in a group stays reachable at the end
    Object.values(buttons).forEach((b) => { if (!b.parentElement || b.parentElement === row) nav.lastElementChild.appendChild(b); });

    // move the pages (every <section id="tab-…">) into the main column
    const main = wrap.querySelector('#adminMain');
    panel.querySelectorAll(':scope > section[id^="tab-"]').forEach((s) => main.appendChild(s));
    row.replaceWith(wrap);
    wireEvents(wrap);
    applyPermissions();
    syncTitle();
  }

  function applyPermissions() {
    document.querySelectorAll('#adminSideNav .tab-btn[data-tab]').forEach((b) => {
      const level = levelOf(b.dataset.tab);
      b.style.display = level === 'none' ? 'none' : '';
      b.classList.toggle('is-view-only', level === 'view');
      if (level === 'view' && !b.querySelector('.admin-view-badge')) {
        b.insertAdjacentHTML('beforeend', `<span class="admin-view-badge" title="${t('shell.viewOnly')}">👁</span>`);
      }
    });
    document.querySelectorAll('#adminSideNav .admin-side-group').forEach((g) => {
      const any = [...g.querySelectorAll('.tab-btn')].some((b) => b.style.display !== 'none');
      g.hidden = !any;
    });
  }

  function current() {
    return document.querySelector('#adminSideNav .tab-btn.active[data-tab]');
  }

  function syncTitle() {
    const b = current();
    const title = $('adminPageTitle');
    if (title && b) title.textContent = b.querySelector('span')?.textContent || '';
    const ro = $('adminReadonly');
    if (ro && b) ro.hidden = levelOf(b.dataset.tab) !== 'view';
  }

  function openDrawer(open) {
    const side = $('adminSide');
    if (!side) return;
    side.classList.toggle('is-open', open);
    $('adminScrim').hidden = !open;
    $('adminMenuBtn').setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => $('adminSearch')?.focus(), 50);
  }

  function wireEvents(wrap) {
    wrap.querySelector('#adminSideNav').addEventListener('click', (e) => {
      const b = e.target.closest('.tab-btn[data-tab]');
      if (!b) return;
      if (b.dataset.tab !== 'board') { const s = $('tab-board'); if (s) s.style.display = 'none'; }
      setTimeout(() => { syncTitle(); openDrawer(false); window.scrollTo({ top: 0 }); }, 0);
    });
    $('adminMenuBtn').addEventListener('click', () => openDrawer(!$('adminSide').classList.contains('is-open')));
    $('adminSideClose').addEventListener('click', () => openDrawer(false));
    $('adminScrim').addEventListener('click', () => openDrawer(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openDrawer(false); });
    $('adminSearch').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('#adminSideNav .admin-side-group').forEach((g) => {
        let any = false;
        g.querySelectorAll('.tab-btn').forEach((b) => {
          const allowed = !(b.dataset.tab && levelOf(b.dataset.tab) === 'none');
          const match = !q || b.textContent.toLowerCase().includes(q);
          b.style.display = allowed && match ? '' : 'none';
          any = any || (allowed && match);
        });
        g.hidden = !any;
      });
    });
    $('adminSearch').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const first = [...document.querySelectorAll('#adminSideNav .tab-btn')].find((b) => b.style.display !== 'none');
      if (first) first.click();
    });
  }

  /* admin.html#orders (from the staff screens' menu) opens that page. */
  function openFromHash() {
    const tab = decodeURIComponent((location.hash || '').replace(/^#(tab-)?/, ''));
    if (!tab) return;
    const b = document.querySelector(`#adminSideNav .tab-btn[data-tab="${CSS.escape(tab)}"]`);
    if (b && b.style.display !== 'none') setTimeout(() => b.click(), 0);
  }

  // Relabel the parts this file wrote when the language changes.
  if (I18N && I18N.onChange) {
    I18N.onChange(() => {
      const wrap = $('adminShell');
      if (!wrap) return;
      wrap.querySelectorAll('.admin-side-title').forEach((p) => { p.textContent = t('shell.groups.' + p.parentElement.dataset.group); });
      const board = wrap.querySelector('.tab-btn[data-tab="board"] span');
      if (board) board.textContent = t('shell.links.workspace');
      $('adminSearch').placeholder = t('shell.search');
      wrap.querySelector('#adminMenuBtn span').textContent = t('shell.menu');
      $('adminReadonly').textContent = t('shell.viewOnly');
      wrap.querySelector('.admin-side-site').textContent = t('shell.viewSite') + ' ↗';
      syncTitle();
    });
  }

  shell.ready = (async () => {
    try {
      if (API && API.getMyPermissions && API.isLoggedIn && API.isLoggedIn()) {
        const res = await API.getMyPermissions();
        shell.areas = res.areas || null;
        shell.role = res.role || null;
      }
    } catch (_) { /* not management — admin.js shows the access page */ }
    if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    build();
    applyPermissions();
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return shell.areas;
  })();
})();
