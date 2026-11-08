/* =========================================================
   Tarmez — js/theme.js
   Dark/light theme toggle + scroll-to-top button.
   Pairs with the inline "no-flash" script in each <head>,
   which sets data-theme before first paint.
   ========================================================= */

(function () {
  'use strict';

  const STORAGE_KEY = 'savoria_theme';

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* storage unavailable — theme still applies for this session */ }
  }

  function initThemeToggle() {
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
      });
    });

    // Keep every tab/page in sync if the user switches theme elsewhere
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        document.documentElement.setAttribute('data-theme', e.newValue);
      }
    });
  }

  function initScrollTop() {
    const btn = document.getElementById('scrollTopBtn');
    if (!btn) return;
    window.addEventListener('scroll', () => {
      btn.classList.toggle('visible', window.scrollY > 500);
    });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initScrollTop();
  });
})();
