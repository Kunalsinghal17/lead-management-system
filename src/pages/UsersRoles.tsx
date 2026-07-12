import React, { useEffect, useState } from "react";
import { BellRing, Check, Minus, UserPlus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Masters, NotificationRow, Role, UserRow } from "../lib/types";
import { formatDateTime } from "../lib/format";

/**
 * BRDID01 — Users & role/access matrix (Admin only) plus the
 * notification/escalation outbox (BRDID10) for auditability.
 */
export default function UsersRoles() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [masters, setMasters] = useState<Masters | null>(null);
  const [logs, setLogs] = useState<NotificationRow[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [u, m, n] = await Promise.all([api.users(), api.masters(), api.notifications()]);
    setUsers(u);
    setMasters(m);
    setLogs(n);
  };

  useEffect(() => { load().catch(() => {}); }, []);

  const runSweep = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.runNotificationSweep();
      setNotice(res.message);
      await load();
      window.setTimeout(() => setNotice(null), 5000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sweep failed.");
    } finally {
      setBusy(false);
    }
  };

  const roleChip = (role: Role) => {
    const styles: Record<Role, { bg: string; fg: string }> = {
      Admin: { bg: "#C6BDDD", fg: "#2C2561" },
      Manager: { bg: "#ECCAE0", fg: "#712B69" },
      Executive: { bg: "#D0E7DF", fg: "#195C4A" },
      Basic: { bg: "#DFDDDD", fg: "#333333" }
    };
    const s = styles[role];
    return (
      <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: s.bg, color: s.fg }}>
        {role}
      </span>
    );
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#333333]">Users & Roles</h1>
          <p className="text-sm text-[#808081]">
            Access is enforced at page, field and action level — the API validates every request
            independently of the UI.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-md bg-[#645BA8] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#2C2561]"
        >
          <UserPlus size={13} /> Add user
        </button>
      </div>

      {notice && (
        <div className="mb-4 rounded-md px-4 py-2.5 text-sm font-bold" style={{ backgroundColor: "#D0E7DF", color: "#195C4A" }}>
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md px-4 py-2.5 text-sm font-bold" style={{ backgroundColor: "#ECCAE0", color: "#55204F" }}>
          {error}
        </div>
      )}

      {/* Users */}
      <div className="mb-6 overflow-hidden rounded-lg border border-[#DFDDDD]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#DFDDDD] bg-opacity-30">
            <tr className="text-xs uppercase tracking-wide text-[#808081]">
              <th className="px-4 py-2.5 font-bold">Name</th>
              <th className="px-4 py-2.5 font-bold">Email</th>
              <th className="px-4 py-2.5 font-bold">Role</th>
              <th className="px-4 py-2.5 font-bold">Reports to</th>
              <th className="px-4 py-2.5 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-[#DFDDDD]">
                <td className="px-4 py-2.5 font-bold text-[#333333]">{u.fullName}</td>
                <td className="px-4 py-2.5 text-[#333333]">{u.email}</td>
                <td className="px-4 py-2.5">{roleChip(u.role)}</td>
                <td className="px-4 py-2.5 text-[#333333]">{u.managerName ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs font-bold" style={{ color: u.isActive ? "#2D7D3E" : "#808081" }}>
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role matrix */}
      {masters && (
        <div className="mb-6 rounded-lg border border-[#DFDDDD]">
          <div className="border-b border-[#DFDDDD] px-4 py-3 text-sm font-bold text-[#333333]">
            Role & access mapping (Master)
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[#808081]">
                <th className="px-4 py-2 font-bold">Action</th>
                {["Admin", "Manager", "Executive", "Basic"].map(r => (
                  <th key={r} className="px-4 py-2 text-center font-bold">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(masters.roleMatrix).map(([action, roles]) => (
                <tr key={action} className="border-t border-[#DFDDDD]">
                  <td className="px-4 py-2 font-bold text-[#333333]">{action}</td>
                  {["Admin", "Manager", "Executive", "Basic"].map(r => (
                    <td key={r} className="px-4 py-2 text-center">
                      {roles[r]
                        ? <Check size={15} className="mx-auto text-[#2D7D3E]" />
                        : <Minus size={15} className="mx-auto text-[#CAC8C7]" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notification outbox */}
      <div className="rounded-lg border border-[#DFDDDD]">
        <div className="flex items-center justify-between border-b border-[#DFDDDD] px-4 py-3">
          <div>
            <div className="text-sm font-bold text-[#333333]">Notifications & escalations</div>
            <div className="text-xs text-[#808081]">
              The system sweeps open leads daily at 6:00 PM IST — missed day updates, 5-day aging
              reminders, 10-day manager escalations.
            </div>
          </div>
          <button
            onClick={runSweep}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-[#C6BDDD] px-3 py-1.5 text-xs font-bold text-[#645BA8] hover:bg-[#C6BDDD] hover:bg-opacity-20 disabled:opacity-50"
          >
            <BellRing size={13} /> {busy ? "Running…" : "Run sweep now"}
          </button>
        </div>
        {logs.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[#808081]">
            No notifications yet. Run the sweep to evaluate all open leads against the follow-up rules.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-[#DFDDDD] bg-opacity-30">
              <tr className="uppercase tracking-wide text-[#808081]">
                <th className="px-4 py-2 font-bold">When</th>
                <th className="px-4 py-2 font-bold">Type</th>
                <th className="px-4 py-2 font-bold">To</th>
                <th className="px-4 py-2 font-bold">Subject</th>
                <th className="px-4 py-2 font-bold">Email</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 30).map(n => (
                <tr key={n.id} className="border-t border-[#DFDDDD]">
                  <td className="px-4 py-2 text-[#808081]">{formatDateTime(n.createdAtUtc)}</td>
                  <td className="px-4 py-2">
                    <span
                      className="rounded px-1.5 py-0.5 font-bold"
                      style={n.type === "Escalation"
                        ? { backgroundColor: "#ECCAE0", color: "#55204F" }
                        : n.type === "AgingReminder"
                          ? { backgroundColor: "#FBE5C3", color: "#725220" }
                          : { backgroundColor: "#D9E1E5", color: "#355462" }}
                    >
                      {n.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[#333333]">{n.toEmail}{n.ccEmail ? ` (cc ${n.ccEmail})` : ""}</td>
                  <td className="px-4 py-2 text-[#333333]">{n.subject}</td>
                  <td className="px-4 py-2 font-bold" style={{ color: n.emailSent ? "#2D7D3E" : "#808081" }}>
                    {n.emailSent ? "Sent" : "Outbox"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <AddUserModal
          users={users}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); load(); }}
        />
      )}
    </div>
  );
}

function AddUserModal({ users, onClose, onAdded }: {
  users: UserRow[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("Executive");
  const [managerId, setManagerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createUser(fullName, email, password, role, managerId ? Number(managerId) : null);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the user.");
      setBusy(false);
    }
  };

  const input = "w-full rounded-md border border-[#CAC8C7] px-3 py-2 text-sm outline-none focus:border-[#645BA8]";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button className="absolute inset-0" style={{ backgroundColor: "rgba(33, 28, 72, 0.45)" }} onClick={onClose} aria-label="Close" />
      <form onSubmit={submit} className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-bold text-[#333333]">Add user</h2>
        <p className="mb-4 text-xs text-[#808081]">
          The manager set here receives this user's 10-day escalations (BRDID10).
        </p>

        {error && (
          <div className="mb-3 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: "#ECCAE0", color: "#55204F" }}>
            {error}
          </div>
        )}

        <label className="mb-1 block text-xs font-bold text-[#333333]">Full name *</label>
        <input className={`${input} mb-3`} required maxLength={100} value={fullName} onChange={e => setFullName(e.target.value)} />

        <label className="mb-1 block text-xs font-bold text-[#333333]">Email *</label>
        <input className={`${input} mb-3`} required type="email" maxLength={150} value={email} onChange={e => setEmail(e.target.value)} />

        <label className="mb-1 block text-xs font-bold text-[#333333]">Password * (min 8 chars)</label>
        <input className={`${input} mb-3`} required type="password" minLength={8} maxLength={100} value={password} onChange={e => setPassword(e.target.value)} />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Role *</label>
            <select className={input} value={role} onChange={e => setRole(e.target.value as Role)}>
              {["Admin", "Manager", "Executive", "Basic"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Reports to</label>
            <select className={input} value={managerId} onChange={e => setManagerId(e.target.value)}>
              <option value="">None</option>
              {users.filter(u => u.role === "Manager" || u.role === "Admin").map(u => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-md border border-[#CAC8C7] px-4 py-2 text-sm font-bold text-[#333333] hover:bg-[#DFDDDD]">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="rounded-md bg-[#645BA8] px-4 py-2 text-sm font-bold text-white hover:bg-[#2C2561] disabled:opacity-50">
            {busy ? "Adding…" : "Add user"}
          </button>
        </div>
      </form>
    </div>
  );
}
