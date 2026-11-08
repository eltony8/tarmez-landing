/* =========================================================
   Savoria — public website content
   js/content.js — loads the database-backed website content
   (texts, images, reviews) and applies it to the elements that
   carry a `data-content` / `data-content-img` attribute.

   Nothing about the design changes: the shipped text and images
   stay in the HTML, and are only replaced when a manager has
   saved a different value through the admin panel. If the API is
   unreachable the page keeps rendering exactly as before.

   ── Languages ────────────────────────────────────────────
   The server returns the English texts in `settings` and the
   Arabic texts in `settings_ar` (each key already resolved:
   the stored Arabic value, or the shipped Arabic default).
   The client picks the right map for the visitor's language and
   re-applies it the moment the language is switched — no reload.
   ========================================================= */

(function () {
  'use strict';

  const state = { settings: {}, settings_ar: {}, images: {}, reviews: [], version: '', loaded: false };
  // api.js exposes its base URL; fall back to the default when it is not loaded.
  const BASE = (typeof SavoriaAPI !== 'undefined' && SavoriaAPI.baseUrl)
    ? SavoriaAPI.baseUrl
    : 'http://localhost:8000';

  const I18N = window.SavoriaI18n;
  const isArabic = () => !!(I18N && I18N.isRTL());

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
  const stripQuery = (u) => String(u || '').split('?')[0];

  /* The texts of the visitor's language (Arabic falls back to English
     for every key the manager has not translated). */
  function activeSettings() {
    if (!isArabic()) return state.settings;
    const merged = Object.assign({}, state.settings);
    Object.keys(state.settings_ar || {}).forEach((key) => {
      const value = state.settings_ar[key];
      if (typeof value === 'string' && value.trim() !== '') merged[key] = value;
    });
    return merged;
  }

  /* ---------- texts ---------- */
  function applySettings() {
    const settings = activeSettings();
    document.querySelectorAll('[data-content]').forEach((el) => {
      const value = settings[el.dataset.content];
      if (typeof value !== 'string' || value.trim() === '') return; // keep the shipped default
      if (el.tagName === 'META') { el.setAttribute('content', value); return; }
      if (el.dataset.contentAttr) {
        el.setAttribute(el.dataset.contentAttr, value);
      } else {
        el.textContent = value;
      }
      if (el.hasAttribute('hidden')) el.removeAttribute('hidden');
    });

    // The browser title is only driven by the CMS on pages that opt in
    // with <title data-content="site_title"> — the admin and auth pages
    // keep their own titles.
    const titleEl = document.querySelector('title[data-content]');
    if (titleEl) {
      const value = settings[titleEl.dataset.content];
      if (typeof value === 'string' && value.trim() !== '') document.title = value;
    }
  }

  /* ---------- Google Maps link on the contact card ---------- */
  function applyMapLink() {
    const item = document.getElementById('contactAddressItem');
    if (!item) return;
    const url = state.settings.contact_map_url;
    const label = I18N ? I18N.t('contact.mapLink') : 'Open in Google Maps';
    if (typeof url !== 'string' || url.trim() === '') {
      item.removeAttribute('title');
      item.onclick = null;
      return;
    }
    item.title = label;
    item.onclick = () => window.open(url, '_blank', 'noopener');
  }

  /* ---------- opening hours (same markup as the shipped block) ---------- */
  function applyHours() {
    const wrap = document.querySelector('.contact-hours');
    if (!wrap) return;
    const raw_ = activeSettings().contact_hours;
    if (typeof raw_ !== 'string' || raw_.trim() === '') return;

    let rows;
    try { rows = JSON.parse(raw_); } catch (_) { return; }
    if (!Array.isArray(rows) || !rows.length) return;

    wrap.innerHTML = rows.map((row) =>
      `<div><span>${esc(row.label)}</span><span>${esc(row.value)}</span></div>`
    ).join('');
  }

  /* ---------- images ---------- */
  function applyImages() {
    document.querySelectorAll('[data-content-img]').forEach((el) => {
      const slot = state.images[el.dataset.contentImg];
      if (!slot || !slot.url) return;
      if (stripQuery(el.getAttribute('src')) !== stripQuery(slot.url)) {
        el.setAttribute('src', slot.url);
      }
      if (slot.alt) el.setAttribute('alt', slot.alt);
    });
  }

  /* ---------- reviews (same slide markup as the shipped section) ---------- */
  function applyReviews() {
    const track = document.getElementById('testimonialTrack');
    if (!track || !state.reviews.length) return; // keep the shipped slides on empty/error

    track.innerHTML = state.reviews.map((review, index) => {
      const rating = Math.max(0, Math.min(5, Number(review.rating) || 0));
      const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
      const avatar = review.author_avatar
        ? `<img src="${esc(review.author_avatar)}" alt="${esc(review.author_name)}">`
        : '';
      const body = I18N ? I18N.localize(review, 'content') : (review.content || '');
      const meta = I18N ? I18N.localize(review, 'author_meta') : (review.author_meta || '');
      const metaHTML = meta ? `<span>${esc(meta)}</span>` : '';
      return `
        <div class="testimonial-slide${index === 0 ? ' active' : ''}">
          <div class="stars">${stars}</div>
          <p>"${esc(body)}"</p>
          <div class="testimonial-author">
            ${avatar}
            <div><strong>${esc(review.author_name)}</strong>${metaHTML}</div>
          </div>
        </div>`;
    }).join('');

    // Rebuild the slider dots for the new slides (app.js owns the slider).
    if (window.SavoriaApp && typeof window.SavoriaApp.initTestimonials === 'function') {
      window.SavoriaApp.initTestimonials();
    }
  }

  function apply() {
    applySettings();
    applyHours();
    applyImages();
    applyMapLink();
    applyReviews();
    // Lets other scripts (the home page motion) know the admin's content is on the page.
    document.dispatchEvent(new CustomEvent('savoria:content-applied'));
  }

  async function load(force = false) {
    try {
      const headers = {};
      // A forced load skips the conditional request so a client always
      // receives the full payload (used after a manual refresh).
      if (state.version && !force) headers['If-None-Match'] = '"' + state.version + '"';
      const res = await fetch(BASE + '/site-content', { headers, cache: 'no-store' });
      if (res.status === 304) { state.loaded = true; return false; }
      if (!res.ok) return false;

      const json = await res.json();
      if (!json || !json.success || !json.data) return false;

      state.settings = json.data.settings || {};
      state.settings_ar = json.data.settings_ar || {};
      state.images = json.data.images || {};
      state.reviews = json.data.reviews || [];
      state.version = json.data.version || '';
      state.loaded = true;
      apply();
      return true;
    } catch (_) {
      return false; // offline / backend down → the page keeps its shipped content
    }
  }

  window.addEventListener('DOMContentLoaded', load);
  // Re-check when the visitor comes back to the tab, so content edited in
  // the panel shows up without a manual reload.
  window.addEventListener('focus', () => { if (state.loaded) load(); });

  // Switching the language swaps the CMS texts straight away — the
  // Arabic copy is already in the payload, no second request needed.
  if (I18N) {
    I18N.onChange(() => {
      if (state.loaded) apply();
    });
  }

  window.SavoriaContent = { load, apply, state };
})();
