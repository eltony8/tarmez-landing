/* Tarmez landing page: language, the hero QR moment, tabs, lazy videos, plans, reels and the demo form. */
(function () {
  'use strict';
  const CFG = window.TARMEZ;
  const TEXT = window.TARMEZ_TEXT;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* storage blocked: fine */ } },
  };

  /* ---------------- language ---------------- */
  // Arabic first; a visitor's own choice is remembered
  let lang = store.get('tarmez_lang') || 'ar';
  if (!TEXT[lang]) lang = 'ar';
  const t = (k) => (TEXT[lang] && TEXT[lang][k]) ?? TEXT.ar[k] ?? k;

  function applyLang() {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split(';').forEach((pair) => { const [attr, key] = pair.split(':'); el.setAttribute(attr, t(key)); });
    });
    document.title = t('meta.title');
    renderPlans();
    renderPlanSelect();
    setupContact();
    if (qr) drawQR(1);
  }
  $('#langBtn').addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    store.set('tarmez_lang', lang);
    applyLang();
  });

  /* ---------------- the hero: the table's code breaks apart into the menu ---------------- */
  const stage = $('#heroStage');
  const canvas = $('#qrCanvas');
  const ctx = canvas.getContext('2d');
  let qr = null;
  let modules = [];

  function buildQR() {
    if (typeof window.qrcode !== 'function') return false;
    const q = window.qrcode(0, 'M');
    q.addData(CFG.siteUrl);
    q.make();
    const n = q.getModuleCount();
    modules = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) modules.push({ r, c });
    qr = { n };
    return true;
  }

  // progress 1 = the whole code; 0..1 while it flies apart (p goes 1 → 0)
  function drawQR(p, burst = 0) {
    const W = canvas.width;
    const n = qr.n;
    const cell = W / (n + 2);
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = '#1F1B18';
    const mid = (n - 1) / 2;
    for (const m of modules) {
      const dx = m.c - mid, dy = m.r - mid;
      const d = Math.hypot(dx, dy) + 0.5;
      const local = Math.max(0, burst - (d / n) * 0.35) / 0.65; // the centre goes first
      const e = local * local;
      const x = (m.c + 1) * cell + (dx / d) * e * W * 0.9;
      const y = (m.r + 1) * cell + (dy / d) * e * W * 0.9;
      ctx.globalAlpha = Math.max(0, 1 - e * 1.4) * p + (1 - p) * 0;
      ctx.fillRect(x, y, cell + 0.6, cell + 0.6);
    }
    ctx.globalAlpha = 1;
  }

  function play() {
    stage.classList.remove('scanned');
    if (!qr) { stage.classList.add('scanned'); return; }
    drawQR(1, 0);
    if (reduced) { stage.classList.add('scanned'); return; }
    const t0 = performance.now() + 900;
    const dur = 1100;
    const step = (now) => {
      const k = Math.min(1, Math.max(0, (now - t0) / dur));
      if (now < t0) { requestAnimationFrame(step); return; }
      drawQR(1, k);
      if (k > 0.35 && !stage.classList.contains('scanned')) stage.classList.add('scanned');
      if (k < 1) requestAnimationFrame(step);
      else setTimeout(() => drawQR(1, 0), 500); // the small card shows the whole code again
    };
    requestAnimationFrame(step);
  }
  $('#replay').addEventListener('click', play);

  /* ---------------- videos: load and play only when on screen ---------------- */
  const videoObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const v = en.target;
      if (en.isIntersecting && !v.closest('[hidden]')) {
        if (v.dataset.src && !v.src) v.src = v.dataset.src;
        if (!reduced) v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, { threshold: 0.25 }) : null;
  function watchVideos() {
    $$('video[data-src], video[data-autoplay]').forEach((v) => {
      if (videoObserver) videoObserver.observe(v);
      else { if (v.dataset.src) v.src = v.dataset.src; }
    });
  }

  /* ---------------- role tabs (arrow keys follow the reading direction) ---------------- */
  const tabs = $$('[role="tab"]');
  function selectTab(tab, focus) {
    tabs.forEach((b) => {
      const on = b === tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(b.getAttribute('aria-controls'));
      panel.hidden = !on;
      const v = $('video', panel);
      if (v) {
        if (on) { if (v.dataset.src && !v.src) v.src = v.dataset.src; if (!reduced) v.play().catch(() => {}); }
        else v.pause();
      }
    });
    if (focus) tab.focus();
  }
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => selectTab(b));
    b.addEventListener('keydown', (e) => {
      const rtl = document.documentElement.dir === 'rtl';
      const next = (rtl ? 'ArrowLeft' : 'ArrowRight'), prev = (rtl ? 'ArrowRight' : 'ArrowLeft');
      let j = null;
      if (e.key === next) j = (i + 1) % tabs.length;
      if (e.key === prev) j = (i - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); selectTab(tabs[j], true); }
    });
  });

  /* ---------------- plans ---------------- */
  let period = 'monthly';
  const money = (v) => new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US').format(v);
  function renderPlans() {
    const box = $('#plans');
    box.innerHTML = CFG.plans.map((p) => `
      <article class="plan${p.featured ? ' featured' : ''}">
        ${p.featured ? `<span class="flag">${t('pricing.featured')}</span>` : ''}
        <h3>${p.name[lang]}</h3>
        <p class="blurb">${p.blurb[lang]}</p>
        <p class="price"><strong>${money(p[period])}</strong><span>${CFG.currency[lang]} ${t('pricing.per')}</span></p>
        <ul>${p.features[lang].map((f) => `<li><svg><use href="#i-check"/></svg><span>${f}</span></li>`).join('')}</ul>
        <a class="btn ${p.featured ? 'btn-solid' : ''}" href="#contact" data-plan="${p.id}">${t('pricing.cta')}</a>
      </article>`).join('');
    $('#priceDraft').hidden = !CFG.pricesAreDraft;
    $$('[data-plan]', box).forEach((a) => a.addEventListener('click', () => { $('#planSelect').value = a.dataset.plan; }));
  }
  $$('.period button').forEach((b) => b.addEventListener('click', () => {
    period = b.dataset.period;
    $$('.period button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    renderPlans();
  }));
  function renderPlanSelect() {
    const sel = $('#planSelect');
    const keep = sel.value;
    sel.innerHTML = `<option value="">${t('contact.plan.any')}</option>` + CFG.plans.map((p) => `<option value="${p.id}">${p.name[lang]}</option>`).join('');
    sel.value = keep;
  }

  /* ---------------- contact ---------------- */
  const waLink = (text) => `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(text)}`;
  function setupContact() {
    const wa = $('#waBtn'), mail = $('#mailBtn');
    wa.hidden = !CFG.whatsapp;
    if (CFG.whatsapp) wa.href = waLink(t('contact.wa.msg'));
    mail.hidden = !CFG.email;
    if (CFG.email) mail.href = `mailto:${CFG.email}?subject=${encodeURIComponent(t('nav.cta'))}`;
    const local = /^(localhost|127\.0\.0\.1|)$/.test(location.hostname);
    $('#contactSetup').hidden = !(local && !CFG.whatsapp && !CFG.email && !CFG.formspreeId);
  }

  $('#leadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const status = $('#formStatus');
    const data = Object.fromEntries(new FormData(form).entries());
    status.className = 'form-status';
    if (!data.name.trim() || !data.phone.trim()) { status.textContent = t('contact.required'); status.classList.add('err'); return; }
    const plan = CFG.plans.find((p) => p.id === data.plan);
    const summary = [
      t('contact.wa.msg'),
      `${t('contact.name')}: ${data.name}`,
      data.restaurant && `${t('contact.restaurant')}: ${data.restaurant}`,
      data.city && `${t('contact.city')}: ${data.city}`,
      `${t('contact.phone')}: ${data.phone}`,
      plan && `${t('contact.plan')}: ${plan.name[lang]}`,
      data.message && data.message,
    ].filter(Boolean).join('\n');

    if (CFG.formspreeId) {
      const btn = $('#sendBtn');
      btn.disabled = true;
      btn.textContent = t('contact.sending');
      try {
        const r = await fetch(`https://formspree.io/f/${CFG.formspreeId}`, {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, plan: plan ? plan.name.en : '', _subject: `Tarmez demo — ${data.restaurant || data.name}` }),
        });
        if (!r.ok) throw new Error(String(r.status));
        form.reset();
        status.textContent = t('contact.sent');
        status.classList.add('ok');
      } catch (_) {
        status.textContent = t('contact.failed');
        status.classList.add('err');
      } finally {
        btn.disabled = false;
        btn.textContent = t('contact.send');
      }
    } else if (CFG.whatsapp) {
      window.open(waLink(summary), '_blank', 'noopener');
    } else if (CFG.email) {
      location.href = `mailto:${CFG.email}?subject=${encodeURIComponent(t('nav.cta'))}&body=${encodeURIComponent(summary)}`;
    } else {
      status.textContent = t('contact.setup');
      status.classList.add('err');
    }
  });

  /* ---------------- campaign reels ---------------- */
  const dialog = $('#reelDialog');
  const reel = $('#reelVideo');
  $$('.reel').forEach((b) => b.addEventListener('click', () => {
    reel.src = b.dataset.video;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    reel.play().catch(() => {});
  }));
  const closeReel = () => { reel.pause(); reel.removeAttribute('src'); reel.load(); if (dialog.open) dialog.close(); };
  $('#reelClose').addEventListener('click', closeReel);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeReel(); });
  dialog.addEventListener('close', () => { reel.pause(); });

  /* ---------------- start ---------------- */
  $('#year').textContent = new Date().getFullYear();
  buildQR();
  applyLang();
  watchVideos();
  play();
})();
