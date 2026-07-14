/**
 * "Ask AI" — rule-based natural-language query engine.
 *
 * No external AI API. Questions are parsed with intent + entity matching
 * against live LMS data, so answers are always grounded in the actual
 * pipeline. Deterministic, explainable, and works offline.
 */
import { DashboardSummary, Lead, NameValue } from "./types";
import { formatInr } from "./format";
import { scoreLead } from "./scoring";

export interface NlqAnswer {
  title: string;
  text: string;
  kpis?: { label: string; value: string; accent?: string }[];
  table?: { headers: string[]; rows: (string | number)[][] };
  chart?: { kind: "bar"; data: NameValue[] };
  chips: string[];
  leadsRef?: Lead[];
}

const DEFAULT_CHIPS = [
    "Give me an overview of how we are doing right now",
    "Which leads need follow-up?",
    "Show hot leads",
    "What is our conversion rate?",
    "How much is our open pipeline worth?",
    "Show unassigned leads in the central pool",
    "Breakdown by lead source",
    "Break down leads by stage",
    "Break down leads by owner",
    "Break down leads by industry",
    "Lost reason analysis",
    "How many leads are open?",
    "Leads older than 5 days",
    "Leads older than 10 days"
  ];

export function answerQuestion(q: string, leads: Lead[], summary: DashboardSummary): NlqAnswer {
  const s = q.toLowerCase();
  const real = leads.filter(l => l.enquiryType !== "NotLead");
  const open = real.filter(l => l.status === "Open");

  // ---------- overview ----------
  if (match(s, ["overview", "how are we doing", "how we are doing", "performance", "snapshot", "summary"])) {
    const trendUp = summary.leadsPerDay.slice(-7).reduce((a, p) => a + p.count, 0) >=
                    summary.leadsPerDay.slice(-14, -7).reduce((a, p) => a + p.count, 0);
    return {
      title: "Performance snapshot",
      text:
        `Your pipeline currently has ${summary.openLeads} open leads out of ${summary.totalLeads} total, ` +
        `worth ${formatInr(summary.pipelineValueInr)}. Conversion rate stands at ${summary.conversionRatePct}% ` +
        `with ${formatInr(summary.wonValueInr)} already won. ` +
        (trendUp
          ? "Enquiry volume over the last 7 days is holding up against the prior week. "
          : "Enquiry volume has dipped versus the prior week — worth reviewing lead sources. ") +
        (summary.unassignedLeads > 0
          ? `${summary.unassignedLeads} leads are still unassigned in the central pool — assign them to protect response time.`
          : "No leads are waiting in the central pool."),
      kpis: [
        { label: "Total leads", value: String(summary.totalLeads) },
        { label: "Open leads", value: String(summary.openLeads) },
        { label: "Conversion rate", value: `${summary.conversionRatePct}%` },
        { label: "Pipeline value", value: formatInr(summary.pipelineValueInr), accent: "purple" },
        { label: "Won value", value: formatInr(summary.wonValueInr), accent: "green" },
        { label: "Lost value", value: formatInr(summary.lostValueInr), accent: "magenta" }
      ],
      chips: ["Which leads need follow-up?", "Breakdown by lead source", "Lost reason analysis", "Show hot leads"]
    };
  }

  // ---------- follow-ups needed ----------
  if (match(s, ["need follow", "follow-up", "follow up", "pending update", "missing update", "attention"])) {
    const needy = open
      .filter(l => l.assignedToUserId !== null)
      .filter(l => {
        const window = Math.min(5, daysSince(l.assignedAtUtc) + 1);
        const missing = l.enquiryType === "Lead" && window >= 1 && !l.dayUpdates.some(d => d.dayNumber === window);
        return missing || l.ageDays > 5;
      })
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 12);
    return {
      title: "Leads needing follow-up",
      text: needy.length === 0
        ? "Every open lead has its day-wise updates in order and nothing has crossed the 5-day aging threshold. Follow-up discipline looks good."
        : `${needy.length} open leads need attention — either today's day-wise update is missing or they have aged past 5 days. Oldest first:`,
      table: needy.length === 0 ? undefined : {
        headers: ["Lead", "Name", "Owner", "Stage", "Age (days)", "Day updates"],
        rows: needy.map(l => [l.leadCode, l.name, l.assignedToName ?? "—", l.stage, l.ageDays, `${l.dayUpdates.length}/5`])
      },
      chips: ["Leads older than 10 days", "Show unassigned leads", "Give me an overview of how we are doing right now"],
      leadsRef: needy
    };
  }

  // ---------- unassigned / central pool ----------
  if (match(s, ["unassigned", "central pool", "pool", "nobody", "no owner"])) {
    const poolLeads = real.filter(l => l.assignedToUserId === null && l.status === "Open");
    return {
      title: "Central pool",
      text: poolLeads.length === 0
        ? "The central pool is empty — every lead has an owner."
        : `${poolLeads.length} leads are waiting in the central pool without an owner. Every lead must have exactly one active handler — pick them up from the Central Pool page.`,
      table: poolLeads.length === 0 ? undefined : {
        headers: ["Lead", "Name", "Industry", "Source", "Age (days)"],
        rows: poolLeads.slice(0, 12).map(l => [l.leadCode, l.name, l.industry ?? "—", l.source, l.ageDays])
      },
      chips: ["Which leads need follow-up?", "Breakdown by owner", "Give me an overview of how we are doing right now"]
    };
  }

  // ---------- lost reasons ----------
  if (match(s, ["lost reason", "why are we losing", "losing", "lost analysis"])) {
    const lost = real.filter(l => l.status === "Lost");
    const top = summary.lostReasons[0];
    return {
      title: "Lost reason analysis",
      text: lost.length === 0
        ? "No leads have been marked Lost yet, so there is nothing to analyse. That is either great news or worth verifying that losses are being recorded honestly."
        : `${lost.length} leads worth ${formatInr(summary.lostValueInr)} have been lost. ` +
          (top ? `The single biggest reason is "${top.name}" (${top.value} leads). ` : "") +
          "Reducing the top reason is usually the fastest conversion win.",
      chart: summary.lostReasons.length ? { kind: "bar", data: summary.lostReasons } : undefined,
      chips: ["Give me an overview of how we are doing right now", "Breakdown by lead source", "Show hot leads"]
    };
  }

  // ---------- hot / scored leads ----------
  if (match(s, ["hot lead", "best lead", "top lead", "score", "prioritize", "priority"])) {
    const ranked = open
      .map(l => ({ lead: l, score: scoreLead(l) }))
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, 10);
    return {
      title: "Highest-priority open leads",
      text: ranked.length === 0
        ? "There are no open leads to prioritize right now."
        : "Ranked by the rule-based conversion score (email type, CTA intent, industry, value, freshness, stage momentum):",
      table: ranked.length === 0 ? undefined : {
        headers: ["Lead", "Name", "Score", "Band", "Stage", "Value", "Owner"],
        rows: ranked.map(r => [
          r.lead.leadCode, r.lead.name, `${r.score.score}/100`, r.score.label,
          r.lead.stage, formatInr(r.lead.valueInr), r.lead.assignedToName ?? "Unassigned"
        ])
      },
      chips: ["Which leads need follow-up?", "Breakdown by industry", "Give me an overview of how we are doing right now"],
      leadsRef: ranked.map(r => r.lead)
    };
  }

  // ---------- breakdowns ----------
  const breakdown = parseBreakdown(s, real, summary);
  if (breakdown) return breakdown;

  // ---------- conversion ----------
  if (match(s, ["conversion", "win rate", "won rate"])) {
    return {
      title: "Conversion",
      text:
        `Conversion rate is ${summary.conversionRatePct}% — ${summary.wonLeads} won against ${summary.lostLeads} lost. ` +
        `Won value totals ${formatInr(summary.wonValueInr)}; ${formatInr(summary.pipelineValueInr)} remains open in the pipeline.`,
      kpis: [
        { label: "Won", value: String(summary.wonLeads), accent: "green" },
        { label: "Lost", value: String(summary.lostLeads), accent: "magenta" },
        { label: "Conversion", value: `${summary.conversionRatePct}%` }
      ],
      chips: ["Lost reason analysis", "Show hot leads", "Give me an overview of how we are doing right now"]
    };
  }

  // ---------- pipeline value ----------
  if (match(s, ["pipeline", "value", "worth", "revenue"])) {
    return {
      title: "Pipeline value",
      text:
        `Open pipeline is worth ${formatInr(summary.pipelineValueInr)} across ${summary.openLeads} leads. ` +
        `${formatInr(summary.wonValueInr)} has been converted and ${formatInr(summary.lostValueInr)} lost.`,
      chart: { kind: "bar", data: summary.byStage },
      chips: ["Breakdown by stage", "Show hot leads", "Lost reason analysis"]
    };
  }

  // ---------- aging filters: "older than N days" ----------
  const olderMatch = s.match(/older than (\d+)|over (\d+) day|more than (\d+) day/);
  if (olderMatch) {
    const n = parseInt(olderMatch[1] ?? olderMatch[2] ?? olderMatch[3] ?? "5", 10);
    const aged = open.filter(l => l.ageDays > n).sort((a, b) => b.ageDays - a.ageDays);
    return {
      title: `Open leads older than ${n} days`,
      text: aged.length === 0
        ? `No open leads are older than ${n} days. Aging is under control.`
        : `${aged.length} open leads have been sitting for more than ${n} days` +
          (n >= 10 ? " — these are past the 10-day escalation threshold." : "."),
      table: aged.length === 0 ? undefined : {
        headers: ["Lead", "Name", "Owner", "Stage", "Age (days)"],
        rows: aged.slice(0, 15).map(l => [l.leadCode, l.name, l.assignedToName ?? "Unassigned", l.stage, l.ageDays])
      },
      chips: ["Which leads need follow-up?", "Show unassigned leads", "Lost reason analysis"],
      leadsRef: aged
    };
  }

  // ---------- count/how-many with entity ----------
  if (match(s, ["how many", "count", "number of", "total"])) {
    if (s.includes("open")) return simpleCount("Open leads", open.length, summary, `${open.length} leads are currently open.`);
    if (s.includes("won")) return simpleCount("Won leads", summary.wonLeads, summary, `${summary.wonLeads} leads have been won, worth ${formatInr(summary.wonValueInr)}.`);
    if (s.includes("lost")) return simpleCount("Lost leads", summary.lostLeads, summary, `${summary.lostLeads} leads were lost, worth ${formatInr(summary.lostValueInr)}.`);
    if (s.includes("not lead") || s.includes("notlead") || s.includes("junk")) {
      return simpleCount("Not-Lead enquiries", summary.closedNotLeads, summary,
        `${summary.closedNotLeads} enquiries were classified as Not Lead and auto-closed by the system.`);
    }
    return simpleCount("Total leads", summary.totalLeads, summary,
      `The system holds ${summary.totalLeads} qualified/active leads plus ${summary.closedNotLeads} Not-Lead enquiries.`);
  }

  // ---------- entity search: industry or person ----------
  const industryHit = summary.byIndustry.find(i => s.includes(i.name.toLowerCase()));
  if (industryHit) {
    const inds = real.filter(l => (l.industry ?? "").toLowerCase() === industryHit.name.toLowerCase());
    return {
      title: `${industryHit.name} leads`,
      text: `${inds.length} leads belong to ${industryHit.name}. ${inds.filter(l => l.status === "Open").length} are open.`,
      table: {
        headers: ["Lead", "Name", "Stage", "Status", "Owner", "Value"],
        rows: inds.slice(0, 15).map(l => [l.leadCode, l.name, l.stage, l.status, l.assignedToName ?? "—", formatInr(l.valueInr)])
      },
      chips: ["Breakdown by industry", "Show hot leads", "Give me an overview of how we are doing right now"],
      leadsRef: inds
    };
  }

  // ---------- fallback ----------
  return {
    title: "I can answer questions about your pipeline",
    text:
      "Ask me about leads, the central pool, follow-ups, conversion, pipeline value, lost reasons, sources, industries, owners or visitors. A few things to try:",
    chips: DEFAULT_CHIPS
  };
}

