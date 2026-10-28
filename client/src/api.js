import { loadSession, saveSession } from './session.js';

// Base URL for the API. Empty in dev (Vite proxies /api to :4000); set
// VITE_API_URL to the deployed API's origin for production builds.
const API_BASE = import.meta.env.VITE_API_URL || '';

// The free API host sleeps when idle and takes up to a minute to wake. A
// request still waiting after SLOW_MS counts as slow; ServerWaking shows a
// notice while any request is slow.
const SLOW_MS = 3000;
let slowRequests = 0;
const slowListeners = new Set();
const setSlow = delta => {
  slowRequests += delta;
  slowListeners.forEach(fn => fn(slowRequests > 0));
};
export const onSlowChange = fn => {
  slowListeners.add(fn);
  return () => slowListeners.delete(fn);
};

// Starts waking the API early (landing and login pages), so it is up by the
// time the person has typed their number. Fire and forget.
let woken = false;
export function wakeApi() {
  if (woken) return;
  woken = true;
  fetch(`${API_BASE}/api/health`).catch(() => { woken = false; });
}

export async function api(path, options = {}) {
  const token = loadSession()?.token;
  let slow = false;
  const timer = setTimeout(() => { slow = true; setSlow(1); }, SLOW_MS);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch {
    // fetch only throws when there is no answer at all (offline, DNS, CORS).
    throw new Error("Can't reach Middleman. Check your internet connection and try again.");
  } finally {
    clearTimeout(timer);
    if (slow) setSlow(-1);
  }
  const data = await res.json().catch(() => null);

  // An expired or revoked session: forget it and go back to login.
  if (res.status === 401 && token) {
    saveSession(null);
    window.location.assign('/login');
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
