import { createContext, useContext, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from './api.js';

// Demo-grade auth: the logged-in user is whatever POST /api/auth/login
// returned for a phone number, kept in localStorage so a refresh keeps you
// logged in. Enough to know who the user is and route by role.
const STORAGE_KEY = 'middleman.user';
const AuthContext = createContext(null);

function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveUser(user) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private mode etc.) — stay logged in for this tab only
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadUser);

  const login = async phone => {
    const u = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone }) });
    saveUser(u);
    setUser(u);
    return u;
  };

  const logout = () => {
    saveUser(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const homePathFor = user => (user?.role === 'worker' ? '/jobs' : '/discover');

// Renders children only for a logged-in user with the given role; otherwise
// sends them to login, or to their own role's home.
export function RequireRole({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homePathFor(user)} replace />;
  return children;
}