// ------------------------------------------------------------------ insights

export interface Insight {
  kind: "win" | "risk";
  metric: string;
  text: string;
  severity?: "critical" | "watch";
}

export interface InsightsReport {
  headline: string;
  wins: Insight[];
  risks: Insight[];
  recommendedAction: string;
}

/**
 * Rule-based dashboard insights — wins, risks and a recommended action derived
 * deterministically from the live summary. No external AI service.
 */
export function generateInsights(summary: DashboardSummary): InsightsReport {
  const wins: Insight[] = [];
  const risks: Insight[] = [];
  const d = summary.deltas;

  if (d.pipelineValuePct > 20)
    wins.push({ kind: "win", metric: formatInr(summary.pipelineValueInr),
      text: `Pipeline value grew ${d.pipelineValuePct}% vs the prior period — top of funnel is expanding.` });
  if (d.totalLeadsPct > 15)
    wins.push({ kind: "win", metric: String(summary.totalLeads),
      text: `Lead inflow is up ${d.totalLeadsPct}% — enquiry capture is working.` });
  if (d.wonValuePct > 10)
    wins.push({ kind: "win", metric: formatInr(summary.wonValueInr),
      text: `Won value up ${d.wonValuePct}% period-over-period.` });
  if (summary.adherencePct >= 90)
    wins.push({ kind: "win", metric: `${summary.adherencePct}%`,
      text: "Follow-up adherence is at or above the 90% target — discipline is holding." });
  if (wins.length === 0)
    wins.push({ kind: "win", metric: `${summary.openLeads}`,
      text: `${summary.openLeads} open leads worth ${formatInr(summary.pipelineValueInr)} are actively in play.` });

  const na = summary.needsAttention;
  if (na.escalated > 0)
    risks.push({ kind: "risk", metric: String(na.escalated), severity: "critical",
      text: `${na.escalated} escalated leads open beyond 10 days — a backlog that directly threatens win rates.` });
  if (summary.adherencePct < 90)
    risks.push({ kind: "risk", metric: `${summary.adherencePct}%`, severity: "watch",
      text: `Follow-up adherence at ${summary.adherencePct}% vs the 90% target — risking pipeline leakage.` });
  if (d.conversionPts < 0)
    risks.push({ kind: "risk", metric: `${d.conversionPts} pts`, severity: "watch",
      text: `Conversion dipped ${Math.abs(d.conversionPts)} points — volume is not yet yielding proportional wins.` });
  if (na.unassigned > 0)
    risks.push({ kind: "risk", metric: String(na.unassigned), severity: "watch",
      text: `${na.unassigned} leads are waiting in the central pool without an owner.` });
  if (summary.lostLeads === 0 && summary.totalLeads > 10)
    risks.push({ kind: "risk", metric: "0", severity: "watch",
      text: "No recorded losses — unusual; worth verifying losses are being tracked honestly." });

  let action: string;
  if (na.escalated > 0)
    action = `Immediately clear the ${na.escalated} escalated leads over 10 days old` +
      (summary.adherencePct < 90 ? `, and coach the team to lift follow-up adherence from ${summary.adherencePct}% toward 90%` : "") +
      " to capitalize on the current pipeline.";
  else if (na.unassigned > 0)
    action = `Assign the ${na.unassigned} pool leads today — fast first response is the single biggest conversion lever.`;
  else if (summary.adherencePct < 90)
    action = `Focus this week on day-wise follow-up discipline (currently ${summary.adherencePct}%, target 90%).`;
  else
    action = "Pipeline hygiene looks healthy — push Proposal-stage leads toward closure.";

  const headline =
    d.pipelineValuePct > 20 && (summary.adherencePct < 90 || d.conversionPts < 0)
      ? `Pipeline value surged ${d.pipelineValuePct}% with lead volumes up, but ${summary.adherencePct < 90 ? "follow-up adherence" : "conversion"} fell short this period.`
      : d.totalLeadsPct > 0
        ? `Lead inflow up ${d.totalLeadsPct}% with ${formatInr(summary.pipelineValueInr)} open pipeline; conversion at ${summary.conversionRatePct}%.`
        : `${summary.openLeads} open leads worth ${formatInr(summary.pipelineValueInr)}; conversion at ${summary.conversionRatePct}%.`;

  return { headline, wins: wins.slice(0, 3), risks: risks.slice(0, 3), recommendedAction: action };
}

