import React, { useEffect, useMemo, useState } from "react";
import { Download, Globe, Search } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { api } from "../lib/api";
import { VisitorAnalytics, VisitorStat } from "../lib/types";
import { formatDateTime, formatDuration } from "../lib/format";
import { useAuth } from "../lib/auth";

/**
 * visitor analytics: daily new-vs-returning visits, engagement
 * distributions and the per-IP register. Data arrives in real time from the
 * website tracking tool via the ingestion API.
 */
export default function Visitors() {
  const { can } = useAuth();
  const [stats, setStats] = useState<VisitorStat[]>([]);
  const [analytics, setAnalytics] = useState<VisitorAnalytics | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"visits" | "time" | "recent">("recent");
  const [ipSearch, setIpSearch] = useState("");

  const load = async (d = days) => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([api.visitors(), api.visitorAnalytics(d)]);
      setStats(s);
      setAnalytics(a);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load().catch(() => setLoading(false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    let arr = [...stats];
    if (ipSearch.trim()) arr = arr.filter(v => v.ipAddress.includes(ipSearch.trim()));
    if (sort === "visits") arr.sort((a, b) => b.visitCount - a.visitCount);
    else if (sort === "time") arr.sort((a, b) => b.timeSpentSeconds - a.timeSpentSeconds);
    else arr.sort((a, b) => b.lastVisitAtUtc.localeCompare(a.lastVisitAtUtc));
    return arr;
  }, [stats, sort, ipSearch]);

  if (loading && !analytics) {
    return <div className="py-24 text-center text-sm text-[#808081]">Loading visitor analytics…</div>;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#333333]">Visitor Analytics</h1>
          <p className="text-sm text-[#808081]">
            Time spent & visit count by IP, streamed from the website tracking tool.
          </p>
        </div>
        {can("export") && (
          <button
            onClick={() => api.exportVisitors()}
            className="flex items-center gap-1.5 rounded-md border border-[#CAC8C7] px-3 py-1.5 text-xs font-bold text-[#333333] hover:bg-[#DFDDDD] hover:bg-opacity-40"
          >
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      {analytics && (
        <>
          {/* KPIs */}
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label={`Total visits (${days}d)`} value={String(analytics.totalVisits)} />
            <Kpi label="Unique visitors" value={String(analytics.uniqueVisitors)} />
            <Kpi label="Returning visitors" value={String(analytics.returningVisitors)} />
            <Kpi label="Avg. time on site" value={formatDuration(analytics.avgTimeSeconds)} />
          </div>

          {/* Daily new vs returning */}
          <div className="mb-5 rounded-lg border border-[#DFDDDD] p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-[#333333]">Visits per day — new vs returning</div>
                <div className="text-xs text-[#808081]">
                  Peak {analytics.peakDayVisits}/day · average {analytics.avgVisitsPerDay}/day
                </div>
              </div>
              <div className="flex gap-1">
                {[14, 30, 90].map(d => (
                  <button
                    key={d}
                    onClick={() => { setDays(d); load(d); }}
                    className={`rounded px-2 py-1 text-xs font-bold ${days === d ? "bg-[#645BA8] text-white" : "text-[#808081] hover:bg-[#DFDDDD]"}`}
                  >
                    {d}D
                  </button>
                ))}
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.daily} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barCategoryGap="20%">
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#808081" }}
                    tickFormatter={(v: string) => v.slice(5)}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#808081" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderColor: "#DFDDDD" }} labelStyle={{ color: "#333333", fontWeight: 700 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="newVisitors" stackId="v" fill="#645BA8" name="New visitor" />
                  <Bar dataKey="returningVisitors" stackId="v" fill="#C6BDDD" name="Returning visitor" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Distributions */}
          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <Distribution
              title="Visit frequency"
              subtitle={`${analytics.uniqueVisitors || stats.length} IPs · by number of visits`}
              data={analytics.frequency}
              color="#467082"
            />
            <Distribution
              title="Time on site"
              subtitle={`${stats.length} IPs · by time spent`}
              data={analytics.timeOnSite}
              color="#26AD8B"
            />
          </div>
        </>
      )}

      {/* Per-IP register */}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="relative flex items-center">
          <Search size={13} className="absolute left-2.5 text-[#808081]" />
          <input
            value={ipSearch}
            onChange={e => setIpSearch(e.target.value)}
            placeholder="Search IP…"
            className="w-44 rounded-md border border-[#CAC8C7] py-1.5 pl-8 pr-3 text-xs outline-none focus:border-[#645BA8]"
          />
        </div>
        <span className="text-[#808081]">Sort by</span>
        {([["recent", "Most recent"], ["visits", "Visit count"], ["time", "Time spent"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            className={`rounded px-2 py-1 font-bold ${sort === k ? "bg-[#645BA8] text-white" : "text-[#808081] hover:bg-[#DFDDDD]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-[#DFDDDD]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#DFDDDD] bg-opacity-30">
            <tr className="text-xs uppercase tracking-wide text-[#808081]">
              <th className="px-4 py-2.5 font-bold">IP Address</th>
              <th className="px-4 py-2.5 font-bold">Time Spent</th>
              <th className="px-4 py-2.5 font-bold">No. of Visits</th>
              <th className="px-4 py-2.5 font-bold">First Visit</th>
              <th className="px-4 py-2.5 font-bold">Last Visit</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[#808081]">
                  <Globe className="mx-auto mb-2 text-[#9F91C6]" size={26} />
                  {ipSearch ? "No IPs match your search." : "No visitor data yet — the tracking tool posts it here in real time."}
                </td>
              </tr>
            ) : (
              sorted.map(v => (
                <tr key={v.id} className="border-t border-[#DFDDDD] hover:bg-[#DFDDDD] hover:bg-opacity-20">
                  <td className="px-4 py-2.5 font-bold text-[#333333]">{v.ipAddress}</td>
                  <td className="px-4 py-2.5 text-[#333333]">{formatDuration(v.timeSpentSeconds)}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-bold"
                      style={v.visitCount > 1
                        ? { backgroundColor: "#D0E7DF", color: "#195C4A" }
                        : { backgroundColor: "#DFDDDD", color: "#333333" }}
                    >
                      {v.visitCount}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[#808081]">{formatDateTime(v.firstVisitAtUtc)}</td>
                  <td className="px-4 py-2.5 text-[#808081]">{formatDateTime(v.lastVisitAtUtc)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#DFDDDD] p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-[#808081]">{label}</div>
      <div className="mt-1 text-2xl font-bold text-[#333333]">{value}</div>
    </div>
  );
}

function Distribution({ title, subtitle, data, color }: {
  title: string;
  subtitle: string;
  data: { name: string; value: number; pct: number }[];
  color: string;
}) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="rounded-lg border border-[#DFDDDD] p-4">
      <div className="text-sm font-bold text-[#333333]">{title}</div>
      <div className="mb-3 text-xs text-[#808081]">{subtitle}</div>
      <div className="space-y-2.5">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-3 text-xs">
            <span className="w-16 shrink-0 text-[#333333]">{d.name}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#DFDDDD]">
              <span
                className="block h-2.5 rounded-full"
                style={{ width: `${(100 * d.value) / max}%`, backgroundColor: color }}
              />
            </span>
            <span className="w-8 shrink-0 text-right font-bold text-[#333333]">{d.value}</span>
            <span className="w-9 shrink-0 text-right text-[#808081]">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
