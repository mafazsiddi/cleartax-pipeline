import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../api/client.js';

const K_SESSION = 'mira_session';
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { token, user }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(K_SESSION);
    if (stored) {
      try {
        setSession(JSON.parse(stored));
      } catch {
        localStorage.removeItem(K_SESSION);
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback((data) => {
    setSession(data);
    localStorage.setItem(K_SESSION, JSON.stringify(data));
  }, []);

  const dropSession = useCallback(() => {
    setSession(null);
    localStorage.removeItem(K_SESSION);
  }, []);

  const logout = useCallback(async () => {
    const token = session?.token;
    dropSession();
    if (token) {
      try {
        await apiFetch('/auth/logout', { method: 'POST', token });
      } catch {
        // best effort — session is already cleared client-side
      }
    }
  }, [session, dropSession]);

  // Wraps apiFetch with the current token and drops the session on 401.
  const request = useCallback(
    (path, opts = {}) => {
      const token = session?.token;
      // Once the session is gone, in-flight effects and polling ticks can still
      // fire a render or two before their components unmount. Sending those
      // without a token just earns a 401 and re-enters the branch below, so
      // fail them here instead of round-tripping to the server.
      if (!token) {
        const err = new Error('Not authenticated');
        err.status = 401;
        return Promise.reject(err);
      }
      return apiFetch(path, { ...opts, token }).catch((err) => {
        if (err.status === 401) dropSession();
        throw err;
      });
    },
    [session, dropSession]
  );

  return (
    <AuthCtx.Provider
      value={{
        session,
        user: session?.user || null,
        token: session?.token || null,
        loading,
        login,
        logout,
        request,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
