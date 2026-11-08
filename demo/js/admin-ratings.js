/* =========================================================
   Tarmez — Site Management → Ratings (admins only)
   js/admin-ratings.js

   The overall score, the star distribution, what customers praise
   or complain about, each dish's average, and every rating with
   its comment. A rating with a comment can be published to the
   home page reviews (and taken off again).
   ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const tr = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const lang = () => (I18N && I18N.getLang ? I18N.getLang() : 'en');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtDate = (v) => (I18N && I18N.fmtDate && v ? I18N.fmtDate(v) : (v || ''));
  const UI = window.SavoriaAdminUI || {};
  const toast = (type, msg, detail = '') => (UI.toast ? UI.toast(type, msg, detail) : console.warn(msg));
  const API = typeof SavoriaAPI !== 'undefined' ? SavoriaAPI : null;
  if (!API || !$('tab-ratings')) return;

  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/></svg>';
  const starRow = (n) => `<span class="rt-stars" aria-label="${n}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= Math.round(n) ? 'is-on' : ''}">${STAR}</i>`).join('')}</span>`;
  let last = null;

  function render(data) {
    last = data;
    const s = data.summary;
    const total = Math.max(1, s.count);
    const dist = [5, 4, 3, 2, 1].map((n) => {
      const c = s.distribution[String(n)] || 0;
      return `<div class="rt-bar"><span>${n} ${STAR}</span><div><i style="width:${Math.round((c / total) * 100)}%"></i></div><b>${c}</b></div>`;
    }).join('');
    const tags = Object.entries(s.tags || {}).filter(([, v]) => v.good || v.bad)
      .sort((a, b) => (b[1].good + b[1].bad) - (a[1].good + a[1].bad))
      .map(([k, v]) => `<span class="rt-tag">${esc(t('rate.tagsGoodList.' + k))}${v.good ? ` <b class="is-good">👍 ${v.good}</b>` : ''}${v.bad ? ` <b class="is-bad">👎 ${v.bad}</b>` : ''}</span>`).join('')
      || `<span class="mgmt-note">${esc(t('rt.noTags'))}</span>`;
    const dishName = (d) => (lang() === 'ar' && d.name_ar ? d.name_ar : d.name) || '#' + d.menu_item_id;
    const dishes = s.dishes || [];
    const dishRows = (list) => list.map((d) => `<li><span>${esc(dishName(d))}</span>${starRow(d.avg)}<b>${esc(d.avg)}</b><small>(${esc(d.n)})</small></li>`).join('');
    const worst = [...dishes].sort((a, b) => a.avg - b.avg).slice(0, 5);

    $('rtSummary').innerHTML = `
      <div class="rt-card rt-score">
        <strong>${s.count ? esc(Number(s.average).toFixed(1)) : '—'}</strong>
        ${starRow(s.average)}
        <span>${esc(t('rt.count', { count: s.count }))}</span>
        <span class="mgmt-note">${esc(t('rt.responseRate', { rate: s.response_rate }))}</span>
      </div>
      <div class="rt-card"><h4>${esc(t('rt.distribution'))}</h4>${dist}</div>
      <div class="rt-card"><h4>${esc(t('rt.tags'))}</h4><div class="rt-tags">${tags}</div></div>
      <div class="rt-card"><h4>${esc(t('rt.bestDishes'))}</h4>${dishes.length ? `<ol class="rt-dishes">${dishRows(dishes.slice(0, 5))}</ol>` : `<p class="mgmt-note">${esc(t('rt.noDishes'))}</p>`}</div>
      <div class="rt-card"><h4>${esc(t('rt.worstDishes'))}</h4>${dishes.length > 1 ? `<ol class="rt-dishes">${dishRows(worst)}</ol>` : `<p class="mgmt-note">${esc(t('rt.noDishes'))}</p>`}</div>`;

    $('rtList').innerHTML = data.ratings.length ? data.ratings.map((r) => `
      <article class="rt-item${r.rating <= 2 ? ' is-low' : ''}">
        <header>
          ${starRow(r.rating)}
          <strong>${esc(r.customer_name || t('rt.guest'))}</strong>
          <span class="mgmt-note">${esc(t('rt.order', { number: r.order_number || r.order_id }))} · ${esc(fmtDate(r.updated_at || r.created_at))}</span>
          ${r.published ? `<span class="rt-pill">${esc(t('rt.onHome'))}</span>` : ''}
        </header>
        ${(r.tags || []).length ? `<div class="rt-tags">${r.tags.map((x) => `<span class="rt-tag">${esc(t((r.rating >= 4 ? 'rate.tagsGoodList.' : 'rate.tagsBadList.') + x))}</span>`).join('')}</div>` : ''}
        ${r.comment ? `<p class="rt-comment">“${esc(r.comment)}”</p>` : ''}
        ${(r.dishes || []).length ? `<ul class="rt-item-dishes">${r.dishes.map((d) => `<li>${esc((lang() === 'ar' && d.item_name_ar) || d.item_name_snapshot)} ${starRow(d.rating)}</li>`).join('')}</ul>` : ''}
        <footer>
          <a class="btn btn-outline btn-sm" href="invoice.html?order=${encodeURIComponent(r.order_id)}" target="_blank" rel="noopener">${esc(t('invoice.open'))}</a>
          ${r.comment ? (r.published
            ? `<button type="button" class="btn btn-outline btn-sm" data-unpublish="${r.id}">${esc(t('rt.unpublish'))}</button>`
            : `<button type="button" class="btn btn-primary btn-sm" data-publish="${r.id}">${esc(t('rt.publish'))}</button>`) : ''}
        </footer>
      </article>`).join('') : `<p class="mgmt-note">${esc(t('rt.empty'))}</p>`;
  }

  async function load() {
    const params = {};
    if ($('rtStars').value) params.stars = $('rtStars').value;
    if ($('rtComments').checked) params.comments = '1';
    try {
      render(await API.getAdminRatings(params));
    } catch (err) { toast('error', t('admin.toasts.loadFailed'), tr(err.message)); }
  }

  $('rtStars').addEventListener('change', load);
  $('rtComments').addEventListener('change', load);
  $('rtRefresh').addEventListener('click', load);
  $('rtList').addEventListener('click', async (e) => {
    const pub = e.target.closest('[data-publish]');
    const unpub = e.target.closest('[data-unpublish]');
    if (!pub && !unpub) return;
    const btn = pub || unpub;
    btn.disabled = true;
    try {
      if (pub) { await API.publishRating(pub.dataset.publish); toast('success', t('rt.published')); }
      else { await API.unpublishRating(unpub.dataset.unpublish); toast('success', t('rt.unpublished')); }
      load();
    } catch (err) { btn.disabled = false; toast('error', t('admin.toasts.saveFailed'), tr(err.message)); }
  });
  if (I18N && I18N.onChange) I18N.onChange(() => { if (last && $('tab-ratings').style.display !== 'none') render(last); });

  window.SavoriaAdminRatings = { load };
})();
