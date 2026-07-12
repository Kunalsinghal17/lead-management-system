/**
 * API client.
 *
 * Talks to the ASP.NET Core API when reachable ("live" mode). When the API
 * cannot be reached — Lovable preview, static hosting, frontend-only dev —
 * it transparently switches to the in-browser mock layer so the whole app
 * remains fully interactive.
 */
import * as mock from "./mock";
import {
  BulkUploadResult, CreateLeadPayload, DashboardSummary, Lead, LeadFilters,
  Masters, NotificationRow, Role, SessionUser, UpdateLeadPayload, UserRow,
  VisitorStat
} from "./types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const FORCE_MOCKS = (import.meta.env.VITE_USE_MOCKS as string | undefined) === "true";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------- mode probe

let modePromise: Promise<"live" | "mock"> | null = null;

export function apiMode(): Promise<"live" | "mock"> {
  if (FORCE_MOCKS) return Promise.resolve("mock");
  if (!modePromise) {
    modePromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(`${BASE}/api/health`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error("health check failed");
        const body = await res.json();
        if (body?.status !== "ok") throw new Error("unexpected health payload");
        return "live" as const;
      } catch {
        console.warn("[LMS] API not reachable — running on built-in demo data (mock mode).");
        return "mock" as const;
      }
    })();
  }
  return modePromise;
}

// ---------------------------------------------------------------- session

function session(): SessionUser | null {
  const raw = sessionStorage.getItem("lms.session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const s = session();
  return s ? { Authorization: `Bearer ${s.token}` } : {};
}

async function http<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers ?? {})
    }
  });
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    const message = body?.message ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

function wrapMock<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof mock.MockApiError) throw new ApiError(e.message, e.status);
    throw e;
  }
}

function me(): { id: number; role: Role } {
  const s = session();
  return { id: s?.userId ?? 0, role: s?.role ?? "Basic" };
}

function downloadBlob(content: string | Blob, filename: string, type = "text/csv") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------- API surface

