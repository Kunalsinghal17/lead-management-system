/**
 * In-browser mock data layer.
 *
 * Activated automatically when the .NET API is not reachable (e.g. Lovable
 * preview, GitHub Pages, or frontend-only development). It mirrors the same
 * business rules the API enforces (BRDID01–13) so the preview behaves like
 * the real system. State lives in memory for the session.
 */
import {
  BulkUploadResult, CreateLeadPayload, DashboardSummary, DayUpdate, Lead,
  LeadFilters, Masters, NEXT_STAGES, NotificationRow, Role, SessionUser,
  Stage, Status, UpdateLeadPayload, UserRow, VisitorStat, isFinalStatus
} from "./types";

// ------------------------------------------------------------------ helpers

const PERSONAL_DOMAINS = [
  "gmail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com",
  "rediffmail.com", "icloud.com", "protonmail.com", "aol.com", "live.com", "msn.com"
];

function classifyMail(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return PERSONAL_DOMAINS.includes(domain) ? "Personal" : "Professional";
}

function daysAgo(n: number, hoursOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(d.getHours() - hoursOffset);
  return d.toISOString();
}

function ageDaysOf(iso: string): number {
  const created = new Date(iso);
  const now = new Date();
  const a = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

// Deterministic PRNG so every preview shows the same believable data
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ------------------------------------------------------------------ state

interface MockUser extends UserRow {
  password: string;
}

const users: MockUser[] = [
  { id: 1, fullName: "LMS Admin", email: "admin@nexdigm.com", role: "Admin", managerId: null, managerName: null, isActive: true, password: "Admin@123" },
  { id: 2, fullName: "LMS Manager", email: "manager@nexdigm.com", role: "Manager", managerId: null, managerName: null, isActive: true, password: "Manager@123" },
  { id: 3, fullName: "LMS Executive", email: "executive@nexdigm.com", role: "Executive", managerId: 2, managerName: "LMS Manager", isActive: true, password: "Exec@123" },
  { id: 4, fullName: "LMS Basic", email: "basic@nexdigm.com", role: "Basic", managerId: 2, managerName: "LMS Manager", isActive: true, password: "Basic@123" }
];

const masters: Masters = {
  lostReasons: ["No Response From Client", "Commercial", "Credentials", "Student", "Free Info", "Duplicate", "Other"],
  industries: ["Healthcare", "BFSI", "Food Processing", "Technology", "Manufacturing", "Energy", "Retail", "Logistics", "Pharma", "Automotive"],
  leadTypes: ["Custom", "Syndicate"],
  stages: ["Enquiry", "Lead", "Proposal", "Won", "Lost"],
  statuses: ["Open", "Won", "Lost"],
  enquiryTypes: ["Lead", "NotLead"],
  roleMatrix: {
    "View All Leads": { Admin: true, Manager: true, Executive: true, Basic: true },
    "View Own Leads": { Admin: true, Manager: true, Executive: true, Basic: true },
    "Export": { Admin: true, Manager: true, Executive: false, Basic: false },
    "Delete/Inactive": { Admin: true, Manager: false, Executive: false, Basic: false },
    "Add User": { Admin: true, Manager: false, Executive: false, Basic: false },
    "Re-assignment of leads": { Admin: true, Manager: true, Executive: false, Basic: false }
  }
};

let leads: Lead[] = [];
let visitors: VisitorStat[] = [];
let notifications: NotificationRow[] = [];
let nextLeadId = 56;
let nextUserId = 5;
let nextNotificationId = 1;

function buildSeedData() {
  const rnd = mulberry32(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

  const firstNames = ["Aarav", "Priya", "Zoya", "Meera", "Nadia", "Rohan", "Kabir", "Ananya", "Vikram", "Isha", "Dev", "Sana"];
  const lastNames = ["Bhalla", "Deshmukh", "Sethi", "Iyer", "Malhotra", "Fernandes", "Menon", "Nair", "Kapoor", "Shah"];
  const companies = ["renew", "maerskgroup", "adani", "relianceenergy", "tataprojects", "infra-corp", "medlife", "agrofoods"];
  const personal = ["gmail.com", "yahoo.com", "outlook.com"];
  const titles = [
    "Quick-Commerce Grocery Trends", "EV Battery Supply Chain Outlook", "Hospital Digitization Index",
    "Cold Chain Logistics Forecast", "Fintech Lending Landscape", "Specialty Chemicals Deep-Dive",
    "Renewable Grid Storage Report", "OTC Pharma Distribution Study"
  ];
  const ctas = ["Download Report", "Request Sample", "Contact Sales", "Subscribe"];
  const notes = [
    "Intro call attempted — left voicemail.", "Connected on call, shared brochure.",
    "Email sent with sample pages.", "Client reviewing internally, follow-up booked.",
    "Discussed scope customization on call."
  ];
  const lostReasonsSeed = ["No Response From Client", "Commercial", "Student", "Free Info"];

  for (let i = 1; i <= 55; i++) {
    const fn = pick(firstNames);
    const ln = pick(lastNames);
    const professional = rnd() > 0.3;
    const domain = professional ? pick(companies) + ".com" : pick(personal);
    const email = `${fn}.${ln}${professional ? "" : Math.floor(rnd() * 90 + 10)}@${domain}`.toLowerCase();
    const age = Math.floor(rnd() * 30);
    const created = daysAgo(age, Math.floor(rnd() * 10));
    const srcRoll = rnd();
    const source = srcRoll < 0.6 ? "Website" : srcRoll < 0.8 ? "BulkUpload" : "Manual";

    const lead: Lead = {
      id: i,
      leadCode: `LMS-${String(i + 4000).padStart(5, "0")}`,
      reportCode: `RC-${pick(["BFS", "HLC", "TEC", "MFG", "ENR", "RTL", "LOG", "PHM"])}-${1000 + i}`,
      reportTitle: pick(titles),
      industry: pick(masters.industries),
      name: `${fn} ${ln}`,
      email,
      mailType: classifyMail(email),
      countryCode: "+91",
      phone: `9${Math.floor(rnd() * 899999999 + 100000000)}`,
      ipAddress: `${Math.floor(rnd() * 190 + 30)}.${Math.floor(rnd() * 255)}.${Math.floor(rnd() * 255)}.${Math.floor(rnd() * 253 + 1)}`,
      cta: pick(ctas),
      reportUrl: "https://www.nexdigm.com/market-research/reports/sample",
      details: rnd() > 0.6 ? "Interested in customized scope and regional splits." : null,
      source: source as Lead["source"],
      submittedAtUtc: created,
      assignedToUserId: null,
      assignedToName: null,
      assignedAtUtc: null,
      enquiryType: "Unclassified",
      leadType: "Unspecified",
      stage: "Enquiry",
      status: "Open",
      valueInr: null,
      lostReason: null,
      lostReasonOther: null,
      remarks: null,
      notificationFlag: false,
      escalationFlag: false,
      createdAtUtc: created,
      lastUpdateAtUtc: created,
      closedAtUtc: null,
      isActive: true,
      ageDays: age,
      dayUpdates: []
    };

    const bucket = Math.floor(rnd() * 100);
    const ownerRoll = rnd();
    const owner = ownerRoll < 0.5 ? users[2] : ownerRoll < 0.8 ? users[3] : users[1];

    if (bucket < 18) {
      // stays in central pool, unclassified
    } else if (bucket < 28) {
      lead.assignedToUserId = owner.id;
      lead.assignedToName = owner.fullName;
      lead.assignedAtUtc = created;
      lead.enquiryType = "NotLead";
      lead.status = "Closed";
      lead.closedAtUtc = daysAgo(Math.max(0, age - 1));
    } else {
      lead.assignedToUserId = owner.id;
      lead.assignedToName = owner.fullName;
      lead.assignedAtUtc = created;
      lead.enquiryType = "Lead";
      lead.leadType = rnd() > 0.5 ? "Custom" : "Syndicate";
      lead.valueInr = Math.floor(rnd() * 59 + 1) * 100000;

      if (bucket < 55) {
        lead.stage = "Lead";
      } else if (bucket < 72) {
        lead.stage = "Proposal";
      } else if (bucket < 88) {
        lead.stage = "Won";
        lead.status = "Won";
        lead.closedAtUtc = daysAgo(Math.max(0, age - 3));
      } else {
        lead.stage = "Lost";
        lead.status = "Lost";
        lead.lostReason = pick(lostReasonsSeed);
        lead.closedAtUtc = daysAgo(Math.max(0, age - 3));
      }

      const window = Math.min(5, age + 1);
      const filled = Math.floor(rnd() * (window + 1));
      for (let d = 1; d <= filled; d++) {
        lead.dayUpdates.push({
          dayNumber: d,
          note: notes[(d - 1) % notes.length],
          updatedAtUtc: daysAgo(Math.max(0, age - d + 1)),
          updatedBy: owner.fullName
        });
      }
    }

    leads.push(lead);
  }

  // Visitor stats correlated with lead IPs (BRDID13)
  const seen = new Set<string>();
  for (const l of leads.slice(0, 25)) {
    if (!l.ipAddress || seen.has(l.ipAddress)) continue;
    seen.add(l.ipAddress);
    const visits = Math.floor(rnd() * 11 + 1);
    visitors.push({
      id: visitors.length + 1,
      ipAddress: l.ipAddress,
      visitCount: visits,
      timeSpentSeconds: visits * Math.floor(rnd() * 540 + 60),
      firstVisitAtUtc: daysAgo(Math.floor(rnd() * 35 + 5)),
      lastVisitAtUtc: daysAgo(Math.floor(rnd() * 4))
    });
  }
  for (let i = 0; i < 15; i++) {
    visitors.push({
      id: visitors.length + 1,
      ipAddress: `${Math.floor(rnd() * 190 + 30)}.${Math.floor(rnd() * 255)}.${Math.floor(rnd() * 255)}.${Math.floor(rnd() * 253 + 1)}`,
      visitCount: Math.floor(rnd() * 5 + 1),
      timeSpentSeconds: Math.floor(rnd() * 1770 + 30),
      firstVisitAtUtc: daysAgo(Math.floor(rnd() * 28 + 2)),
      lastVisitAtUtc: daysAgo(Math.floor(rnd() * 2))
    });
  }
}

buildSeedData();

function refreshAges() {
  for (const l of leads) l.ageDays = ageDaysOf(l.createdAtUtc);
}

// ------------------------------------------------------------------ auth

export function mockLogin(email: string, password: string): SessionUser {
  const user = users.find(
    u => u.email.toLowerCase() === email.trim().toLowerCase() && u.isActive
  );
  if (!user || user.password !== password)
    throw new MockApiError("Invalid email or password.", 401);
  return {
    token: `mock-token-${user.id}-${Date.now()}`,
    expiresUtc: new Date(Date.now() + 8 * 3600000).toISOString(),
    userId: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    idleTimeoutMinutes: 30
  };
}

// ------------------------------------------------------------------ leads

export function mockListLeads(filters: LeadFilters, currentUserId: number, role: Role): Lead[] {
  refreshAges();
  let list = leads.filter(l => l.isActive);

  switch (filters.view) {
    case "my":
      list = list.filter(l => l.assignedToUserId === currentUserId && l.enquiryType !== "NotLead");
      break;
    case "pool":
      list = list.filter(l => l.assignedToUserId === null && l.status === "Open");
      break;
    case "notlead":
      list = list.filter(l => l.enquiryType === "NotLead");
      if (role !== "Admin") list = list.filter(l => l.assignedToUserId === currentUserId);
      break;
    default:
      list = list.filter(l => l.enquiryType !== "NotLead");
  }

  if (filters.search) {
    const s = filters.search.toLowerCase();
    list = list.filter(l =>
      l.name.toLowerCase().includes(s) ||
      l.email.toLowerCase().includes(s) ||
      l.leadCode.toLowerCase().includes(s) ||
      (l.reportTitle ?? "").toLowerCase().includes(s) ||
      (l.industry ?? "").toLowerCase().includes(s));
  }
  if (filters.stage) list = list.filter(l => l.stage === filters.stage);
  if (filters.status) list = list.filter(l => l.status === filters.status);
  if (filters.industry) list = list.filter(l => l.industry === filters.industry);
  if (filters.source) list = list.filter(l => l.source === filters.source);
  if (filters.ownerId) list = list.filter(l => l.assignedToUserId === filters.ownerId);

  return [...list].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
}

export function mockGetLead(id: number): Lead {
  refreshAges();
  const lead = leads.find(l => l.id === id && l.isActive);
  if (!lead) throw new MockApiError("Lead not found.", 404);
  return lead;
}

export function mockCreateLead(payload: CreateLeadPayload, source: Lead["source"] = "Manual"): Lead {
  if (!payload.name?.trim()) throw new MockApiError("Name is required.");
  if (!payload.email?.includes("@")) throw new MockApiError("A valid email is required.");

  const now = new Date().toISOString();
  const lead: Lead = {
    id: nextLeadId,
    leadCode: `LMS-${String(nextLeadId + 4000).padStart(5, "0")}`,
    reportCode: payload.reportCode || null,
    reportTitle: payload.reportTitle || null,
    industry: payload.industry || null,
    name: payload.name.trim(),
    email: payload.email.trim(),
    mailType: classifyMail(payload.email),
    countryCode: payload.countryCode || "+91",
    phone: payload.phone || null,
    ipAddress: null,
    cta: payload.cta || null,
    reportUrl: null,
    details: payload.details || null,
    source,
    submittedAtUtc: now,
    assignedToUserId: null,
    assignedToName: null,
    assignedAtUtc: null,
    enquiryType: "Unclassified",
    leadType: "Unspecified",
    stage: "Enquiry",
    status: "Open",
    valueInr: payload.valueInr ?? null,
    lostReason: null,
    lostReasonOther: null,
    remarks: payload.remarks || null,
    notificationFlag: false,
    escalationFlag: false,
    createdAtUtc: now,
    lastUpdateAtUtc: now,
    closedAtUtc: null,
    isActive: true,
    ageDays: 0,
    dayUpdates: []
  };
  nextLeadId++;
  leads.unshift(lead);
  return lead;
}

export function mockAssign(leadId: number, targetUserId: number, actingUserId: number, role: Role): Lead {
  const lead = mockGetLead(leadId);
  if (isFinalStatus(lead.status))
    throw new MockApiError("This lead is closed and can no longer be assigned.");
  const target = users.find(u => u.id === targetUserId && u.isActive);
  if (!target) throw new MockApiError("Target user not found or inactive.");

  const isReassignment = lead.assignedToUserId !== null && lead.assignedToUserId !== targetUserId;
  const elevated = role === "Admin" || role === "Manager";
  if (isReassignment && !elevated)
    throw new MockApiError("Only Admin or Manager can re-assign an owned lead.", 403);
  if (!isReassignment && lead.assignedToUserId === null && targetUserId !== actingUserId && !elevated)
    throw new MockApiError("You can only pick pool leads for yourself.", 403);

  lead.assignedToUserId = target.id;
  lead.assignedToName = target.fullName;
  lead.assignedAtUtc = lead.assignedAtUtc ?? new Date().toISOString();
  if (isReassignment) lead.assignedAtUtc = new Date().toISOString();
  lead.lastUpdateAtUtc = new Date().toISOString();
  return lead;
}

export function mockUpdateLead(leadId: number, req: UpdateLeadPayload, actingUserId: number, role: Role): Lead {
  const lead = mockGetLead(leadId);
  const isOwner = lead.assignedToUserId === actingUserId;
  const elevated = role === "Admin" || role === "Manager";
  if (!isOwner && !elevated)
    throw new MockApiError("Only the assigned user (or Admin/Manager) can update this lead.", 403);

  const wasFinal = isFinalStatus(lead.status);

  if (req.remarks !== undefined) {
    if (wasFinal && !elevated) throw new MockApiError("Lead is closed. Only Admin/Manager can edit it.", 403);
    lead.remarks = req.remarks;
  }
  if (req.valueInr !== undefined) {
    if (wasFinal && !elevated) throw new MockApiError("Lead is closed. Only Admin/Manager can edit it.", 403);
    lead.valueInr = req.valueInr;
  }

  // BRDID05 — classification (re-classification allowed while the lead is active)
  if (req.enquiryType) {
    if (wasFinal && !elevated)
      throw new MockApiError("Lead is closed. Only Admin/Manager can re-classify it.", 403);
    const et = req.enquiryType.replace(/\s/g, "");
    if (et !== "Lead" && et !== "NotLead")
      throw new MockApiError("Enquiry Type must be 'Lead' or 'NotLead'.");
    lead.enquiryType = et as Lead["enquiryType"];
    if (et === "NotLead") {
      lead.status = "Closed";
      lead.closedAtUtc = new Date().toISOString();
    }
  }

  const classified = lead.enquiryType !== "Unclassified";

  if (req.leadType) {
    if (!classified) throw new MockApiError("Classify the enquiry (Lead / Not Lead) before updating other fields.");
    if (req.leadType !== "Custom" && req.leadType !== "Syndicate")
      throw new MockApiError("Lead Type must be 'Custom' or 'Syndicate'.");
    lead.leadType = req.leadType;
  }

  // BRDID07 — forward-only stages
  let statusToApply = req.status;
  if (req.stage && req.stage !== lead.stage) {
    if (!classified) throw new MockApiError("Classify the enquiry (Lead / Not Lead) before moving stages.");
    if (lead.enquiryType === "NotLead") throw new MockApiError("Not-Lead enquiries are closed — no stage movement allowed.");
    const allowed = NEXT_STAGES[lead.stage] ?? [];
    if (!allowed.includes(req.stage as Stage))
      throw new MockApiError(
        `Invalid stage move: ${lead.stage} → ${req.stage}. Stages are strictly forward-only (Enquiry → Lead → Proposal → Won/Lost).`);
    lead.stage = req.stage as Stage;
    if (req.stage === "Won") statusToApply = "Won";
    if (req.stage === "Lost") statusToApply = statusToApply ?? "Lost";
  }

  // BRDID08 / 09 — status + mandatory lost reason
  if (statusToApply) {
    if (!classified) throw new MockApiError("Classify the enquiry (Lead / Not Lead) before updating status.");
    if (lead.enquiryType === "NotLead") throw new MockApiError("Not-Lead enquiries are closed by the system.");
    if (!["Open", "Won", "Lost"].includes(statusToApply))
      throw new MockApiError("Status must be Open, Won or Lost.");
    if (wasFinal && statusToApply !== lead.status && !elevated)
      throw new MockApiError("Closed leads can only be corrected by Admin/Manager.", 403);

    if (statusToApply === "Lost") {
      const reason = req.lostReason ?? lead.lostReason;
      if (!reason) throw new MockApiError("Lost Reason is mandatory when marking a lead as Lost (BRDID09).");
      if (reason.toLowerCase() === "other" && !(req.lostReasonOther ?? lead.lostReasonOther))
        throw new MockApiError("Please describe the reason when 'Other' is selected.");
      lead.lostReason = reason;
      lead.lostReasonOther = req.lostReasonOther ?? lead.lostReasonOther;
    }

    lead.status = statusToApply as Status;
    lead.closedAtUtc = isFinalStatus(lead.status) ? new Date().toISOString() : null;
  } else if (req.lostReason || req.lostReasonOther) {
    if (!elevated) throw new MockApiError("Saved Lost Reason can only be edited by Admin/Manager.", 403);
    if (req.lostReason) lead.lostReason = req.lostReason;
    if (req.lostReasonOther) lead.lostReasonOther = req.lostReasonOther;
  }

  lead.lastUpdateAtUtc = new Date().toISOString();
  return lead;
}

export function mockDayUpdate(leadId: number, dayNumber: number, note: string, actingUserId: number, role: Role): Lead {
  const lead = mockGetLead(leadId);
  const isOwner = lead.assignedToUserId === actingUserId;
  const elevated = role === "Admin" || role === "Manager";

  if (!isOwner && !elevated)
    throw new MockApiError("Only the assigned user (or Admin/Manager) can add day-wise updates.", 403);
  if (lead.assignedToUserId === null)
    throw new MockApiError("Assign the lead before recording day-wise updates.");
  if (lead.enquiryType !== "Lead")
    throw new MockApiError("Day-wise updates apply to classified Leads only (BRDID05/06).");
  if (isFinalStatus(lead.status))
    throw new MockApiError("Lead is closed — day-wise updates are no longer required.");
  if (dayNumber < 1 || dayNumber > 5)
    throw new MockApiError("Day number must be between 1 and 5.");
  if (!note.trim()) throw new MockApiError("Update note cannot be empty.");
  if (dayNumber > 1 && !lead.dayUpdates.some(d => d.dayNumber === dayNumber - 1))
    throw new MockApiError(`Please fill Day ${dayNumber - 1} before Day ${dayNumber} (updates must be sequential).`);

  const actor = users.find(u => u.id === actingUserId);
  const existing = lead.dayUpdates.find(d => d.dayNumber === dayNumber);
  const entry: DayUpdate = {
    dayNumber,
    note: note.trim(),
    updatedAtUtc: new Date().toISOString(),
    updatedBy: actor?.fullName ?? "User"
  };
  if (existing) Object.assign(existing, entry);
  else lead.dayUpdates.push(entry);

  lead.lastUpdateAtUtc = new Date().toISOString();
  return lead;
}

export function mockDeleteLead(leadId: number, role: Role): void {
  if (role !== "Admin") throw new MockApiError("Only Admin can delete/inactivate leads.", 403);
  const lead = mockGetLead(leadId);
  lead.isActive = false;
}

export function mockSimulateIngestion(): Lead {
  const rnd = Math.random;
  const names = ["Ravi Krishnan", "Tara Bose", "Neel Vaidya", "Alisha Rao", "Farhan Qureshi"];
  const domains = ["globexpharma.com", "steelcoregroup.com", "gmail.com", "brightretail.in"];
  const industries = ["Pharma", "Manufacturing", "Retail", "Technology"];
  const ctas = ["Download Report", "Request Sample", "Contact Sales"];
  const titles = ["API Manufacturing Outlook", "Smart Factory Adoption", "D2C Retail Playbook"];
  const name = names[Math.floor(rnd() * names.length)];
  const email = name.toLowerCase().replace(/\s/g, ".") + "@" + domains[Math.floor(rnd() * domains.length)];

  const lead = mockCreateLead({
    name,
    email,
    phone: `9${Math.floor(rnd() * 899999999 + 100000000)}`,
    countryCode: "+91",
    industry: industries[Math.floor(rnd() * industries.length)],
    reportCode: `RC-SIM-${Math.floor(rnd() * 9000 + 1000)}`,
    reportTitle: titles[Math.floor(rnd() * titles.length)],
    cta: ctas[Math.floor(rnd() * ctas.length)]
  }, "Website");
  lead.ipAddress = `${Math.floor(rnd() * 190 + 30)}.${Math.floor(rnd() * 255)}.${Math.floor(rnd() * 255)}.${Math.floor(rnd() * 253 + 1)}`;
  return lead;
}

// ------------------------------------------------------------------ dashboard

export function mockDashboard(days = 30): DashboardSummary {
  refreshAges();
  const active = leads.filter(l => l.isActive);
  const real = active.filter(l => l.enquiryType !== "NotLead");
  const won = real.filter(l => l.status === "Won").length;
  const lost = real.filter(l => l.status === "Lost").length;
  const decided = won + lost;

  const trend = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    trend.push({ date: key, count: active.filter(l => l.createdAtUtc.slice(0, 10) === key).length });
  }

  const group = (arr: Lead[], key: (l: Lead) => string | null | undefined) => {
    const map = new Map<string, number>();
    for (const l of arr) {
      const k = key(l);
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const sum = (arr: Lead[]) => arr.reduce((acc, l) => acc + (l.valueInr ?? 0), 0);

  return {
    totalLeads: real.length,
    openLeads: real.filter(l => l.status === "Open").length,
    wonLeads: won,
    lostLeads: lost,
    closedNotLeads: active.filter(l => l.enquiryType === "NotLead").length,
    unassignedLeads: real.filter(l => l.assignedToUserId === null && l.status === "Open").length,
    conversionRatePct: decided === 0 ? 0 : Math.round((1000 * won) / decided) / 10,
    pipelineValueInr: sum(real.filter(l => l.status === "Open")),
    wonValueInr: sum(real.filter(l => l.status === "Won")),
    lostValueInr: sum(real.filter(l => l.status === "Lost")),
    leadsPerDay: trend,
    bySource: group(active, l => l.source),
    byStage: group(real, l => l.stage),
    byIndustry: group(real, l => l.industry).slice(0, 8),
    lostReasons: group(real.filter(l => l.status === "Lost"), l => l.lostReason)
  };
}

// ------------------------------------------------------------------ users, masters, visitors, notifications

export function mockUsers(): UserRow[] {
  return users.map(({ password: _pw, ...u }) => u);
}

export function mockCreateUser(fullName: string, email: string, password: string, role: Role, managerId?: number | null): UserRow {
  if (!fullName.trim() || !email.trim()) throw new MockApiError("Full name and email are required.");
  if (password.length < 8) throw new MockApiError("Password must be at least 8 characters.");
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase()))
    throw new MockApiError("A user with this email already exists.", 409);
  const manager = users.find(u => u.id === managerId);
  const user: MockUser = {
    id: nextUserId++,
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    role,
    managerId: managerId ?? null,
    managerName: manager?.fullName ?? null,
    isActive: true,
    password
  };
  users.push(user);
  const { password: _pw, ...row } = user;
  return row;
}

export function mockMasters(): Masters {
  return masters;
}

export function mockVisitors(): VisitorStat[] {
  return [...visitors].sort((a, b) => b.lastVisitAtUtc.localeCompare(a.lastVisitAtUtc));
}

export function mockNotifications(): NotificationRow[] {
  return [...notifications].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc)).slice(0, 200);
}

