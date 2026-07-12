import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SessionUser } from "./types";
import { api } from "./api";

/**
 * Session management (BRDID01 + security controls):
 *  - JWT kept in sessionStorage (cleared when browser closes; not a cookie)
 *  - automatic logout after a period of inactivity (session timeout)
 *  - role available app-wide for page/field/action-level access control
 */
interface AuthContextValue {
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (action: PermissionAction) => boolean;
}

export type PermissionAction =
  | "export"
  | "delete"
  | "addUser"
  | "reassign"
  | "createLead"
  | "bulkUpload";

const PERMISSIONS: Record<PermissionAction, string[]> = {
  export: ["Admin", "Manager"],
  delete: ["Admin"],
  addUser: ["Admin"],
  reassign: ["Admin", "Manager"],
  createLead: ["Admin", "Manager", "Executive"],
  bulkUpload: ["Admin", "Manager", "Executive"]
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => {
    const raw = sessionStorage.getItem("lms.session");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as SessionUser;
      if (new Date(parsed.expiresUtc).getTime() < Date.now()) return null;
      return parsed;
    } catch {
      return null;
    }
  });

  const logout = useCallback(() => {
    sessionStorage.removeItem("lms.session");
    setUser(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.login(email, password);
    sessionStorage.setItem("lms.session", JSON.stringify(session));
    setUser(session);
  }, []);

  // Idle timeout — re-login required after inactivity
  useEffect(() => {
    if (!user) return;
    const timeoutMs = (user.idleTimeoutMinutes || 30) * 60_000;
    let timer = window.setTimeout(logout, timeoutMs);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(logout, timeoutMs);
    };
    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [user, logout]);

  const can = useCallback(
    (action: PermissionAction) => !!user && PERMISSIONS[action].includes(user.role),
    [user]
  );

  const value = useMemo(() => ({ user, login, logout, can }), [user, login, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
