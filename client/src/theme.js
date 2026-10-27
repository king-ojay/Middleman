// Appearance preference: 'system' (follow the phone), 'light' or 'dark'.
// Stored per device. The colours themselves live in styles/index.css; this
// only sets data-theme on <html> so the CSS knows which set to use.
const STORAGE_KEY = 'middleman.theme';
export const THEMES = ['system', 'light', 'dark'];

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function loadTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  // Match the browser chrome to the page background.
  const dark = theme === 'dark' || (theme === 'system' && systemDark());
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E131D' : '#F4F5F8');
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable (private mode etc.) — the choice lasts for this tab only
  }
  applyTheme(theme);
}

// Apply the saved choice at startup and keep the browser chrome in step when
// the system setting changes while the app is open.
export function initTheme() {
  applyTheme(loadTheme());
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(loadTheme()));
}
