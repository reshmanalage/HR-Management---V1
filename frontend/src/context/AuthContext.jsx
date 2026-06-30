import { createContext, useContext, useState } from "react";
import {
  getAccessToken,
  setAccessToken,
  setRefreshToken,
  getRefreshToken,
  clearAccessToken,
} from "../utils/tokenStorage";
import { logout as logoutRequest } from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getAccessToken()));
  const [user, setUser] = useState(null);

  function login({ access_token, refresh_token }) {
    setAccessToken(access_token);
    setRefreshToken(refresh_token);
    setIsAuthenticated(true);
  }

  async function logout() {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await logoutRequest(refreshToken);
      } catch {
        // token may already be invalid/expired - proceed with local cleanup regardless
      }
    }
    clearAccessToken();
    setUser(null);
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, setUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
