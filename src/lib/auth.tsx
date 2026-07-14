import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PermissionMatrix, SessionUser } from "./types";
import { api } from "./api";

/**
 * Session management (+ security controls):
 *  - JWT kept in sessionStorage (cleared when browser closes; not a cookie)
 *  - automatic logout after a period of inactivity (session timeout)
 *  - live, editable permission matrix drives page/field/action-level access.
 *    The API re-validates every request, so the UI can never over-grant.
 */
interface AuthContextValue {
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (action: PermissionAction) => boolean;
  refreshPermissions: () => Promise<void>;
}

export type PermissionAction =
  | "export"
  | "delete"
  | "addUser"
  | "reassign"
  | "createLead"
  | "bulkUpload"
  | "ownLeads"
  | "pageDashboard"
  | "pageAskAI"
  | "pageLeads"
  | "pageCentralPool"
  | "pageBulkUpload"
  | "pageVisitorAnalytics"
  | "pageUsersRoles";

/** UI action → matrix action key (as stored in the DB / mock). */
const ACTION_KEYS: Record<PermissionAction, string> = {
  export: "Export",
  delete: "DeleteLead",
  addUser: "AddUser",
  reassign: "Reassign",
  createLead: "CreateLead",
  bulkUpload: "BulkUpload",
  ownLeads: "OwnLeads",
  pageDashboard: "PageDashboard",
  pageAskAI: "PageAskAI",
  pageLeads: "PageLeads",
  pageCentralPool: "PageCentralPool",
  pageBulkUpload: "PageBulkUpload",
  pageVisitorAnalytics: "PageVisitorAnalytics",
  pageUsersRoles: "PageUsersRoles"
};

/** Fallbacks while the matrix loads (BRD Role Master defaults). */
const DEFAULTS: Record<PermissionAction, string[]> = {
  export: ["Admin", "Manager"],
  delete: ["Admin"],
  addUser: ["Admin"],
  reassign: ["Admin", "Manager"],
  createLead: ["Admin", "Manager", "Executive"],
  bulkUpload: ["Admin", "Manager", "Executive"],
  ownLeads: ["Executive"],
  pageDashboard: ["Admin", "Manager", "Executive", "Basic"],
  pageAskAI: ["Admin", "Manager", "Executive", "Basic"],
  pageLeads: ["Admin", "Manager", "Executive", "Basic"],
  pageCentralPool: ["Admin", "Manager", "Executive", "Basic"],
  pageBulkUpload: ["Admin", "Manager", "Executive"],
  pageVisitorAnalytics: ["Admin", "Manager", "Executive"],
  pageUsersRoles: ["Admin"]
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

  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);

  const logout = useCallback(() => {
    sessionStorage.removeItem("lms.session");
    setUser(null);
    setMatrix(null);
  }, []);

  const refreshPermissions = useCallback(async () => {
    try {
      setMatrix(await api.permissions());
    } catch {
      // keep defaults on failure
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.login(email, password);
    sessionStorage.setItem("lms.session", JSON.stringify(session));
    setUser(session);
  }, []);

  // Load the live permission matrix once signed in, keep it fresh on every
  // data change and on a slow poll — so Admin edits apply to running sessions
  // without a re-login.
  useEffect(() => {
    if (!user) return;
    refreshPermissions();
    const onChange = () => refreshPermissions();
    window.addEventListener("lms:data-changed", onChange);
    const t = window.setInterval(refreshPermissions, 60_000);
    return () => {
      window.removeEventListener("lms:data-changed", onChange);
      window.clearInterval(t);
    };
  }, [user, refreshPermissions]);

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
    (action: PermissionAction) => {
      if (!user) return false;
      const key = ACTION_KEYS[action];
      if (matrix && matrix[key]) return !!matrix[key][user.role];
      return DEFAULTS[action].includes(user.role);
    },
    [user, matrix]
  );

  const value = useMemo(
    () => ({ user, login, logout, can, refreshPermissions }),
    [user, login, logout, can, refreshPermissions]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