export const api = {
  async login(email: string, password: string): Promise<SessionUser> {
    if ((await apiMode()) === "mock") return wrapMock(() => mock.mockLogin(email, password));
    const res = await http<{
      token: string; expiresUtc: string; userId: number; fullName: string;
      email: string; role: Role; idleTimeoutMinutes: number;
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    return res;
  },

  async listLeads(filters: LeadFilters = {}): Promise<Lead[]> {
    if ((await apiMode()) === "mock") {
      const u = me();
      return wrapMock(() => mock.mockListLeads(filters, u.id, u.role));
    }
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    });
    return http<Lead[]>(`/api/leads?${params.toString()}`);
  },

  async getLead(id: number): Promise<Lead> {
    if ((await apiMode()) === "mock") return wrapMock(() => mock.mockGetLead(id));
    return http<Lead>(`/api/leads/${id}`);
  },

  async createLead(payload: CreateLeadPayload): Promise<Lead> {
    if ((await apiMode()) === "mock") return wrapMock(() => mock.mockCreateLead(payload));
    return http<Lead>("/api/leads", { method: "POST", body: JSON.stringify(payload) });
  },

  async updateLead(id: number, payload: UpdateLeadPayload): Promise<Lead> {
    if ((await apiMode()) === "mock") {
      const u = me();
      return wrapMock(() => mock.mockUpdateLead(id, payload, u.id, u.role));
    }
    return http<Lead>(`/api/leads/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },

  async assignLead(id: number, userId: number): Promise<Lead> {
    if ((await apiMode()) === "mock") {
      const u = me();
      return wrapMock(() => mock.mockAssign(id, userId, u.id, u.role));
    }
    return http<Lead>(`/api/leads/${id}/assign`, { method: "POST", body: JSON.stringify({ userId }) });
  },

  async addDayUpdate(id: number, dayNumber: number, note: string): Promise<Lead> {
    if ((await apiMode()) === "mock") {
      const u = me();
      return wrapMock(() => mock.mockDayUpdate(id, dayNumber, note, u.id, u.role));
    }
    return http<Lead>(`/api/leads/${id}/day-updates`, {
      method: "POST",
      body: JSON.stringify({ dayNumber, note })
    });
  },

  async deleteLead(id: number): Promise<void> {
    if ((await apiMode()) === "mock") {
      const u = me();
      return wrapMock(() => mock.mockDeleteLead(id, u.role));
    }
    return http<void>(`/api/leads/${id}`, { method: "DELETE" });
  },

  async exportLeads(view = "all"): Promise<void> {
    if ((await apiMode()) === "mock") {
      const u = me();
      const csv = wrapMock(() => mock.mockExportLeadsCsv(view, u.id, u.role));
      downloadBlob(csv, `nexdigm-leads-${Date.now()}.csv`);
      return;
    }
    const res = await fetch(`${BASE}/api/leads/export?view=${view}`, { headers: authHeaders() });
    if (!res.ok) throw new ApiError("Export failed — check your permission.", res.status);
    downloadBlob(await res.blob(), `nexdigm-leads-${Date.now()}.csv`);
  },

  async dashboard(days = 30): Promise<DashboardSummary> {
    if ((await apiMode()) === "mock") return wrapMock(() => mock.mockDashboard(days));
    return http<DashboardSummary>(`/api/dashboard/summary?days=${days}`);
  },

  async masters(): Promise<Masters> {
    if ((await apiMode()) === "mock") return wrapMock(() => mock.mockMasters());
    return http<Masters>("/api/masters");
  },

  async users(): Promise<UserRow[]> {
    if ((await apiMode()) === "mock") return wrapMock(() => mock.mockUsers());
    return http<UserRow[]>("/api/users");
  },

  async createUser(fullName: string, email: string, password: string, role: Role, managerId?: number | null): Promise<UserRow> {
    if ((await apiMode()) === "mock")
      return wrapMock(() => mock.mockCreateUser(fullName, email, password, role, managerId));
    return http<UserRow>("/api/users", {
      method: "POST",
      body: JSON.stringify({ fullName, email, password, role, managerId })
    });
  },

  async visitors(): Promise<VisitorStat[]> {
    if ((await apiMode()) === "mock") return wrapMock(() => mock.mockVisitors());
    return http<VisitorStat[]>("/api/visitors");
  },

  async exportVisitors(): Promise<void> {
    if ((await apiMode()) === "mock") {
      downloadBlob(mock.mockExportVisitorsCsv(), `nexdigm-visitor-analytics-${Date.now()}.csv`);
      return;
    }
    const res = await fetch(`${BASE}/api/visitors/export`, { headers: authHeaders() });
    if (!res.ok) throw new ApiError("Export failed — check your permission.", res.status);
    downloadBlob(await res.blob(), `nexdigm-visitor-analytics-${Date.now()}.csv`);
  },

  async notifications(): Promise<NotificationRow[]> {
    if ((await apiMode()) === "mock") return wrapMock(() => mock.mockNotifications());
    return http<NotificationRow[]>("/api/notifications");
  },

  async runNotificationSweep(): Promise<{ message: string }> {
    if ((await apiMode()) === "mock") return wrapMock(() => mock.mockRunNotificationSweep());
    return http<{ message: string }>("/api/notifications/run-now", { method: "POST" });
  },

  async simulateIngestion(): Promise<{ message: string }> {
    if ((await apiMode()) === "mock") {
      const lead = wrapMock(() => mock.mockSimulateIngestion());
      return { message: `Simulated website enquiry ingested (${lead.leadCode}).` };
    }
    return http<{ message: string }>("/api/ingest/simulate", { method: "POST" });
  },

  async downloadTemplate(): Promise<void> {
    if ((await apiMode()) === "mock") {
      downloadBlob(mock.mockTemplateCsv(), "nexdigm-lms-bulk-upload-template.csv");
      return;
    }
    const res = await fetch(`${BASE}/api/bulk-upload/template`, { headers: authHeaders() });
    if (!res.ok) throw new ApiError("Template download failed.", res.status);
    downloadBlob(await res.blob(), "nexdigm-lms-bulk-upload-template.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  },

  async bulkUpload(file: File): Promise<BulkUploadResult> {
    if ((await apiMode()) === "mock") {
      if (!file.name.toLowerCase().endsWith(".csv"))
        throw new ApiError("Preview mode accepts the .csv template (the live system accepts .xlsx).", 400);
      const text = await file.text();
      return wrapMock(() => mock.mockBulkUpload(text));
    }
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/api/bulk-upload`, {
      method: "POST",
      headers: authHeaders(),
      body: form
    });
    const body = await res.json();
    if (!res.ok) throw new ApiError(body?.message ?? "Upload failed.", res.status);
    return body as BulkUploadResult;
  }
};
