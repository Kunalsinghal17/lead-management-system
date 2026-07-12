import { Lead } from "./types";

/**
 * Rule-based conversion likelihood score (0–100).
 * Fully deterministic and explainable — no external AI service involved.
 * Every point has a stated reason, shown to the user in the lead drawer.
 */
export interface LeadScore {
  score: number;
  label: "Hot" | "Warm" | "Cool";
  reasons: string[];
  signals: string[];
}

const HIGH_INTENT_CTAS = ["request sample", "contact sales"];
const HOT_INDUSTRIES = ["pharma", "bfsi", "healthcare", "technology"];

export function scoreLead(lead: Lead): LeadScore {
  let score = 30;
  const reasons: string[] = [];
  const signals: string[] = [];

  // Email type
  if (lead.mailType === "Professional") {
    score += 20;
    reasons.push("Professional email domain — likely a business buyer");
  } else {
    score -= 5;
    reasons.push("Personal email domain lowers conversion likelihood");
  }
  signals.push(lead.mailType);

  // CTA intent
  const cta = (lead.cta || "").toLowerCase();
  if (HIGH_INTENT_CTAS.some(c => cta.includes(c))) {
    score += 15;
    reasons.push(`"${lead.cta}" is a buying-intent action`);
  } else if (cta.includes("download")) {
    score += 8;
    reasons.push("Report download shows research interest");
  }
  if (lead.cta) signals.push(lead.cta);

  // Industry
  const industry = (lead.industry || "").toLowerCase();
  if (HOT_INDUSTRIES.includes(industry)) {
    score += 10;
    reasons.push(`${lead.industry} historically converts well`);
  }
  if (lead.industry) signals.push(lead.industry);

  // Deal value
  if (lead.valueInr && lead.valueInr >= 2_000_000) {
    score += 15;
    reasons.push("High declared deal value");
  } else if (lead.valueInr && lead.valueInr >= 500_000) {
    score += 10;
    reasons.push("Meaningful declared deal value");
  } else if (lead.valueInr && lead.valueInr > 0) {
    score += 5;
    reasons.push(`Deal value known but relatively low at ${lead.valueInr.toLocaleString("en-IN")} INR`);
  }
  if (lead.valueInr) signals.push(`₹${lead.valueInr.toLocaleString("en-IN")}`);

  // Freshness
  if (lead.ageDays <= 2) {
    score += 10;
    reasons.push("Fresh enquiry — fast response window still open");
    signals.push("New · 0–2d");
  } else if (lead.ageDays <= 5) {
    score += 5;
    signals.push(`Age ${lead.ageDays}d`);
  } else if (lead.ageDays > 10) {
    score -= 10;
    reasons.push(`Open for ${lead.ageDays} days — engagement is going cold`);
    signals.push(`Aging · ${lead.ageDays}d`);
  }

  // Stage momentum
  if (lead.stage === "Proposal") {
    score += 10;
    reasons.push("Proposal already shared — late-stage momentum");
  } else if (lead.stage === "Lead") {
    score += 5;
  }
  signals.push(lead.stage);

  // Follow-up discipline
  const updates = lead.dayUpdates?.length ?? 0;
  if (updates >= 3) {
    score += 5;
    reasons.push("Consistent day-wise follow-ups recorded");
  }

  score = Math.max(5, Math.min(95, score));
  const label: LeadScore["label"] = score >= 70 ? "Hot" : score >= 45 ? "Warm" : "Cool";
  return { score, label, reasons, signals };
}

/**
 * Template-based follow-up email draft, personalized from the lead's context
 * and prior day-wise notes. Deterministic — the user reviews and sends it.
 */
export function draftFollowUpEmail(lead: Lead): { subject: string; body: string } {
  const firstName = lead.name.split(" ")[0] || lead.name;
  const report = lead.reportTitle || "our market research coverage";
  const lastNote = [...(lead.dayUpdates || [])].sort((a, b) => b.dayNumber - a.dayNumber)[0];

  const opening =
    lead.cta?.toLowerCase().includes("sample")
      ? `Thank you for requesting a sample of "${report}".`
      : lead.cta?.toLowerCase().includes("download")
        ? `Thank you for downloading "${report}".`
        : `Thank you for your interest in "${report}".`;

  const continuity = lastNote
    ? `Following up on our last interaction (${lastNote.note.toLowerCase().replace(/\.$/, "")}), I wanted to check how your evaluation is progressing.`
    : `I wanted to check whether you had a chance to review the material and whether the scope aligns with what you need.`;

  const valueLine =
    lead.leadType === "Custom"
      ? `Since you are exploring a customized scope, we can tailor the segmentation, regions and deliverables to your exact requirement.`
      : `We can also share the detailed table of contents and sample pages so you can evaluate the depth of coverage.`;

  return {
    subject: `Re: ${report} — next steps for ${lead.industry || "your team"}`,
    body:
`Dear ${firstName},

${opening}

${continuity}

${valueLine}

Would a short call this week work for you? I am happy to walk you through the findings most relevant to ${lead.industry || "your industry"}.

Best regards,
${lead.assignedToName || "Nexdigm Market Research Team"}
Nexdigm — Think Next.`
  };
}
