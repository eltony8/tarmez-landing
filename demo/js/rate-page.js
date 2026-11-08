/* =========================================================
   Tarmez — rate your order
   js/rate-page.js  (rate.html?order=<id>)

   Stars for the order, quick tags (what was great / what went
   wrong), optional stars for each dish and a comment. Opens from
   the "How was your order?" notification, the account page, the
   invoice page or the tracking page (guests: phone + code kept in
   sessionStorage for this tab, never in the address bar).
   ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const I18N = window.SavoriaI18n;
  const t = (key, params) => (I18N ? I18N.t(key, params) : key);
  const tr = (msg) => (I18N ? I18N.translateApiMessage(msg) : msg);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const lang = () => (I18N && I18N.getLang ? I18N.getLang() : 'en');
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/></svg>';

  const orderId = parseInt(new URLSearchParams(location.search).get('order'), 10);
  const signedIn = typeof SavoriaAPI !== 'undefined' && SavoriaAPI.isLoggedIn && SavoriaAPI.isLoggedIn();
  let guest = null;
  let data = null;
  let state = { rating: 0, tags: [], comment: '', items: {} };

  function guestAccess() {
    try { return JSON.parse(sessionStorage.getItem('savoria_invoice_access') || '{}')[orderId] || null; } catch (_) { return null; }
  }

  function stars(name, value, big) {
    return `<div class="rate-stars${big ? ' is-big' : ''}" role="radiogroup" aria-label="${esc(t('rate.starsLabel'))}" data-stars="${esc(name)}">
      ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${n === value}" aria-label="${n}" data-value="${n}" class="${n <= value ? 'is-on' : ''}">${STAR}</button>`).join('')}
    </div>`;
  }

  function dishName(it) {
    const name = lang() === 'ar' && it.item_name_ar ? it.item_name_ar : it.item_name_snapshot;
    const opt = lang() === 'ar' && it.option_name_ar ? it.option_name_ar : it.option_name;
    return name + (opt ? ` · ${opt}` : '');
  }

  function message(title, text, actions = '') {
    $('rateRoot').innerHTML = `<div class="rate-message"><h1>${esc(title)}</h1><p>${esc(text)}</p>${actions ? `<div class="rate-actions">${actions}</div>` : ''}</div>`;
  }

  function render() {
    const o = data.order;
    const number = o.order_number || o.id;
    if (!data.can_rate) {
      const existing = data.rating;
      if (data.reason === 'not_delivered') {
        message(t('rate.notYetTitle'), t('rate.notYet'), `<a class="btn btn-primary" href="${signedIn ? 'account.html#orders' : 'track-order.html'}">${esc(t('invoice.followOrder'))}</a>`);
      } else {
        message(t('rate.closedTitle'), existing ? t('rate.closedRated', { stars: existing.rating }) : t('rate.closed', { days: data.window_days }),
          `<a class="btn btn-primary" href="index.html#menu">${esc(t('rate.orderAgain'))}</a>`);
      }
      return;
    }
    const level = state.rating;
    const good = level >= 4;
    const tagTitle = level === 0 ? '' : good ? t('rate.tagsGood') : t('rate.tagsBad');
    $('rateRoot').innerHTML = `
      <form class="rate-form" id="rateForm" novalidate>
        <p class="rate-eyebrow">${esc(t('rate.eyebrow', { number }))}</p>
        <h1>${esc(data.rating ? t('rate.titleEdit') : t('rate.title'))}</h1>
        ${stars('order', level, true)}
        <p class="rate-level" data-level="${level}">${level ? esc(t('rate.levels.' + level)) : esc(t('rate.tapStar'))}</p>

        <div class="rate-tags"${level ? '' : ' hidden'}>
          <h2>${esc(tagTitle)}</h2>
          <div class="rate-tag-list">
            ${data.tags.map((tag) => `<button type="button" class="rate-tag${state.tags.includes(tag) ? ' is-on' : ''}" data-tag="${esc(tag)}" aria-pressed="${state.tags.includes(tag)}">${esc(t((good ? 'rate.tagsGoodList.' : 'rate.tagsBadList.') + tag))}</button>`).join('')}
          </div>
        </div>

        ${data.items.length ? `
          <div class="rate-dishes"${level ? '' : ' hidden'}>
            <h2>${esc(t('rate.dishesTitle'))}</h2>
            <p class="rate-hint">${esc(t('rate.dishesHint'))}</p>
            ${data.items.map((it) => `
              <div class="rate-dish">
                ${it.image_url ? `<img src="${esc(it.image_url)}" alt="" loading="lazy">` : '<span class="rate-dish-ph"></span>'}
                <span class="rate-dish-name">${esc(dishName(it))}${it.quantity > 1 ? ` <small>× ${esc(it.quantity)}</small>` : ''}</span>
                ${stars('item:' + it.id, state.items[String(it.id)] || 0, false)}
              </div>`).join('')}
          </div>` : ''}

        <div class="rate-comment"${level ? '' : ' hidden'}>
          <label for="rateComment">${esc(t('rate.commentLabel'))}</label>
          <textarea id="rateComment" rows="3" maxlength="1000" placeholder="${esc(good ? t('rate.commentGood') : t('rate.commentBad'))}">${esc(state.comment)}</textarea>
          <small class="rate-hint">${esc(t('rate.commentNote'))}</small>
        </div>

        <div class="form-error" id="rateError"></div>
        <button class="btn btn-primary btn-block rate-submit" type="submit" ${level ? '' : 'disabled'}>${esc(data.rating ? t('rate.update') : t('rate.send'))}</button>
      </form>`;
  }

  function thanks() {
    const good = state.rating >= 4;
    $('rateRoot').innerHTML = `
      <div class="rate-message rate-thanks">
        <div class="rate-thanks-stars">${[1, 2, 3, 4, 5].map((n) => `<span class="${n <= state.rating ? 'is-on' : ''}" style="--i:${n}">${STAR}</span>`).join('')}</div>
        <h1>${esc(t('rate.thanksTitle'))}</h1>
        <p>${esc(good ? t('rate.thanksGood') : t('rate.thanksBad'))}</p>
        <div class="rate-actions">
          <a class="btn btn-primary" href="index.html#menu">${esc(t('rate.orderAgain'))}</a>
          <a class="btn btn-outline" href="invoice.html?order=${encodeURIComponent(orderId)}">${esc(t('invoice.open'))}</a>
        </div>
      </div>`;
  }

  /* ---------- events ---------- */
  $('rateRoot').addEventListener('click', (e) => {
    const star = e.target.closest('[data-stars] [data-value]');
    if (star) {
      const group = star.closest('[data-stars]').dataset.stars;
      const value = Number(star.dataset.value);
      if (group === 'order') {
        const wasGood = state.rating >= 4;
        state.rating = value;
        if (wasGood !== (value >= 4)) state.tags = []; // the tag list changes meaning
      } else {
        const key = group.slice(5);
        state.items[key] = state.items[key] === value ? 0 : value; // tapping the same star again clears it
      }
      const comment = $('rateComment');
      if (comment) state.comment = comment.value;
      render();
      return;
    }
    const tag = e.target.closest('[data-tag]');
    if (tag) {
      const name = tag.dataset.tag;
      state.tags = state.tags.includes(name) ? state.tags.filter((x) => x !== name) : [...state.tags, name];
      tag.classList.toggle('is-on');
      tag.setAttribute('aria-pressed', state.tags.includes(name));
    }
  });

  $('rateRoot').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.rating) return;
    state.comment = ($('rateComment') && $('rateComment').value.trim()) || '';
    const btn = e.target.querySelector('.rate-submit');
    btn.disabled = true;
    const items = {};
    Object.entries(state.items).forEach(([k, v]) => { if (v) items[k] = v; });
    try {
      data = await SavoriaAPI.saveRating(orderId, { rating: state.rating, tags: state.tags, comment: state.comment, items },
        guest && guest.phone, guest && guest.code);
      thanks();
    } catch (err) {
      btn.disabled = false;
      $('rateError').textContent = err.errors && Object.keys(err.errors).length
        ? Object.values(err.errors).map(tr).join(' ') : tr(err.message);
    }
  });

  async function load() {
    if (!orderId) { message(t('invoice.notFoundTitle'), t('invoice.notFound')); return; }
    guest = signedIn ? null : guestAccess();
    try {
      data = await SavoriaAPI.getRatingForm(orderId, guest && guest.phone, guest && guest.code);
      if (data.rating) {
        state = { rating: data.rating.rating, tags: data.rating.tags || [], comment: data.rating.comment || '', items: { ...(data.rating.items || {}) } };
      }
      render();
    } catch (err) {
      if (err.status === 403 || err.status === 401) {
        message(t('rate.lockedTitle'), t('rate.locked'),
          `<a class="btn btn-primary" href="login.html">${esc(t('nav.logIn'))}</a><a class="btn btn-outline" href="track-order.html">${esc(t('invoice.backTrack'))}</a>`);
      } else {
        message(t('invoice.errorTitle'), tr(err.message));
      }
    }
  }

  if (I18N && I18N.onChange) I18N.onChange(() => { if (data && $('rateForm')) { const c = $('rateComment'); if (c) state.comment = c.value; render(); } });
  load();
})();
