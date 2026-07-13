import React, { useEffect, useMemo, useState } from "react";
import { X, Sparkles, Copy, Check, Trash2, Lock } from "lucide-react";
import { Lead, Masters, NEXT_STAGES, Stage, UserRow, isFinalStatus } from "../lib/types";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime, formatInrFull } from "../lib/format";
import { scoreLead, draftFollowUpEmail } from "../lib/scoring";
import { MailTypeBadge, ScorePill, StageBadge, StatusBadge } from "./Badges";

interface Props {
  leadId: number;
  masters: Masters;
  users: UserRow[];
  onClose: () => void;
  onChanged: () => void;
}

export default function LeadDrawer({ leadId, masters, users, onClose, onChanged }: Props) {
  const { user, can } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [assignable, setAssignable] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Editable manual fields (BRDID11: auto fields stay read-only)
  const [enquiryType, setEnquiryType] = useState("");
  const [leadType, setLeadType] = useState("");
  const [stage, setStage] = useState<Stage>("Enquiry");
  const [status, setStatus] = useState("Open");
  const [valueInr, setValueInr] = useState<string>("");
  const [lostReason, setLostReason] = useState("");
  const [lostOther, setLostOther] = useState("");
  const [remarks, setRemarks] = useState("");
  const [dayNotes, setDayNotes] = useState<Record<number, string>>({});
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const l = await api.getLead(leadId);
    setLead(l);
    setEnquiryType(l.enquiryType === "Unclassified" ? "" : l.enquiryType);
    setLeadType(l.leadType === "Unspecified" ? "" : l.leadType);
    setStage(l.stage);
    setStatus(l.status === "Closed" ? "Closed" : l.status);
    setValueInr(l.valueInr != null ? String(l.valueInr) : "");
    setLostReason(l.lostReason ?? "");
    setLostOther(l.lostReasonOther ?? "");
    setRemarks(l.remarks ?? "");
    const notes: Record<number, string> = {};
    l.dayUpdates.forEach(d => { notes[d.dayNumber] = d.note; });
    setDayNotes(notes);
  };

  useEffect(() => {
    load().catch(e => setError(e instanceof Error ? e.message : "Failed to load lead."));
    // Assignment targets = users whose role can own leads (default: Executives)
    api.assignableUsers().then(setAssignable).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const score = useMemo(() => (lead ? scoreLead(lead) : null), [lead]);
  const classified = !!lead && lead.enquiryType !== "Unclassified";
  const isOwner = !!lead && lead.assignedToUserId === user?.userId;
  const elevated = user?.role === "Admin" || user?.role === "Manager";
  const canEdit = isOwner || elevated;
  const finalized = !!lead && isFinalStatus(lead.status);
  const stageOptions: Stage[] = lead ? [lead.stage, ...NEXT_STAGES[lead.stage]] : ["Enquiry"];
  const showLostReason = status === "Lost" || stage === "Lost";

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong.");

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3000);
  };

  const assign = async (targetUserId: number) => {
    setError(null);
    setBusy(true);
    try {
      await api.assignLead(leadId, targetUserId);
      await load();
      onChanged();
      flash("Owner updated.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!lead) return;
    setError(null);

    // BRDID09 client-side guard (server enforces too)
    if (showLostReason && !lostReason) {
      setError("Lost Reason is mandatory when marking a lead as Lost (BRDID09).");
      return;
    }
    if (showLostReason && lostReason === "Other" && !lostOther.trim()) {
      setError("Please describe the reason when 'Other' is selected.");
      return;
    }

    const payload: import("../lib/types").UpdateLeadPayload = {};
    if (enquiryType && enquiryType !== lead.enquiryType) payload.enquiryType = enquiryType;
    if (leadType && leadType !== lead.leadType) payload.leadType = leadType;
    if (stage !== lead.stage) payload.stage = stage;
    if (status !== lead.status && status !== "Closed") payload.status = status;
    if (showLostReason && lostReason) {
      payload.lostReason = lostReason;
      if (lostOther.trim()) payload.lostReasonOther = lostOther.trim();
    }
    const valueNum = valueInr.trim() === "" ? null : Number(valueInr);
    if (valueNum !== (lead.valueInr ?? null) && !(valueNum !== null && isNaN(valueNum))) {
      payload.valueInr = valueNum;
    }
    if (remarks !== (lead.remarks ?? "")) payload.remarks = remarks;

    if (Object.keys(payload).length === 0) {
      flash("Nothing to save.");
      return;
    }

    setBusy(true);
    try {
      await api.updateLead(leadId, payload);
      await load();
      onChanged();
      flash("Changes saved.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const saveDay = async (dayNumber: number) => {
    const note = (dayNotes[dayNumber] ?? "").trim();
    if (!note) return;
    setError(null);
    setBusy(true);
    try {
      await api.addDayUpdate(leadId, dayNumber, note);
      await load();
      onChanged();
      flash(`Day ${dayNumber} update saved.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Mark this lead inactive? It will disappear from all lists.")) return;
    setBusy(true);
    try {
      await api.deleteLead(leadId);
      onChanged();
      onClose();
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  };

  const makeDraft = () => lead && setDraft(draftFollowUpEmail(lead));

  const copyDraft = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (!lead) {
    return (
      <Overlay onClose={onClose}>
        <div className="p-10 text-center text-sm text-[#808081]">{error ?? "Loading lead…"}</div>
      </Overlay>
    );
  }

  const sectionTitle = (t: string, hint?: string) => (
    <div className="mb-2 mt-6 flex items-center justify-between">
      <h3 className="text-xs font-bold uppercase tracking-wide text-[#808081]">{t}</h3>
      {hint && <span className="flex items-center gap-1 text-[11px] text-[#808081]"><Lock size={11} /> {hint}</span>}
    </div>
  );

  const input =
    "w-full rounded-md border border-[#CAC8C7] px-3 py-2 text-sm outline-none focus:border-[#645BA8] disabled:bg-[#DFDDDD] disabled:bg-opacity-40 disabled:text-[#808081]";

  return (
    <Overlay onClose={onClose}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[#DFDDDD] bg-white px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#808081]">
              <span className="font-bold text-[#645BA8]">{lead.leadCode}</span>
              <span>·</span>
              <span>{lead.enquiryType === "Unclassified" ? "Unclassified" : lead.enquiryType === "NotLead" ? "Not Lead" : "Lead"}</span>
            </div>
            <h2 className="mt-0.5 text-lg font-bold text-[#333333]">{lead.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StageBadge stage={lead.stage} />
              <StatusBadge status={lead.status} />
              <MailTypeBadge type={lead.mailType} />
              {score && <ScorePill score={score.score} label={score.label} />}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {can("delete") && (
              <button onClick={remove} title="Delete / inactivate (Admin)" className="rounded p-2 text-[#808081] hover:bg-[#ECCAE0] hover:text-[#55204F]">
                <Trash2 size={16} />
              </button>
            )}
            <button onClick={onClose} className="rounded p-2 text-[#808081] hover:bg-[#DFDDDD]" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 pb-28">
        {(error || notice) && (
          <div
            className="mt-4 rounded-md px-3 py-2 text-sm font-bold"
            style={error
              ? { backgroundColor: "#ECCAE0", color: "#55204F" }
              : { backgroundColor: "#D0E7DF", color: "#195C4A" }}
          >
            {error ?? notice}
          </div>
        )}

        {/* Score explanation */}
        {score && (
          <>
            {sectionTitle("Conversion likelihood — rule-based score")}
            <div className="rounded-lg border border-[#DFDDDD] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#333333]">{score.label}</span>
                <span className="text-sm font-bold text-[#333333]">{score.score}<span className="text-[#808081]">/100</span></span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-[#DFDDDD]">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${score.score}%`,
                    background: "linear-gradient(90deg, #645BA8, #C86AA9)"
                  }}
                />
              </div>
              <ul className="mt-3 space-y-1">
                {score.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs text-[#333333]">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#645BA8]" />{r}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {score.signals.map((sig, i) => (
                  <span key={i} className="rounded border border-[#DFDDDD] px-1.5 py-0.5 text-[11px] text-[#808081]">{sig}</span>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Lifecycle & status */}
        {sectionTitle("Lifecycle & status")}
        {!classified && (
          <div className="mb-3 rounded-md border border-[#C6BDDD] bg-[#C6BDDD] bg-opacity-20 px-3 py-2 text-xs text-[#2C2561]">
            Classify this enquiry as <b>Lead</b> or <b>Not Lead</b> before processing it — stage, status and
            follow-ups unlock once it is classified (BRDID05).
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Enquiry Handled By</label>
            <select
              className={input}
              value={lead.assignedToUserId ?? ""}
              disabled={busy || (lead.assignedToUserId !== null && !elevated) || finalized}
              onChange={e => e.target.value && assign(Number(e.target.value))}
            >
              <option value="">Unassigned — pick an executive</option>
              {assignable.map(u => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
              {/* Keep a legacy owner visible even if their role can no longer own leads */}
              {lead.assignedToUserId !== null && !assignable.some(u => u.id === lead.assignedToUserId) && (
                <option value={lead.assignedToUserId}>{lead.assignedToName ?? "Current owner"}</option>
              )}
            </select>
            {lead.assignedToUserId !== null && !elevated && (
              <p className="mt-1 text-[11px] text-[#808081]">Re-assignment is Admin/Manager only (BRDID04).</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Enquiry Type</label>
            <select
              className={input}
              value={enquiryType}
              disabled={busy || !canEdit || lead.enquiryType === "NotLead" || (finalized && !elevated)}
              onChange={e => setEnquiryType(e.target.value)}
            >
              <option value="">Classify enquiry…</option>
              <option value="Lead">Lead</option>
              <option value="NotLead">Not Lead</option>
            </select>
            {enquiryType === "NotLead" && lead.enquiryType !== "NotLead" && (
              <p className="mt-1 text-[11px] font-bold text-[#712B69]">
                Saving will auto-close this enquiry (status → Closed).
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Stage {!classified && <span className="font-normal text-[#808081]">— classify first</span>}</label>
            <select
              className={input}
              value={stage}
              disabled={busy || !canEdit || !classified || lead.enquiryType === "NotLead" || finalized}
              onChange={e => setStage(e.target.value as Stage)}
            >
              {stageOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-[#808081]">Forward-only: Enquiry → Lead → Proposal → Won/Lost.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Status {!classified && <span className="font-normal text-[#808081]">— classify first</span>}</label>
            <select
              className={input}
              value={status}
              disabled={busy || !canEdit || !classified || lead.enquiryType === "NotLead" || (finalized && !elevated)}
              onChange={e => setStatus(e.target.value)}
            >
              {lead.status === "Closed" && <option value="Closed">Closed (system)</option>}
              <option value="Open">Open</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Lead Type</label>
            <select
              className={input}
              value={leadType}
              disabled={busy || !canEdit || !classified || lead.enquiryType === "NotLead" || finalized}
              onChange={e => setLeadType(e.target.value)}
            >
              <option value="">Select type…</option>
              {masters.leadTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#333333]">Value (INR)</label>
            <input
              className={input}
              type="number"
              min={0}
              value={valueInr}
              disabled={busy || !canEdit || (finalized && !elevated)}
              onChange={e => setValueInr(e.target.value)}
              placeholder="e.g. 2500000"
            />
          </div>
        </div>

        {/* Lost reason (BRDID09) */}
        {showLostReason && (
          <div className="mt-3 rounded-lg border border-[#ECCAE0] bg-[#ECCAE0] bg-opacity-30 p-4">
            <div className="mb-2 text-xs font-bold text-[#55204F]">
              Lost Reason — mandatory before saving a Lost lead
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select
                className={input}
                value={lostReason}
                disabled={busy || (!canEdit && !elevated) || (!!lead.lostReason && !elevated)}
                onChange={e => setLostReason(e.target.value)}
              >
                <option value="">Select reason…</option>
                {masters.lostReasons.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {lostReason === "Other" && (
                <input
                  className={input}
                  value={lostOther}
                  disabled={busy}
                  onChange={e => setLostOther(e.target.value)}
                  placeholder="Describe the specific reason (mandatory)"
                />
              )}
            </div>
            {!!lead.lostReason && !elevated && (
              <p className="mt-1 text-[11px] text-[#808081]">Saved lost reason is editable by Admin/Manager only.</p>
            )}
          </div>
        )}

        {/* Day-wise follow-ups (BRDID06) */}
        {sectionTitle("Day-wise follow-up (D1–D5)",
          lead.enquiryType !== "Lead" ? "Available once classified as a Lead" : undefined)}
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(d => {
            const existing = lead.dayUpdates.find(u => u.dayNumber === d);
            const prevFilled = d === 1 || lead.dayUpdates.some(u => u.dayNumber === d - 1);
            const editable =
              canEdit && lead.enquiryType === "Lead" && !finalized && prevFilled && lead.assignedToUserId !== null;
            return (
              <div key={d} className="rounded-md border border-[#DFDDDD] p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="rounded bg-[#211C48] px-1.5 py-0.5 text-[10px] font-bold text-white">D{d}</span>
                  <span className="text-[11px] text-[#808081]">
                    {existing
                      ? `${existing.updatedBy ?? ""} · ${formatDateTime(existing.updatedAtUtc)}`
                      : prevFilled ? (lead.enquiryType === "Lead" && !finalized ? "Due" : "—") : "Fill previous day first"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    className={input}
                    value={dayNotes[d] ?? ""}
                    disabled={!editable || busy}
                    onChange={e => setDayNotes(n => ({ ...n, [d]: e.target.value }))}
                    placeholder={editable ? "Call attempted / email sent / client response…" : "Not yet due"}
                  />
                  {editable && (dayNotes[d] ?? "") !== (existing?.note ?? "") && (
                    <button
                      onClick={() => saveDay(d)}
                      disabled={busy}
                      className="shrink-0 rounded-md bg-[#645BA8] px-3 text-xs font-bold text-white"
                    >
                      Save
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Follow-up assistant */}
        {lead.enquiryType === "Lead" && !finalized && (
          <>
            {sectionTitle("Follow-up assistant", "Template draft — you review & send")}
            <div className="rounded-lg border border-[#C6BDDD] p-4">
              {!draft ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-[#333333]">Draft a follow-up email</div>
                    <div className="text-xs text-[#808081]">
                      Personalized from this lead's context and prior day-wise notes. Generated locally — no external AI service.
                    </div>
                  </div>
                  <button
                    onClick={makeDraft}
                    className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #645BA8, #C86AA9)" }}
                  >
                    <Sparkles size={13} /> Draft email
                  </button>
                </div>
              ) : (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-[#333333]">Subject: {draft.subject}</span>
                    <button
                      onClick={copyDraft}
                      className="flex items-center gap-1 rounded border border-[#CAC8C7] px-2 py-1 text-[11px] font-bold text-[#333333] hover:bg-[#DFDDDD]"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap rounded bg-[#DFDDDD] bg-opacity-30 p-3 text-xs leading-relaxed text-[#333333]" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
                    {draft.body}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}

        {/* Remarks */}
        {sectionTitle("Remarks")}
        <textarea
          className={`${input} min-h-[70px]`}
          value={remarks}
          disabled={busy || !canEdit || (finalized && !elevated)}
          onChange={e => setRemarks(e.target.value)}
          placeholder="General comments / next steps…"
        />

        {/* Auto fields (BRDID11 — read-only) */}
        {sectionTitle("Enquiry details", "Auto — read-only")}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-[#DFDDDD] p-4 text-sm">
          <Field label="Report Code" value={lead.reportCode} />
          <Field label="Source" value={lead.source === "BulkUpload" ? "Bulk Upload" : lead.source} />
          <Field label="Report Title" value={lead.reportTitle} wide />
          <Field label="Industry" value={lead.industry} />
          <Field label="CTA" value={lead.cta} />
          <Field label="Email" value={lead.email} />
          <Field label="Country Code" value={lead.countryCode} />
          <Field label="Phone" value={lead.phone} />
          <Field label="User IP Address" value={lead.ipAddress} />
          <Field label="Submitted" value={formatDateTime(lead.submittedAtUtc)} />
          <Field label="Report URL" value={lead.reportUrl} wide />
          {lead.details && <Field label="Details / requirement" value={lead.details} wide />}
          {lead.valueInr != null && <Field label="Recorded value" value={formatInrFull(lead.valueInr)} />}
        </div>
      </div>

      {/* Footer actions */}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#DFDDDD] bg-white px-6 py-3">
        <button
          onClick={onClose}
          className="rounded-md border border-[#CAC8C7] px-4 py-2 text-sm font-bold text-[#333333] hover:bg-[#DFDDDD]"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy || !canEdit}
          className="rounded-md bg-[#211C48] px-4 py-2 text-sm font-bold text-white hover:bg-[#2C2561] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Overlay>
  );
}

function Field({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#808081]">{label}</div>
      <div className="mt-0.5 break-words text-[#333333]">{value || "—"}</div>
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button
        className="absolute inset-0 cursor-default"
        style={{ backgroundColor: "rgba(33, 28, 72, 0.45)" }}
        onClick={onClose}
        aria-label="Close panel"
      />
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
        {children}
      </div>
    </div>
  );
}
