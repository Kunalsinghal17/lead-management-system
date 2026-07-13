import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Sparkles, Users, Inbox, CloudUpload, Globe,
  ShieldCheck, LogOut, CircleUserRound, Radio
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, apiMode, DATA_CHANGED_EVENT } from "../lib/api";
import NexdigmLogo from "./NexdigmLogo";

/**
 * App shell — deep-purple brand sidebar (Nexdigm Purple Shade 2 #211C48)
 * with a magenta active marker; white working canvas.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [poolCount, setPoolCount] = useState<number>(0);
  const [mode, setMode] = useState<"live" | "mock" | null>(null);

  useEffect(() => {
    apiMode().then(setMode);
    let alive = true;
    const refresh = () =>
      api.listLeads({ view: "pool" }).then(l => { if (alive) setPoolCount(l.length); }).catch(() => {});
    refresh();
    // Instant refresh on any mutation (assignment, creation, upload, ...) +
    // a slow poll as a safety net for changes made by other users.
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    const t = window.setInterval(refresh, 30_000);
    return () => {
      alive = false;
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      window.clearInterval(t);
    };
  }, []);

  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/ask-ai", label: "Ask AI", icon: Sparkles },
    { to: "/leads", label: "Leads", icon: Users },
    { to: "/central-pool", label: "Central Pool", icon: Inbox, badge: poolCount || undefined },
    ...(can("bulkUpload") ? [{ to: "/bulk-upload", label: "Bulk Upload", icon: CloudUpload }] : [])
  ];
  const insightNav = [{ to: "/visitor-analytics", label: "Visitor Analytics", icon: Globe }];
  const systemNav = user?.role === "Admin"
    ? [{ to: "/users-roles", label: "Users & Roles", icon: ShieldCheck }]
    : [];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
      isActive ? "bg-[#2C2561] text-white font-bold" : "text-[#C6BDDD] hover:bg-[#2C2561] hover:text-white"
    }`;

  const section = (label: string) => (
    <div className="mt-5 mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[#776DA7]">
      {label}
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col bg-[#211C48]">
        <div className="px-4 py-5">
          <NexdigmLogo height={24} onDark />
          <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9F91C6]">
            Lead Management System
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {section("Platform")}
          {nav.map(item => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.icon size={16} strokeWidth={2} />
              <span className="flex-1">{item.label}</span>
              {"badge" in item && item.badge ? (
                <span className="rounded-full bg-[#C86AA9] px-1.5 text-[11px] font-bold text-white">
                  {item.badge}
                </span>
              ) : null}
            </NavLink>
          ))}

          {section("Insights")}
          {insightNav.map(item => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.icon size={16} strokeWidth={2} />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {systemNav.length > 0 && (
            <>
              {section("System")}
              {systemNav.map(item => (
                <NavLink key={item.to} to={item.to} className={linkClass}>
                  <item.icon size={16} strokeWidth={2} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Demo-data banner when API is not reachable */}
        {mode === "mock" && (
          <div className="mx-3 mb-3 rounded-md bg-[#2C2561] px-3 py-2 text-[11px] text-[#DFA6CC]">
            <div className="flex items-center gap-2">
              <Radio size={13} />
              Preview mode — demo data (API offline)
            </div>
            <div className="mt-1 text-[10px] text-[#9F91C6]">
              Changes persist in this browser.{" "}
              <button
                onClick={() => api.resetDemoData()}
                className="font-bold text-[#DFA6CC] underline hover:text-white"
              >
                Reset demo data
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-[#2C2561] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <CircleUserRound size={26} className="text-[#9F91C6]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-white">{user?.fullName}</div>
              <div className="truncate text-[11px] text-[#9F91C6]">{user?.role}</div>
            </div>
            <button
              onClick={() => { logout(); navigate("/"); }}
              title="Sign out"
              className="rounded p-1.5 text-[#9F91C6] hover:bg-[#2C2561] hover:text-white"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main canvas */}
      <main className="flex-1 overflow-y-auto bg-white">
        <div className="mx-auto max-w-[1200px] px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
