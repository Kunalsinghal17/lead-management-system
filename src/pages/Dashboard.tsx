import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar
} from "recharts";
import {
  ArrowDownRight, ArrowUpRight, ChevronRight, RefreshCcw,
  Sparkles, TrendingDown, TriangleAlert, Zap
} from "lucide-react";
import { api } from "../lib/api";
import { DashboardSummary, Lead } from "../lib/types";
import { formatInr, ageLabel } from "../lib/format";
import { StageBadge, StatusBadge } from "../components/Badges";
import { SkeletonDashboard } from "../components/Skeleton";
import { generateInsights } from "../lib/nlq";
import { useAuth } from "../lib/auth";

const SERIES = ["#645BA8", "#C86AA9", "#26AD8B", "#F0AA31", "#467082", "#2D7D3E", "#D9E138"];

export default function Dashboard() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [days, setDays] = useState(30);
  const [toast, setToast] = useState<string | null>(null);

  const load = async (d = days) => {
    const [s, all] = await Promise.all([api.dashboard(d), api.listLeads({})]);
    setSummary(s);
    setLeads(all);
  };

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const simulate = async () => {
    const res = await api.simulateIngestion();
    setToast(res.message);
    await load();
    window.setTimeout(() => setToast(null), 4000);
  };

  // ---------------- derived analytics ----------------

  const stageCount = (name: string) => summary?.byStage.find(s => s.name === name)?.value ?? 0;

  const funnel = useMemo(() => {
    if (!summary) return [];
    const total = summary.totalLeads;
    const reachedLead = total - stageCount("Enquiry");
    const reachedProposal = stageCount("Proposal") + stageCount("Won") + stageCount("Lost");
    const steps = [
      { label: "Enquiries received", count: total, hint: "Website, manual entry & bulk upload" },
      { label: "Qualified as Lead", count: reachedLead, hint: "Classified Lead, moved past Enquiry" },
      { label: "Proposal shared", count: reachedProposal, hint: "Commercial discussion underway" },
      { label: "Won", count: summary.wonLeads, hint: `${formatInr(summary.wonValueInr)} converted` }
    ];
    return steps.map((s, i) => ({
      ...s,
      pctOfTotal: total === 0 ? 0 : Math.round((100 * s.count) / total),
      stepConv: i === 0 || steps[i - 1].count === 0 ? null : Math.round((100 * s.count) / steps[i - 1].count),
      dropped: i === 0 ? 0 : steps[i - 1].count - s.count
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const leaderboard = useMemo(() => {
    const map = new Map<string, { open: number; won: number; lost: number; wonValue: number }>();
    for (const l of leads.filter(x => x.enquiryType !== "NotLead" && x.assignedToName)) {
      const row = map.get(l.assignedToName!) ?? { open: 0, won: 0, lost: 0, wonValue: 0 };
      if (l.status === "Open") row.open++;
      if (l.status === "Won") { row.won++; row.wonValue += l.valueInr ?? 0; }
      if (l.status === "Lost") row.lost++;
      map.set(l.assignedToName!, row);
    }
    return [...map.entries()]
      .map(([name, r]) => ({
        name, ...r,
        conversion: r.won + r.lost === 0 ? null : Math.round((100 * r.won) / (r.won + r.lost))
      }))
      .sort((a, b) => b.wonValue - a.wonValue);
  }, [leads]);

  const insights = useMemo(() => (summary ? generateInsights(summary) : null), [summary]);

  if (!summary || !insights) {
    return <SkeletonDashboard />;
  }

  const na = summary.needsAttention;
  const attention = [
    { key: "escalated", label: "Escalated leads", sub: "Open more than 10 days", count: na.escalated, color: "#712B69" },
    { key: "missing", label: "Missing updates", sub: "Daily updates D1–D5", count: na.missingUpdates, color: "#BC852C" },
    { key: "aging", label: "Aging leads", sub: "Open more than 5 days", count: na.aging, color: "#F0AA31" },
    { key: "unassigned", label: "Unassigned", sub: "Sitting in central pool", count: na.unassigned, color: "#467082" },
    { key: "unclassified", label: "Unclassified", sub: "Pending enquiry-type", count: na.unclassified, color: "#808081" }
  ];

  const drill = (key: string) => {
    if (key === "unassigned") navigate("/central-pool");
    else navigate("/leads", { state: { preset: key } });
  };

  const kpis = [
    { label: "Total Leads", value: String(summary.totalLeads), delta: summary.deltas.totalLeadsPct, deltaLabel: "vs prior period" },
    { label: "Open Leads", value: String(summary.openLeads), delta: null, deltaLabel: `${summary.unassignedLeads} awaiting owner` },
    { label: "Conversion Rate", value: `${summary.conversionRatePct}%`, delta: summary.deltas.conversionPts, deltaLabel: "pts vs prior", isPts: true },
    { label: "Pipeline Value", value: formatInr(summary.pipelineValueInr), delta: summary.deltas.pipelineValuePct, deltaLabel: "vs prior period" },
    { label: "Won Value", value: formatInr(summary.wonValueInr), delta: summary.deltas.wonValuePct, deltaLabel: "vs prior period" }
  ];

  const classification = [
    { name: "Lead", value: summary.totalLeads },
    { name: "Not Lead", value: summary.closedNotLeads }
  ];
  const classTotal = summary.totalLeads + summary.closedNotLeads;

  const adherenceTarget = 90;
  const ring = Math.min(100, Math.max(0, summary.adherencePct));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#333333]">Dashboard</h1>
          <p className="text-sm text-[color:var(--nx-muted)]">
            Welcome back, {user?.fullName?.split(" ")[0]}.
            {summary.scope === "own" && " Showing your leads only."}
            {summary.scope === "team" && " Showing your team's pipeline."}
            {summary.scope === "all" && " Here is the pipeline right now."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(user?.role === "Admin" || user?.role === "Manager") && (
            <button
              onClick={simulate}
              className="flex items-center gap-1.5 rounded-md border border-[#C6BDDD] px-3 py-1.5 text-xs font-bold text-[#645BA8] hover:bg-[#C6BDDD] hover:bg-opacity-20"
              title="Simulate a website enquiry arriving from the Nexdigm website"
            >
              <Zap size={13} /> Simulate web enquiry
            </button>
          )}
          <button
            onClick={() => load()}
            className="flex items-center gap-1.5 rounded-md border border-[#CAC8C7] px-3 py-1.5 text-xs font-bold text-[#333333] hover:bg-[#DFDDDD] hover:bg-opacity-40"
          >
            <RefreshCcw size={13} /> Refresh
          </button>
        </div>
      </div>

      {toast && (
        <div role="status" aria-live="polite" className="mb-4 rounded-md px-4 py-2.5 text-sm font-bold" style={{ backgroundColor: "#D0E7DF", color: "#195C4A" }}>
          {toast}
        </div>
      )}

      {/* KPI row with deltas */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map(k => (
          <div key={k.label} className="rounded-lg border border-[#DFDDDD] p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-[color:var(--nx-muted)]">{k.label}</div>
            <div className="mt-1 text-2xl font-bold text-[#333333]">{k.value}</div>
            <div className="mt-1 flex items-center gap-1 text-xs">
              {k.delta !== null && (
                <span className="flex items-center gap-0.5 font-bold" style={{ color: k.delta >= 0 ? "#2D7D3E" : "#712B69" }}>
                  {k.delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {Math.abs(k.delta)}{k.isPts ? "" : "%"}
                </span>
              )}
              <span className="text-[color:var(--nx-muted)]">{k.deltaLabel}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Classification + Needs attention + Adherence */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-[#DFDDDD] p-4">
          <div className="text-sm font-bold text-[#333333]">Enquiry classification</div>
          <div className="text-xs text-[color:var(--nx-muted)]">Lead vs Not Lead</div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={classification} dataKey="value" nameKey="name" innerRadius={36} outerRadius={56} paddingAngle={3} strokeWidth={0}>
                  <Cell fill="#645BA8" />
                  <Cell fill="#C6BDDD" />
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderColor: "#DFDDDD" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-[#645BA8]">{summary.totalLeads}</div>
              <div className="text-[11px] text-[color:var(--nx-muted)]">
                Lead · {classTotal === 0 ? 0 : Math.round((100 * summary.totalLeads) / classTotal)}% of total
              </div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#333333]">{summary.closedNotLeads}</div>
              <div className="text-[11px] text-[color:var(--nx-muted)]">
                Not Lead · {classTotal === 0 ? 0 : Math.round((100 * summary.closedNotLeads) / classTotal)}% of total
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[#DFDDDD] p-4">
          <div className="flex items-center gap-1.5 text-sm font-bold text-[#333333]">
            <TriangleAlert size={14} className="text-[#F0AA31]" /> Needs attention
          </div>
          <div className="mb-2 text-xs text-[color:var(--nx-muted)]">{summary.openLeads} open — click to drill down</div>
          <div className="space-y-1">
            {attention.map(a => (
              <button
                key={a.key}
                onClick={() => drill(a.key)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-[#DFDDDD] hover:bg-opacity-30"
              >
                <span>
                  <span className="block text-xs font-bold text-[#333333]">{a.label}</span>
                  <span className="block text-[11px] text-[color:var(--nx-muted)]">{a.sub}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-base font-bold" style={{ color: a.color }}>{a.count}</span>
                  <ChevronRight size={13} className="text-[#B5B5B6]" />
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[#DFDDDD] p-4">
          <div className="text-sm font-bold text-[#333333]">Follow-up adherence</div>
          <div className="text-xs text-[color:var(--nx-muted)]">D1–D5 updates vs the {adherenceTarget}% target</div>
          <div className="flex items-center justify-center py-3">
            <svg width="132" height="132" viewBox="0 0 132 132" role="img"
              aria-label={`Adherence ${summary.adherencePct}%`}>
              <circle cx="66" cy="66" r="54" fill="none" stroke="#DFDDDD" strokeWidth="12" />
              <circle
                cx="66" cy="66" r="54" fill="none"
                stroke={ring >= adherenceTarget ? "#2D7D3E" : ring >= 60 ? "#F0AA31" : "#712B69"}
                strokeWidth="12" strokeLinecap="round"
                strokeDasharray={`${(ring / 100) * 339.3} 339.3`}
                transform="rotate(-90 66 66)"
              />
              <text x="66" y="62" textAnchor="middle" fontSize="22" fontWeight="bold" fill="#333333"
                fontFamily="Arial, Helvetica, sans-serif">{summary.adherencePct}%</text>
              <text x="66" y="80" textAnchor="middle" fontSize="10" fill="#808081"
                fontFamily="Arial, Helvetica, sans-serif">Adherence</text>
            </svg>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <div className="text-base font-bold text-[#2D7D3E]">{summary.adherenceOnTrack}</div>
              <div className="text-[11px] uppercase tracking-wide text-[color:var(--nx-muted)]">On track</div>
            </div>
            <div>
              <div className="text-base font-bold text-[#712B69]">{summary.adherenceMissed}</div>
              <div className="text-[11px] uppercase tracking-wide text-[color:var(--nx-muted)]">Missed</div>
            </div>
            <div>
              <div className="text-base font-bold" style={{ color: "#BC852C" }}>{adherenceTarget}%</div>
              <div className="text-[11px] uppercase tracking-wide text-[color:var(--nx-muted)]">Target</div>
            </div>
          </div>
        </div>
      </div>

      {/* AI insights (rule-based) */}
      <div className="mb-6 rounded-lg border border-[#DFDDDD] p-5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[color:var(--nx-muted)]">
          <Sparkles size={13} className="text-[#C86AA9]" /> Insights — computed from live data, no external AI
        </div>
        <p className="mb-3 text-sm font-bold text-[#333333]">{insights.headline}</p>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#2D7D3E]">Wins</div>
            {insights.wins.map((w, i) => (
              <div key={i} className="flex gap-2 rounded-md bg-[#C4E4C4] bg-opacity-30 px-3 py-2">
                <span className="shrink-0 text-sm font-bold text-[#2D7D3E]">{w.metric}</span>
                <span className="text-xs text-[#333333]">{w.text}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#712B69]">Risks</div>
            {insights.risks.length === 0 ? (
              <div className="rounded-md bg-[#DFDDDD] bg-opacity-40 px-3 py-2 text-xs text-[#333333]">
                No material risks detected in this period.
              </div>
            ) : (
              insights.risks.map((r, i) => (
                <div
                  key={i}
                  className="flex gap-2 rounded-md px-3 py-2"
                  style={{ backgroundColor: r.severity === "critical" ? "rgba(236, 202, 224, 0.5)" : "rgba(251, 229, 195, 0.5)" }}
                >
                  <span className="shrink-0 text-sm font-bold" style={{ color: r.severity === "critical" ? "#712B69" : "#BC852C" }}>
                    {r.metric}
                  </span>
                  <span className="text-xs text-[#333333]">{r.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-[#C6BDDD] bg-[#C6BDDD] bg-opacity-10 px-3 py-2">
          <span className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-[#645BA8]">Recommended action</span>
          <span className="flex-1 text-xs text-[#333333]">{insights.recommendedAction}</span>
        </div>
      </div>

      {/* Conversion funnel */}
      <div className="mb-6 rounded-lg border border-[#DFDDDD] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-[#333333]">Conversion funnel</div>
            <div className="text-xs text-[color:var(--nx-muted)]">
              How enquiries progress through Enquiry → Lead → Proposal → Won, with step-by-step conversion.
            </div>
          </div>
          <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: "#C6BDDD", color: "#2C2561" }}>
            End-to-end: {funnel.length > 0 && funnel[0].count > 0
              ? Math.round((100 * funnel[funnel.length - 1].count) / funnel[0].count)
              : 0}%
          </span>
        </div>
        <div className="space-y-1.5">
          {funnel.map((step, i) => {
            const width = Math.max(9, step.pctOfTotal);
            const colors = ["#645BA8", "#776DA7", "#9F91C6", "#2D7D3E"];
            return (
              <div key={step.label}>
                {i > 0 && step.dropped > 0 && (
                  <div className="mb-1 flex items-center gap-1.5 pl-1 text-[11px] text-[color:var(--nx-muted)]">
                    <TrendingDown size={11} className="text-[#712B69]" />
                    {step.dropped} dropped ({step.stepConv !== null ? 100 - step.stepConv : 0}%)
                    {i === funnel.length - 1 && summary.lostLeads > 0 && ` — includes ${summary.lostLeads} marked Lost`}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div
                      className="flex h-12 items-center justify-between rounded-md px-4 text-white transition-all"
                      style={{ width: `${width}%`, minWidth: 220, backgroundColor: colors[i] }}
                    >
                      <div>
                        <div className="text-xs font-bold leading-tight">{step.label}</div>
                        <div className="text-[11px] leading-tight opacity-80">{step.hint}</div>
                      </div>
                      <div className="pl-4 text-right">
                        <div className="text-base font-bold leading-tight">{step.count}</div>
                        <div className="text-[11px] leading-tight opacity-80">{step.pctOfTotal}% of total</div>
                      </div>
                    </div>
                  </div>
                  <div className="w-24 shrink-0 text-right text-xs font-bold" style={{ color: "#645BA8" }}>
                    {step.stepConv !== null ? `${step.stepConv}% convert` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trend + sources */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-[#DFDDDD] p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-[#333333]">Enquiries per day</div>
              <div className="text-xs text-[color:var(--nx-muted)]">Auto-ingested + manual + bulk</div>
            </div>
            <div className="flex gap-1">
              {[14, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => { setDays(d); load(d); }}
                  className={`rounded px-2 py-1 text-xs font-bold ${days === d ? "bg-[#645BA8] text-white" : "text-[color:var(--nx-muted)] hover:bg-[#DFDDDD]"}`}
                >
                  {d}D
                </button>
              ))}
            </div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.leadsPerDay} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#645BA8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#645BA8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(51,51,51,0.78)" }} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "rgba(51,51,51,0.78)" }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderColor: "#DFDDDD" }} labelStyle={{ color: "#333333", fontWeight: 700 }} />
                <Area type="monotone" dataKey="count" stroke="#645BA8" strokeWidth={2} fill="url(#trendFill)" name="Enquiries" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-[#DFDDDD] p-4">
          <div className="text-sm font-bold text-[#333333]">Lead sources</div>
          <div className="text-xs text-[color:var(--nx-muted)]">Website / manual / bulk mix</div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={summary.bySource} dataKey="value" nameKey="name" innerRadius={38} outerRadius={60} paddingAngle={3} strokeWidth={0}>
                  {summary.bySource.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderColor: "#DFDDDD" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1">
            {summary.bySource.map((s, i) => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES[i % SERIES.length] }} />
                <span className="flex-1 text-[#333333]">{s.name === "BulkUpload" ? "Bulk Upload" : s.name}</span>
                <span className="font-bold text-[#333333]">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Industries + leaderboard */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[#DFDDDD] p-4">
          <div className="mb-2 text-sm font-bold text-[#333333]">Top industries</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.byIndustry.slice(0, 6)} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(51,51,51,0.78)" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={104} interval={0} tick={{ fontSize: 11, fill: "#333333" }} />
                <Tooltip contentStyle={{ fontSize: 12, borderColor: "#DFDDDD" }} />
                <Bar dataKey="value" fill="#9F91C6" radius={[0, 4, 4, 0]} name="Leads" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-[#DFDDDD] p-4">
          <div className="text-sm font-bold text-[#333333]">Team leaderboard</div>
          <div className="mb-2 text-xs text-[color:var(--nx-muted)]">Executives by won value</div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="uppercase tracking-wide text-[color:var(--nx-muted)]">
                <th className="py-1.5 font-bold">Executive</th>
                <th className="py-1.5 text-center font-bold">Open</th>
                <th className="py-1.5 text-center font-bold">Won</th>
                <th className="py-1.5 text-center font-bold">Conv.</th>
                <th className="py-1.5 text-right font-bold">Won value</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-[color:var(--nx-muted)]">No assigned leads yet.</td></tr>
              ) : (
                leaderboard.map(r => (
                  <tr key={r.name} className="border-t border-[#DFDDDD]">
                    <td className="py-2 font-bold text-[#333333]">{r.name}</td>
                    <td className="py-2 text-center text-[#333333]">{r.open}</td>
                    <td className="py-2 text-center font-bold text-[#2D7D3E]">{r.won}</td>
                    <td className="py-2 text-center text-[#333333]">{r.conversion === null ? "—" : `${r.conversion}%`}</td>
                    <td className="py-2 text-right text-[#333333]">{formatInr(r.wonValue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent leads */}
      <div className="rounded-lg border border-[#DFDDDD]">
        <div className="border-b border-[#DFDDDD] px-4 py-3 text-sm font-bold text-[#333333]">Recent leads</div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-[color:var(--nx-muted)]">
              <th className="px-4 py-2 font-bold">Lead ID</th>
              <th className="px-4 py-2 font-bold">Name</th>
              <th className="px-4 py-2 font-bold">Industry</th>
              <th className="px-4 py-2 font-bold">Stage</th>
              <th className="px-4 py-2 font-bold">Status</th>
              <th className="px-4 py-2 font-bold">Owner</th>
              <th className="px-4 py-2 font-bold">Age</th>
              <th className="px-4 py-2 text-right font-bold">Value</th>
            </tr>
          </thead>
          <tbody>
            {leads.slice(0, 8).map(l => (
              <tr
                key={l.id}
                onClick={() => navigate("/leads", { state: { openLeadId: l.id } })}
                title={`Open ${l.leadCode} in the Lead Tracker`}
                className="cursor-pointer border-t border-[#DFDDDD] hover:bg-[#DFDDDD] hover:bg-opacity-20"
              >
                <td className="px-4 py-2.5 text-xs font-bold text-[#645BA8]">{l.leadCode}</td>
                <td className="px-4 py-2.5 font-bold text-[#333333]">{l.name}</td>
                <td className="px-4 py-2.5 text-[#333333]">{l.industry ?? "—"}</td>
                <td className="px-4 py-2.5"><StageBadge stage={l.stage} /></td>
                <td className="px-4 py-2.5"><StatusBadge status={l.status} /></td>
                <td className="px-4 py-2.5 text-[#333333]">
                  {l.assignedToName ?? <span className="italic text-[color:var(--nx-muted)]">Unassigned</span>}
                </td>
                <td className="px-4 py-2.5 text-[#333333]">{ageLabel(l.ageDays)}</td>
                <td className="px-4 py-2.5 text-right text-[#333333]">{formatInr(l.valueInr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {can("export") && (
        <div className="mt-3 text-right">
          <button onClick={() => api.exportLeads("all")} className="text-xs font-bold text-[#645BA8] hover:underline">
            Export all leads (CSV)
          </button>
        </div>
      )}
    </div>
  );
}
