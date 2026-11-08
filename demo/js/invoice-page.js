/* =========================================================
   Tarmez — the customer's invoice page
   js/invoice-page.js  (invoice.html?order=<id>)

   The signed-in owner opens it from their account or from the
   "invoice ready" notification. A guest arrives from the tracking
   page, which keeps the phone + tracking code for this tab in
   sessionStorage (never in the address bar).
   "Download PDF" opens the print window on the A4 page, where the
   browser saves it as a PDF.
   ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const tr = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const params = new URLSearchParams(location.search);
  const orderId = parseInt(params.get('order'), 10);
  const signedIn = typeof SavoriaAPI !== 'undefined' && SavoriaAPI.isLoggedIn && SavoriaAPI.isLoggedIn();
  let current = null;

  function guestAccess(id) {
    try {
      const map = JSON.parse(sessionStorage.getItem('savoria_invoice_access') || '{}');
      return map[id] || null;
    } catch (_) { return null; }
  }

  function showState(title, text, actions = '') {
    $('invoiceToolbar').hidden = true;
    $('invoiceHint').hidden = true;
    $('invoiceStage').innerHTML = `
      <div class="invoice-state">
        <h2>${esc(title)}</h2>
        <p>${esc(text)}</p>
        ${actions ? `<div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">${actions}</div>` : ''}
      </div>`;
  }

  function fit() {
    const scale = $('invoiceScale');
    if (!scale) return;
    const page = scale.firstElementChild;
    const k = Math.min(1, $('invoiceStage').clientWidth / 794);
    scale.style.transform = `translateX(-50%) scale(${k})`;
    scale.parentElement.style.height = (page ? page.offsetHeight : 1123) * k + 'px';
  }

  function draw() {
    if (!current) return;
    const html = window.SavoriaInvoice.render(current, current.design, { restaurantName: 'Tarmez' });
    $('invoiceStage').innerHTML = `
      <div class="invoice-print-area"><div class="invoice-scale invoice-sheet-shadow" id="invoiceScale">${html}</div></div>`;
    $('invoiceToolbar').hidden = false;
    $('invoiceHint').hidden = false;
    const number = current.order.invoice_number || current.order.id;
    $('invoiceHeading').textContent = t('invoice.titleNumber', { number: String(number).padStart(5, '0') });
    $('invoiceBack').href = signedIn ? 'account.html#orders' : 'track-order.html';
    if ($('invoiceRate') && current.order.status === 'delivered') {
      $('invoiceRate').href = 'rate.html?order=' + encodeURIComponent(current.order.id);
      $('invoiceRate').hidden = false;
    }
    $('invoiceBack').textContent = signedIn ? t('invoice.back') : t('invoice.backTrack');
    document.querySelectorAll('#invoiceStage img').forEach((img) => img.addEventListener('load', fit, { once: true }));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    fit();
  }

  async function load() {
    if (!orderId) {
      showState(t('invoice.notFoundTitle'), t('invoice.notFound'), `<a class="btn btn-primary" href="index.html">${esc(t('nav.home'))}</a>`);
      return;
    }
    const guest = signedIn ? null : guestAccess(orderId);
    try {
      current = await SavoriaAPI.getInvoice(orderId, guest && guest.phone, guest && guest.code);
      draw();
    } catch (err) {
      if (err.status === 409) {
        showState(t('invoice.notReadyTitle'), t('invoice.notReady'),
          `<a class="btn btn-primary" href="${signedIn ? 'account.html#orders' : 'track-order.html'}">${esc(t('invoice.followOrder'))}</a>`);
      } else if (err.status === 403 || err.status === 401) {
        showState(t('invoice.lockedTitle'), signedIn ? tr(err.message) : t('invoice.locked'),
          `<a class="btn btn-primary" href="login.html">${esc(t('nav.logIn'))}</a><a class="btn btn-outline" href="track-order.html">${esc(t('invoice.backTrack'))}</a>`);
      } else {
        showState(t('invoice.errorTitle'), tr(err.message));
      }
    }
  }

  $('invoiceDownload').addEventListener('click', () => {
    if (!current) return;
    const before = document.title;
    const number = current.order.invoice_number || current.order.id;
    document.title = `Tarmez-Invoice-${String(number).padStart(5, '0')}`;
    window.print();
    setTimeout(() => { document.title = before; }, 1000);
  });

  window.addEventListener('resize', fit);
  if (I18N && I18N.onChange) I18N.onChange(() => { if (current) draw(); });
  load();
})();