/** Mirrors the API's 6 PM sweep (BRDID10) so the demo can trigger it on demand. */
export function mockRunNotificationSweep(): { message: string } {
  refreshAges();
  let count = 0;
  const push = (leadId: number, type: string, to: string, cc: string | null, subject: string) => {
    notifications.push({
      id: nextNotificationId++,
      leadId,
      type,
      toEmail: to,
      ccEmail: cc,
      subject,
      emailSent: false,
      createdAtUtc: new Date().toISOString()
    });
    count++;
  };

  for (const lead of leads.filter(l => l.isActive && l.status === "Open")) {
    const owner = users.find(u => u.id === lead.assignedToUserId);
    const manager = users.find(u => u.id === owner?.managerId);

    if (owner && lead.enquiryType === "Lead" && lead.assignedAtUtc) {
      const day = Math.min(5, ageDaysOf(lead.assignedAtUtc) + 1);
      if (day >= 1 && day <= 5 && !lead.dayUpdates.some(d => d.dayNumber === day)) {
        push(lead.id, "MissingDayUpdate", owner.email, null,
          `[Nexdigm LMS] Day ${day} update pending — ${lead.leadCode} (${lead.name})`);
      }
    }
    if (owner && lead.ageDays > 5 && lead.ageDays <= 10) {
      push(lead.id, "AgingReminder", owner.email, null,
        `[Nexdigm LMS] Lead open ${lead.ageDays} days — ${lead.leadCode} (${lead.name})`);
      lead.notificationFlag = true;
    }
    if (lead.ageDays > 10 && (manager || owner)) {
      push(lead.id, "Escalation", (manager ?? owner)!.email, manager ? owner!.email : null,
        `[Nexdigm LMS] ESCALATION — ${lead.leadCode} open ${lead.ageDays} days`);
      lead.escalationFlag = true;
    }
  }
  return { message: `Notification sweep executed — ${count} notifications generated. Check the log below.` };
}

