/* =========================================================
   Tarmez — home page motion
   js/motion.js  (paired with css/motion.css)

   Counting hero stats, steam and pointer depth in the hero, tilting
   menu cards, staggered card entrances, the dish that flies into the
   cart, section entrances and the reading progress line.
   It does nothing when the visitor prefers reduced motion, and the
   page works the same without it.
   ========================================================= */
(function () {
  'use strict';

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !document.body || !document.body.classList.contains('home-page')) return;
  document.documentElement.classList.add('motion');

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- 2. Hero stats count up ---------- */
  // "4.9★" → 0.0★ … 4.9★, "12k+" → 0k+ … 12k+, "2,300+" keeps its comma.
  // Only western digits are counted; anything else is left as it is.
  function countUp(el, duration = 1600) {
    const target = el.textContent;
    const m = target.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s);
    if (!m) return;
    const [, before, numText, after] = m;
    const grouped = numText.includes(',');
    const decimals = (numText.split('.')[1] || '').length;
    const value = parseFloat(numText.replace(/,/g, ''));
    if (!isFinite(value) || value === 0) return;
    const format = (n) => {
      const fixed = n.toFixed(decimals);
      if (!grouped) return fixed;
      const [i, d] = fixed.split('.');
      return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : '');
    };
    let written = '';
    const start = performance.now();
    const step = (now) => {
      // Anything else that rewrites the value while we count (the site content
      // loader) wins: we stop and leave its text alone.
      if (written && el.textContent !== written) return;
      const p = Math.min(1, (now - start) / duration);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      written = p === 1 ? target : before + format(value * eased) + after;
      el.textContent = written;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    // Safety net: whatever happens to the frames, never leave a half-counted number behind.
    setTimeout(() => { if (written && el.textContent === written) el.textContent = target; }, duration + 500);
  }

  function initStats() {
    const stats = $$('.hero-stat strong');
    if (!stats.length) return;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      stats.forEach((el, i) => setTimeout(() => countUp(el), 1100 + i * 120));
    };
    // Give the site content (admin-edited numbers) a moment to arrive first.
    document.addEventListener('savoria:content-applied', run, { once: true });
    setTimeout(run, 700);
  }

  /* ---------- 3. Steam + pointer depth ---------- */
  function initHeroDepth() {
    const hero = $('.hero');
    if (!hero) return;
    const accent = $('.hero-visual-accent', hero);
    if (accent && !$('.hero-steam', accent)) {
      accent.insertAdjacentHTML('beforeend', `
        <svg class="hero-steam" viewBox="0 0 60 80" aria-hidden="true" focusable="false">
          <path d="M18 78 C 8 62, 28 54, 18 38 S 22 14, 16 4"/>
          <path d="M30 78 C 22 60, 40 52, 30 36 S 34 12, 30 2"/>
          <path d="M42 78 C 34 62, 52 54, 42 38 S 46 14, 42 4"/>
        </svg>`);
    }
    if (!finePointer) return;
    hero.classList.add('has-depth');
    let frame = 0;
    let mx = 0;
    let my = 0;
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      my = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(() => {
        hero.style.setProperty('--mx', mx.toFixed(3));
        hero.style.setProperty('--my', my.toFixed(3));
        frame = 0;
      });
    });
    hero.addEventListener('pointerleave', () => {
      hero.style.setProperty('--mx', 0);
      hero.style.setProperty('--my', 0);
    });
  }

  /* ---------- 4. Menu cards: tilt + sheen, and staggered entrances ---------- */
  function initMenuCards() {
    const grid = $('#menuGrid');
    if (!grid) return;

    if (finePointer) {
      let current = null;
      let frame = 0;
      let last = null;
      const reset = (card) => {
        if (!card) return;
        card.classList.remove('is-tilting');
        card.style.removeProperty('--rx');
        card.style.removeProperty('--ry');
      };
      grid.addEventListener('pointermove', (e) => {
        const card = e.target.closest('.menu-card');
        if (card !== current) { reset(current); current = card; }
        if (!card || card.classList.contains('motion-wait')) return;
        last = e;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!current || !last) return;
          const r = current.getBoundingClientRect();
          const x = (last.clientX - r.left) / r.width;
          const y = (last.clientY - r.top) / r.height;
          current.classList.add('is-tilting');
          current.style.setProperty('--ry', ((x - 0.5) * 10).toFixed(2) + 'deg');
          current.style.setProperty('--rx', ((0.5 - y) * 8).toFixed(2) + 'deg');
          current.style.setProperty('--sx', (x * 100).toFixed(1) + '%');
          current.style.setProperty('--sy', (y * 100).toFixed(1) + '%');
        });
      });
      grid.addEventListener('pointerleave', () => { reset(current); current = null; });
    }

    if (!('IntersectionObserver' in window)) return;
    const seen = new WeakSet();
    const io = new IntersectionObserver((entries) => {
      const arriving = entries.filter((en) => en.isIntersecting).map((en) => en.target);
      arriving.forEach((card, i) => {
        io.unobserve(card);
        setTimeout(() => {
          card.classList.add('motion-in');
          card.classList.remove('motion-wait');
          setTimeout(() => card.classList.remove('motion-in'), 900);
        }, i * 90);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    const prepare = () => {
      $$('.menu-card', grid).forEach((card) => {
        if (seen.has(card)) return;
        seen.add(card);
        card.classList.add('motion-wait');
        io.observe(card);
      });
    };
    prepare();
    // The menu is drawn (and redrawn by the category filter) after load.
    new MutationObserver(prepare).observe(grid, { childList: true });
  }

  /* ---------- 5. The dish flies into the cart ---------- */
  function initFlyToCart() {
    document.addEventListener('savoria:cart-add', (e) => {
      const cart = $('#cartTrigger');
      const btn = e.detail && e.detail.button;
      if (!cart || !btn || !btn.getBoundingClientRect || typeof document.body.animate !== 'function') return;
      const card = btn.closest('.menu-card');
      const fromEl = (card && $('.menu-card-media img', card)) || btn;
      const a = fromEl.getBoundingClientRect();
      const b = cart.getBoundingClientRect();
      if (!a.width || !b.width) return;
      const src = (e.detail && e.detail.image) || (card && $('.menu-card-media img', card)?.src);
      const fly = document.createElement(src ? 'img' : 'div');
      if (src) { fly.src = src; fly.alt = ''; } else { fly.style.background = 'var(--color-terracotta)'; }
      fly.className = 'motion-fly';
      fly.setAttribute('aria-hidden', 'true');
      const x0 = a.left + a.width / 2;
      const y0 = a.top + a.height / 2;
      const x1 = b.left + b.width / 2;
      const y1 = b.top + b.height / 2;
      fly.style.left = x0 + 'px';
      fly.style.top = y0 + 'px';
      document.body.appendChild(fly);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const lift = Math.min(160, Math.abs(dy) * 0.35 + 60);
      const anim = fly.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(0.9)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.35 },
      ], { duration: 850, easing: 'cubic-bezier(.45,.05,.35,1)' });
      anim.onfinish = () => {
        fly.remove();
        cart.classList.remove('motion-cart-glow');
        void cart.offsetWidth;
        cart.classList.add('motion-cart-glow');
      };
    });
  }

  /* ---------- 6. Sections arrive in their own way ---------- */
  function initSections() {
    $$('.about-media.reveal').forEach((el) => el.classList.add('motion-curtain'));
    $$('.about-text.reveal, .reservation-text.reveal, .contact-info-card.reveal').forEach((el) => el.classList.add('motion-side'));
    $$('.reservation-form.reveal, .contact-form-card.reveal').forEach((el) => el.classList.add('motion-lift'));

    const bar = document.createElement('div');
    bar.className = 'motion-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    let ticking = false;
    const update = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty('--progress', max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : 0);
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  initStats();
  initHeroDepth();
  initMenuCards();
  initFlyToCart();
  initSections();
})();