// ------------------------------------------------------------------ helpers

function match(s: string, needles: string[]): boolean {
  return needles.some(n => s.includes(n));
}

function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
}

function simpleCount(title: string, count: number, summary: DashboardSummary, text: string): NlqAnswer {
  return {
    title,
    text,
    kpis: [
      { label: title, value: String(count) },
      { label: "Conversion", value: `${summary.conversionRatePct}%` },
      { label: "Pipeline", value: formatInr(summary.pipelineValueInr), accent: "purple" }
    ],
    chips: DEFAULT_CHIPS
  };
}

function parseBreakdown(s: string, real: Lead[], summary: DashboardSummary): NlqAnswer | null {
  if (!match(s, ["breakdown", "break down", "by source", "by industry", "by stage", "by owner", "split", "distribution", "group"]))
    return null;

  if (s.includes("source")) {
    return {
      title: "Leads by source",
      text: "Where leads are coming from — website auto-ingestion, manual creation and bulk upload:",
      chart: { kind: "bar", data: summary.bySource },
      chips: ["Breakdown by stage", "Breakdown by industry", "Give me an overview of how we are doing right now"]
    };
  }
  if (s.includes("industry")) {
    return {
      title: "Leads by industry",
      text: "Top industries by lead count:",
      chart: { kind: "bar", data: summary.byIndustry },
      chips: ["Breakdown by source", "Show hot leads", "Lost reason analysis"]
    };
  }
  if (s.includes("owner") || s.includes("user") || s.includes("team")) {
    const map = new Map<string, number>();
    for (const l of real) {
      const k = l.assignedToName ?? "Unassigned";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    const data = [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    return {
      title: "Leads by owner",
      text: "Lead ownership across the team (every lead has exactly one active handler):",
      chart: { kind: "bar", data },
      chips: ["Which leads need follow-up?", "Show unassigned leads", "Breakdown by stage"]
    };
  }
  // default breakdown → stage
  return {
    title: "Leads by lifecycle stage",
    text: "Pipeline distribution across the strict Enquiry → Lead → Proposal → Won/Lost lifecycle:",
    chart: { kind: "bar", data: summary.byStage },
    chips: ["Breakdown by source", "Breakdown by industry", "Breakdown by owner"]
  };
}
