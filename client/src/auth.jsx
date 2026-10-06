import { createContext, useContext, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from './api.js';
import { loadUser, saveUser } from './session.js';

// The logged-in user is whatever POST /api/auth/login (phone + PIN) or
// /register returned, kept in localStorage so a refresh keeps you logged in.
// API calls still identify the user by id until Phase 7 adds real sessions.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadUser);

  const start = u => {
    saveUser(u);
    setUser(u);
    return u;
  };

  const login = async (phone, pin) =>
    start(await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone, pin }) }));

  const register = async details =>
    start(await api('/api/auth/register', { method: 'POST', body: JSON.stringify(details) }));

  const resetPin = async (phone, code, pin) =>
    start(await api('/api/auth/pin/reset', { method: 'POST', body: JSON.stringify({ phone, code, pin }) }));

  const logout = () => {
    saveUser(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, register, resetPin, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const homePathFor = user => (user?.role === 'worker' ? '/jobs' : '/discover');

// Renders children only for a logged-in user; otherwise sends them to login.
export function RequireUser({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Renders children only for a logged-in user with the given role; otherwise
// sends them to login, or to their own role's home.
export function RequireRole({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homePathFor(user)} replace />;
  return children;
}
