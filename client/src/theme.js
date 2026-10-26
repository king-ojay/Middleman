// Appearance preference, saved on this device. 'system' follows the phone's
// light/dark setting through the CSS media query in styles/index.css.
export const THEMES = ['system', 'light', 'dark'];

const KEY = 'middleman.theme';

export function loadTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    return THEMES.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;

  // Match the browser chrome (address bar, status bar) to the page.
  const channels = getComputedStyle(root).getPropertyValue('--color-canvas').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', `rgb(${channels.split(/\s+/).join(',')})`);
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode or storage blocked: the choice lasts for this visit only.
  }
  applyTheme(theme);
}
