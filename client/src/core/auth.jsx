import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const refresh = useCallback(async () => {
    if (!getToken()) { setMe(null); setLoading(false); return null; }
    try {
      const { data } = await api('/auth/me');
      setMe(data);
      return data;
    } catch {
      setToken(null); setMe(null); return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    return refresh();
  };
  const logout = () => { setToken(null); setMe(null); };
  const setUnread = (n) => setMe((m) => (m ? { ...m, unread: n } : m));
  const hasFeature = (code) => !code || Boolean(me?.features?.includes(code));
  const can = (...perms) => !perms.filter(Boolean).length || Boolean(me?.user?.is_org_owner || perms.some((p) => me?.permissions?.includes(p)));

  return <AuthContext.Provider value={{ me, loading, login, logout, refresh, setUnread, hasFeature, can }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
