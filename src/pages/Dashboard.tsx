import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar
} from "recharts";
import { RefreshCcw, Zap } from "lucide-react";
import { api } from "../lib/api";
import { DashboardSummary, Lead } from "../lib/types";
import { formatInr, ageLabel } from "../lib/format";
import { StageBadge, StatusBadge } from "../components/Badges";
import { useAuth } from "../lib/auth";

const SERIES = ["#645BA8", "#C86AA9", "#26AD8B", "#F0AA31", "#467082", "#2D7D3E", "#D9E138"];

export default function Dashboard() {
  const { user, can } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recent, setRecent] = useState<Lead[]>([]);
  const [days, setDays] = useState(30);
  const [toast, setToast] = useState<string | null>(null);

  const load = async (d = days) => {
    const [s, leads] = await Promise.all([api.dashboard(d), api.listLeads({})]);
    setSummary(s);
    setRecent(leads.slice(0, 8));
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

  if (!summary) {
    return <div className="py-24 text-center text-sm text-[#808081]">Loading dashboard…</div>;
  }

  const kpis = [
    { label: "Total Leads", value: String(summary.totalLeads), sub: `${summary.closedNotLeads} not-lead auto-closed` },
    { label: "Open Leads", value: String(summary.openLeads), sub: `${summary.unassignedLeads} in central pool` },
    { label: "Conversion Rate", value: `${summary.conversionRatePct}%`, sub: `${formatInr(summary.wonValueInr)} converted` },
    { label: "Pipeline Value", value: formatInr(summary.pipelineValueInr), sub: `${formatInr(summary.lostValueInr)} lost` }
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#333333]">Dashboard</h1>
          <p className="text-sm text-[#808081]">
            Welcome back, {user?.fullName?.split(" ")[0]}. Here is the pipeline right now.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(user?.role === "Admin" || user?.role === "Manager") && (
            <button
              onClick={simulate}
              className="flex items-center gap-1.5 rounded-md border border-[#C6BDDD] px-3 py-1.5 text-xs font-bold text-[#645BA8] hover:bg-[#C6BDDD] hover:bg-opacity-20"
              title="Simulate a website enquiry arriving via the MarketRAdmin API (BRDID02)"
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
        <div className="mb-4 rounded-md px-4 py-2.5 text-sm font-bold" style={{ backgroundColor: "#D0E7DF", color: "#195C4A" }}>
          {toast}
        </div>
      )}

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map(k => (
          <div key={k.label} className="rounded-lg border border-[#DFDDDD] p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-[#808081]">{k.label}</div>
            <div className="mt-1 text-2xl font-bold text-[#333333]">{k.value}</div>
            <div className="mt-1 text-xs text-[#808081]">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Trend + source mix */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-[#DFDDDD] p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-[#333333]">Enquiries per day</div>
              <div className="text-xs text-[#808081]">Auto-ingested + manual + bulk</div>
            </div>
            <div className="flex gap-1">
              {[14, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => { setDays(d); load(d); }}
                  className={`rounded px-2 py-1 text-xs font-bold ${
                    days === d ? "bg-[#645BA8] text-white" : "text-[#808081] hover:bg-[#DFDDDD]"
                  }`}
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
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#808081" }}
                  tickFormatter={(v: string) => v.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10, fill: "#808081" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderColor: "#DFDDDD" }}
                  labelStyle={{ color: "#333333", fontWeight: 700 }}
                />
                <Area type="monotone" dataKey="count" stroke="#645BA8" strokeWidth={2} fill="url(#trendFill)" name="Enquiries" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-[#DFDDDD] p-4">
          <div className="text-sm font-bold text-[#333333]">Lead sources</div>
          <div className="text-xs text-[#808081]">Website / manual / bulk mix</div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={summary.bySource}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={38}
                  outerRadius={60}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {summary.bySource.map((_, i) => (
                    <Cell key={i} fill={SERIES[i % SERIES.length]} />
                  ))}
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

      {/* Stage + industry */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[#DFDDDD] p-4">
          <div className="mb-2 text-sm font-bold text-[#333333]">Pipeline by stage</div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.byStage} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#808081" }} />
                <YAxis tick={{ fontSize: 10, fill: "#808081" }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderColor: "#DFDDDD" }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Leads">
                  {summary.byStage.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.name === "Won" ? "#2D7D3E"
                          : entry.name === "Lost" ? "#712B69"
                          : entry.name === "Proposal" ? "#C86AA9"
                          : entry.name === "Lead" ? "#645BA8"
                          : "#467082"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-[#DFDDDD] p-4">
          <div className="mb-2 text-sm font-bold text-[#333333]">Top industries</div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.byIndustry} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 30 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "#808081" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "#333333" }} />
                <Tooltip contentStyle={{ fontSize: 12, borderColor: "#DFDDDD" }} />
                <Bar dataKey="value" fill="#9F91C6" radius={[0, 4, 4, 0]} name="Leads" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent leads */}
      <div className="rounded-lg border border-[#DFDDDD]">
        <div className="border-b border-[#DFDDDD] px-4 py-3 text-sm font-bold text-[#333333]">Recent leads</div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-[#808081]">
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
            {recent.map(l => (
              <tr key={l.id} className="border-t border-[#DFDDDD] hover:bg-[#DFDDDD] hover:bg-opacity-20">
                <td className="px-4 py-2.5 text-xs font-bold text-[#645BA8]">{l.leadCode}</td>
                <td className="px-4 py-2.5 font-bold text-[#333333]">{l.name}</td>
                <td className="px-4 py-2.5 text-[#333333]">{l.industry ?? "—"}</td>
                <td className="px-4 py-2.5"><StageBadge stage={l.stage} /></td>
                <td className="px-4 py-2.5"><StatusBadge status={l.status} /></td>
                <td className="px-4 py-2.5 text-[#333333]">
                  {l.assignedToName ?? <span className="italic text-[#808081]">Unassigned</span>}
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
          <button
            onClick={() => api.exportLeads("all")}
            className="text-xs font-bold text-[#645BA8] hover:underline"
          >
            Export all leads (CSV)
          </button>
        </div>
      )}
    </div>
  );
}