// ------------------------------------------------------------------ bulk upload (CSV in preview mode)

export const TEMPLATE_COLUMNS = [
  "Report Code", "Name", "Email", "Country Code", "Phone", "Industry",
  "Stage", "Status", "Enquiry Handled By", "Value (INR)", "Remarks"
];

export function mockTemplateCsv(): string {
  return TEMPLATE_COLUMNS.join(",") + "\n" +
    'RC-EXM-0001,Sample Contact,sample.contact@company.com,+91,9800000000,Healthcare,Enquiry,Open,executive@nexdigm.com,250000,Migrated from legacy tracker\n';
}

export function mockBulkUpload(text: string): BulkUploadResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) throw new MockApiError("The file is empty.");

  const header = splitCsvLine(lines[0]).map(h => h.trim());
  for (let i = 0; i < TEMPLATE_COLUMNS.length; i++) {
    if ((header[i] ?? "").toLowerCase() !== TEMPLATE_COLUMNS[i].toLowerCase())
      throw new MockApiError(
        `Template mismatch at column ${i + 1}: expected '${TEMPLATE_COLUMNS[i]}' but found '${header[i] ?? ""}'. Please use the system-generated template.`);
  }

  const errors: { row: number; error: string }[] = [];
  let inserted = 0;
  let total = 0;
  const seen = new Set<string>();
  const existing = new Set(leads.filter(l => l.isActive).map(l => l.email.toLowerCase()));

  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]);
    const [reportCode, name, email, countryCode, phone, industry, stage, status, handledBy, valueRaw, remarks] =
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (cols[i] ?? "").trim());

    if (!name && !email && !reportCode && !phone) continue;
    total++;
    const rowNo = r + 1;

    if (!name) { errors.push({ row: rowNo, error: "Name is mandatory." }); continue; }
    if (!email || !email.includes("@") || !email.includes(".")) {
      errors.push({ row: rowNo, error: "A valid Email is mandatory." }); continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) { errors.push({ row: rowNo, error: `Duplicate email '${email}' within the file.` }); continue; }
    if (existing.has(key)) { errors.push({ row: rowNo, error: `Duplicate: a lead with email '${email}' already exists in LMS.` }); continue; }
    if (stage && !["Enquiry", "Lead", "Proposal", "Won", "Lost"].includes(stage)) {
      errors.push({ row: rowNo, error: `Invalid Stage '${stage}'. Allowed: Enquiry, Lead, Proposal, Won, Lost.` }); continue;
    }
    if (status && !["Open", "Won", "Lost"].includes(status)) {
      errors.push({ row: rowNo, error: `Invalid Status '${status}'. Allowed: Open, Won, Lost.` }); continue;
    }
    let value: number | null = null;
    if (valueRaw) {
      const v = Number(valueRaw.replace(/,/g, ""));
      if (isNaN(v) || v < 0) { errors.push({ row: rowNo, error: `Value (INR) '${valueRaw}' is not a valid number.` }); continue; }
      value = v;
    }
    let owner: MockUser | undefined;
    if (handledBy) {
      owner = users.find(u => u.email.toLowerCase() === handledBy.toLowerCase() && u.isActive);
      if (!owner) { errors.push({ row: rowNo, error: `'Enquiry Handled By' user '${handledBy}' not found in LMS.` }); continue; }
    }

    const lead = mockCreateLead({
      name, email,
      phone: phone || undefined,
      countryCode: countryCode || undefined,
      industry: industry || undefined,
      reportCode: reportCode || undefined,
      remarks: remarks || undefined,
      valueInr: value
    }, "BulkUpload");

    if (stage && stage !== "Enquiry") { lead.stage = stage as Stage; lead.enquiryType = "Lead"; }
    if (status && status !== "Open") {
      lead.status = status as Status;
      lead.enquiryType = "Lead";
      lead.closedAtUtc = new Date().toISOString();
    }
    if (owner) {
      lead.assignedToUserId = owner.id;
      lead.assignedToName = owner.fullName;
      lead.assignedAtUtc = new Date().toISOString();
    }
    seen.add(key);
    inserted++;
  }

  return { totalRows: total, inserted, failed: errors.length, errors };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** CSV export used in mock mode (Export permission still enforced by the UI). */
