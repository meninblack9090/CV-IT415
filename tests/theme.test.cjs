const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'js', 'theme.js');

function loadTheme({ saved = null, systemDark = false, blockedStorage = false, reducedMotion = false } = {}) {
  const classes = new Set();
  const timers = new Map();
  let nextTimer = 0;
  const root = {
    dataset: {},
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
  };
  const button = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, listener) { this[name] = listener; },
  };
  const storage = new Map(saved === null ? [] : [['cv-theme', saved]]);
  const media = {
    matches: systemDark,
    addEventListener(name, listener) { this[name] = listener; },
  };
  const document = {
    documentElement: root,
    getElementById: () => button,
    addEventListener(name, listener) { this[name] = listener; },
  };
  const context = {
    document,
    window: {
      matchMedia: query => query.includes('reduced-motion') ? { matches: reducedMotion } : media,
      setTimeout(callback, delay) {
        timers.set(++nextTimer, { callback, delay });
        return nextTimer;
      },
      clearTimeout(id) { timers.delete(id); },
      localStorage: {
        getItem(key) {
          if (blockedStorage) throw new Error('Storage unavailable');
          return storage.get(key) ?? null;
        },
        setItem(key, value) {
          if (blockedStorage) throw new Error('Storage unavailable');
          storage.set(key, value);
        },
      },
    },
  };
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const earlyScript = html.match(/<script id="theme-init">([\s\S]*?)<\/script>/);
  if (earlyScript) vm.runInNewContext(earlyScript[1], context);
  const earlyTheme = root.dataset.theme;
  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), context);
  return { root, button, document, media, storage, classes, timers, earlyTheme };
}

test('applies the device preference before the document finishes loading', () => {
  assert.equal(loadTheme({ systemDark: true }).root.dataset.theme, 'dark');
  assert.equal(loadTheme().root.dataset.theme, 'light');
  assert.equal(loadTheme({ systemDark: true }).earlyTheme, 'dark');
  assert.equal(loadTheme({ saved: 'light', systemDark: true }).earlyTheme, 'light');
});

test('restores a saved choice instead of the device preference', () => {
  assert.equal(loadTheme({ saved: 'light', systemDark: true }).root.dataset.theme, 'light');
  assert.equal(loadTheme({ saved: 'dark' }).root.dataset.theme, 'dark');
  assert.equal(loadTheme({ saved: 'invalid', systemDark: true }).root.dataset.theme, 'dark');
});

test('switches both ways and saves the choice with an accessible button label', () => {
  const page = loadTheme();
  page.document.DOMContentLoaded();
  assert.equal(page.button.attributes['aria-pressed'], 'false');
  assert.equal(page.button.attributes['aria-label'], 'Switch to dark mode');
  page.button.click();
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.storage.get('cv-theme'), 'dark');
  assert.equal(page.button.attributes['aria-pressed'], 'true');
  assert.equal(page.button.attributes['aria-label'], 'Switch to light mode');
  page.button.click();
  assert.equal(page.root.dataset.theme, 'light');
  assert.equal(page.storage.get('cv-theme'), 'light');
});

test('animates only theme changes and clears the temporary class after rapid toggles', () => {
  const page = loadTheme();
  page.document.DOMContentLoaded();
  assert(!page.classes.has('theming'));
  page.button.click();
  page.button.click();
  assert(page.classes.has('theming'));
  assert.equal(page.timers.size, 1);
  const timer = [...page.timers.values()][0];
  assert.equal(timer.delay, 450);
  timer.callback();
  assert(!page.classes.has('theming'));
});

test('does not animate theme changes when reduced motion is requested', () => {
  const page = loadTheme({ reducedMotion: true });
  page.document.DOMContentLoaded();
  page.button.click();
  assert.equal(page.root.dataset.theme, 'dark');
  assert(!page.classes.has('theming'));
  assert.equal(page.timers.size, 0);
});

test('keeps working when browser storage is unavailable', () => {
  const page = loadTheme({ blockedStorage: true });
  page.document.DOMContentLoaded();
  page.button.click();
  assert.equal(page.root.dataset.theme, 'dark');
});

test('follows device changes until the visitor makes a choice', () => {
  const page = loadTheme();
  page.document.DOMContentLoaded();
  page.media.matches = true;
  page.media.change();
  assert.equal(page.root.dataset.theme, 'dark');
  page.button.click();
  page.media.change();
  assert.equal(page.root.dataset.theme, 'light');
});

test('all CSS color literals are defined as theme custom properties', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
  const declarations = css.split('\n').filter(line => /^\s+[\w-]+:/.test(line));
  for (const declaration of declarations) {
    if (declaration.trim().startsWith('--')) continue;
    const literalValues = declaration.replace(/var\(--[\w-]+\)/g, '');
    assert(!/#[\da-f]{3,8}\b|rgba?\(|\btransparent\b/i.test(literalValues), declaration);
  }
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
  for (const [, name] of css.matchAll(/var\((--[\w-]+)/g)) assert(defined.has(name), name);
});

test('the first-paint script precedes CSS and the toggle contains both inline SVGs', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(html.indexOf('<script id="theme-init">') < html.indexOf('rel="stylesheet"'));
  assert(html.includes('<script src="js/theme.js" defer>'));
  const button = html.match(/<button class="theme-toggle"[\s\S]*?<\/button>/)[0];
  assert.equal((button.match(/<svg\b/g) || []).length, 2);
  assert(button.includes('class="theme-icon-moon"'));
  assert(button.includes('class="theme-icon-sun"'));
});

test('provides keyboard navigation and accessible contact form metadata', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(html.includes('class="skip-link" href="#main-content"'));
  assert(html.includes('<main id="main-content">'));
  assert(html.includes('aria-describedby="contact-form-note"'));
  assert(html.includes('inputmode="email"'));
  assert(html.includes('spellcheck="true"'));
});
