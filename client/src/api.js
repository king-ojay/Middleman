import { loadUser } from './session.js';

// Base URL for the API. Empty in dev (Vite proxies /api to :4000); set
// VITE_API_URL to the deployed API's origin for production builds.
const API_BASE = import.meta.env.VITE_API_URL || '';

export async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // Demo-grade caller identity until Phase 7's PIN login.
      ...(loadUser()?._id ? { 'x-user-id': loadUser()._id } : {}),
      ...options.headers
    }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
