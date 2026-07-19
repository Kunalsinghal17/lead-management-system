import React from "react";

/**
 * Lightweight loading skeletons (UI/UX rule: visible feedback for operations
 * over ~300ms instead of a frozen screen with a text line). Pulse animation
 * is disabled automatically for users with prefers-reduced-motion via the
 * global CSS rule in index.css.
 */

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-[#DFDDDD] ${className}`} />;
}

/** KPI card placeholders matching the dashboard's 5-card grid. */
export function SkeletonKpis({ count = 5 }: { count?: number }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-[#DFDDDD] p-4">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="mt-3 h-7 w-16" />
          <SkeletonBlock className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Generic content panel placeholder (charts, funnel, tables). */
export function SkeletonPanel({ height = "h-64" }: { height?: string }) {
  return (
    <div className={`mb-6 rounded-lg border border-[#DFDDDD] p-4 ${height}`}>
      <SkeletonBlock className="h-4 w-40" />
      <SkeletonBlock className="mt-2 h-3 w-64" />
      <SkeletonBlock className="mt-4 h-[calc(100%-3.5rem)] w-full" />
    </div>
  );
}

/** Table-row placeholders — render inside a <tbody>. */
export function SkeletonRows({ rows = 6, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-t border-[#DFDDDD]">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <SkeletonBlock className={`h-3.5 ${c === 1 ? "w-32" : "w-16"}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Full-page dashboard placeholder. */
export function SkeletonDashboard() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <div className="mb-6">
        <SkeletonBlock className="h-6 w-40" />
        <SkeletonBlock className="mt-2 h-4 w-72" />
      </div>
      <SkeletonKpis />
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-[#DFDDDD] p-4">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="mt-2 h-3 w-44" />
            <SkeletonBlock className="mt-4 h-36 w-full" />
          </div>
        ))}
      </div>
      <SkeletonPanel height="h-72" />
    </div>
  );
}
