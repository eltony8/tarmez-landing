/* =========================================================
   Tarmez — Full-Stack Complete App
   js/app.js — menu rendering, cart, checkout, reservations,
                auth-aware navigation. Depends on js/api.js.

   All user-facing copy goes through the translation layer
   (js/i18n.js): static markup is bound with `data-i18n`, and
   everything rendered from JavaScript uses t('key') so the whole
   interface follows the visitor's language instantly.
   ========================================================= */

(function () {
  'use strict';

  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const localize = (row, field) => (I18N ? I18N.localize(row, field) : (row ? row[field] : ''));
  const raw = (row, field) => (I18N ? I18N.raw(row, field) : (row ? row[field] : ''));
  const fmtSAR = (amount) => (I18N ? I18N.fmtSAR(amount) : 'SAR ' + Number(amount).toLocaleString('en-US'));

  /* ---------- Confirmation blocks (order sent / reservation confirmed) ----------
     One shared builder so the order confirmation and the reservation
     confirmation read the same way: a badge, a headline, the details,
     and the "track it" icon right underneath. */
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  const ICON_TRACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-3.7-3.7"/><path d="M11 8v3l2 2"/></svg>';
  const ICON_CALENDAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></svg>';

  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  /* Two numbers live on an order:
       · the order number is the operational counter — it restarts when
         the manager resets it from the panel;
       · the invoice number is the permanent internal id.
     The customer only ever sees the ORDER number, so what they read as
     "their order" follows the counter the manager resets. */
  const orderNumberOf = (order) => {
    const n = order && order.order_number;
    return (n !== null && n !== undefined && n !== '') ? n : (order ? order.id : '');
  };

  /* ---------- Table QR context ----------
     A guest who scans a table's QR code lands on index.html?t=<token>.
     The token is resolved by the server, which returns the real table;
     only the table's number and the token are remembered on the device.
     The token — never a hand-typed number — travels with the order, so
     the server can re-verify which table it really is.
     The table belongs to one sitting only: it is forgotten
     TABLE_TTL_MS after the scan (or after the last order placed at it),
     so a guest who comes back another day — or opens the installed app,
     which shares this storage — is not sent to yesterday's table. */
  const TABLE_CTX_KEY = 'savoria_table_ctx_v1';
  const TABLE_TTL_MS = 3 * 60 * 60 * 1000; // a meal, with room for dessert
  let TABLE_NOTICE = null; // 'invalid' after a code the server rejected

  function getTableContext() {
    try {
      const ctx = JSON.parse(localStorage.getItem(TABLE_CTX_KEY) || 'null');
      if (!ctx || !ctx.token || !Number(ctx.id) || !Number(ctx.number)) return null;
      // Saved before this rule (no time) or older than one sitting: forget it.
      if (!Number(ctx.saved_at) || Date.now() - Number(ctx.saved_at) > TABLE_TTL_MS) {
        clearTableContext();
        return null;
      }
      return ctx;
    } catch { return null; }
  }

  function saveTableContext(ctx) {
    try { localStorage.setItem(TABLE_CTX_KEY, JSON.stringify({ ...ctx, saved_at: Date.now() })); } catch { /* storage blocked */ }
  }

  function clearTableContext() {
    try { localStorage.removeItem(TABLE_CTX_KEY); } catch { /* storage blocked */ }
  }

  function tableDisplayName(ctx) {
    const name = ctx ? localize(ctx, 'label') : '';
    return (typeof name === 'string' && name.trim() !== '') ? name : '';
  }

  /* Re-draws the menu banner from whatever the device remembers. Called on
     boot and again after a language switch. */
  function refreshTableBanner() {
    const banner = document.getElementById('tableBanner');
    if (!banner) return;
    const title = document.getElementById('tableBannerTitle');
    const note = document.getElementById('tableBannerNote');
    const ctx = getTableContext();

    if (TABLE_NOTICE === 'invalid' || TABLE_NOTICE === 'paused') {
      if (title) title.textContent = t('table.eyebrow');
      if (note) note.textContent = t(TABLE_NOTICE === 'paused' ? 'table.paused' : 'table.invalid');
      banner.classList.add('is-notice');
      banner.style.display = 'flex';
      return;
    }
    if (ctx) {
      const label = tableDisplayName(ctx);
      if (title) title.textContent = t('table.bannerTitle', { number: ctx.number }) + (label ? ` · ${label}` : '');
      if (note) note.textContent = t('table.bannerNote');
      banner.classList.remove('is-notice');
      banner.style.display = 'flex';
      return;
    }
    banner.style.display = 'none';
  }

  /* The cart page repeats the scanned table next to the hero and in the
     summary, so the customer can see where the order will be served
     before signing in. The table still comes from the server-resolved
     QR token, never from a typed number. */
  function renderTableContext() {
    const ctx = getTableContext();
    const label = ctx ? tableDisplayName(ctx) : '';
    const text = ctx
      ? t('table.bannerTable', { number: ctx.number }) + (label ? ` · ${label}` : '')
      : '';

    const chip = document.getElementById('cartTableChip');
    const chipText = document.getElementById('cartTableChipText');
    if (chip) chip.style.display = ctx ? 'inline-flex' : 'none';
    if (chipText) chipText.textContent = text;

    const box = document.getElementById('cartTableContext');
    const number = document.getElementById('cartTableContextNumber');
    if (box) box.style.display = ctx ? 'flex' : 'none';
    if (number) number.textContent = text;
  }

  /* The contact form and the place-order action belong to a signed-in
     account. The items, totals and the scanned table stay visible while
     signed out, with a clear sign-in gate instead of the form. */
  function applyCheckoutGate() {
    const signedIn = isSignedIn();
    const gate = document.getElementById('cartAuthGate');
    const details = document.getElementById('cartDetailsCard');
    const rewards = document.querySelector('.cart-rewards-card');
    const placeOrder = document.getElementById('placeOrderBtn');

    if (gate) gate.style.display = signedIn ? 'none' : 'block';
    if (details) details.style.display = signedIn ? '' : 'none';
    if (rewards && !signedIn) rewards.style.display = 'none';
    if (placeOrder) placeOrder.style.display = signedIn ? '' : 'none';
  }

  /* Resolve ?t=<token> once per visit. A rejected code (unknown or
     disabled) clears any stale table so the guest can order normally. */
  async function initTableContext() {
    const token = (new URLSearchParams(location.search).get('t') || '').trim();
    if (token) {
      try {
        const table = await SavoriaAPI.resolveTable(token);
        saveTableContext({
          id: Number(table.id),
          number: Number(table.table_number),
          label: table.label || '',
          label_ar: table.label_ar || '',
          token,
        });
        TABLE_NOTICE = null;
      } catch (err) {
        clearTableContext();
        TABLE_NOTICE = err && err.status === 503 ? 'paused' : 'invalid';
      }
    }
    refreshTableBanner();
    renderTableContext();
    if (token) {
      // Land the guest on the menu right away, not on the hero.
      setTimeout(() => {
        try { document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { /* no menu section */ }
      }, 350);
    }
    return getTableContext();
  }

  function confirmationBlock({ icon, titleKey, titleParams, metaKey, metaParams, trackUrl, trackKey }) {
    // The text is bound with data-i18n, so switching the language
    // re-translates the confirmation in place, like every other part
    // of the page.
    const paramsAttr = (params) => (params
      ? ` data-i18n-params='${JSON.stringify(params).replace(/'/g, '&#39;')}'`
      : '');
    return `
      <div class="confirm-block">
        <span class="confirm-badge">${icon}</span>
        <div class="confirm-body">
          <p class="confirm-title" data-i18n="${titleKey}"${paramsAttr(titleParams)}>${escHtml(t(titleKey, titleParams))}</p>
          ${metaKey ? `<p class="confirm-meta" data-i18n="${metaKey}"${paramsAttr(metaParams)}>${escHtml(t(metaKey, metaParams))}</p>` : ''}
          <a class="confirm-track" href="${escHtml(trackUrl)}">${ICON_TRACK}<span data-i18n="${trackKey}">${escHtml(t(trackKey))}</span></a>
        </div>
      </div>`;
  }

  /* The two confirmations are kept in memory so a language switch can
     re-render them — the amount is re-formatted in the new language. */
  let LAST_ORDER_CONFIRM = null;
  let LAST_RESERVATION_CONFIRM = null;

  /* The order confirmation also survives a refresh (and the trip back to
     the menu), so the customer can still open tracking and see the coupon
     promised for that invoice. It expires after a day. */
  const ORDER_CONFIRM_KEY = 'savoria_last_order_confirm_v1';
  const ORDER_CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;

  function saveOrderConfirmation() {
    try {
      if (!LAST_ORDER_CONFIRM) {
        localStorage.removeItem(ORDER_CONFIRM_KEY);
        return;
      }
      localStorage.setItem(ORDER_CONFIRM_KEY, JSON.stringify({
        ...LAST_ORDER_CONFIRM,
        savedAt: Date.now(),
      }));
    } catch { /* storage blocked */ }
  }

  function restoreOrderConfirmation() {
    try {
      const saved = JSON.parse(localStorage.getItem(ORDER_CONFIRM_KEY) || 'null');
      if (!saved || !saved.id) return;
      if (Number(saved.savedAt) && Date.now() - Number(saved.savedAt) > ORDER_CONFIRM_TTL_MS) {
        localStorage.removeItem(ORDER_CONFIRM_KEY);
        return;
      }
      LAST_ORDER_CONFIRM = saved;
    } catch { /* storage blocked */ }
  }

  function clearOrderConfirmation() {
    LAST_ORDER_CONFIRM = null;
    try { localStorage.removeItem(ORDER_CONFIRM_KEY); } catch { /* storage blocked */ }
  }

  function renderOrderConfirmation() {
    if (!LAST_ORDER_CONFIRM) return;
    const el = document.getElementById('checkoutStatus');
    if (!el) return;
    // A restored confirmation has no `show` class yet — without it the alert
    // stays display:none while the cart layout is hidden, leaving a blank page.
    el.className = 'auth-alert success show cart-page-alert';
    el.style.display = '';
    const c = LAST_ORDER_CONFIRM;
    const metaParams = { id: c.id, total: fmtSAR(c.total) };
    if (c.discount > 0) metaParams.discount = fmtSAR(c.discount);

    const titleText = t('checkout.orderSent');
    const metaText = c.discount > 0 ? t('checkout.orderSentMetaWithDiscount', metaParams) : t('checkout.orderSentMeta', metaParams);
    const trackText = t('cart.trackOrder');
    const browseText = t('cart.newOrder');

    el.innerHTML = `
      <div class="cart-order-confirmed-card">
        <div class="cart-confirm-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h2 class="cart-confirm-title">${escHtml(titleText)}</h2>
        <p class="cart-confirm-meta">${escHtml(metaText)}</p>
        ${c.code ? `<p class="cart-confirm-meta">${escHtml(t('track.trackingCode'))}: <strong dir="ltr" style="letter-spacing:2px;">${escHtml(c.code)}</strong></p>` : ''}
        ${c.tableNumber ? `<p class="cart-confirm-table">${escHtml(t('table.confirmLine', { number: c.tableNumber }))}</p>` : ''}
        <div id="confirmCouponPlaceholder"></div>
        <div class="cart-confirm-actions">
          <a class="confirm-track-btn" id="confirmTrackBtn" href="${escHtml(c.trackUrl)}">
            ${ICON_TRACK}
            <span>${escHtml(trackText)}</span>
          </a>
          <a class="confirm-menu-btn" href="index.html#menu">
            🍽️ <span>${escHtml(browseText)}</span>
          </a>
        </div>
      </div>
    `;

    if (c.earnedPreview && Number(c.earnedPreview.value) > 0) {
      const coupBox = document.createElement('div');
      coupBox.className = 'future-coupon-modal';
      coupBox.style.width = '100%';
      coupBox.style.maxWidth = '460px';
      coupBox.innerHTML = `
        <div style="font-weight:700;color:var(--color-success);font-size:1.05rem;">${escHtml(t('rewards.couponPendingTitle'))}</div>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin:6px 0;">${escHtml(t(isSignedIn() ? 'rewards.couponPendingDescAccount' : 'rewards.couponPendingDesc', {
          value: fmtSAR(c.earnedPreview.value),
          percent: c.earnedPreview.percent,
        }))}</p>
      `;
      el.querySelector('#confirmCouponPlaceholder')?.replaceWith(coupBox);
    }

    const layout = document.getElementById('cartLayout');
    if (layout) {
      layout.classList.add('is-order-confirmed');
    }
  }

  function renderReservationConfirmation() {
    if (!LAST_RESERVATION_CONFIRM) return;
    const el = document.getElementById('reservationSuccess');
    if (!el) return;
    el.innerHTML = confirmationBlock({
      icon: ICON_CALENDAR,
      titleKey: 'reservation.confirmed',
      metaKey: 'reservation.success',
      trackUrl: LAST_RESERVATION_CONFIRM.trackUrl,
      trackKey: 'reservation.track',
    });
  }

  let MENU_ITEMS = [];
  let DISH_RATINGS = {}; // menu_item_id → { avg, count } from customers' ratings
  let CATEGORIES = [];
  let CART = []; // [{ menu_item_id, option_id, option_name, option_name_ar, spicy, name, price, image_url, quantity }]

  /* One cart line per dish + option + spicy choice: "Wings 12 pieces spicy" and
     "Wings 6 pieces" are two lines. */
  const lineKey = (l) => `${l.menu_item_id}:${l.option_id || 0}:${l.spicy ? 1 : 0}`;

  /* The cart survives a page change (for example the trip to login.html and
     back), so a customer never loses their order halfway through. */
  const CART_KEY = 'savoria_cart_v1';

  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(CART)); } catch { /* storage blocked */ }
  }

  function restoreCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (!Array.isArray(parsed)) return;
      CART = parsed
        .filter(l => l && Number(l.menu_item_id) > 0 && Number(l.quantity) > 0)
        .map(l => ({
          menu_item_id: Number(l.menu_item_id),
          option_id: Number(l.option_id) > 0 ? Number(l.option_id) : null,
          option_name: l.option_name ? String(l.option_name) : '',
          option_name_ar: l.option_name_ar ? String(l.option_name_ar) : '',
          spicy: l.spicy === true,
          name: String(l.name || ''),
          price: Number(l.price) || 0,
          image_url: String(l.image_url || ''),
          quantity: Math.min(99, Math.max(1, Math.floor(Number(l.quantity)))),
        }));
    } catch {
      CART = [];
    }
  }
  /* Promo discounts are removed by design — customers can only use the
     coupon codes issued by the restaurant, and every qualifying invoice
     earns a new coupon automatically. */

  /* Dishes highlighted on the menu — a real restaurant usually calls out
     its best-sellers and chef picks rather than showing everything flat.
     The keys stay the untranslated dish names so the flag keeps working
     in every language. */
  const FEATURED_DISHES = {
    'Slow-Braised Lamb Shank': { label: 'menu.chefSpecial', cls: 'badge-chef' },
    'Charcoal Grilled Salmon': { label: 'menu.popular', cls: 'badge-popular' },
    'Truffle Mushroom Arancini': { label: 'menu.chefSpecial', cls: 'badge-chef' },
    'Dark Chocolate Fondant': { label: 'menu.popular', cls: 'badge-popular' },
  };

  const WHATSAPP_NUMBER = '923001112233'; // restaurant order line

  /* ---------- Menu loading (API, with graceful fallback) ---------- */
  const MANAGEMENT_ROLES = ['super_admin', 'admin', 'staff', 'cashier'];

  const FALLBACK_MENU_ITEMS = [
    {
      id: 1, name: 'Slow-Braised Lamb Shank', name_ar: 'لحم ضأن مطهو ببطء',
      category_name: 'Mains', category_name_ar: 'الأطباق الرئيسية',
      description: 'Red wine jus, saffron mash, roasted root vegetables.',
      description_ar: 'مرق فاخر، مهروس الزعفران، خضروات جذرية محمصة.',
      price: 125, is_available: 1, spice_level: 1, calories: 650,
      image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&q=80',
    },
    {
      id: 2, name: 'Charcoal Grilled Salmon', name_ar: 'سلمون مشوي على الفحم',
      category_name: 'Mains', category_name_ar: 'الأطباق الرئيسية',
      description: 'Miso glaze, sesame greens, ginger-scallion oil.',
      description_ar: 'تتبيلة الميسو، خضار بالسمسم، زيت الزنجبيل والبصل الأخضر.',
      price: 110, is_available: 1, spice_level: 1, calories: 520,
      image_url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500&q=80',
    },
    {
      id: 3, name: 'Charred Corn & Burrata', name_ar: 'ذرة مشوية وبوراتا',
      category_name: 'Starters', category_name_ar: 'المقبلات',
      description: 'Grilled sweet corn, torn burrata, chili oil, micro basil.',
      description_ar: 'ذرة حلوة مشوية، جبن بوراتا، زيت الفلفل الحار، ريحان طازج.',
      price: 55, is_available: 1, spice_level: 1, calories: 340,
      image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&q=80',
    },
    {
      id: 4, name: 'Smoked Prawn Toast', name_ar: 'توست الروبيان المدخن',
      category_name: 'Starters', category_name_ar: 'المقبلات',
      description: 'Brioche, smoked prawn butter, pickled shallot, lime zest.',
      description_ar: 'بريوش، زبدة الروبيان المدخن، كراث مخلل، بشر الليمون.',
      price: 65, is_available: 1, spice_level: 2, calories: 410,
      image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&q=80',
    },
    {
      id: 5, name: 'Dark Chocolate Fondant', name_ar: 'فوندان الشوكولاتة الداكنة',
      category_name: 'Desserts', category_name_ar: 'الحلويات',
      description: 'Molten center, pistachio crumble, vanilla bean ice cream.',
      description_ar: 'قلب شوكولاتة ذائب، فتات الفستق، آيس كريم الفانيليا.',
      price: 45, is_available: 1, spice_level: 0, calories: 480,
      image_url: 'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=500&q=80',
    },
    {
      id: 6, name: 'Saffron Kunafa', name_ar: 'كنافة بالزعفران',
      category_name: 'Desserts', category_name_ar: 'الحلويات',
      description: 'Crisp shredded pastry, cream cheese filling, rose-saffron syrup.',
      description_ar: 'شعيرية مقرمشة، حشوة قشطة وجبن، شيرة الورد والزعفران.',
      price: 40, is_available: 1, spice_level: 0, calories: 450,
      image_url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=500&q=80',
    },
    {
      id: 7, name: 'Hibiscus Iced Tea', name_ar: 'شاي الكركديه المثلج',
      category_name: 'Beverages', category_name_ar: 'المشروبات',
      description: 'Cold-steeped hibiscus, fresh mint, orange blossom water.',
      description_ar: 'كركديه منقوع بارد، نعناع طازج، ماء زهر البرتقال.',
      price: 25, is_available: 1, spice_level: 0, calories: 95,
      image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&q=80',
    },
  ];

  async function loadMenu() {
    const grid = document.getElementById('menuGrid');
    // The cart page has no grid but still needs live dish names, prep times
    // and translations for the saved lines, so it loads the menu too.
    const needsMenu = grid || document.body.classList.contains('cart-page');
    if (!needsMenu) return;

    // Categories drive the customer-facing filter row + navbar dropdown,
    // the menu items fill the grid. Both are needed before the filter
    // row is built, because the navbar shows the per-category dish count.
    try { CATEGORIES = await SavoriaAPI.getCategories(); } catch (_) { CATEGORIES = []; }

    try {
      MENU_ITEMS = await SavoriaAPI.getMenuItems();
    } catch (err) {
      // Fallback to sample items so storefront is always operable
      console.warn('API unavailable, using sample menu items fallback:', err);
      MENU_ITEMS = FALLBACK_MENU_ITEMS;
    }

    if (grid && SavoriaAPI.getDishRatings) {
      try { DISH_RATINGS = await SavoriaAPI.getDishRatings() || {}; } catch (_) { DISH_RATINGS = {}; }
    }
    syncMenuFilters(CATEGORIES);
    renderMenu(currentFilter());
    // Dish names in a restored cart may be in the other language — re-label
    // them from the freshly loaded menu.
    if (CART.length) { relocalizeCart(); saveCart(); renderCart(); }
  }

  function currentFilter() {
    const active = document.querySelector('.menu-filter-btn.active');
    return active ? active.dataset.filter : 'all';
  }

  /**
   * Rebuild the storefront filter buttons from live categories while
   * keeping the exact existing .menu-filters / .menu-filter-btn design;
   * and sync the navbar "Menu" dropdown's per-category dish counts.
   */
  function syncMenuFilters(categories) {
    const filtersWrap = document.querySelector('.menu-filters');
    const activeFilter = currentFilter();
    if (filtersWrap && Array.isArray(categories) && categories.length) {
      const html = [`<button class="menu-filter-btn${activeFilter === 'all' ? ' active' : ''}" data-filter="all">${t('menu.filterAll')}</button>`]
        .concat(categories.map(c => {
          const slug = (raw(c, 'name') || '').toLowerCase();
          return `<button class="menu-filter-btn${slug === activeFilter ? ' active' : ''}" data-filter="${slug}">${localize(c, 'name')}</button>`;
        }))
        .join('');
      filtersWrap.innerHTML = html;
      initMenuFilters();
    }

    // Navbar dropdown counts (keep the existing markup + styles)
    const dropLinks = document.querySelectorAll('#navLinks .nav-dropdown-panel a[data-cat]');
    dropLinks.forEach(link => {
      const key = link.dataset.cat;
      const count = MENU_ITEMS.filter(i =>
        (raw(i, 'category_name') || '').toLowerCase() === key ||
        (raw(i, 'category_name') || '').toLowerCase() === key + 's'
      ).length;
      const span = link.querySelector('.count');
      if (span && count > 0) span.textContent = t('nav.dishCount', { count });
    });
  }

  function spiceDots(level) {
    let html = '';
    for (let i = 0; i < 3; i++) html += `<span class="${i < level ? 'filled' : ''}"></span>`;
    return html;
  }

  function renderMenu(filter) {
    const grid = document.getElementById('menuGrid');
    if (!grid) return;
    const items = filter === 'all'
      ? MENU_ITEMS
      : MENU_ITEMS.filter(i => (raw(i, 'category_name') || '').toLowerCase() === filter);

    if (!items.length) {
      grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--color-text-muted);">${t('menu.empty')}</p>`;
      return;
    }

    grid.innerHTML = items.map(item => {
      const name = escHtml(localize(item, 'name'));
      const description = escHtml(localize(item, 'description'));
      const category = escHtml(localize(item, 'category_name'));
      // The calorie value joins the existing muted label instead of adding
      // a new element, so the card keeps exactly the same structure and
      // spacing (and nothing shows at all when no value is published).
      const calories = caloriesLabel(item);
      const metaLabel = calories ? `${category} · ${calories}` : category;
      const featured = FEATURED_DISHES[raw(item, 'name')];

      const discountPercent = Number(item.discount_percent) || 0;
      const hasDiscount = discountPercent > 0 && discountPercent <= 100;
      // A dish with options shows its cheapest one: "From SAR 60".
      const options = Array.isArray(item.options) ? item.options : [];
      const fromPrefix = options.length > 1 ? `${t('menu.priceFrom')} ` : '';
      const originalPrice = options.length ? Math.min(...options.map(o => Number(o.price))) : Number(item.price);
      const discountedPrice = hasDiscount ? round2(originalPrice * (1 - discountPercent / 100)) : originalPrice;

      const discountBadge = hasDiscount
        ? `<span class="menu-card-badge menu-discount-badge">-${discountPercent}%</span>`
        : '';
      const badge = !item.is_available
        ? `<span class="menu-card-badge" style="background:var(--color-text-muted);">${t('menu.soldOut')}</span>`
        : (discountBadge || (featured ? `<span class="menu-card-badge ${featured.cls}">${t(featured.label)}</span>` : ''));
      return `
      <article class="menu-card is-visible" data-category="${escHtml((raw(item, 'category_name') || '').toLowerCase())}">
        <div class="menu-card-media">
          <img src="${escHtml(item.image_url)}" alt="${name}" loading="lazy">
          ${badge}
        </div>
        <div class="menu-card-body">
          <div class="menu-card-top">
            <h3>${name}</h3>
            ${hasDiscount ? `
              <div class="menu-price-wrap">
                <span class="menu-card-price-original">${fmtSAR(originalPrice)}</span>
                <span class="menu-card-price is-discounted">${fromPrefix}${fmtSAR(discountedPrice)}</span>
              </div>
            ` : `
              <span class="menu-card-price">${fromPrefix}${fmtSAR(originalPrice)}</span>
            `}
          </div>
          <p>${description}</p>
          <div class="menu-card-meta">
            <div class="spice-level" title="${t('menu.spiceLevel')}">${spiceDots(item.spice_level)}</div>
            ${DISH_RATINGS[String(item.id)] ? `<span class="dish-rating" title="${escHtml(t('rate.dishAverage', { count: DISH_RATINGS[String(item.id)].count }))}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" ><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/></svg>${escHtml(String(DISH_RATINGS[String(item.id)].avg))} <small>(${escHtml(String(DISH_RATINGS[String(item.id)].count))})</small></span>` : ''}
            <span style="font-size:0.78rem;color:var(--color-text-muted);">${metaLabel}</span>
          </div>
        </div>
        <div class="menu-card-footer">
          <button class="add-to-cart-btn" data-id="${item.id}" ${item.is_available ? '' : 'disabled'}>
            ${item.is_available
              ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`
              : ''}
            ${item.is_available ? t('menu.addToCart') : t('menu.currentlyUnavailable')}
          </button>
        </div>
      </article>
    `;
    }).join('');

    grid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = MENU_ITEMS.find(i => i.id === parseInt(btn.dataset.id, 10));
        if (item && needsChoice(item)) openChoicePicker(item, btn);
        else addToCart(parseInt(btn.dataset.id, 10), btn);
      });
    });
  }

  function initMenuFilters() {
    const buttons = document.querySelectorAll('.menu-filter-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderMenu(btn.dataset.filter);
      });
    });
  }

  let cartToastTimer = null;
  function showCartToast(name) {
    let toastEl = document.getElementById('cartFloatingToast');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'cartFloatingToast';
      toastEl.className = 'cart-floating-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = `
      <div class="cart-toast-content">
        <span class="cart-toast-check">✓</span>
        <span class="cart-toast-text">${t('cart.itemAddedToast', { name: escHtml(name) })}</span>
      </div>
      <button type="button" class="cart-toast-action" id="toastOpenCart">${t('cart.viewCart')}</button>
    `;
    toastEl.classList.add('show');
    document.getElementById('toastOpenCart')?.addEventListener('click', () => {
      toastEl.classList.remove('show');
      window.location.href = 'cart.html';
    });
    clearTimeout(cartToastTimer);
    cartToastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 3500);
  }

  /* ---------- Calories ----------
     A dish with options may list calories per size / quantity; an option
     without its own value falls back to the dish's. The card shows one
     value or the range ("480–1850 kcal"). */
  const hasCalories = (v) => v !== null && v !== undefined && v !== '';
  function optionCalories(item, option) {
    if (option && hasCalories(option.calories)) return Number(option.calories);
    return hasCalories(item.calories) ? Number(item.calories) : null;
  }
  function caloriesLabel(item) {
    const options = Array.isArray(item.options) ? item.options : [];
    const values = (options.length ? options.map(o => optionCalories(item, o)) : [optionCalories(item, null)])
      .filter(v => v !== null);
    if (!values.length) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max
      ? t('menu.calories', { value: fmtNum(min) })
      : t('menu.caloriesRange', { min: fmtNum(min), max: fmtNum(max) });
  }

  /* ---------- Dish options & the spicy choice ---------- */
  const needsChoice = (item) => (Array.isArray(item.options) && item.options.length > 0) || !!item.has_spicy_option;

  /** Price of a dish (or of one of its options) after the dish discount. */
  function unitPrice(item, option) {
    const base = parseFloat(option ? option.price : item.price);
    const discountPercent = Number(item.discount_percent) || 0;
    return (discountPercent > 0 && discountPercent <= 100) ? round2(base * (1 - discountPercent / 100)) : base;
  }

  /** "12 pieces · Spicy" for a cart line, in the current language. */
  const choiceText = (line) => (window.SavoriaI18n && window.SavoriaI18n.itemChoice ? window.SavoriaI18n.itemChoice(line) : '');

  /* A small dialog: pick one option (size / quantity) and regular or spicy. */
  function openChoicePicker(item, clickedBtn) {
    document.getElementById('choicePicker')?.remove();
    const options = Array.isArray(item.options) ? item.options : [];
    const lastFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.id = 'choicePicker';
    wrap.className = 'choice-picker-overlay';
    wrap.innerHTML = `
      <div class="choice-picker" role="dialog" aria-modal="true" aria-labelledby="choicePickerTitle">
        <button type="button" class="choice-picker-close" aria-label="${escHtml(t('common.close'))}">×</button>
        <h3 id="choicePickerTitle">${escHtml(localize(item, 'name'))}</h3>
        ${options.length ? `
          <fieldset class="choice-group">
            <legend>${t('menu.chooseOption')}</legend>
            ${options.map((o, idx) => `
              <label class="choice-option">
                <input type="radio" name="choiceOption" value="${o.id}" ${idx === 0 ? 'checked' : ''}>
                <span class="choice-option-name">${escHtml(localize(o, 'name'))}${optionCalories(item, o) !== null ? `<small class="choice-option-cal">${t('menu.calories', { value: fmtNum(optionCalories(item, o)) })}</small>` : ''}</span>
                <span class="choice-option-price">${fmtSAR(unitPrice(item, o))}</span>
              </label>`).join('')}
          </fieldset>` : ''}
        ${item.has_spicy_option ? `
          <fieldset class="choice-group choice-spice">
            <legend>${t('menu.chooseSpice')}</legend>
            <label class="choice-pill"><input type="radio" name="choiceSpice" value="0" checked><span>${t('menu.regular')}</span></label>
            <label class="choice-pill"><input type="radio" name="choiceSpice" value="1"><span>🌶️ ${t('menu.spicy')}</span></label>
            <small>${t('menu.spicySamePrice')}</small>
          </fieldset>` : ''}
        <button type="button" class="btn btn-primary choice-picker-add">${t('menu.addToCart')}</button>
      </div>`;
    document.body.appendChild(wrap);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); if (lastFocus) lastFocus.focus(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('.choice-picker-close').addEventListener('click', close);
    wrap.querySelector('.choice-picker-add').addEventListener('click', () => {
      const optionId = Number(wrap.querySelector('input[name="choiceOption"]:checked')?.value) || null;
      const spicy = wrap.querySelector('input[name="choiceSpice"]:checked')?.value === '1';
      close();
      addToCart(item.id, clickedBtn, { optionId, spicy });
    });
    (wrap.querySelector('input:checked') || wrap.querySelector('.choice-picker-add')).focus();
  }

  function addToCart(menuItemId, clickedBtn = null, choice = {}) {
    clearOrderConfirmation();
    const statusEl = document.getElementById('checkoutStatus');
    if (statusEl) { statusEl.className = 'auth-alert'; statusEl.innerHTML = ''; }

    const item = MENU_ITEMS.find(i => i.id === menuItemId);
    if (!item) return;
    const option = choice.optionId ? (item.options || []).find(o => o.id === choice.optionId) : null;
    if ((item.options || []).length && !option) { openChoicePicker(item, clickedBtn); return; }
    const spicy = !!(choice.spicy && item.has_spicy_option);

    const itemName = localize(item, 'name');
    const line = {
      menu_item_id: item.id,
      option_id: option ? option.id : null,
      option_name: option ? option.name : '',
      option_name_ar: option ? (option.name_ar || '') : '',
      spicy,
      name: itemName,
      price: unitPrice(item, option),
      original_price: parseFloat(option ? option.price : item.price),
      discount_percent: Number(item.discount_percent) || 0,
      image_url: item.image_url, quantity: 1,
    };
    const existing = CART.find(c => lineKey(c) === lineKey(line));
    if (existing) {
      existing.quantity += 1;
    } else {
      CART.push(line);
    }
    saveCart();
    renderCart();

    // 1. Button active animation feedback
    if (clickedBtn) {
      const originalText = clickedBtn.innerHTML;
      clickedBtn.classList.add('btn-added');
      clickedBtn.innerHTML = `✓ ${t('cart.added')}`;
      setTimeout(() => {
        clickedBtn.classList.remove('btn-added');
        clickedBtn.innerHTML = originalText;
      }, 1300);
    }

    // Lets the home page motion fly the dish into the cart.
    document.dispatchEvent(new CustomEvent('savoria:cart-add', { detail: { button: clickedBtn, image: item.image_url } }));

    // 2. Pulse cart trigger badge
    const cartTrigger = document.getElementById('cartTrigger');
    if (cartTrigger) {
      cartTrigger.classList.remove('cart-badge-bounce');
      void cartTrigger.offsetWidth;
      cartTrigger.classList.add('cart-badge-bounce');
    }

    // 3. Floating mini-toast notification (user views cart whenever ready)
    showCartToast(choiceText(line) ? `${itemName} (${choiceText(line)})` : itemName);
  }

  function updateQty(key, delta) {
    const line = CART.find(c => lineKey(c) === key);
    if (!line) return;
    line.quantity += delta;
    if (line.quantity <= 0) CART = CART.filter(c => lineKey(c) !== key);
    saveCart();
    renderCart();
  }

  function removeLine(key) {
    CART = CART.filter(c => lineKey(c) !== key);
    saveCart();
    renderCart();
  }

  function cartTotal() {
    return CART.reduce((sum, l) => sum + l.price * l.quantity, 0);
  }

  /** Re-label the cart lines after a language switch (the dish names
      live in the menu, the cart only keeps the id). */
  function relocalizeCart() {
    CART.forEach(line => {
      const item = MENU_ITEMS.find(i => i.id === line.menu_item_id);
      if (item) {
        line.name = localize(item, 'name');
        // Prices follow the live menu; an option that no longer exists is left
        // for the server to refuse with a clear message at checkout.
        const option = line.option_id ? (item.options || []).find(o => o.id === line.option_id) : null;
        if (option) { line.option_name = option.name; line.option_name_ar = option.name_ar || ''; }
        line.price = unitPrice(item, option);
        line.original_price = parseFloat(option ? option.price : item.price);
        line.discount_percent = Number(item.discount_percent) || 0;
        if (!line.image_url && item.image_url) line.image_url = item.image_url;
      }
    });
  }

  /* ---------- Coupon rules (one coupon per qualifying invoice) ----------
     The checkout only previews the rule; the server recomputes the exact
     same figure inside the order transaction. */
  let LOYALTY_RULES = null;
  let LOYALTY_REQ = 0;
  const round2 = (n) => Math.round(Number(n) * 100) / 100;

  async function loadLoyaltyRules() {
    const reqId = ++LOYALTY_REQ;
    try {
      const rules = await SavoriaAPI.getLoyaltyRules();
      if (reqId !== LOYALTY_REQ) return; // a newer load superseded this one
      LOYALTY_RULES = rules;
    } catch {
      if (reqId !== LOYALTY_REQ) return;
      LOYALTY_RULES = null;
    }
    renderCart();
  }

  /* Mirrors CouponService.valueForBill() in backend-java (coupons package). */
  function earnedCouponPreview(billAmount) {
    const r = LOYALTY_RULES;
    if (!r || !r.enabled) return null;
    const percent = Number(r.coupon_percent) || 0;
    const minInvoice = Number(r.min_invoice) || 0;
    const bill = Math.max(0, Number(billAmount) || 0);
    const eligible = percent > 0 && bill >= minInvoice;
    return {
      percent, minInvoice, bill, eligible,
      amount: eligible ? round2(bill * (percent / 100)) : 0,
      missing: Math.max(0, round2(minInvoice - bill)),
    };
  }

  /* ---------- Customer coupons (phone-keyed, no login required) ----------
     Coupons are stacked by code; the server re-reads every value, checks
     ownership/status and rejects reused or oversized stacks. */
  let MY_REWARDS = null;             // coupons/lookup payload
  const APPLIED_COUPONS = new Map(); // code -> older personal coupon
  let ACTIVE_PHONE = '';

  /* Loyalty points and the admin's discount codes (signed-in customers).
     The bill previews the same arithmetic the server repeats inside the
     order transaction: code → older coupons → points → VAT. */
  let MY_POINTS = null;      // GET /me/points
  let APPLIED_PROMO = null;  // the one discount code on this order
  let USE_POINTS = 0;        // points the customer chose to spend

  /* Mirrors PromoService.discountFor() in backend-java. */
  function promoDiscountFor(promo, bill) {
    if (!promo) return 0;
    const value = Number(promo.value) || 0;
    let d = promo.discount_type === 'percent' ? round2(bill * value / 100) : value;
    if (promo.max_discount !== null && promo.max_discount !== undefined) d = Math.min(d, Number(promo.max_discount));
    return round2(Math.max(0, Math.min(d, bill)));
  }
  const pointRules = () => (MY_POINTS && MY_POINTS.enabled ? MY_POINTS : null);
  /* Mirrors PointsService.pointsFor() / maxForBill(). */
  function pointsFor(amount, r) {
    if (!r || !(r.earn_amount > 0) || !(amount > 0)) return 0;
    return Math.floor(round2(amount) / r.earn_amount + 1e-9) * (Number(r.earn_points) || 0);
  }
  function maxPointsForBill(bill, r) {
    if (!r || !(r.point_value > 0) || !(bill > 0)) return 0;
    return Math.floor(round2(bill * r.max_percent / 100) / r.point_value + 1e-9);
  }

  const tr = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const fmtNum = (n) => (I18N ? I18N.fmtNumber(n) : Number(n).toLocaleString('en-US'));
  const isSignedIn = () => {
    try { return typeof SavoriaAPI !== 'undefined' && SavoriaAPI.isLoggedIn(); } catch { return false; }
  };

  /* The tracking code is the guest's second factor next to the phone.
     Keeping the last one per phone on this device saves re-typing it. */
  function rememberTrackCode(phone, code) {
    try {
      const key = 'savoria_track_codes';
      const map = JSON.parse(localStorage.getItem(key) || '{}');
      map[String(phone).replace(/\D/g, '').slice(-10)] = String(code).toUpperCase();
      localStorage.setItem(key, JSON.stringify(map));
    } catch { /* storage blocked */ }
  }

  function availableCoupons() {
    return ((MY_REWARDS && MY_REWARDS.coupons) || []).filter((c) => c.status === 'available');
  }

  async function loadRewards(phoneOverride) {
    // A signed-in customer never types a phone to find their coupons:
    // the account is the identity, and the server returns its wallet.
    if (isSignedIn()) {
      const user = SavoriaAPI.getCurrentUser();
      try {
        const res = await SavoriaAPI.getMyCoupons();
        MY_REWARDS = res || null;
        ACTIVE_PHONE = (res && res.phone) || (user && user.phone) || '';
      } catch {
        MY_REWARDS = null;
        ACTIVE_PHONE = (user && user.phone) || '';
      }
      // Points belong to customer accounts; staff browsing the site have none.
      MY_POINTS = null;
      if (user && user.role === 'customer') {
        try { MY_POINTS = await SavoriaAPI.getMyPoints(); } catch { MY_POINTS = null; }
      }
      return;
    }

    let phone = phoneOverride || ACTIVE_PHONE;
    if (!phone) {
      const checkoutPhone = document.getElementById('checkoutPhone')?.value?.trim();
      if (checkoutPhone && checkoutPhone.length >= 7) phone = checkoutPhone;
    }
    if (phone) {
      try {
        const res = await SavoriaAPI.lookupCouponsByPhone(phone);
        MY_REWARDS = res.data || res;
        ACTIVE_PHONE = phone;
      } catch {
        MY_REWARDS = null;
      }
    } else {
      MY_REWARDS = null;
    }
  }

  async function applyCoupon(rawCode) {
    const code = (rawCode || '').toUpperCase().trim();
    if (!code) return;
    if (!isSignedIn()) {
      showRewardsMsg(t('rewards.signInForCoupon'), true);
      return;
    }
    if (APPLIED_COUPONS.has(code) || (APPLIED_PROMO && APPLIED_PROMO.code === code)) {
      showRewardsMsg(t('rewards.couponAlreadyApplied'), true);
      return;
    }
    // 1. a discount code made by the restaurant (one per order)
    try {
      const promo = await SavoriaAPI.validatePromo(code, cartTotal());
      const replaced = APPLIED_PROMO ? APPLIED_PROMO.code : null;
      APPLIED_PROMO = promo;
      showRewardsMsg(replaced ? t('rewards.promoReplaced', { code, old: replaced }) : t('rewards.couponAppliedSuccess', { code }), false);
      const input = document.getElementById('couponCodeInput');
      if (input) input.value = '';
      renderCart();
      return;
    } catch (err) {
      if (err.status !== 404) { showRewardsMsg(tr(err.message), true); return; }
    }
    // 2. otherwise one of the customer's older personal coupons
    if (!LOYALTY_RULES || !LOYALTY_RULES.enabled) {
      showRewardsMsg(tr('This coupon code does not exist.'), true);
      return;
    }
    const max = (LOYALTY_RULES && Number(LOYALTY_RULES.max_per_order) > 0)
      ? Number(LOYALTY_RULES.max_per_order)
      : (MY_REWARDS && Number(MY_REWARDS.max_per_order) > 0 ? Number(MY_REWARDS.max_per_order) : 0);
    if (max > 0 && APPLIED_COUPONS.size >= max) {
      showRewardsMsg(t('rewards.capReached', { max }), true);
      return;
    }
    try {
      const res = await SavoriaAPI.validateCoupon(code, ACTIVE_PHONE, cartTotal());
      const rawCoup = (res && res.coupon) || (res && res.data && res.data.coupon) || (res && res.data) || res;
      if (!rawCoup || typeof rawCoup !== 'object') {
        throw new Error('Invalid coupon data');
      }
      const c = {
        id: rawCoup.id,
        code: (rawCoup.code || code).toUpperCase(),
        title: rawCoup.title || '',
        value: Number(rawCoup.value) || Number(res?.calculated_amount) || 0,
        discount_type: rawCoup.discount_type || 'fixed',
        min_order_amount: Number(rawCoup.min_order_amount) || 0,
        calculated_discount: Number(res?.calculated_amount) || Number(rawCoup.value) || 0,
      };
      APPLIED_COUPONS.set(code, c);
      showRewardsMsg(t('rewards.couponAppliedSuccess', { code }), false);
      const input = document.getElementById('couponCodeInput');
      if (input) input.value = '';
      renderCart();
    } catch (err) {
      showRewardsMsg(tr(err.message), true);
    }
  }

  function removeCoupon(rawCode) {
    const code = (rawCode || '').toUpperCase().trim();
    if (APPLIED_PROMO && APPLIED_PROMO.code === code) {
      APPLIED_PROMO = null;
      renderCart();
      return;
    }
    if (APPLIED_COUPONS.has(code)) {
      APPLIED_COUPONS.delete(code);
      renderCart();
    }
  }

  /* One running bill: subtotal → stacked coupons → VAT.
     Each coupon keeps its full face value, exactly like the server; if the
     stack is worth more than the bill the order is rejected with a clear
     message instead of silently shrinking the coupons. */
  function computeBill() {
    const subtotal = round2(cartTotal());
    if (!LOYALTY_RULES || !LOYALTY_RULES.enabled) {
      APPLIED_COUPONS.clear();
    }

    // 1. the discount code (it may stop applying when the cart shrinks)
    const promoBelowMin = !!APPLIED_PROMO && subtotal + 0.001 < (Number(APPLIED_PROMO.min_order) || 0);
    const promoDiscount = APPLIED_PROMO && !promoBelowMin ? promoDiscountFor(APPLIED_PROMO, subtotal) : 0;
    const afterPromo = round2(subtotal - promoDiscount);

    // 2. older personal coupons, at face value
    const coupons = Array.from(APPLIED_COUPONS.values());
    const couponTotal = round2(coupons.reduce((sum, c) => (
      sum + (c.discount_type === 'percent'
        ? round2(afterPromo * (Number(c.value) || 0) / 100)
        : (Number(c.value) || 0))
    ), 0));
    const overBill = couponTotal > afterPromo + 0.001;
    const couponDiscount = Math.min(couponTotal, afterPromo);
    const afterCoupons = Math.max(0, round2(afterPromo - couponDiscount));

    // 3. loyalty points (minimum, share of the bill, balance)
    const pr = pointRules();
    const balance = MY_POINTS ? Number(MY_POINTS.balance) || 0 : 0;
    const pointsCap = pr ? Math.min(balance, maxPointsForBill(afterCoupons, pr)) : 0;
    let pointsUsed = pr ? Math.min(USE_POINTS, pointsCap) : 0;
    if (pr && pointsUsed < (Number(pr.min_redeem) || 0)) pointsUsed = 0;
    const pointsDiscount = pr ? round2(Math.min(pointsUsed * pr.point_value, afterCoupons)) : 0;
    const net = Math.max(0, round2(afterCoupons - pointsDiscount));

    const vatRate = (LOYALTY_RULES && LOYALTY_RULES.vat_rate !== undefined)
      ? Number(LOYALTY_RULES.vat_rate)
      : 15.00;
    const vatAmount = round2(net * (vatRate / 100));
    const total = Math.max(0, round2(net + vatAmount));

    return {
      subtotal, coupons, couponTotal, couponDiscount, overBill,
      promo: APPLIED_PROMO, promoDiscount, promoBelowMin,
      pointsUsed, pointsDiscount, pointsCap, pointsToEarn: pointsFor(net, pr),
      net, vatRate, vatAmount, total,
      earn: earnedCouponPreview(net),
      maxCoupons: LOYALTY_RULES
        ? Number(LOYALTY_RULES.max_per_order) || 0
        : (MY_REWARDS ? Number(MY_REWARDS.max_per_order) || 0 : 0),
    };
  }

  /* ---------- Rewards panel (rendered with the cart) ---------- */
  let rewardsMsgTimer = null;
  function showRewardsMsg(message, isError) {
    const el = document.getElementById('rewardsMsg');
    if (!el) return;
    el.textContent = message;
    el.className = 'rewards-msg ' + (isError ? 'is-error' : 'is-success');
    el.style.display = 'block';
    clearTimeout(rewardsMsgTimer);
    rewardsMsgTimer = setTimeout(() => { el.style.display = 'none'; }, 7000);
  }

  function renderRewards(bill) {
    const panel = document.getElementById('rewardsPanel');
    const rewardsCard = document.querySelector('.cart-rewards-card');
    if (!panel) return;
    // Coupons belong to the signed-in account. Before login the whole
    // card (including the old phone lookup) stays hidden — the checkout
    // gate explains that the customer must sign in first.
    // The discount codes and the points work whether or not the older coupons are on.
    if (!CART.length || !isSignedIn()) {
      panel.style.display = 'none';
      if (rewardsCard) rewardsCard.style.display = 'none';
      return;
    }
    renderPointsUse(bill);
    if (rewardsCard) rewardsCard.style.display = 'block';
    panel.style.display = 'block';

    // The wallet comes from the account now, so the phone lookup bar is
    // redundant. The coupons themselves are listed below instead.
    const phoneBar = document.getElementById('rewardsPhoneBar');
    if (phoneBar) phoneBar.style.display = 'none';

    const unlinked = document.getElementById('rewardsPhoneUnlinked');
    const linked = document.getElementById('rewardsPhoneLinked');
    const badge = document.getElementById('rewardsBadge');

    const available = availableCoupons();
    const totalBadges = available.length + APPLIED_COUPONS.size;
    if (badge) {
      badge.textContent = fmtNum(totalBadges);
      badge.style.display = totalBadges > 0 ? 'inline-flex' : 'none';
    }

    if (unlinked && linked) {
      const signedIn = isSignedIn();
      if (signedIn || (ACTIVE_PHONE && MY_REWARDS)) {
        unlinked.style.display = 'none';
        linked.style.display = 'block';
        const phoneDisp = document.getElementById('rewardsPhoneDisplay');
        if (phoneDisp) phoneDisp.textContent = ACTIVE_PHONE;
        const logoutBtn = document.getElementById('rewardsLogout');
        if (logoutBtn) logoutBtn.style.display = signedIn ? 'none' : '';
        const note = document.getElementById('rewardsNote');
        if (note) {
          note.textContent = available.length
            ? t(signedIn ? 'rewards.availableNoteAccount' : 'rewards.availableNote', { count: fmtNum(available.length) })
            : t(signedIn ? 'rewards.noCouponsAccount' : 'rewards.noCouponsYet');
        }
      } else {
        unlinked.style.display = 'block';
        linked.style.display = 'none';
      }
    }

    // Applied coupons chips
    const stack = document.getElementById('appliedCouponsStack');
    const stackList = document.getElementById('appliedCouponsList');
    if (stack && stackList) {
      if (APPLIED_COUPONS.size > 0 || APPLIED_PROMO) {
        stack.style.display = 'block';
        const promoChip = APPLIED_PROMO ? `
          <span class="applied-coupon-chip${bill.promoBelowMin ? ' is-paused' : ''}">
            🏷️ <strong dir="ltr">${escHtml(APPLIED_PROMO.code)}</strong>: ${bill.promoBelowMin
              ? escHtml(t('rewards.promoNeedsMore', { amount: fmtSAR(APPLIED_PROMO.min_order) }))
              : '− ' + fmtSAR(bill.promoDiscount)}
            <button type="button" class="chip-remove" data-remove-coupon="${escHtml(APPLIED_PROMO.code)}" title="${escHtml(t('rewards.removeCoupon'))}">×</button>
          </span>` : '';
        stackList.innerHTML = promoChip + Array.from(APPLIED_COUPONS.values()).map(c => `
          <span class="applied-coupon-chip">
            🎟️ <strong>${escHtml(c.code)}</strong>: − ${c.discount_type === 'percent' ? c.value + '%' : fmtSAR(c.value)}
            <button type="button" class="chip-remove" data-remove-coupon="${escHtml(c.code)}" title="${escHtml(t('rewards.removeCoupon'))}">×</button>
          </span>
        `).join('');
      } else {
        stack.style.display = 'none';
        stackList.innerHTML = '';
      }
    }

    // Older coupons on the signed-in account (only while that system is on)
    const availWrap = document.getElementById('rewardsAvailableCouponsWrap');
    const list = document.getElementById('rewardsCoupons');
    if (availWrap && list && !(LOYALTY_RULES && LOYALTY_RULES.enabled)) {
      availWrap.style.display = 'none';
    } else if (availWrap && list) {
      availWrap.style.display = available.length ? 'block' : 'none';
      if (!available.length) {
        list.innerHTML = `<p class="rewards-empty">${escHtml(t('rewards.noCouponsAccount'))}</p>`;
      } else {
        list.innerHTML = available.map((c) => {
          const selected = APPLIED_COUPONS.has(c.code);
          return `
            <div class="coupon-pick${selected ? ' is-selected' : ''}" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;">
              <span class="coupon-pick-code">🎟️ ${escHtml(c.code)}</span>
              <span class="coupon-pick-value">− ${c.discount_type === 'percent' ? c.value + '%' : fmtSAR(c.value)}</span>
              <button type="button" class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:0.75rem;"
                data-pick-coupon="${escHtml(c.code)}" ${selected ? 'disabled' : ''}>
                ${selected ? '✓' : escHtml(t('rewards.useCouponBtn'))}
              </button>
            </div>`;
        }).join('');
      }
    }

    if (bill.overBill && list) {
      list.insertAdjacentHTML('beforeend',
        `<p class="rewards-empty rewards-warn">${escHtml(t('rewards.overBill', { total: fmtSAR(bill.couponTotal) }))}</p>`);
    }
  }

  /* "Use your points": balance, what it is worth, how many this bill can take. */
  function renderPointsUse(bill) {
    const wrap = document.getElementById('pointsUseWrap');
    if (!wrap) return;
    const pr = pointRules();
    if (!pr) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    const balance = Number(MY_POINTS.balance) || 0;
    const min = Number(pr.min_redeem) || 0;
    const note = document.getElementById('pointsBalanceNote');
    const form = document.getElementById('pointsUseForm');
    const input = document.getElementById('pointsUseInput');
    const usable = balance >= min && bill.pointsCap >= min;
    if (note) {
      note.textContent = balance < min
        ? t('points.cartNeedMore', { balance: fmtNum(balance), missing: fmtNum(min - balance), min: fmtNum(min) })
        : usable
          ? t('points.cartBalance', { balance: fmtNum(balance), worth: fmtSAR(round2(balance * pr.point_value)), max: fmtNum(bill.pointsCap) })
          : t('points.cartBillTooSmall', { min: fmtNum(min) });
    }
    if (form) form.style.display = usable ? '' : 'none';
    if (input) {
      input.min = String(min);
      input.max = String(bill.pointsCap);
      input.placeholder = t('points.inputPlaceholder', { min: fmtNum(min), max: fmtNum(bill.pointsCap) });
    }
    const applied = document.getElementById('pointsAppliedList');
    if (applied) {
      applied.innerHTML = bill.pointsUsed > 0 ? `
        <span class="applied-coupon-chip">
          ⭐ ${escHtml(t('points.chip', { points: fmtNum(bill.pointsUsed), amount: fmtSAR(bill.pointsDiscount) }))}
          <button type="button" class="chip-remove" data-remove-points="1" title="${escHtml(t('points.remove'))}">×</button>
        </span>` : '';
    }
  }

  function usePoints(raw) {
    const pr = pointRules();
    if (!pr) return;
    const bill = computeBill();
    const want = Math.floor(Number(raw));
    const min = Number(pr.min_redeem) || 0;
    if (!(want >= min)) { showRewardsMsg(t('points.belowMin', { min: fmtNum(min) }), true); return; }
    if (want > bill.pointsCap) { showRewardsMsg(t('points.aboveMax', { max: fmtNum(bill.pointsCap) }), true); return; }
    USE_POINTS = want;
    const input = document.getElementById('pointsUseInput');
    if (input) input.value = '';
    renderCart();
  }

  function isManagementUser() {
    if (!isSignedIn()) return false;
    const user = SavoriaAPI.getCurrentUser();
    return !!user && MANAGEMENT_ROLES.includes(String(user.role || ''));
  }

  /* A management account always keeps a direct way back to the back-office
     from the storefront. The link only exists for those roles, and it is
     removed again when the visitor logs out. */
  function updateAdminNavLink() {
    const nav = document.getElementById('navLinks');
    if (!nav) return;

    let link = document.getElementById('navAdminLink');
    if (!isManagementUser()) {
      if (link) link.remove();
      return;
    }

    // admin.html already ships its own static Site Management link.
    if (!link && nav.querySelector('a[href="admin.html"]')) return;

    if (!link) {
      link = document.createElement('a');
      link.id = 'navAdminLink';
      link.href = 'admin.html';
      link.className = 'nav-admin-link';
      const mobileAuth = document.getElementById('mobileNavAuth');
      if (mobileAuth && mobileAuth.parentElement === nav) nav.insertBefore(link, mobileAuth);
      else nav.appendChild(link);
    }

    const label = t('nav.siteManagement');
    link.textContent = label;
    link.setAttribute('aria-label', label);
  }

  function updateNavAuth() {
    updateAdminNavLink();
    applyReservationGate();

    const targets = [
      document.getElementById('navLoginLink'),
      document.getElementById('mobileNavLoginLink'),
    ].filter(Boolean);

    targets.forEach(link => {
      const label = link.querySelector('.nav-login-label, .nav-auth-label');
      const isIn = isSignedIn();
      const key = isIn ? 'nav.logOut' : 'nav.logIn';
      const text = t(key);
      // The tablet breakpoint hides the text and leaves the icon alone, so
      // the link needs its own accessible name at every width.
      link.setAttribute('aria-label', text);
      link.setAttribute('title', text);
      if (label) {
        label.textContent = text;
        label.setAttribute('data-i18n', key);
        // The icon lives outside the label, so it is never wiped out.
        link.removeAttribute('data-i18n');
      } else {
        link.textContent = text;
        link.setAttribute('data-i18n', key);
      }
      if (isIn) {
        link.href = '#';
        link.onclick = async (e) => {
          e.preventDefault();
          try { await SavoriaAPI.logout(); } catch { SavoriaAPI.clearSession(); }
          window.location.reload();
        };
      } else {
        link.href = 'login.html';
        link.onclick = null;
      }
    });
  }

  function bindRewardsEvents() {
    // Phone check
    document.getElementById('rewardsPhoneCheckBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('rewardsPhoneInput');
      const phone = input ? input.value.trim() : '';
      if (!phone) return;
      await loadRewards(phone);
      const cp = document.getElementById('checkoutPhone');
      if (cp && !cp.value) cp.value = phone;
      renderCart();
    });

    document.getElementById('rewardsPhoneInput')?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('rewardsPhoneCheckBtn')?.click();
      }
    });

    document.getElementById('checkoutPhone')?.addEventListener('blur', async (e) => {
      const phone = e.target.value.trim();
      if (phone && phone.length >= 7 && phone !== ACTIVE_PHONE) {
        await loadRewards(phone);
        renderCart();
      }
    });

    document.getElementById('applyCouponBtn')?.addEventListener('click', () => {
      const input = document.getElementById('couponCodeInput');
      if (input && input.value) applyCoupon(input.value);
    });

    document.getElementById('couponCodeInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('applyCouponBtn')?.click();
      }
    });

    document.getElementById('pointsUseBtn')?.addEventListener('click', () => usePoints(document.getElementById('pointsUseInput')?.value));
    document.getElementById('pointsUseInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); usePoints(e.target.value); }
    });
    document.getElementById('pointsUseMaxBtn')?.addEventListener('click', () => usePoints(computeBill().pointsCap));
    document.getElementById('pointsAppliedList')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-remove-points]')) { USE_POINTS = 0; renderCart(); }
    });

    document.getElementById('appliedCouponsList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-coupon]');
      if (btn) removeCoupon(btn.dataset.removeCoupon);
    });

    document.getElementById('rewardsCoupons')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick-coupon]');
      if (btn && !btn.disabled) applyCoupon(btn.dataset.pickCoupon);
    });

    document.getElementById('rewardsLogout')?.addEventListener('click', () => {
      ACTIVE_PHONE = '';
      MY_REWARDS = null;
      renderCart();
    });
  }

  function buildWhatsAppLink() {
    if (!CART.length) return `https://wa.me/${WHATSAPP_NUMBER}`;
    const lines = CART.map(l => `- ${l.name}${choiceText(l) ? ` (${choiceText(l)})` : ''} x${l.quantity} (${fmtSAR(l.price * l.quantity)})`).join('\n');
    const bill = computeBill();
    const total = fmtSAR(bill.total);
    const discount = bill.couponDiscount > 0
      ? t('checkout.whatsappDiscount', { amount: fmtSAR(bill.couponDiscount) })
      : '';
    const msg = t('checkout.whatsappMessage', { lines, total }) + discount;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  }

  /* Estimated ready time — based on the slowest dish in the cart plus a
     small buffer per extra item, like a real kitchen queue. */
  function renderEstimate() {
    const el = document.getElementById('cartEstimate');
    if (!el) return;
    if (!CART.length) { el.style.display = 'none'; return; }

    const prepTimes = CART.map(l => {
      const menuItem = MENU_ITEMS.find(i => i.id === l.menu_item_id);
      return menuItem ? Number(menuItem.prep_time_minutes) || 15 : 15;
    });
    const slowest = Math.max(...prepTimes, 15);
    const extraItems = CART.reduce((sum, l) => sum + l.quantity, 0) - 1;
    const low = slowest + Math.max(extraItems, 0) * 2;
    const high = low + 10;

    el.style.display = 'flex';
    el.innerHTML = `⏱️ ${t('cart.estimatedReady', { range: `${low}–${high}` })}`;
  }

  function renderCart() {
    const countEl = document.getElementById('cartCount');
    const bodyEl = document.getElementById('cartBody');
    const totalEl = document.getElementById('cartTotal');
    const count = CART.reduce((sum, l) => sum + l.quantity, 0);
    if (countEl) countEl.textContent = count;
    const itemsCountEl = document.getElementById('cartItemsCount');
    if (itemsCountEl) itemsCountEl.textContent = count;

    // The cart page uses this state to hide the checkout column when empty.
    const layout = document.getElementById('cartLayout');
    if (layout) {
      if (LAST_ORDER_CONFIRM) {
        layout.classList.add('is-order-confirmed');
      } else {
        layout.classList.remove('is-order-confirmed');
      }
      layout.classList.toggle('is-empty', !CART.length);
    }

    renderTableContext();
    applyCheckoutGate();

    // The main storefront has no cart body but still shows the live badge.
    if (!bodyEl && !totalEl) return;

    if (!CART.length) {
      bodyEl.innerHTML = `
        <div class="cart-empty-state">
          <span class="cart-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          </span>
          <h3>${t('cart.emptyTitle')}</h3>
          <p>${t('cart.emptyHint')}</p>
          <div class="cart-empty-actions">
            <a href="index.html#menu" class="btn btn-primary">${t('cart.newOrder')}</a>
            <a href="track-order.html" class="cart-empty-track">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>${t('cart.trackOrder')}</span>
            </a>
          </div>
        </div>`;
    } else {
      bodyEl.innerHTML = CART.map(l => `
        <article class="cart-line">
          <div class="cart-line-media">
            <img src="${escHtml(l.image_url)}" alt="${escHtml(l.name)}" loading="lazy">
          </div>
          <div class="cart-line-info">
            <div class="cart-line-head">
              <h3>${escHtml(l.name)}${choiceText(l) ? `<small class="cart-line-choice">${escHtml(choiceText(l))}</small>` : ''}</h3>
              <button type="button" class="cart-line-remove" data-action="remove" data-key="${lineKey(l)}" aria-label="${escHtml(t('cart.removeItem', { name: l.name }))}" title="${escHtml(t('cart.remove'))}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
            </div>
            <div class="cart-line-unit">${(Number(l.discount_percent) > 0) ? `<span class="menu-card-price-original" style="margin-inline-end:6px;">${fmtSAR(l.original_price)}</span>` : ''}${t('cart.each', { price: fmtSAR(l.price) })}${(Number(l.discount_percent) > 0) ? `<span class="cart-item-discount-chip">-${Number(l.discount_percent)}%</span>` : ''}</div>
            <div class="cart-line-foot">
              <div class="cart-line-qty" role="group" aria-label="${escHtml(t('common.quantity'))}">
                <button type="button" data-action="dec" data-key="${lineKey(l)}" aria-label="${escHtml(t('cart.decreaseQty'))}">−</button>
                <span>${l.quantity}</span>
                <button type="button" data-action="inc" data-key="${lineKey(l)}" aria-label="${escHtml(t('cart.increaseQty'))}">+</button>
              </div>
              <div class="cart-line-price">${fmtSAR(l.price * l.quantity)}</div>
            </div>
          </div>
        </article>
      `).join('');

      bodyEl.querySelectorAll('[data-action="inc"]').forEach(b => b.addEventListener('click', () => updateQty(b.dataset.key, 1)));
      bodyEl.querySelectorAll('[data-action="dec"]').forEach(b => b.addEventListener('click', () => updateQty(b.dataset.key, -1)));
      bodyEl.querySelectorAll('[data-action="remove"]').forEach(b => b.addEventListener('click', () => removeLine(b.dataset.key)));
    }

    const bill = computeBill();
    const subtotal = bill.subtotal;
    const subtotalRow = document.getElementById('cartSubtotalRow');
    if (subtotalRow) {
      subtotalRow.style.display = CART.length ? 'flex' : 'none';
      document.getElementById('cartSubtotal').textContent = fmtSAR(subtotal);
    }

    const promoRow = document.getElementById('cartPromoRow');
    if (promoRow) {
      promoRow.style.display = bill.promoDiscount > 0 ? 'flex' : 'none';
      document.getElementById('cartPromoCode').textContent = bill.promo ? bill.promo.code : '';
      document.getElementById('cartPromoDiscount').textContent = '− ' + fmtSAR(bill.promoDiscount);
    }
    const pointsRow = document.getElementById('cartPointsRow');
    if (pointsRow) {
      pointsRow.style.display = bill.pointsDiscount > 0 ? 'flex' : 'none';
      document.getElementById('cartPointsUsed').textContent = fmtNum(bill.pointsUsed);
      document.getElementById('cartPointsDiscount').textContent = '− ' + fmtSAR(bill.pointsDiscount);
    }

    const couponRow = document.getElementById('cartCouponRow');
    if (couponRow) {
      couponRow.style.display = bill.couponDiscount > 0 ? 'flex' : 'none';
      document.getElementById('cartCouponCount').textContent = fmtNum(bill.coupons.length);
      document.getElementById('cartCouponDiscount').textContent = '− ' + fmtSAR(bill.couponDiscount);
    }

    renderRewards(bill);

    /* Coupon earned from this invoice — evaluated from this bill and the
       live rules. The server issues exactly this coupon after checkout. */
    const earnBox = document.getElementById('cartEarnCouponBox');
    const earnMsg = document.getElementById('cartEarnCouponMsg');
    if (earnBox && earnMsg) {
      const earn = bill.earn;
      const pr = pointRules();
      if (CART.length && pr) {
        // Invoices earn loyalty points now (added when the order is delivered).
        earnBox.style.display = 'block';
        const valEl = document.getElementById('cartEarnCouponValue');
        if (valEl) valEl.textContent = t('points.count', { points: fmtNum(bill.pointsToEarn) });
        earnMsg.textContent = bill.pointsToEarn > 0
          ? t('points.earnNotice', { amount: fmtSAR(pr.earn_amount), points: fmtNum(pr.earn_points) })
          : t('points.earnMissing', { amount: fmtSAR(pr.earn_amount) });
      } else if (!CART.length || !earn || !earn.percent) {
        earnBox.style.display = 'none';
      } else {
        earnBox.style.display = 'block';
        const valEl = document.getElementById('cartEarnCouponValue');
        if (earn.eligible) {
          if (valEl) valEl.textContent = fmtSAR(earn.amount);
          earnMsg.textContent = t(isSignedIn() ? 'cart.earnCouponNoticeAccount' : 'cart.earnCouponNotice', { percent: fmtNum(earn.percent) });
        } else {
          if (valEl) valEl.textContent = fmtSAR(0);
          earnMsg.textContent = earn.percent > 0
            ? t('cart.earnCouponMissing', {
                amount: fmtSAR(earn.missing),
                minimum: fmtSAR(earn.minInvoice),
              })
            : t('cart.earnCouponNoPercent');
        }
      }
    }

    if (totalEl) totalEl.textContent = fmtSAR(bill.total);

    const vatRow = document.getElementById('cartVatRow');
    if (vatRow) {
      if (CART.length > 0 && bill.vatRate > 0) {
        vatRow.style.display = 'flex';
        const vatLbl = document.getElementById('cartVatLabel');
        if (vatLbl) vatLbl.textContent = t('cart.vatRate', { rate: bill.vatRate });
        const vatVal = document.getElementById('cartVatAmount');
        if (vatVal) vatVal.textContent = '+ ' + fmtSAR(bill.vatAmount);
      } else {
        vatRow.style.display = 'none';
      }
    }

    renderEstimate();

    const waBtn = document.getElementById('whatsappOrderBtn');
    if (waBtn) waBtn.href = buildWhatsAppLink();
  }

  function openCart() {
    const drawer = document.getElementById('cartDrawer');
    if (!drawer) {
      // The cart is a full page now — never a side panel.
      window.location.href = 'cart.html';
      return;
    }
    drawer.classList.add('open');
    document.getElementById('cartOverlay')?.classList.add('open');
    if (CART.length > 0 && LAST_ORDER_CONFIRM) {
      const statusEl = document.getElementById('checkoutStatus');
      if (statusEl) { statusEl.className = 'auth-alert'; statusEl.innerHTML = ''; }
      clearOrderConfirmation();
    }
    // Refresh the rules and the customer's wallet every time the cart
    // opens so settings changes and coupons used elsewhere show up at once.
    loadLoyaltyRules();
    loadRewards().then(renderCart);
  }
  function closeCart() {
    document.getElementById('cartDrawer')?.classList.remove('open');
    document.getElementById('cartOverlay')?.classList.remove('open');
  }

  function initCart() {
    restoreCart();
    if (!CART.length) restoreOrderConfirmation();
    const trigger = document.getElementById('cartTrigger');
    // Anchors navigate to cart.html on their own; only an old-style button
    // needs the click handler.
    if (trigger && trigger.tagName !== 'A') trigger.addEventListener('click', openCart);
    document.getElementById('cartClose')?.addEventListener('click', closeCart);
    document.getElementById('cartOverlay')?.addEventListener('click', closeCart);

    bindRewardsEvents();
    updateNavAuth();
    loadLoyaltyRules();
    loadRewards().then(renderCart);

    renderCart();
    if (LAST_ORDER_CONFIRM) renderOrderConfirmation();
  }

  /* ---------- Checkout ---------- */
  function initCheckout() {
    const form = document.getElementById('checkoutForm');
    if (!form) return;

    // A signed-in customer already told us who they are — the contact
    // fields come from the account and stay read-only, so the order and
    // its coupons always belong to one identity.
    const sessionUser = isSignedIn() ? SavoriaAPI.getCurrentUser() : null;
    if (sessionUser) {
      const nameInput = document.getElementById('checkoutName');
      const phoneInput = document.getElementById('checkoutPhone');
      if (nameInput) {
        nameInput.value = sessionUser.full_name || '';
        nameInput.readOnly = true;
      }
      if (phoneInput) {
        phoneInput.value = sessionUser.phone || '';
        phoneInput.readOnly = true;
      }
      const note = document.querySelector('.cart-form-note span[data-i18n="checkout.phoneNote"]');
      if (note) {
        note.textContent = t('checkout.accountPrefilled');
        note.setAttribute('data-i18n', 'checkout.accountPrefilled');
      }
    }

    const orderTypeSelect = document.getElementById('checkoutOrderType');
    const addressGroup = document.getElementById('checkoutAddressGroup');
    const tableGroup = document.getElementById('checkoutTableGroup');
    const addressInput = document.getElementById('checkoutAddress');
    const tableInput = document.getElementById('checkoutTable');
    const lockedGroup = document.getElementById('tableLockedGroup');
    const lockedNumber = document.getElementById('tableLockedNumber');
    const unlinkBtn = document.getElementById('tableUnlinkBtn');

    /* A scanned table fixes the order as dine-in at that table: the type
       is locked, the manual field is replaced by the table read from the
       QR code, and the guest cannot edit the number. */
    function applyTableLock() {
      const ctx = getTableContext();
      const locked = !!ctx;
      if (lockedGroup) lockedGroup.style.display = locked ? 'block' : 'none';
      if (locked) {
        const label = tableDisplayName(ctx);
        if (lockedNumber) {
          lockedNumber.textContent = label
            ? `${t('table.bannerTable', { number: ctx.number })} · ${label}`
            : t('table.bannerTable', { number: ctx.number });
        }
        orderTypeSelect.value = 'dine_in';
        orderTypeSelect.disabled = true;
      } else {
        orderTypeSelect.disabled = false;
      }
      syncOrderTypeFields();
    }

    function syncOrderTypeFields() {
      // While a table is bound, the type stays dine-in and the guest types
      // neither an address nor a table number.
      if (getTableContext()) {
        addressGroup.style.display = 'none';
        tableGroup.style.display = 'none';
        addressInput.required = false;
        tableInput.required = false;
        return;
      }
      const type = orderTypeSelect.value;
      addressGroup.style.display = type === 'delivery' ? 'block' : 'none';
      tableGroup.style.display = type === 'dine_in' ? 'block' : 'none';
      addressInput.required = type === 'delivery';
      tableInput.required = type === 'dine_in';
    }
    orderTypeSelect?.addEventListener('change', syncOrderTypeFields);
    applyTableLock();

    // Escape hatch: leave table mode entirely (the guest then picks
    // delivery or pickup). This never lets anyone choose a different table.
    unlinkBtn?.addEventListener('click', () => {
      if (!window.confirm(t('table.unlinkConfirm'))) return;
      clearTableContext();
      applyTableLock();
      const statusEl = document.getElementById('checkoutStatus');
      if (statusEl) {
        statusEl.className = 'auth-alert success show';
        statusEl.textContent = t('table.unlinked');
      }
    });

    // The phone is the customer's contact detail on the order (and stays
    // in the restaurant's order records). It plays no part in loyalty: the
    // discount below depends only on the bill and the live rules.

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!CART.length) return;

      const statusEl = document.getElementById('checkoutStatus');
      const submitBtn = form.querySelector('button[type="submit"]');

      // The checkout belongs to an account. A direct submit while signed
      // out (or after the token expired) returns the customer to the gate
      // instead of creating an unattached order.
      if (!isSignedIn()) {
        applyCheckoutGate();
        if (statusEl) {
          statusEl.className = 'auth-alert error show';
          statusEl.textContent = t('checkout.loginRequired');
          statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        document.getElementById('cartAuthGate')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const name = document.getElementById('checkoutName').value.trim();
      const phone = document.getElementById('checkoutPhone').value.trim();
      const phoneDigits = phone.replace(/\D/g, '');
      const tableCtx = getTableContext();
      const orderType = tableCtx ? 'dine_in' : orderTypeSelect.value;
      const address = document.getElementById('checkoutAddress').value.trim();
      const tableValue = document.getElementById('checkoutTable').value;
      const notes = document.getElementById('checkoutNotes').value.trim();

      const isAr = I18N && I18N.getLang && I18N.getLang() === 'ar';

      if (!name) {
        statusEl.className = 'auth-alert error show';
        statusEl.textContent = isAr ? 'يرجى كتابة الاسم بالكامل.' : 'Please enter your full name.';
        statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('checkoutName').focus();
        return;
      }

      if (!phoneDigits || phoneDigits.length < 9) {
        statusEl.className = 'auth-alert error show';
        statusEl.textContent = isAr ? 'يرجى إدخال رقم جوال صحيح (9 أرقام على الأقل).' : 'A valid phone number is required (at least 9 digits).';
        statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('checkoutPhone').focus();
        return;
      }

      if (orderType === 'delivery' && !address) {
        statusEl.className = 'auth-alert error show';
        statusEl.textContent = isAr ? 'يرجى كتابة عنوان التوصيل.' : 'Delivery address is required for delivery orders.';
        statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('checkoutAddress').focus();
        return;
      }

      // A table scanned from a QR never needs a typed number — the server
      // resolves the table from the code instead.
      if (orderType === 'dine_in' && !tableValue && !tableCtx) {
        statusEl.className = 'auth-alert error show';
        statusEl.textContent = isAr ? 'يرجى إدخال رقم الطاولة.' : 'Table number is required for dine-in orders.';
        statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('checkoutTable').focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = t('checkout.placingOrder');

      // Coupons chosen in the cart. Only codes are sent — never an amount.
      // The server re-reads the value, checks ownership/status and recomputes
      // the bill, then issues this invoice's own coupon exactly once.
      const bill = computeBill();

      const payload = {
        customer_name: name,
        phone: phone,
        order_type: orderType,
        delivery_address: orderType === 'delivery' ? address : '',
        table_number: (orderType === 'dine_in' && !tableCtx && tableValue) ? parseInt(tableValue, 10) : null,
        order_notes: notes || undefined,
        items: CART.map(l => ({
          menu_item_id: l.menu_item_id, quantity: l.quantity,
          ...(l.option_id ? { option_id: l.option_id } : {}),
          ...(l.spicy ? { spicy: true } : {}),
        })),
      };
      // The scanned code decides the table on the server — the browser
      // only proves which table it scanned, never what the order costs.
      if (tableCtx) payload.table_token = tableCtx.token;
      if (bill.coupons.length) payload.coupon_codes = bill.coupons.map(c => c.code);
      if (bill.promo && bill.promoDiscount > 0) payload.promo_code = bill.promo.code;
      if (bill.pointsUsed > 0) payload.use_points = bill.pointsUsed;

      try {
        const order = await SavoriaAPI.createOrder(payload);
        if (tableCtx) saveTableContext(tableCtx);
        const orderedPhone = payload.phone;
        const trackCode = (order && order.track_code) || '';
        if (trackCode) rememberTrackCode(orderedPhone, trackCode);
        statusEl.className = 'auth-alert success show';
        const trackUrl = isSignedIn() && order.id
          ? 'account.html?order=' + encodeURIComponent(order.id) + '#orders'
          : 'track-order.html?phone=' + encodeURIComponent(orderedPhone)
            + (trackCode ? '&code=' + encodeURIComponent(trackCode) : '');
        LAST_ORDER_CONFIRM = {
          id: orderNumberOf(order),
          total: order.total_amount,
          discount: Number(order.coupon_discount) || 0,
          trackUrl,
          code: trackCode,
          earnedPreview: order.earned_coupon_preview,
          tableNumber: (order.table_number ?? (tableCtx ? tableCtx.number : null)) || null,
        };
        saveOrderConfirmation();
        renderOrderConfirmation();
        statusEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        CART = [];
        saveCart();
        APPLIED_COUPONS.clear();
        APPLIED_PROMO = null;
        USE_POINTS = 0;
        await loadRewards();
        renderCart();
        form.reset();
        form.querySelectorAll('input, select, textarea').forEach((el) => {
          if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
          else if (el.tagName === 'SELECT') el.selectedIndex = 0;
          else el.value = '';
        });
        document.getElementById('checkoutPhone').value = orderedPhone;
        applyTableLock();
      } catch (err) {
        statusEl.className = 'auth-alert error show';
        clearOrderConfirmation();
        const fieldErrors = err && err.errors ? Object.values(err.errors).filter(Boolean) : [];
        const message = I18N ? I18N.translateApiMessage(err.message) : err.message;
        statusEl.textContent = fieldErrors.length
          ? `${message.replace(/\.?$/, '')}: ${fieldErrors.map((m) => (I18N ? I18N.translateApiMessage(m) : m)).join(' · ')}`
          : message;
        statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = t('checkout.placeOrder');
      }
    });
  }

  /* ---------- Reservation form (wired to API) ----------
     A table can only be booked from a registered account, so the form is
     replaced by a sign-in card for guests and rebuilt from the account
     name/phone once the customer is signed in. */
  function applyReservationGate() {
    const form = document.getElementById('reservationForm');
    const gate = document.getElementById('reservationAuthGate');
    if (!form || !gate) return;

    const signedIn = isSignedIn();
    form.style.display = signedIn ? '' : 'none';
    gate.style.display = signedIn ? 'none' : 'flex';
    form.setAttribute('aria-hidden', signedIn ? 'false' : 'true');
    gate.setAttribute('aria-hidden', signedIn ? 'true' : 'false');

    if (!signedIn) return;
    const me = SavoriaAPI.getCurrentUser() || {};
    const name = document.getElementById('resName');
    const phone = document.getElementById('resPhone');
    if (name && !name.value.trim()) name.value = me.full_name || '';
    if (phone && !phone.value.trim()) phone.value = me.phone || '';
  }

  function initReservationForm() {
    const form = document.getElementById('reservationForm');
    const success = document.getElementById('reservationSuccess');
    if (!form) return;

    applyReservationGate();

    const dateInput = document.getElementById('resDate');
    if (dateInput) dateInput.min = new Date().toISOString().split('T')[0];

    // Returning from login/register with ?focus=reservation lands here.
    if (new URLSearchParams(window.location.search).get('focus') === 'reservation') {
      setTimeout(() => {
        document.getElementById('reservation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isSignedIn()) {
        applyReservationGate();
        document.getElementById('reservation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      const payload = {
        full_name: document.getElementById('resName').value.trim(),
        phone: document.getElementById('resPhone').value.trim(),
        reservation_date: document.getElementById('resDate').value,
        reservation_time: document.getElementById('resTime').value,
        party_size: document.getElementById('resGuests').value,
        notes: document.getElementById('resNotes').value.trim(),
      };

      try {
        const created = await SavoriaAPI.createReservation(payload);
        const reservationId = created && created.id;
        const trackUrl = reservationId
          ? 'account.html?reservation=' + encodeURIComponent(reservationId) + '#reservations'
          : 'account.html#reservations';
        success.className = 'form-success-msg show';
        success.style.background = '';
        success.style.color = '';
        LAST_RESERVATION_CONFIRM = { trackUrl };
        renderReservationConfirmation();
        form.reset();
        applyReservationGate();
      } catch (err) {
        success.className = 'form-success-msg show';
        success.style.background = 'rgba(179,38,30,0.1)';
        success.style.color = 'var(--color-error)';
        LAST_RESERVATION_CONFIRM = null;
        success.textContent = I18N ? I18N.translateApiMessage(err.message) : err.message;
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  /* ---------- Shared UI (nav scroll, mobile toggle, reveal) ---------- */
  function initNavbar() {
    const navbar = document.getElementById('navbar');
    const toggle = document.getElementById('navToggle');
    if (!navbar) return;
    window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 40));

    toggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navbar.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      document.body.classList.toggle('nav-locked', isOpen);
    });

    // Auto-close mobile menu when user taps any nav link
    navbar.querySelectorAll('.nav-links a').forEach(a => {
      a.addEventListener('click', () => {
        navbar.classList.remove('nav-open');
        toggle?.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('nav-locked');
      });
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (navbar.classList.contains('nav-open') && !navbar.contains(e.target)) {
        navbar.classList.remove('nav-open');
        toggle?.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('nav-locked');
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navbar.classList.contains('nav-open')) {
        navbar.classList.remove('nav-open');
        toggle?.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('nav-locked');
      }
    });
  }

  function initScrollReveal() {
    const targets = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      targets.forEach(tg => tg.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.15 });
    targets.forEach(tg => observer.observe(tg));
  }

  let testimonialTimer = null;

  function initTestimonials() {
    const slides = document.querySelectorAll('.testimonial-slide');
    const dotsWrap = document.getElementById('testimonialDots');
    if (!slides.length || !dotsWrap) return;

    // Rebuild-safe: the content loader can replace the slides at runtime,
    // so the dots and the auto-advance timer are reset, never duplicated.
    dotsWrap.innerHTML = '';
    if (testimonialTimer) { clearInterval(testimonialTimer); testimonialTimer = null; }

    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = i === 0 ? 'active' : '';
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    });
    let current = 0;
    const dots = dotsWrap.querySelectorAll('button');
    function goTo(i) {
      slides[current].classList.remove('active'); dots[current].classList.remove('active');
      current = i;
      slides[current].classList.add('active'); dots[current].classList.add('active');
    }
    testimonialTimer = setInterval(() => goTo((current + 1) % slides.length), 6000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    initNavbar();
    initMenuFilters();
    initCart();
    initReservationForm();
    initTestimonials();
    initScrollReveal();
    loadMenu();

    /* The table a QR code pointed at must be resolved before checkout
       decides the order type, so the two run in order. */
    (async () => {
      await initTableContext();
      initCheckout();
    })();

    /* A language switch re-renders everything that is built from data
       (menu cards, cart lines, loyalty preview) without a page reload. */
    if (I18N) {
      I18N.onChange(() => {
        updateNavAuth();
        relocalizeCart();
        renderCart();
        refreshTableBanner();
        renderTableContext();
        applyCheckoutGate();
        if (CATEGORIES.length) syncMenuFilters(CATEGORIES);
        if (MENU_ITEMS.length) renderMenu(currentFilter());
        // The order / reservation confirmations are re-rendered too, so
        // the amount is shown in the new language and currency format.
        renderOrderConfirmation();
        renderReservationConfirmation();
      });
    }
  });

  // Exposed so the website-content loader can rebuild the testimonial
  // slider when it swaps the reviews in (same markup, new data).
  window.SavoriaApp = { initTestimonials, renderMenu, renderCart, reloadMenu: loadMenu };
})();
