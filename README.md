# Nexdigm — Lead Management System (LMS)

Centralized Lead Management System for Nexdigm Market Research, built from the BRD
(*Nexdigm BRD "Lead Management System" V 2.0*). It automates enquiry capture from the
website (MarketRAdmin), lead assignment, lifecycle tracking, day-wise follow-ups,
notifications & escalations, bulk upload and visitor analytics — with role-based access
throughout.

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind (Nexdigm brand palette, Arial) |
| Backend | ASP.NET Core 8 Web API (C#) |
| Database | SQL Server (EF Core, auto-create + seed on first run; SQLite fallback for machines without SQL Server) |
| Auth | JWT + database users today, behind an `IAuthProvider` seam ready for Active Directory / Entra ID (Gene) |

---

## Quick start (VS Code — "clone and run")

Prerequisites: [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) and [Node.js 18+](https://nodejs.org).

```bash
git clone <your-repo-url>
cd nexdigm-lms
npm install
```

Then either:

**One key:** open the folder in VS Code → `Ctrl+Shift+B` (runs the default task
**Run LMS (API + Frontend)** which starts both processes), or

**Two terminals:**

```bash
# Terminal 1 — API on http://localhost:5164 (creates + seeds the database on first run)
dotnet run --project api/Nexdigm.Lms.Api/Nexdigm.Lms.Api.csproj

# Terminal 2 — frontend on http://localhost:5173 (proxies /api to the API)
npm run dev
```

Open **http://localhost:5173** and sign in:

| Role | Name | Email | Password |
|---|---|---|---|
| Admin | Harshit Mishra | harshit.mishra@nexdigm.com | Admin@123 |
| Manager | Harsh Mittal | harsh.mittal@nexdigm.com | Manager@123 |
| Executive | Aditi Sharma | aditi.sharma@nexdigm.com | Exec@123 |
| Executive | Rohan Kulkarni | rohan.kulkarni@nexdigm.com | Exec@123 |
| Executive | Neha Joshi | neha.joshi@nexdigm.com | Exec@123 |
| Basic | Priyank Desai | priyank.desai@nexdigm.com | Basic@123 |

Leads are owned and handled by **Executives** (Admin/Manager oversee, re-assign and escalate).
This is driven by the editable permission matrix below, not hard-coded.

The database is created and seeded automatically on first API start — masters, the four
users above, ~55 realistic sample leads and visitor analytics data.

### Database options

`api/Nexdigm.Lms.Api/appsettings.json`:

- **SQL Server (default):** points at `(localdb)\MSSQLLocalDB`. Change
  `ConnectionStrings:SqlServer` for a full SQL Server instance, e.g.
  `Server=.;Database=NexdigmLMS;Trusted_Connection=True;TrustServerCertificate=True`.
- **Automatic fallback:** if SQL Server is unreachable at startup (e.g. a laptop without
  LocalDB), the API logs a warning and runs on a local SQLite file (`nexdigm-lms.db`) so the
  app still works out of the box. Disable via `Database:AllowSqliteFallback: false`.
- Set `Seed:SampleLeads: false` to start with an empty pipeline (masters + users only).

---

## Lovable / static preview

The frontend is a standard Vite + React app at the repository root, so the repo can be
pushed to GitHub and connected to Lovable as-is. When the .NET API is not reachable, the
app automatically switches to a **built-in mock data layer** that mirrors every business
rule (same login accounts, same validations), so the full UI is interactive in preview —
a "Preview mode — demo data" badge appears in the sidebar. No configuration needed.

To point a hosted frontend at a hosted API, set `VITE_API_URL` (see `.env.example`).

---

## What's implemented (BRD traceability)

| BRD ID | Requirement | Where |
|---|---|---|
| BRDID01 | User login & role access (page/field/action level), **editable permission matrix** | `AuthController`, JWT roles, `PermissionService` (DB-stored matrix, Admin edits it on Users & Roles; API enforces per request) |
| BRDID02 | Web ingestion from MarketRAdmin (real-time API) | `POST /api/ingest/enquiry` (X-Api-Key), "Simulate web enquiry" on Dashboard |
| BRDID03 | Auto + manual lead creation, uniform schema, defaults | `LeadService.CreateLeadAsync`, Create Lead modal |
| BRDID04 | Central assignment — pool, single owner, Admin/Manager re-assign | Central Pool page, `POST /api/leads/{id}/assign` |
| BRDID05 | Enquiry Type (Lead / Not Lead) mandatory; Not Lead auto-closes | Lead drawer classification; Not Lead pool tab |
| BRDID06 | Day-wise updates D1–D5, sequential, owner-only | Lead drawer D1–D5 section, `POST /api/leads/{id}/day-updates` |
| BRDID07 | Lifecycle stages, strict forward-only | Stage dropdown offers only valid next stages; server re-validates |
| BRDID08 | Status (Open/Won/Lost) independent of stage; final = inactive | Lead drawer status; server rules |
| BRDID09 | Mandatory Lost Reason (+ text when "Other"); later edits Admin/Manager | Lost reason panel in drawer |
| BRDID10 | Daily 6 PM sweep — missed-update reminders, >5d aging, >10d manager escalation | `NotificationScheduler` (BackgroundService), outbox on Users & Roles page, "Run sweep now" |
| BRDID11 | Field catalogue — auto fields read-only, manual fields role-based | Lead drawer "Enquiry details" (read-only) vs editable manual fields |
| BRDID12 | Bulk upload — system template, structure/row/file validation, error report | Bulk Upload page, `ExcelService` (ClosedXML) |
| BRDID13 | Visitor timestamping & visit count via API, exportable | Visitor Analytics page, `POST /api/visitors/ingest` |

**Smart features (no external AI API — fully rule-based and deterministic):**

- **Ask AI** — natural-language questions over live pipeline data ("which leads need
  follow-up?", "lost reason analysis", "leads older than 5 days", "breakdown by source"...).
- **Lead scoring** — explainable conversion-likelihood score (email domain type, CTA
  intent, industry, value, freshness, stage momentum) with stated reasons.
- **Follow-up assistant** — drafts a personalized follow-up email from the lead's context
  and day-wise notes; the user reviews, copies and sends.

**Security controls (per the BRD's implicit requirements):** no page renders without
login; JWT validated on every API call (UI bypass is rejected server-side); passwords
masked and PBKDF2-hashed; idle-session timeout with re-login; credentials never in URLs;
generic error messages; EF Core parameterized queries (SQL-injection safe); CORS
restricted; role checks at page, field and action level.

---

## Project layout

```
nexdigm-lms/
├── index.html, src/               # React frontend (Vite root — Lovable-compatible)
│   ├── pages/                     # Dashboard, Ask AI, Leads, Central Pool, Bulk Upload,
│   │                              # Visitor Analytics, Users & Roles, Login
│   ├── components/                # Layout, LeadDrawer, Badges
│   └── lib/                       # api client (live/mock switch), mock engine, auth,
│                                  # scoring, NLQ engine, types, formatting
├── api/Nexdigm.Lms.Api/           # ASP.NET Core 8 Web API
│   ├── Controllers/               # Auth, Leads, Users, Masters, Dashboard, BulkUpload,
│   │                              # Visitors, Ingest, Notifications
│   ├── Services/                  # LeadService (business rules), ExcelService,
│   │                              # EmailService, NotificationScheduler, LeadRules
│   ├── Domain/                    # Entities + enums
│   ├── Data/                      # LmsDbContext, DbSeeder
│   └── Auth/                      # IAuthProvider (AD-ready), DbAuthProvider,
│                                  # TokenService, PasswordHasher
├── Nexdigm.Lms.sln
└── .vscode/                       # One-key run tasks + debugger config
```

## Configuration reference (`appsettings.json`)

| Key | Purpose |
|---|---|
| `Database:Provider` | `SqlServer` (default) or `Sqlite` |
| `Database:AllowSqliteFallback` | Auto-fallback when SQL Server is unreachable (default `true`) |
| `Jwt:*` | Token issuer/key/expiry + `IdleTimeoutMinutes` (session timeout) |
| `Ingestion:ApiKey` | Shared key MarketRAdmin / visitor tool send as `X-Api-Key` |
| `Email:*` | SMTP settings; when `Enabled: false`, emails are logged to the in-app outbox instead |
| `Notifications:*` | Daily run hour (IST), aging (5d) and escalation (10d) thresholds, optional demo interval |
| `Seed:*` | Toggle seeding of masters/users/sample data |

## API surface (Swagger at `/swagger` in Development)

- `POST /api/auth/login`
- `GET/POST/PUT/DELETE /api/leads` (+ `/assign`, `/day-updates`, `/export`)
- `GET /api/dashboard/summary`, `GET /api/masters`, `GET/POST /api/users`, `GET /api/users/assignable`
- `GET/PUT /api/permissions` (editable role matrix; PUT is Admin-only)
- `GET /api/bulk-upload/template`, `POST /api/bulk-upload`
- `GET /api/visitors`, `GET /api/visitors/export`, `POST /api/visitors/ingest` (API key)
- `POST /api/ingest/enquiry` (API key), `POST /api/ingest/simulate`
- `GET /api/notifications`, `POST /api/notifications/run-now`

## Where visitor analytics data comes from

The IPs/visits on the Visitor Analytics page are **seeded demo data** (BRDID13 demo).
There is no built-in website tracker — in production your website/SEO tool must push
events to `POST /api/visitors/ingest` with the `X-Api-Key` header and body
`{ "ipAddress": "…", "timeSpentSeconds": 123, "visitAt": "…" }`. The LMS aggregates
time-on-site and visit counts per IP and correlates them with lead IPs.

## Integrating the real MarketRAdmin

Point MarketRAdmin's webhook at `POST /api/ingest/enquiry` with header
`X-Api-Key: <Ingestion:ApiKey>` and this JSON body:

```json
{
  "reportCode": "RC-BFS-1035", "reportTitle": "Quick-Commerce Grocery Trends",
  "industry": "BFSI", "name": "Nadia Malhotra", "email": "nadia.malhotra@renew.com",
  "countryCode": "+91", "phone": "9302760591", "ipAddress": "138.35.245.200",
  "cta": "Download Report", "reportUrl": "https://…", "details": "…",
  "submittedAt": "2026-07-13T10:20:00Z"
}
```

## Moving to Active Directory (Gene)

Implement `IAuthProvider` (e.g. `AdAuthProvider`) that validates against AD/Entra ID and
maps the AD ID from Gene to the `Users` table (`AdId` column already exists), then swap
the DI registration in `Program.cs`. Controllers, tokens and role checks stay unchanged.

---

Phase-2 candidates left out per the BRD: CRM integrations, ML-based scoring, advanced
dashboards.

© Nexdigm Private Limited — internal use only.
