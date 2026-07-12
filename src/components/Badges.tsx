import React from "react";
import { Stage, Status } from "../lib/types";

/** Brand-coded chips. All colors from the official Nexdigm palette. */

const stageStyles: Record<Stage, { bg: string; fg: string }> = {
  Enquiry: { bg: "#D9E1E5", fg: "#355462" },
  Lead: { bg: "#C6BDDD", fg: "#2C2561" },
  Proposal: { bg: "#ECCAE0", fg: "#712B69" },
  Won: { bg: "#C4E4C4", fg: "#1C4924" },
  Lost: { bg: "#ECCAE0", fg: "#55204F" }
};

const statusStyles: Record<Status, { bg: string; fg: string; dot: string }> = {
  Open: { bg: "#FBE5C3", fg: "#725220", dot: "#F0AA31" },
  Won: { bg: "#C4E4C4", fg: "#1C4924", dot: "#2D7D3E" },
  Lost: { bg: "#ECCAE0", fg: "#55204F", dot: "#712B69" },
  Closed: { bg: "#DFDDDD", fg: "#333333", dot: "#808081" }
};

export function StageBadge({ stage }: { stage: Stage }) {
  const s = stageStyles[stage] ?? stageStyles.Enquiry;
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-bold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {stage}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const s = statusStyles[status] ?? statusStyles.Open;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {status}
    </span>
  );
}

export function MailTypeBadge({ type }: { type: string }) {
  const pro = type === "Professional";
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-bold"
      style={{
        backgroundColor: pro ? "#D0E7DF" : "#F4F5C9",
        color: pro ? "#195C4A" : "#60622A"
      }}
    >
      {type}
    </span>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const label = source === "BulkUpload" ? "Bulk Upload" : source;
  return <span className="text-xs font-bold" style={{ color: "#467082" }}>{label}</span>;
}

export function ScorePill({ score, label }: { score: number; label: string }) {
  const color = label === "Hot" ? "#712B69" : label === "Warm" ? "#BC852C" : "#467082";
  const bg = label === "Hot" ? "#ECCAE0" : label === "Warm" ? "#FBE5C3" : "#D9E1E5";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
      style={{ backgroundColor: bg, color }}
    >
      {label} · {score}
    </span>
  );
}
