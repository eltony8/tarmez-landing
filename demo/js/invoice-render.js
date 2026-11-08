/* =========================================================
   Tarmez — customer invoice renderer
   js/invoice-render.js  (styles: css/invoice.css)

   window.SavoriaInvoice.render(data, design) → the HTML of one A4
   invoice page. Used by the customer's invoice page (invoice.html)
   and by the live preview of Site Management → Invoice design.

   data   = the /orders/{id}/invoice payload
            { order, items, invoice, seller, draft }
   design = the admin's design (merged over DEFAULTS; any missing
            field falls back to the default)

   The invoice is bilingual (Arabic + English) and carries what a
   Saudi simplified tax invoice needs: seller name and VAT number,
   date and time of issue, VAT and the total including VAT, and the
   ZATCA QR code.
   ========================================================= */
(function () {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
  const HEX = /^#[0-9A-Fa-f]{6}$/;
  const SAFE_URL = /^(https:\/\/[^\s"'<>()]+|\/?assets\/[A-Za-z0-9_./-]+)$/;

  /* ---------- presets ---------- */
  const PRESETS = {
    chalk: {
      label: { en: 'Chalkboard', ar: 'سبورة' },
      colors: { page: '#252321', ink: '#F3EDE4', muted: '#B9B0A5', accent: '#C99067', accentInk: '#1E1A17', line: '#6B5545', title: '#F3EDE4', decor: '#EDE4D8' },
      texture: 'chalk', decor: 'herbs', titleStyle: 'chalk',
    },
    paper: {
      label: { en: 'Cream paper', ar: 'ورق كريمي' },
      colors: { page: '#FBF6EE', ink: '#2C2621', muted: '#7A6E62', accent: '#C4602E', accentInk: '#FFFFFF', line: '#E6D8C3', title: '#2C2621', decor: '#C4602E' },
      texture: 'paper', decor: 'olive', titleStyle: 'outline',
    },
    olive: {
      label: { en: 'Olive night', ar: 'زيتوني ليلي' },
      colors: { page: '#1E2419', ink: '#F1EEE3', muted: '#B5B8A3', accent: '#C9A227', accentInk: '#1E2419', line: '#4F5A3C', title: '#F1EEE3', decor: '#C9A227' },
      texture: 'chalk', decor: 'olive', titleStyle: 'solid',
    },
    minimal: {
      label: { en: 'Minimal white', ar: 'أبيض بسيط' },
      colors: { page: '#FFFFFF', ink: '#1F1B18', muted: '#6B6B6B', accent: '#1F1B18', accentInk: '#FFFFFF', line: '#E5E5E5', title: '#1F1B18', decor: '#1F1B18' },
      texture: 'none', decor: 'none', titleStyle: 'solid',
    },
  };

  const DEFAULTS = {
    preset: 'chalk',
    colors: { ...PRESETS.chalk.colors },
    texture: 'chalk',          // chalk | paper | none
    decor: 'herbs',            // herbs | olive | spices | none
    titleStyle: 'chalk',       // chalk | outline | solid
    logo: { show: true, url: '' },
    photo: { show: true, source: 'order', url: '', size: 210, position: 'end', shape: 'circle', rotate: -8 },
    show: {
      title: true, subtitle: true, customer: true, meta: true, seller: true, vatNumber: true, crNumber: true,
      sellerAddress: true, itemNo: true, itemOptions: true, itemNotes: false, arabicNames: true, payment: true,
      discounts: true, taxable: true, qr: true, zatcaNote: true, uuid: false, terms: true, thanks: true, footer: true,
    },
    texts: {
      title_en: 'INVOICE', title_ar: 'فاتورة',
      terms_en: 'Prices include the dishes listed above. Please keep this invoice for any question about your order.',
      terms_ar: 'الأسعار تشمل الأصناف الموضحة أعلاه. يرجى الاحتفاظ بالفاتورة لأي استفسار عن طلبك.',
      thanks_en: 'Thank you for dining with us', thanks_ar: 'شكرًا لاختياركم مطعمنا',
      footer_en: '', footer_ar: '',
    },
    paymentLines: [],   // [{ label_en, label_ar, value }] e.g. bank, IBAN
    extraFields: [],    // [{ label_en, label_ar, value }] shown with the invoice details
  };

  function merge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over : base;
    if (base && typeof base === 'object') {
      const out = { ...base };
      if (over && typeof over === 'object' && !Array.isArray(over)) {
        Object.keys(over).forEach((k) => { out[k] = k in base ? merge(base[k], over[k]) : over[k]; });
      }
      return out;
    }
    return over === undefined || over === null ? base : over;
  }

  const designOf = (d) => merge(JSON.parse(JSON.stringify(DEFAULTS)), d || {});

  /* ---------- formatting ---------- */
  const money = (v) => 'SAR ' + (Number(v) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function riyadhTime(iso) {
    if (!iso) return '';
    const d = new Date(String(iso).includes('T') ? iso : String(iso).replace(' ', 'T'));
    if (isNaN(d)) return String(iso);
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(d).replace(',', '');
    } catch (_) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }
  const bi = (en, ar) => `<span class="inv-en">${esc(en)}</span><span class="inv-ar" lang="ar" dir="rtl">${esc(ar)}</span>`;
  const color = (v, fallback) => (HEX.test(String(v || '')) ? v : fallback);
  const safeUrl = (u) => (SAFE_URL.test(String(u || '')) ? String(u) : '');

  const ORDER_TYPES = {
    delivery: ['Delivery', 'توصيل'], pickup: ['Pickup', 'استلام'], dine_in: ['Dine-in', 'محلي'], table: ['Table', 'طاولة'],
  };
  const PAYMENTS = { cash: ['Cash', 'نقدًا'], card: ['Card', 'بطاقة'], online: ['Online', 'دفع إلكتروني'] };

  /* ---------- decorations (line art) ---------- */
  const DECOR = {
    herbs: `
      <svg class="inv-decor inv-decor-start" viewBox="0 0 200 160" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 4 C 40 40, 80 80, 150 120"/>
        <path d="M30 26 C 18 6, 30 -4, 44 6 C 50 20, 42 30, 30 26 Z"/><path d="M30 26 C 36 16, 40 10, 44 6"/>
        <path d="M58 52 C 52 30, 66 22, 78 32 C 82 48, 72 56, 58 52 Z"/><path d="M58 52 C 66 42, 72 36, 78 32"/>
        <path d="M46 40 C 24 44, 14 30, 22 20 C 36 18, 46 28, 46 40 Z"/><path d="M46 40 C 36 34, 28 26, 22 20"/>
        <path d="M84 74 C 64 80, 52 66, 60 56 C 76 54, 86 62, 84 74 Z"/><path d="M84 74 C 74 68, 66 62, 60 56"/>
        <path d="M98 82 C 96 60, 112 54, 122 66 C 124 82, 112 88, 98 82 Z"/><path d="M98 82 C 108 76, 116 70, 122 66"/>
        <path d="M120 104 C 102 112, 90 100, 96 90 C 112 86, 122 94, 120 104 Z"/>
      </g></svg>
      <svg class="inv-decor inv-decor-end" viewBox="0 0 200 160" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M196 4 C 160 30, 130 70, 90 150"/>
        <circle cx="150" cy="40" r="9"/><circle cx="166" cy="52" r="8"/><circle cx="146" cy="58" r="8"/><circle cx="162" cy="30" r="7"/>
        <path d="M150 40 l 4 -3 M166 52 l 3 -3 M146 58 l 3 -3"/>
        <path d="M128 78 C 104 70, 98 52, 110 46 C 126 50, 132 64, 128 78 Z"/><path d="M128 78 C 120 66, 114 54, 110 46"/>
        <path d="M118 94 C 138 104, 140 122, 128 126 C 114 118, 112 104, 118 94 Z"/><path d="M118 94 C 122 106, 126 116, 128 126"/>
        <path d="M108 118 C 84 116, 74 100, 84 92 C 100 94, 108 106, 108 118 Z"/>
      </g></svg>`,
    olive: `
      <svg class="inv-decor inv-decor-start" viewBox="0 0 200 160" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 10 C 60 30, 110 70, 170 140"/>
        <path d="M40 24 C 30 8, 46 0, 60 10 C 62 22, 52 30, 40 24 Z"/><path d="M70 42 C 76 24, 94 24, 96 38 C 90 50, 78 52, 70 42 Z"/>
        <path d="M58 40 C 40 46, 30 34, 38 24 C 52 24, 60 32, 58 40 Z"/><path d="M100 66 C 82 74, 70 62, 76 52 C 92 50, 102 58, 100 66 Z"/>
        <path d="M112 78 C 116 60, 134 58, 138 72 C 132 86, 120 88, 112 78 Z"/><ellipse cx="128" cy="102" rx="7" ry="10" transform="rotate(-30 128 102)"/>
        <ellipse cx="84" cy="68" rx="6" ry="9" transform="rotate(20 84 68)"/>
      </g></svg>
      <svg class="inv-decor inv-decor-end" viewBox="0 0 200 160" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M196 10 C 140 30, 90 70, 30 140"/>
        <path d="M160 24 C 170 8, 154 0, 140 10 C 138 22, 148 30, 160 24 Z"/><path d="M130 42 C 124 24, 106 24, 104 38 C 110 50, 122 52, 130 42 Z"/>
        <path d="M142 40 C 160 46, 170 34, 162 24 C 148 24, 140 32, 142 40 Z"/><path d="M100 66 C 118 74, 130 62, 124 52 C 108 50, 98 58, 100 66 Z"/>
        <path d="M88 78 C 84 60, 66 58, 62 72 C 68 86, 80 88, 88 78 Z"/><ellipse cx="72" cy="102" rx="7" ry="10" transform="rotate(30 72 102)"/>
      </g></svg>`,
    spices: `
      <svg class="inv-decor inv-decor-start" viewBox="0 0 200 160" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M30 30 C 60 20, 96 34, 110 70 C 96 66, 70 62, 30 30 Z"/><path d="M30 30 C 22 22, 18 12, 24 6"/>
        <path d="M60 100 l 10 -14 l 10 14 l -10 14 Z"/><path d="M70 86 v 28"/>
        <circle cx="128" cy="40" r="5"/><circle cx="142" cy="54" r="4"/><circle cx="120" cy="60" r="3"/>
        <path d="M20 130 C 40 120, 56 124, 66 140"/><path d="M28 126 l -6 -10 M40 122 l -2 -12 M52 124 l 2 -12"/>
      </g></svg>
      <svg class="inv-decor inv-decor-end" viewBox="0 0 200 160" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M170 30 C 140 20, 104 34, 90 70 C 104 66, 130 62, 170 30 Z"/><path d="M170 30 C 178 22, 182 12, 176 6"/>
        <path d="M140 100 l -10 -14 l -10 14 l 10 14 Z"/><path d="M130 86 v 28"/>
        <circle cx="72" cy="40" r="5"/><circle cx="58" cy="54" r="4"/><circle cx="80" cy="60" r="3"/>
      </g></svg>`,
  };
  const BEAN = '<svg viewBox="0 0 40 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="20" cy="12" rx="15" ry="8" transform="rotate(-12 20 12)"/><path d="M7 14 C 16 8, 24 16, 33 10"/></g></svg>';

  /* ---------- QR ---------- */
  function qrSvg(text) {
    if (!text || typeof window.qrcode !== 'function') return '';
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
    } catch (_) { return ''; }
  }

  /* ---------- the page ---------- */
  function render(data, rawDesign, opts = {}) {
    const d = designOf(rawDesign);
    const s = d.show;
    const c = d.colors;
    const order = data.order || {};
    const items = data.items || [];
    const inv = data.invoice;
    const seller = data.seller || {};
    const tx = d.texts;

    const vars = [
      ['--inv-page', color(c.page, '#252321')], ['--inv-ink', color(c.ink, '#F3EDE4')], ['--inv-muted', color(c.muted, '#B9B0A5')],
      ['--inv-accent', color(c.accent, '#C99067')], ['--inv-accent-ink', color(c.accentInk, '#1E1A17')],
      ['--inv-line', color(c.line, '#6B5545')], ['--inv-title', color(c.title, '#F3EDE4')], ['--inv-decor', color(c.decor, '#EDE4D8')],
    ].map(([k, v]) => `${k}:${v}`).join(';');

    // totals: the issued invoice is the source of truth; a draft is computed from the order
    const itemsTotal = inv ? inv.items_total : items.reduce((a, i) => a + (Number(i.subtotal) || 0), 0);
    const vat = inv ? inv.vat_amount : Number(order.vat_amount) || 0;
    const total = inv ? inv.total_amount : Number(order.total_amount) || 0;
    const rate = inv ? inv.vat_rate : Number(order.vat_rate) || 0;
    const taxable = inv ? inv.taxable_amount : Math.max(0, total - vat);
    const promo = Number(order.discount_amount) || 0;
    const coupons = Number(order.coupon_discount) || 0;
    const points = Number(order.points_discount) || 0;

    const number = order.invoice_number || order.id || '';
    const orderNo = order.order_number || order.id || '';
    const type = ORDER_TYPES[order.order_type] || [order.order_type || '', order.order_type || ''];
    const pay = PAYMENTS[order.payment_method];

    const logoUrl = safeUrl(d.logo.url) || (opts.defaultLogo || 'assets/favicon.svg');
    let photoUrl = d.photo.source === 'custom' ? safeUrl(d.photo.url) : '';
    if (d.photo.source !== 'custom') {
      const withPhoto = items.filter((i) => safeUrl(i.image_url) || /^\/?assets\//.test(String(i.image_url || '')))
        .sort((a, b) => (Number(b.subtotal) || 0) - (Number(a.subtotal) || 0));
      photoUrl = withPhoto.length ? String(withPhoto[0].image_url) : (opts.fallbackPhoto || '');
    }
    const photoSize = Math.min(320, Math.max(110, Number(d.photo.size) || 210));
    const rotate = Math.max(-30, Math.min(30, Number(d.photo.rotate) || 0));

    const sellerName = seller.seller_name || opts.restaurantName || 'Tarmez';
    const sellerNameAr = seller.seller_name_ar || '';
    const addressEn = [seller.building_no, seller.street, seller.district, seller.city, seller.postal_code].filter(Boolean).join(', ');
    const addressAr = [seller.building_no, seller.street_ar || seller.street, seller.district_ar || seller.district, seller.city_ar || seller.city, seller.postal_code].filter(Boolean).join('، ');

    const row = (en, ar, value, cls = '') => `
      <div class="inv-total-row ${cls}"><span class="inv-total-label">${bi(en, ar)}</span><span class="inv-total-value">${value}</span></div>`;

    const itemRows = items.map((it, i) => {
      const choice = [it.option_name && (it.option_name + (it.option_name_ar ? ' / ' + it.option_name_ar : '')), it.is_spicy ? 'Spicy / حار' : '']
        .filter(Boolean).join(' · ');
      return `
        <tr>
          ${s.itemNo ? `<td class="inv-c-no">${i + 1}</td>` : ''}
          <td class="inv-c-item">
            <strong>${esc(it.item_name_snapshot || it.name || '')}</strong>
            ${s.arabicNames && it.item_name_ar ? `<span class="inv-ar inv-item-ar" lang="ar" dir="rtl">${esc(it.item_name_ar)}</span>` : ''}
            ${s.itemOptions && choice ? `<small>${esc(choice)}</small>` : ''}
            ${s.itemNotes && it.special_instructions ? `<small class="inv-note">${esc(it.special_instructions)}</small>` : ''}
          </td>
          <td class="inv-c-num">${money(it.unit_price)}</td>
          <td class="inv-c-qty">${esc(it.quantity)}</td>
          <td class="inv-c-num">${money(it.subtotal)}</td>
        </tr>`;
    }).join('');

    const extra = (d.extraFields || []).filter((f) => f && (f.value || f.label_en || f.label_ar)).slice(0, 8)
      .map((f) => `<div class="inv-meta-row"><span>${bi(f.label_en || '', f.label_ar || '')}</span><strong>${esc(f.value || '')}</strong></div>`).join('');
    const payLines = (d.paymentLines || []).filter((f) => f && (f.value || f.label_en || f.label_ar)).slice(0, 6)
      .map((f) => `<div class="inv-pay-row"><span>${bi(f.label_en || '', f.label_ar || '')}</span><strong>${esc(f.value || '')}</strong></div>`).join('');

    const qrText = inv && inv.qr ? inv.qr : (opts.sampleQr || '');
    const qr = s.qr ? (qrText ? qrSvg(qrText) : '') : '';
    const paymentBlock = s.payment && (pay || payLines);

    return `
    <div class="inv-page inv-tex-${esc(d.texture)} inv-title-${esc(d.titleStyle)}${data.draft ? ' is-draft' : ''}" style="${vars}">
      ${data.draft ? `<div class="inv-draft-mark">${bi('DRAFT — not issued yet', 'مسودة — لم تصدر بعد')}</div>` : ''}
      ${d.decor !== 'none' && DECOR[d.decor] ? `<div class="inv-decor-wrap">${DECOR[d.decor]}</div>` : ''}

      <div class="inv-head">
        ${d.logo.show ? `<div class="inv-logo"><img src="${esc(logoUrl)}" alt=""></div>` : ''}
        ${s.title ? `
          <div class="inv-title-wrap">
            ${d.decor !== 'none' ? `<span class="inv-bean inv-bean-a">${BEAN}</span>` : ''}
            <h1 class="inv-title"><span class="inv-title-en">${esc(tx.title_en)}</span>${tx.title_ar ? `<span class="inv-title-ar" lang="ar" dir="rtl">${esc(tx.title_ar)}</span>` : ''}</h1>
            ${d.decor !== 'none' ? `<span class="inv-bean inv-bean-b">${BEAN}</span>` : ''}
          </div>` : ''}
        ${s.subtitle ? `<p class="inv-subtitle">${bi('Simplified Tax Invoice', 'فاتورة ضريبية مبسطة')}</p>` : ''}
      </div>

      <div class="inv-parties">
        ${s.customer ? `
          <div class="inv-block">
            <h3>${bi('Invoice to', 'فاتورة إلى')}</h3>
            <p class="inv-strong">${esc(order.customer_name || '')}</p>
            ${order.phone ? `<p dir="ltr">${esc(order.phone)}</p>` : ''}
            ${order.delivery_address ? `<p>${esc(order.delivery_address)}</p>` : ''}
            <p class="inv-muted">${bi(type[0], type[1])}${order.table_number ? ` · ${bi('Table ' + order.table_number, 'طاولة ' + order.table_number)}` : ''}</p>
          </div>` : '<div></div>'}
        ${s.meta ? `
          <div class="inv-block inv-meta">
            <div class="inv-meta-row"><span>${bi('Invoice no.', 'رقم الفاتورة')}</span><strong dir="ltr">#${esc(String(number).padStart(5, '0'))}</strong></div>
            <div class="inv-meta-row"><span>${bi('Order no.', 'رقم الطلب')}</span><strong dir="ltr">${esc(orderNo)}</strong></div>
            <div class="inv-meta-row"><span>${bi('Date of issue', 'تاريخ الإصدار')}</span><strong dir="ltr">${esc(riyadhTime(inv ? inv.issued_at : order.updated_at || order.created_at))}</strong></div>
            ${extra}
          </div>` : ''}
      </div>

      ${s.seller ? `
        <div class="inv-seller">
          <div><span class="inv-label">${bi('Seller', 'البائع')}</span>
            <strong>${esc(sellerName)}</strong>${sellerNameAr ? ` <strong class="inv-ar" lang="ar" dir="rtl">${esc(sellerNameAr)}</strong>` : ''}</div>
          ${s.vatNumber && seller.vat_number ? `<div><span class="inv-label">${bi('VAT no.', 'الرقم الضريبي')}</span><strong dir="ltr">${esc(seller.vat_number)}</strong></div>` : ''}
          ${s.crNumber && seller.cr_number ? `<div><span class="inv-label">${bi('CR no.', 'السجل التجاري')}</span><strong dir="ltr">${esc(seller.cr_number)}</strong></div>` : ''}
          ${s.sellerAddress && addressEn ? `<div class="inv-seller-address"><span class="inv-label">${bi('Address', 'العنوان')}</span><span>${esc(addressEn)}</span>${(seller.street_ar || seller.district_ar || seller.city_ar) ? `<span class="inv-ar" lang="ar" dir="rtl">${esc(addressAr)}</span>` : ''}</div>` : ''}
        </div>` : ''}

      <table class="inv-table">
        <thead><tr>
          ${s.itemNo ? `<th class="inv-c-no">${bi('No', 'م')}</th>` : ''}
          <th class="inv-c-item">${bi('Item', 'الصنف')}</th>
          <th class="inv-c-num">${bi('Price', 'السعر')}</th>
          <th class="inv-c-qty">${bi('Qty', 'الكمية')}</th>
          <th class="inv-c-num">${bi('Total', 'المجموع')}</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="inv-bottom">
        <div class="inv-bottom-start">
          ${paymentBlock ? `
            <h3>${bi('Payment info', 'معلومات الدفع')}</h3>
            ${pay ? `<div class="inv-pay-row"><span>${bi('Paid by', 'طريقة الدفع')}</span><strong>${bi(pay[0], pay[1])}</strong></div>` : ''}
            ${payLines}` : ''}
          ${qr ? `
            <div class="inv-qr">
              <div class="inv-qr-code">${qr}</div>
              ${s.zatcaNote ? `<p>${bi('Scan to verify this tax invoice (ZATCA).', 'امسح الرمز للتحقق من الفاتورة الضريبية (هيئة الزكاة والضريبة والجمارك).')}</p>` : ''}
            </div>` : ''}
        </div>
        <div class="inv-totals">
          ${row('Subtotal', 'المجموع الفرعي', money(itemsTotal))}
          ${s.discounts && promo > 0 ? row('Coupon' + (order.promo_code ? ' ' + order.promo_code : ''), 'كوبون الخصم', '− ' + money(promo), 'is-discount') : ''}
          ${s.discounts && coupons > 0 ? row('Older coupons', 'كوبونات سابقة', '− ' + money(coupons), 'is-discount') : ''}
          ${s.discounts && points > 0 ? row('Loyalty points' + (order.redeemed_points ? ' (' + order.redeemed_points + ')' : ''), 'نقاط الولاء', '− ' + money(points), 'is-discount') : ''}
          ${s.taxable ? row('Taxable amount', 'المبلغ الخاضع للضريبة', money(taxable)) : ''}
          ${row(`VAT ${Number(rate).toFixed(0)}%`, `ضريبة القيمة المضافة ${Number(rate).toFixed(0)}٪`, money(vat))}
          ${row('Total (incl. VAT)', 'الإجمالي شامل الضريبة', money(total), 'is-grand')}
        </div>
      </div>

      <div class="inv-foot">
        <div class="inv-foot-text">
          ${s.terms && (tx.terms_en || tx.terms_ar) ? `
            <h3>${bi('Terms and conditions', 'الشروط والأحكام')}</h3>
            ${tx.terms_en ? `<p>${esc(tx.terms_en)}</p>` : ''}
            ${tx.terms_ar ? `<p class="inv-ar" lang="ar" dir="rtl">${esc(tx.terms_ar)}</p>` : ''}` : ''}
          ${s.thanks && (tx.thanks_en || tx.thanks_ar) ? `<p class="inv-thanks">${tx.thanks_en ? `<span class="inv-en">${esc(tx.thanks_en)}</span>` : ''}${tx.thanks_ar ? `<span class="inv-ar" lang="ar" dir="rtl">${esc(tx.thanks_ar)}</span>` : ''}</p>` : ''}
          ${s.footer && (tx.footer_en || tx.footer_ar || seller.phone || seller.email) ? `
            <p class="inv-contact">${[seller.phone && `<span dir="ltr">${esc(seller.phone)}</span>`, seller.email && `<span dir="ltr">${esc(seller.email)}</span>`, tx.footer_en && esc(tx.footer_en), tx.footer_ar && `<span lang="ar" dir="rtl">${esc(tx.footer_ar)}</span>`].filter(Boolean).join(' · ')}</p>` : ''}
          ${s.uuid && inv ? `<p class="inv-uuid" dir="ltr">UUID ${esc(inv.uuid)} · ICV ${esc(inv.icv)}</p>` : ''}
        </div>
        ${d.photo.show && photoUrl ? `
          <div class="inv-photo inv-photo-${d.photo.position === 'start' ? 'start' : 'end'} inv-shape-${esc(d.photo.shape)}" style="--inv-photo:${photoSize}px;--inv-rotate:${rotate}deg">
            <img src="${esc(photoUrl)}" alt="">
          </div>` : ''}
      </div>
    </div>`;
  }

  /* ---------- sample data for the admin preview ---------- */
  const SAMPLE = {
    draft: false,
    order: {
      id: 1042, invoice_number: 1042, order_number: '20261101-0042', customer_name: 'Lina Al-Harbi', phone: '0551234567',
      order_type: 'delivery', delivery_address: 'Al Olaya, Riyadh', payment_method: 'card', vat_rate: 15,
      discount_amount: 20, coupon_discount: 0, points_discount: 10, redeemed_points: 10, promo_code: 'WELCOME20',
    },
    items: [
      { item_name_snapshot: 'Mixed Grill Platter', item_name_ar: 'مشويات مشكلة', option_name: 'Large', option_name_ar: 'كبير', unit_price: 95, quantity: 1, subtotal: 95 },
      { item_name_snapshot: 'Chicken Mandi', item_name_ar: 'مندي دجاج', unit_price: 48, quantity: 2, subtotal: 96, is_spicy: true },
      { item_name_snapshot: 'Kunafa', item_name_ar: 'كنافة', unit_price: 22, quantity: 1, subtotal: 22 },
    ],
    invoice: {
      uuid: '3cf5ee18-ee25-44ea-a444-2c37ba7f28be', icv: 1042, issued_at: new Date().toISOString(),
      items_total: 213, discount_total: 30, taxable_amount: 183, vat_rate: 15, vat_amount: 27.45, total_amount: 210.45, qr: '',
    },
    seller: {},
  };

  window.SavoriaInvoice = { render, PRESETS, DEFAULTS, designOf, SAMPLE, money };
})();
