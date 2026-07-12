import React, { useEffect, useState } from "react";
import { Hand, Users } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Lead, UserRow } from "../lib/types";
import { formatDateTime } from "../lib/format";
import { MailTypeBadge, SourceBadge } from "../components/Badges";
import { useAuth } from "../lib/auth";

/**
 * BRDID04 — Central Pool. New leads are visible to all eligible users and
 * unassigned; any user can pick a lead for themselves (single active owner).
 * Admin/Manager can hand a lead to anyone.
 */
export default function CentralPool() {
  const { user, can } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [pool, u] = await Promise.all([api.listLeads({ view: "pool" }), api.users()]);
      setLeads(pool);
      setUsers(u.filter(x => x.isActive));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load().catch(() => {}); }, []);

  const assign = async (leadId: number, userId: number, label: string) => {
    setError(null);
    setBusyId(leadId);
    try {
      await api.assignLead(leadId, userId);
      setNotice(`Lead assigned to ${label}.`);
      window.setTimeout(() => setNotice(null), 3000);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Assignment failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#333333]">Central Pool</h1>
        <p className="text-sm text-[#808081]">
          Fresh, unowned enquiries. Pick a lead to become its single active handler — ownership
          drives day-wise follow-ups, reminders and escalations.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md px-4 py-2.5 text-sm font-bold" style={{ backgroundColor: "#ECCAE0", color: "#55204F" }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md px-4 py-2.5 text-sm font-bold" style={{ backgroundColor: "#D0E7DF", color: "#195C4A" }}>
          {notice}
        </div>
      )}

      {loading ? (
        <div className="py-24 text-center text-sm text-[#808081]">Loading pool…</div>
      ) : leads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#CAC8C7] p-16 text-center">
          <Users className="mx-auto mb-3 text-[#9F91C6]" size={32} />
          <div className="font-bold text-[#333333]">The pool is clear</div>
          <p className="mt-1 text-sm text-[#808081]">
            Every enquiry has an owner. New website enquiries land here automatically via MarketRAdmin.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {leads.map(l => (
            <div key={l.id} className="rounded-lg border border-[#DFDDDD] p-4 transition-shadow hover:shadow-md">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-bold text-[#645BA8]">{l.leadCode}</span>
                <span className="text-[11px] text-[#808081]">{formatDateTime(l.submittedAtUtc)}</span>
              </div>
              <div className="font-bold text-[#333333]">{l.name}</div>
              <div className="mb-1 flex items-center gap-2 text-xs text-[#808081]">
                {l.email} <MailTypeBadge type={l.mailType} />
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#333333]">
                <span>{l.industry ?? "—"}</span>
                <SourceBadge source={l.source} />
                <span className="text-[#808081]">{l.cta ?? ""}</span>
                {l.reportTitle && <span className="w-full truncate text-[#808081]">{l.reportTitle}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => assign(l.id, user!.userId, "you")}
                  disabled={busyId === l.id}
                  className="flex items-center gap-1.5 rounded-md bg-[#645BA8] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#2C2561] disabled:opacity-50"
                >
                  <Hand size={13} /> Pick this lead
                </button>
                {can("reassign") && (
                  <select
                    className="rounded-md border border-[#CAC8C7] px-2 py-1.5 text-xs outline-none focus:border-[#645BA8]"
                    defaultValue=""
                    disabled={busyId === l.id}
                    onChange={e => {
                      const uid = Number(e.target.value);
                      const target = users.find(x => x.id === uid);
                      if (uid && target) assign(l.id, uid, target.fullName);
                    }}
                  >
                    <option value="" disabled>Assign to…</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
