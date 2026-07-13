// Shared types — mirror the API DTOs (camelCase JSON from ASP.NET Core).

export type Role = "Admin" | "Manager" | "Executive" | "Basic";
export type EnquiryType = "Unclassified" | "Lead" | "NotLead";
export type LeadType = "Unspecified" | "Custom" | "Syndicate";
export type Stage = "Enquiry" | "Lead" | "Proposal" | "Won" | "Lost";
export type Status = "Open" | "Won" | "Lost" | "Closed";
export type Source = "Website" | "Manual" | "BulkUpload";

export interface SessionUser {
  token: string;
  expiresUtc: string;
  userId: number;
  fullName: string;
  email: string;
  role: Role;
  idleTimeoutMinutes: number;
}

export interface DayUpdate {
  dayNumber: number;
  note: string;
  updatedAtUtc?: string | null;
  updatedBy?: string | null;
}

export interface Lead {
  id: number;
  leadCode: string;
  reportCode?: string | null;
  reportTitle?: string | null;
  industry?: string | null;
  name: string;
  email: string;
  mailType: string;
  countryCode?: string | null;
  phone?: string | null;
  ipAddress?: string | null;
  cta?: string | null;
  reportUrl?: string | null;
  details?: string | null;
  source: Source;
  submittedAtUtc: string;
  assignedToUserId?: number | null;
  assignedToName?: string | null;
  assignedAtUtc?: string | null;
  enquiryType: EnquiryType;
  leadType: LeadType;
  stage: Stage;
  status: Status;
  valueInr?: number | null;
  lostReason?: string | null;
  lostReasonOther?: string | null;
  remarks?: string | null;
  notificationFlag: boolean;
  escalationFlag: boolean;
  createdAtUtc: string;
  lastUpdateAtUtc: string;
  closedAtUtc?: string | null;
  isActive: boolean;
  ageDays: number;
  dayUpdates: DayUpdate[];
}

export interface UserRow {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  managerId?: number | null;
  managerName?: string | null;
  isActive: boolean;
}

export interface VisitorStat {
  id: number;
  ipAddress: string;
  timeSpentSeconds: number;
  visitCount: number;
  firstVisitAtUtc: string;
  lastVisitAtUtc: string;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface NameValue {
  name: string;
  value: number;
}

export interface NeedsAttention {
  escalated: number;
  missingUpdates: number;
  aging: number;
  unassigned: number;
  unclassified: number;
}

export interface PeriodDeltas {
  totalLeadsPct: number;
  wonPct: number;
  conversionPts: number;
  pipelineValuePct: number;
  wonValuePct: number;
}

export interface DashboardSummary {
  totalLeads: number;
  openLeads: number;
  wonLeads: number;
  lostLeads: number;
  closedNotLeads: number;
  unassignedLeads: number;
  conversionRatePct: number;
  pipelineValueInr: number;
  wonValueInr: number;
  lostValueInr: number;
  leadsPerDay: TrendPoint[];
  bySource: NameValue[];
  byStage: NameValue[];
  byIndustry: NameValue[];
  lostReasons: NameValue[];
  needsAttention: NeedsAttention;
  adherencePct: number;
  adherenceOnTrack: number;
  adherenceMissed: number;
  deltas: PeriodDeltas;
  /** all | team | own — the data context this summary was computed in */
  scope: string;
}

export interface DailyVisits {
  date: string;
  newVisitors: number;
  returningVisitors: number;
}

export interface DistributionBucket {
  name: string;
  value: number;
  pct: number;
}

export interface VisitorAnalytics {
  totalVisits: number;
  uniqueVisitors: number;
  returningVisitors: number;
  avgTimeSeconds: number;
  peakDayVisits: number;
  avgVisitsPerDay: number;
  daily: DailyVisits[];
  frequency: DistributionBucket[];
  timeOnSite: DistributionBucket[];
}

export interface Masters {
  lostReasons: string[];
  industries: string[];
  leadTypes: string[];
  stages: string[];
  statuses: string[];
  enquiryTypes: string[];
  roleMatrix: Record<string, Record<string, boolean>>;
}

export interface BulkRowPreview {
  row: number;
  name: string;
  email: string;
  industry?: string | null;
  stage?: string | null;
  status?: string | null;
  handledBy?: string | null;
  rowStatus: "Valid" | "Error" | "Duplicate";
  error?: string | null;
}

export interface BulkUploadResult {
  totalRows: number;
  validRows: number;
  inserted: number;
  errorRows: number;
  duplicateRows: number;
  dryRun: boolean;
  rows: BulkRowPreview[];
}

export interface NotificationRow {
  id: number;
  leadId?: number | null;
  type: string;
  toEmail: string;
  ccEmail?: string | null;
  subject: string;
  emailSent: boolean;
  createdAtUtc: string;
}

export interface LeadFilters {
  view?: "all" | "my" | "pool" | "notlead";
  search?: string;
  stage?: string;
  status?: string;
  industry?: string;
  source?: string;
  ownerId?: number;
}

export interface UpdateLeadPayload {
  enquiryType?: string;
  leadType?: string;
  stage?: string;
  status?: string;
  valueInr?: number | null;
  lostReason?: string;
  lostReasonOther?: string;
  remarks?: string;
}

export interface CreateLeadPayload {
  name: string;
  email: string;
  phone?: string;
  countryCode?: string;
  industry?: string;
  reportCode?: string;
  reportTitle?: string;
  cta?: string;
  details?: string;
  valueInr?: number | null;
  remarks?: string;
}

/** BRDID07 — strict forward-only stage progression. */
export const NEXT_STAGES: Record<Stage, Stage[]> = {
  Enquiry: ["Lead"],
  Lead: ["Proposal"],
  Proposal: ["Won", "Lost"],
  Won: [],
  Lost: []
};

export const isFinalStatus = (s: Status) => s === "Won" || s === "Lost" || s === "Closed";

/** Permission matrix shape shared with the API. */
export type PermissionMatrix = Record<string, Record<string, boolean>>;

/** Display names for the editable ACTION permissions (BRDID01 Role Master). */
export const PERMISSION_LABELS: Record<string, string> = {
  ViewAllLeads: "View All Leads",
  OwnLeads: "Own / Handle Leads",
  CreateLead: "Create Lead (Manual)",
  Reassign: "Re-assignment of leads",
  BulkUpload: "Bulk Upload",
  Export: "Export",
  DeleteLead: "Delete/Inactive",
  AddUser: "Manage Users"
};

/** Display names for PAGE/MODULE access permissions (nav + route guards). */
export const PAGE_PERMISSION_LABELS: Record<string, string> = {
  PageDashboard: "Dashboard",
  PageAskAI: "Ask AI",
  PageLeads: "Leads",
  PageCentralPool: "Central Pool",
  PageBulkUpload: "Bulk Upload",
  PageVisitorAnalytics: "Visitor Analytics",
  PageUsersRoles: "Users & Roles"
};

/** Cells locked to ON so an Admin can never lock themselves out. */
export const LOCKED_PERMISSIONS: [string, Role][] = [
  ["AddUser", "Admin"],
  ["PageUsersRoles", "Admin"]
];

export interface UpdateUserPayload {
  fullName: string;
  role: Role;
  managerId?: number | null;
  isActive: boolean;
  newPassword?: string | null;
  adId?: string | null;
}
