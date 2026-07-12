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

export interface BulkRowError {
  row: number;
  error: string;
}

export interface BulkUploadResult {
  totalRows: number;
  inserted: number;
  failed: number;
  errors: BulkRowError[];
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
