import { createContext, useContext, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from './api.js';
import { loadSession, saveSession } from './session.js';

// The logged-in user and their signed session token, from POST /api/auth/login
// (phone + PIN), /register or /pin/reset. api.js sends the token on every call.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => loadSession()?.user ?? null);

  const start = session => {
    saveSession(session);
    setUser(session.user);
    return session.user;
  };

  const login = async (phone, pin) =>
    start(await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone, pin }) }));

  const register = async details =>
    start(await api('/api/auth/register', { method: 'POST', body: JSON.stringify(details) }));

  const resetPin = async (phone, code, pin) =>
    start(await api('/api/auth/pin/reset', { method: 'POST', body: JSON.stringify({ phone, code, pin }) }));

  const logout = () => {
    saveSession(null);
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
