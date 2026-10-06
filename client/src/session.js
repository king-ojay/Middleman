// The logged-in user, kept in localStorage so a refresh keeps you logged in.
// Shared by auth.jsx (login/logout) and api.js (identifies the caller).
const STORAGE_KEY = 'middleman.user';

export function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveUser(user) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private mode etc.) — stay logged in for this tab only
  }
}
