import { loadSession, saveSession } from './session.js';

// Base URL for the API. Empty in dev (Vite proxies /api to :4000); set
// VITE_API_URL to the deployed API's origin for production builds.
const API_BASE = import.meta.env.VITE_API_URL || '';

export async function api(path, options = {}) {
  const token = loadSession()?.token;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const data = await res.json().catch(() => null);

  // An expired or revoked session: forget it and go back to login.
  if (res.status === 401 && token) {
    saveSession(null);
    window.location.assign('/login');
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
