(() => {
  'use strict';

  const storageKey = 'cv-theme';
  const root = document.documentElement;
  const deviceTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let selectedTheme = null;
  let toggleButton;
  let transitionTimer;

  try {
    const savedTheme = window.localStorage.getItem(storageKey);
    if (savedTheme === 'light' || savedTheme === 'dark') selectedTheme = savedTheme;
  } catch {
    // Theme switching also works when the browser blocks storage.
  }

  function applyTheme(animate = false) {
    const theme = selectedTheme || (deviceTheme.matches ? 'dark' : 'light');
    if (animate && root.dataset.theme !== theme
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.clearTimeout(transitionTimer);
      root.classList.add('theming');
      transitionTimer = window.setTimeout(() => root.classList.remove('theming'), 450);
    }
    root.dataset.theme = theme;

    if (toggleButton) {
      const isDark = theme === 'dark';
      const label = isDark ? 'Light mode' : 'Dark mode';
      toggleButton.setAttribute('aria-label', `Switch to ${label.toLowerCase()}`);
      toggleButton.setAttribute('aria-pressed', String(isDark));
    }
  }

  // The inline head script sets the first theme before the stylesheet loads.
  applyTheme();
  deviceTheme.addEventListener('change', () => applyTheme(true));

  document.addEventListener('DOMContentLoaded', () => {
    toggleButton = document.getElementById('theme-toggle');
    applyTheme();

    toggleButton.addEventListener('click', () => {
      selectedTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(true);
      try {
        window.localStorage.setItem(storageKey, selectedTheme);
      } catch {
        // Keep the selected theme for this visit even if saving is unavailable.
      }
    });
  });
})();
