import React, { useEffect, useMemo, useState } from "react";
import { Download, Globe } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { api } from "../lib/api";
import { VisitorStat } from "../lib/types";
import { formatDateTime, formatDuration } from "../lib/format";
import { useAuth } from "../lib/auth";

/**
 * BRDID13 — Visitor timestamping & visit counts from the third-party tool,
 * flowing in via API. Exportable.
 */
export default function Visitors() {
  const { can } = useAuth();
  const [stats, setStats] = useState<VisitorStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"visits" | "time" | "recent">("recent");

  useEffect(() => {
    api.visitors().then(s => { setStats(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    const arr = [...stats];
    if (sort === "visits") arr.sort((a, b) => b.visitCount - a.visitCount);
    else if (sort === "time") arr.sort((a, b) => b.timeSpentSeconds - a.timeSpentSeconds);
    else arr.sort((a, b) => b.lastVisitAtUtc.localeCompare(a.lastVisitAtUtc));
    return arr;
  }, [stats, sort]);

  const top = useMemo(
    () => [...stats].sort((a, b) => b.visitCount - a.visitCount).slice(0, 8)
      .map(v => ({ name: v.ipAddress, value: v.visitCount })),
    [stats]
  );

  const totals = useMemo(() => ({
    visitors: stats.length,
    visits: stats.reduce((a, v) => a + v.visitCount, 0),
    time: stats.reduce((a, v) => a + v.timeSpentSeconds, 0),
    returning: stats.filter(v => v.visitCount > 1).length
  }), [stats]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#333333]">Visitor Analytics</h1>
          <p className="text-sm text-[#808081]">
            Time-on-site and visit counts per IP address, streamed from the website tracking tool.
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

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Unique visitors (IPs)" value={String(totals.visitors)} />
        <Kpi label="Total visits" value={String(totals.visits)} />
        <Kpi label="Returning visitors" value={String(totals.returning)} />
        <Kpi label="Total time on site" value={formatDuration(totals.time)} />
      </div>

      <div className="mb-5 rounded-lg border border-[#DFDDDD] p-4">
        <div className="mb-2 text-sm font-bold text-[#333333]">Most frequent visitors</div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#808081" }} interval={0} angle={-18} height={44} />
              <YAxis tick={{ fontSize: 10, fill: "#808081" }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderColor: "#DFDDDD" }} />
              <Bar dataKey="value" fill="#467082" radius={[4, 4, 0, 0]} name="Visits" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs">
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
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-[#808081]">Loading visitor data…</td></tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[#808081]">
                  <Globe className="mx-auto mb-2 text-[#9F91C6]" size={26} />
                  No visitor data yet — the tracking tool posts it here in real time.
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
