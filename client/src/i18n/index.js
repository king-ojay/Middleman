// The app's words in English (default) and Kinyarwanda (beta): en.js and
// rw.js hold every user-facing string by key. t('key', { name }) returns the
// string in the chosen language with {name}-style placeholders filled in;
// tn('key', n) picks 'key.one' for 1 and 'key.other' otherwise (n is passed
// as {n}). A key missing from rw.js falls back to English. The choice is
// kept on this device (localStorage) and set on <html lang>. Changing it
// re-renders the whole app (App.jsx keys its tree on the language).
// The researcher's /admin page stays in English.
import en from './en.js';
import rw from './rw.js';

export const DICTIONARIES = { en, rw };
export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'rw', label: 'Kinyarwanda (beta)' }
];
const STORAGE_KEY = 'middleman.lang';

export function loadLang() {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    return DICTIONARIES[saved] ? saved : 'en';
  } catch {
    return 'en';
  }
}

let current = loadLang();
const listeners = new Set();

export const getLang = () => current;

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Sets <html lang> to the current language (also called once at startup).
export function applyLang() {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

export function setLang(lang) {
  if (!DICTIONARIES[lang] || lang === current) return;
  current = lang;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, lang);
  } catch {
    // storage unavailable (private mode etc.) — the choice lasts for this tab only
  }
  applyLang();
  listeners.forEach(fn => fn(lang));
}

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));

/** The string for `key` in the current language, placeholders filled. */
export function t(key, vars = {}) {
  const text = DICTIONARIES[current][key] ?? en[key];
  return text === undefined ? key : fill(text, vars);
}

/** 'key.one' when n is 1, else 'key.other'; n is available as {n}. */
export const tn = (key, n, vars = {}) => t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...vars });

/** The translation for a known key, or null (for optional lookups such as server error codes). */
export const tMaybe = (key, vars = {}) => (key in DICTIONARIES[current] || key in en ? t(key, vars) : null);
