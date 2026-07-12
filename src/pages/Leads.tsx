import React, { useEffect, useMemo, useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { api } from "../lib/api";
import { Lead, LeadFilters, Masters, UserRow } from "../lib/types";
import { formatInr, ageLabel } from "../lib/format";
import { MailTypeBadge, ScorePill, SourceBadge, StageBadge, StatusBadge } from "../components/Badges";
import LeadDrawer from "../components/LeadDrawer";
import { scoreLead } from "../lib/scoring";
import { useAuth } from "../lib/auth";

type Tab = "all" | "my" | "notlead";

/** BRDID11 — Lead Tracker: the master view of every lead. */
export default function Leads() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [masters, setMasters] = useState<Masters | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [status, setStatus] = useState("");
  const [industry, setIndustry] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [source, setSource] = useState("");
  const [openLead, setOpenLead] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const filters: LeadFilters = useMemo(() => ({
    view: tab,
    search: search || undefined,
    stage: stage || undefined,
    status: status || undefined,
    industry: industry || undefined,
    source: source || undefined,
    ownerId: ownerId ? Number(ownerId) : undefined
  }), [tab, search, stage, status, industry, source, ownerId]);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.listLeads(filters);
      setLeads(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.masters().then(setMasters).catch(() => {});
    api.users().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    const t = window.setTimeout(load, search ? 250 : 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const select = "rounded-md border border-[#CAC8C7] px-2 py-1.5 text-xs outline-none focus:border-[#645BA8]";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#333333]">Lead Tracker</h1>
          <p className="text-sm text-[#808081]">
            The master view of every lead — ownership, lifecycle, status and daily follow-ups.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can("export") && (
            <button
              onClick={() => api.exportLeads(tab)}
              className="flex items-center gap-1.5 rounded-md border border-[#CAC8C7] px-3 py-1.5 text-xs font-bold text-[#333333] hover:bg-[#DFDDDD] hover:bg-opacity-40"
            >
              <Download size={13} /> Export CSV
            </button>
          )}
          {can("createLead") && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-md bg-[#645BA8] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#2C2561]"
            >
              <Plus size={13} /> Create lead
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-[#DFDDDD]">
        {([["all", "All Leads"], ["my", "My Leads"], ["notlead", "Not Lead Pool"]] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold transition-colors ${
              tab === key
                ? "border-[#645BA8] text-[#645BA8]"
                : "border-transparent text-[#808081] hover:text-[#333333]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#808081]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, lead ID, report…"
            className="w-64 rounded-md border border-[#CAC8C7] py-1.5 pl-8 pr-3 text-xs outline-none focus:border-[#645BA8]"
          />
        </div>
        <select className={select} value={stage} onChange={e => setStage(e.target.value)}>
          <option value="">Stage — all</option>
          {masters?.stages.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={select} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Status — all</option>
          {["Open", "Won", "Lost", "Closed"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={select} value={industry} onChange={e => setIndustry(e.target.value)}>
          <option value="">Industry — all</option>
          {masters?.industries.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <select className={select} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
          <option value="">Owner — all</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
        <select className={select} value={source} onChange={e => setSource(e.target.value)}>
          <option value="">Source — all</option>
          <option value="Website">Website</option>
          <option value="Manual">Manual</option>
          <option value="BulkUpload">Bulk Upload</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[#DFDDDD]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#DFDDDD] bg-opacity-30">
            <tr className="text-xs uppercase tracking-wide text-[#808081]">
              <th className="px-4 py-2.5 font-bold">Lead ID</th>
              <th className="px-4 py-2.5 font-bold">Enquiry</th>
              <th className="px-4 py-2.5 font-bold">Industry</th>
              <th className="px-4 py-2.5 font-bold">Score</th>
              <th className="px-4 py-2.5 font-bold">Source · CTA</th>
              <th className="px-4 py-2.5 font-bold">Stage</th>
              <th className="px-4 py-2.5 font-bold">Status</th>
              <th className="px-4 py-2.5 font-bold">Owner</th>
              <th className="px-4 py-2.5 font-bold">Age</th>
              <th className="px-4 py-2.5 text-right font-bold">Value</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-[#808081]">Loading leads…</td></tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-[#808081]">
                  No leads match these filters. Adjust the filters or create a lead to get started.
                </td>
              </tr>
            ) : (
              leads.map(l => {
                const sc = scoreLead(l);
                return (
                  <tr
                    key={l.id}
                    onClick={() => setOpenLead(l.id)}
                    className="cursor-pointer border-t border-[#DFDDDD] hover:bg-[#C6BDDD] hover:bg-opacity-10"
                  >
                    <td className="px-4 py-3 text-xs font-bold text-[#645BA8]">{l.leadCode}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#333333]">{l.name}</div>
                      <div className="flex items-center gap-2 text-xs text-[#808081]">
                        {l.email} <MailTypeBadge type={l.mailType} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#333333]">{l.industry ?? "—"}</td>
                    <td className="px-4 py-3">
                      {l.status === "Open" ? <ScorePill score={sc.score} label={sc.label} /> : <span className="text-xs text-[#808081]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#333333]">
                      <SourceBadge source={l.source} />
                      <div className="text-[#808081]">{l.cta ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3"><StageBadge stage={l.stage} /></td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-4 py-3 text-[#333333]">
                      {l.assignedToName ?? <span className="italic text-[#808081]">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-[#333333]">{ageLabel(l.ageDays)}</td>
                    <td className="px-4 py-3 text-right text-[#333333]">{formatInr(l.valueInr)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-[#808081]">Showing {leads.length} leads</div>

      {openLead !== null && masters && (
        <LeadDrawer
          leadId={openLead}
          masters={masters}
          users={users}
          onClose={() => setOpenLead(null)}
          onChanged={load}
        />
      )}

      {showCreate && masters && (
        <CreateLeadModal
          masters={masters}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ create modal (BRDID03 manual creation)

function CreateLeadModal({ masters, onClose, onCreated }: {
  masters: Masters;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", countryCode: "+91", industry: "",
    reportCode: "", reportTitle: "", cta: "", details: "", valueInr: "", remarks: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createLead({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        countryCode: form.countryCode || undefined,
        industry: form.industry || undefined,
        reportCode: form.reportCode || undefined,
        reportTitle: form.reportTitle || undefined,
        cta: form.cta || undefined,
        details: form.details || undefined,
        valueInr: form.valueInr ? Number(form.valueInr) : undefined,
        remarks: form.remarks || undefined
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the lead.");
      setBusy(false);
    }
  };

  const input = "w-full rounded-md border border-[#CAC8C7] px-3 py-2 text-sm outline-none focus:border-[#645BA8]";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button className="absolute inset-0" style={{ backgroundColor: "rgba(33, 28, 72, 0.45)" }} onClick={onClose} aria-label="Close" />
      <form onSubmit={submit} className="relative z-10 w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-[#333333]">Create lead</h2>
        <p className="mb-4 text-xs text-[#808081]">
          Manual creation follows the same schema and defaults as auto-ingested leads (BRDID03).
          New leads start unassigned in the central pool.
        </p>

        {error && (
          <div className="mb-3 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: "#ECCAE0", color: "#55204F" }}>
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs font-bold text-[#333333]">Name *</label>
            <input className={input} required maxLength={150} value={form.name} onChange={set("name")} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs font-bold text-[#333333]">Email *</label>
            <input className={input} required type="email" maxLength={150} value={form.email} onChange={set("email")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Country code</label>
            <input className={input} maxLength={5} value={form.countryCode} onChange={set("countryCode")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Phone</label>
            <input className={input} maxLength={15} value={form.phone} onChange={set("phone")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Industry</label>
            <select className={input} value={form.industry} onChange={set("industry")}>
              <option value="">Select…</option>
              {masters.industries.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">CTA</label>
            <select className={input} value={form.cta} onChange={set("cta")}>
              <option value="">Select…</option>
              {["Download Report", "Request Sample", "Contact Sales", "Subscribe"].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Report code</label>
            <input className={input} maxLength={50} value={form.reportCode} onChange={set("reportCode")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Value (INR)</label>
            <input className={input} type="number" min={0} value={form.valueInr} onChange={set("valueInr")} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-bold text-[#333333]">Report title</label>
            <input className={input} maxLength={300} value={form.reportTitle} onChange={set("reportTitle")} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-bold text-[#333333]">Details / requirement</label>
            <textarea className={`${input} min-h-[60px]`} maxLength={2000} value={form.details} onChange={set("details")} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-md border border-[#CAC8C7] px-4 py-2 text-sm font-bold text-[#333333] hover:bg-[#DFDDDD]">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="rounded-md bg-[#645BA8] px-4 py-2 text-sm font-bold text-white hover:bg-[#2C2561] disabled:opacity-50">
            {busy ? "Creating…" : "Create lead"}
          </button>
        </div>
      </form>
    </div>
  );
}
