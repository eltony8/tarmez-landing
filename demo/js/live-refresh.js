/* =========================================================
   Tarmez — live order status
   js/live-refresh.js

   window.SavoriaLive.every(fn) runs fn every 15 seconds while the
   page is visible (and at once when the visitor comes back to it),
   so a status changed in Site Management shows up on the customer's
   account and tracking pages without reloading.
   SavoriaLive.announce(text) shows a short message at the top.
   ========================================================= */
(function () {
  'use strict';
  const INTERVAL = 15000;

  function every(fn) {
    let busy = false;
    const run = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try { await fn(); } catch (_) { /* the next round tries again */ } finally { busy = false; }
    };
    const timer = setInterval(run, INTERVAL);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
    window.addEventListener('online', run);
    return () => clearInterval(timer);
  }

  let toastTimer = null;
  function announce(text) {
    let el = document.getElementById('liveToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'liveToast';
      el.className = 'live-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = text;
    requestAnimationFrame(() => el.classList.add('is-in'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-in'), 4500);
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (_) { /* not available */ }
  }

  /** id → status of a list of orders, to see what changed. */
  function statuses(orders) {
    const map = {};
    (orders || []).forEach((o) => { map[String(o.id)] = String(o.status); });
    return map;
  }

  window.SavoriaLive = { every, announce, statuses, INTERVAL };
})();
