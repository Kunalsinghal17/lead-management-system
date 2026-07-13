import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Bell, LayoutDashboard, Sparkles, Users, Inbox, CloudUpload, Globe,
  Search, ShieldCheck, LogOut, CircleUserRound, Radio
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, apiMode, DATA_CHANGED_EVENT } from "../lib/api";
import { NotificationRow } from "../lib/types";
import { formatDateTime } from "../lib/format";
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
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [seenNewest, setSeenNewest] = useState<string>("");
  const [topSearch, setTopSearch] = useState("");
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiMode().then(setMode);
    let alive = true;
    const refresh = () => {
      api.listLeads({ view: "pool" }).then(l => { if (alive) setPoolCount(l.length); }).catch(() => {});
      api.notifications().then(n => { if (alive) setNotifs(n); }).catch(() => {});
    };
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

  // Close the bell dropdown on outside click
  useEffect(() => {
    if (!bellOpen) return;
    const close = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [bellOpen]);

  const hasUnread = notifs.length > 0 && notifs[0].createdAtUtc !== seenNewest;

  const notifTypeStyle = (type: string) =>
    type === "Escalation"
      ? { backgroundColor: "#ECCAE0", color: "#55204F" }
      : type === "AgingReminder"
        ? { backgroundColor: "#FBE5C3", color: "#725220" }
        : { backgroundColor: "#D9E1E5", color: "#355462" };

  // Navigation driven by the editable page-access matrix (BRD: page-level access rights)
  const nav = [
    ...(can("pageDashboard") ? [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] : []),
    ...(can("pageAskAI") ? [{ to: "/ask-ai", label: "Ask AI", icon: Sparkles }] : []),
    ...(can("pageLeads") ? [{ to: "/leads", label: "Leads", icon: Users }] : []),
    ...(can("pageCentralPool")
      ? [{ to: "/central-pool", label: "Central Pool", icon: Inbox, badge: poolCount || undefined }]
      : []),
    ...(can("pageBulkUpload") ? [{ to: "/bulk-upload", label: "Bulk Upload", icon: CloudUpload }] : [])
  ];
  const insightNav = can("pageVisitorAnalytics")
    ? [{ to: "/visitor-analytics", label: "Visitor Analytics", icon: Globe }]
    : [];
  const systemNav = can("pageUsersRoles")
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

          {insightNav.length > 0 && (
            <>
              {section("Insights")}
              {insightNav.map(item => (
                <NavLink key={item.to} to={item.to} className={linkClass}>
                  <item.icon size={16} strokeWidth={2} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </>
          )}

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
      <main className="flex flex-1 flex-col overflow-hidden bg-white">
        {/* Top bar: plain-English search + notification bell */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-b border-[#DFDDDD] px-6 py-2.5">
          <form
            className="relative flex items-center"
            onSubmit={e => {
              e.preventDefault();
              if (topSearch.trim()) {
                navigate("/ask-ai", { state: { q: topSearch.trim() } });
                setTopSearch("");
              }
            }}
          >
            <Search size={13} className="absolute left-2.5 text-[#808081]" />
            <input
              value={topSearch}
              onChange={e => setTopSearch(e.target.value)}
              placeholder="Ask about leads, pipeline, visitors…"
              className="w-64 rounded-md border border-[#DFDDDD] bg-[#DFDDDD] bg-opacity-30 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-[#645BA8] focus:bg-white"
            />
          </form>

          <div className="relative" ref={bellRef}>
            <button
              onClick={() => {
                setBellOpen(o => !o);
                if (notifs.length > 0) setSeenNewest(notifs[0].createdAtUtc);
              }}
              className="relative rounded-md p-2 text-[#808081] hover:bg-[#DFDDDD] hover:bg-opacity-40 hover:text-[#333333]"
              aria-label="Notifications"
            >
              <Bell size={16} />
              {hasUnread && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#C86AA9]" />
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-96 rounded-lg border border-[#DFDDDD] bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-[#DFDDDD] px-4 py-2.5">
                  <span className="text-xs font-bold text-[#333333]">Notifications</span>
                  <span className="text-[10px] text-[#808081]">
                    {user?.role === "Admin" || user?.role === "Manager" ? "All users" : "Addressed to you"}
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-[#808081]">
                      Nothing yet. Reminders and escalations appear here after the daily 6 PM sweep.
                    </div>
                  ) : (
                    notifs.slice(0, 12).map(n => (
                      <div key={n.id} className="border-b border-[#DFDDDD] px-4 py-2.5 last:border-b-0">
                        <div className="mb-0.5 flex items-center justify-between gap-2">
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={notifTypeStyle(n.type)}>
                            {n.type === "MissingDayUpdate" ? "Missing update" :
                             n.type === "AgingReminder" ? "Aging" : n.type}
                          </span>
                          <span className="shrink-0 text-[10px] text-[#808081]">{formatDateTime(n.createdAtUtc)}</span>
                        </div>
                        <div className="truncate text-xs text-[#333333]" title={n.subject}>{n.subject}</div>
                        <div className="text-[10px] text-[#808081]">to {n.toEmail}{n.ccEmail ? ` · cc ${n.ccEmail}` : ""}</div>
                      </div>
                    ))
                  )}
                </div>
                {user?.role === "Admin" && (
                  <button
                    onClick={() => { setBellOpen(false); navigate("/users-roles"); }}
                    className="w-full border-t border-[#DFDDDD] px-4 py-2 text-left text-[11px] font-bold text-[#645BA8] hover:bg-[#DFDDDD] hover:bg-opacity-30"
                  >
                    View full outbox →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1200px] px-6 py-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