export function mockExportLeadsCsv(view: string, currentUserId: number, role: Role): string {
  const list = mockListLeads({ view: view as LeadFilters["view"] }, currentUserId, role);
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = "Lead ID,Name,Email,Mail Type,Phone,Industry,Report Code,Report Title,CTA,Source,Enquiry Type,Lead Type,Stage,Status,Value (INR),Lost Reason,Owner,Age (days),Created (UTC)";
  const rows = list.map(l => [
    l.leadCode, l.name, l.email, l.mailType, l.phone, l.industry, l.reportCode, l.reportTitle,
    l.cta, l.source, l.enquiryType, l.leadType, l.stage, l.status, l.valueInr, l.lostReason,
    l.assignedToName, l.ageDays, l.createdAtUtc.slice(0, 16).replace("T", " ")
  ].map(esc).join(","));
  return [header, ...rows].join("\n");
}

export function mockExportVisitorsCsv(): string {
  const header = "IP Address,Time Spent (seconds),No. of Visits,First Visit (UTC),Last Visit (UTC)";
  const rows = mockVisitors().map(v =>
    `${v.ipAddress},${v.timeSpentSeconds},${v.visitCount},${v.firstVisitAtUtc.slice(0, 16).replace("T", " ")},${v.lastVisitAtUtc.slice(0, 16).replace("T", " ")}`);
  return [header, ...rows].join("\n");
}
