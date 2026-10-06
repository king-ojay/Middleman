// The logged-in session ({ user, token }), kept in localStorage so a refresh
// keeps you logged in. The token is a short-lived signed session from the API;
// a new key replaces the old token-less "middleman.user" entries.
const STORAGE_KEY = 'middleman.session';

export function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return session?.user && session?.token ? session : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.removeItem('middleman.user');
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private mode etc.) — stay logged in for this tab only
  }
}
