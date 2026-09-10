// src/context/AuthContext.jsx
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { setAuthToken, setOnUnauthorized } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Deliberately NOT persisted to localStorage -- a hard refresh logs the
  // user out in this prototype's security model. Only the device_id persists.
  const [session, setSession] = useState(null); // { token, role, name, email }

  const login = useCallback((data) => {
    setAuthToken(data.token);
    setSession(data);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setSession(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => logout());
  }, [logout]);

  return (
    <AuthContext.Provider value={{ session, login, logout, isAuthenticated: !!session }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
