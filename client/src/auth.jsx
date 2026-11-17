import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, onConsentRequired } from './api.js';
import { POLICY_VERSION } from './policy.shared.js';
import { loadSession, saveSession } from './session.js';

// The logged-in user and their signed session token, from POST /api/auth/login
// (phone + PIN), /register or /pin/reset. api.js sends the token on every call.
// needsConsent: the user hasn't agreed to the current Privacy Policy & Terms
// (an account from before consent was asked for, or after the policy
// changed); App.jsx shows the consent screen until giveConsent succeeds.
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

  // After the user changes their own details (Profile): same session, new user.
  const updateUser = next => {
    saveSession({ ...loadSession(), user: next });
    setUser(next);
  };

  // The server says consent is missing (the policy changed while logged in):
  // forget the stored consent so the consent screen shows.
  useEffect(() => onConsentRequired(() => {
    const session = loadSession();
    if (session?.user) updateUser({ ...session.user, policyVersion: null });
  }), []);

  const giveConsent = async () => {
    const { user: next } = await api('/api/auth/consent', {
      method: 'POST',
      body: JSON.stringify({ ageConfirmed: true, policyAccepted: true, policyVersion: POLICY_VERSION })
    });
    updateUser(next);
  };

  const needsConsent = Boolean(user) && !(user.policyVersion === POLICY_VERSION && user.ageConfirmed === true);

  const logout = () => {
    saveSession(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, register, resetPin, updateUser, logout, needsConsent, giveConsent }}>{children}</AuthContext.Provider>;
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
