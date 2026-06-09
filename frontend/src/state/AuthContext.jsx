// imports 
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "../lib/api.js";

// create context

const AuthContext = createContext(null);

// auth provider function 

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
//
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    api("/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(payload) {
    setToken(null);
    const data = await api("/auth/login", {
      method: "POST",
      body: { email: payload.email.trim().toLowerCase(), password: payload.password }
    });
    setToken(data.token);
    setUser(data.user);
  }

  async function signup(payload) {
    setToken(null);
    const data = await api("/auth/signup", {
      method: "POST",
      body: {
        name: payload.name.trim(),
        email: payload.email.trim().toLowerCase(),
        password: payload.password,
        confirmPassword: payload.confirmPassword
      }
    });
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  const value = useMemo(() => ({ user, loading, login, signup, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
