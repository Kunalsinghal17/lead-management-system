/* ============================================================================
   Nexdigm Lead Management System (LMS) — SQL Server schema
   ----------------------------------------------------------------------------
   Target      : Microsoft SQL Server 2016+ / Azure SQL / SQL Express / LocalDB
   Generated to match the Entity Framework Core model in:
       api/Nexdigm.Lms.Api/Domain/Entities.cs
       api/Nexdigm.Lms.Api/Data/LmsDbContext.cs
   ----------------------------------------------------------------------------
   WHY THIS SCRIPT EXISTS
   The API had no SQL script and no EF migrations. It relies on EF Core's
   EnsureCreated() at startup, which only builds the schema when the target
   database does NOT already exist. If SQL Server is unreachable the app
   silently falls back to a local SQLite file (nexdigm-lms.db) — which is the
   "there is no API / the API isn't returning data" symptom.

   Run this script once in SSMS / Azure Data Studio / sqlcmd against your
   SQL Server. It creates the database, all 7 tables, indexes, foreign keys,
   and the deterministic master + permission seed rows.

   Column types deliberately mirror EF Core defaults so the running API
   (which does NOT re-validate the schema) reads and writes without error:
       string        -> nvarchar(n)
       DateTime      -> datetime2
       bool          -> bit
       decimal(18,2) -> decimal(18,2)   (Lead.ValueInr, via HasPrecision)
       enum          -> nvarchar(20/30)  (stored as text via HasConversion<string>)

   The script is IDEMPOTENT: safe to run more than once. Objects are created
   only if they don't already exist; seed rows use NOT EXISTS guards.

   NOTE ON USERS: application user accounts are intentionally NOT seeded here,
   because passwords are PBKDF2 hashes produced by the API's PasswordHasher.
   On first run the API's DbSeeder detects the empty Users table and creates
   the demo accounts (Admin@123, Manager@123, Exec@123, Basic@123) with valid
   hashes, plus demo leads/visitors. Master + permission rows below make the
   seeder skip re-seeding those (its guards check for existing rows).
   ============================================================================ */

SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------- database */
IF DB_ID(N'NexdigmLMS') IS NULL
BEGIN
    CREATE DATABASE [NexdigmLMS];
END
GO

USE [NexdigmLMS];
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* ================================================================ TABLES == */

/* ---------------------------------------------------------------- Users --- */
IF OBJECT_ID(N'[dbo].[Users]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Users](
        [Id]           INT             IDENTITY(1,1) NOT NULL,
        [FullName]     NVARCHAR(100)   NOT NULL CONSTRAINT [DF_Users_FullName] DEFAULT (N''),
        [Email]        NVARCHAR(150)   NOT NULL CONSTRAINT [DF_Users_Email]    DEFAULT (N''),
        [PasswordHash] NVARCHAR(500)   NOT NULL CONSTRAINT [DF_Users_PwdHash]  DEFAULT (N''),
        [AdId]         NVARCHAR(100)   NULL,
        [Role]         NVARCHAR(20)    NOT NULL CONSTRAINT [DF_Users_Role]     DEFAULT (N'Basic'),
        [ManagerId]    INT             NULL,
        [IsActive]     BIT             NOT NULL CONSTRAINT [DF_Users_IsActive] DEFAULT (1),
        [CreatedAtUtc] DATETIME2       NOT NULL CONSTRAINT [DF_Users_Created]  DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_Users] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* ---------------------------------------------------------------- Leads --- */
IF OBJECT_ID(N'[dbo].[Leads]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Leads](
        [Id]               INT             IDENTITY(1,1) NOT NULL,
        [LeadCode]         NVARCHAR(20)    NOT NULL CONSTRAINT [DF_Leads_LeadCode] DEFAULT (N''),
        -- Auto (ingestion) fields
        [ReportCode]       NVARCHAR(50)    NULL,
        [ReportTitle]      NVARCHAR(300)   NULL,
        [Industry]         NVARCHAR(100)   NULL,
        [Name]             NVARCHAR(150)   NOT NULL CONSTRAINT [DF_Leads_Name]     DEFAULT (N''),
        [Email]            NVARCHAR(150)   NOT NULL CONSTRAINT [DF_Leads_Email]    DEFAULT (N''),
        [MailType]         NVARCHAR(20)    NOT NULL CONSTRAINT [DF_Leads_MailType] DEFAULT (N'Professional'),
        [CountryCode]      NVARCHAR(10)    NULL,
        [Phone]            NVARCHAR(30)    NULL,
        [IpAddress]        NVARCHAR(50)    NULL,
        [Cta]              NVARCHAR(100)   NULL,
        [ReportUrl]        NVARCHAR(500)   NULL,
        [Details]          NVARCHAR(2000)  NULL,
        [SubmittedAtUtc]   DATETIME2       NOT NULL CONSTRAINT [DF_Leads_Submitted] DEFAULT (SYSUTCDATETIME()),
        [Source]           NVARCHAR(20)    NOT NULL CONSTRAINT [DF_Leads_Source]    DEFAULT (N'Website'),
        -- Ownership
        [AssignedToUserId] INT             NULL,
        [AssignedAtUtc]    DATETIME2       NULL,
        -- Manual fields
        [EnquiryType]      NVARCHAR(20)    NOT NULL CONSTRAINT [DF_Leads_EnquiryType] DEFAULT (N'Unclassified'),
        [LeadType]         NVARCHAR(20)    NOT NULL CONSTRAINT [DF_Leads_LeadType]    DEFAULT (N'Unspecified'),
        [Stage]            NVARCHAR(20)    NOT NULL CONSTRAINT [DF_Leads_Stage]       DEFAULT (N'Enquiry'),
        [Status]           NVARCHAR(20)    NOT NULL CONSTRAINT [DF_Leads_Status]      DEFAULT (N'Open'),
        [ValueInr]         DECIMAL(18,2)   NULL,
        [LostReason]       NVARCHAR(100)   NULL,
        [LostReasonOther]  NVARCHAR(1000)  NULL,
        [Remarks]          NVARCHAR(2000)  NULL,
        -- System tracking
        [NotificationFlag] BIT             NOT NULL CONSTRAINT [DF_Leads_NotifFlag] DEFAULT (0),
        [EscalationFlag]   BIT             NOT NULL CONSTRAINT [DF_Leads_EscFlag]   DEFAULT (0),
        [CreatedAtUtc]     DATETIME2       NOT NULL CONSTRAINT [DF_Leads_Created]    DEFAULT (SYSUTCDATETIME()),
        [LastUpdateAtUtc]  DATETIME2       NOT NULL CONSTRAINT [DF_Leads_LastUpd]    DEFAULT (SYSUTCDATETIME()),
        [ClosedAtUtc]      DATETIME2       NULL,
        [IsActive]         BIT             NOT NULL CONSTRAINT [DF_Leads_IsActive]   DEFAULT (1),
        CONSTRAINT [PK_Leads] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* -------------------------------------------------------- LeadDayUpdates -- */
IF OBJECT_ID(N'[dbo].[LeadDayUpdates]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[LeadDayUpdates](
        [Id]              INT            IDENTITY(1,1) NOT NULL,
        [LeadId]          INT            NOT NULL,
        [DayNumber]       INT            NOT NULL,
        [Note]            NVARCHAR(2000) NOT NULL CONSTRAINT [DF_LeadDayUpdates_Note] DEFAULT (N''),
        [UpdatedByUserId] INT            NOT NULL,
        [UpdatedAtUtc]    DATETIME2      NOT NULL CONSTRAINT [DF_LeadDayUpdates_Upd]  DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_LeadDayUpdates] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* ---------------------------------------------------------- VisitorStats -- */
IF OBJECT_ID(N'[dbo].[VisitorStats]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[VisitorStats](
        [Id]               INT       IDENTITY(1,1) NOT NULL,
        [IpAddress]        NVARCHAR(50) NOT NULL CONSTRAINT [DF_VisitorStats_Ip] DEFAULT (N''),
        [TimeSpentSeconds] INT       NOT NULL CONSTRAINT [DF_VisitorStats_Time]  DEFAULT (0),
        [VisitCount]       INT       NOT NULL CONSTRAINT [DF_VisitorStats_Count] DEFAULT (0),
        [FirstVisitAtUtc]  DATETIME2 NOT NULL CONSTRAINT [DF_VisitorStats_First] DEFAULT (SYSUTCDATETIME()),
        [LastVisitAtUtc]   DATETIME2 NOT NULL CONSTRAINT [DF_VisitorStats_Last]  DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_VisitorStats] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* ----------------------------------------------------------- VisitEvents -- */
IF OBJECT_ID(N'[dbo].[VisitEvents]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[VisitEvents](
        [Id]               INT       IDENTITY(1,1) NOT NULL,
        [IpAddress]        NVARCHAR(50) NOT NULL CONSTRAINT [DF_VisitEvents_Ip]  DEFAULT (N''),
        [VisitAtUtc]       DATETIME2 NOT NULL CONSTRAINT [DF_VisitEvents_At]     DEFAULT (SYSUTCDATETIME()),
        [TimeSpentSeconds] INT       NOT NULL CONSTRAINT [DF_VisitEvents_Time]   DEFAULT (0),
        CONSTRAINT [PK_VisitEvents] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* ------------------------------------------------------- NotificationLogs - */
IF OBJECT_ID(N'[dbo].[NotificationLogs]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[NotificationLogs](
        [Id]           INT            IDENTITY(1,1) NOT NULL,
        [LeadId]       INT            NULL,   -- intentionally NOT a FK (matches EF model: no navigation configured)
        [Type]         NVARCHAR(30)   NOT NULL CONSTRAINT [DF_NotificationLogs_Type] DEFAULT (N'System'),
        [ToEmail]      NVARCHAR(150)  NOT NULL CONSTRAINT [DF_NotificationLogs_To]   DEFAULT (N''),
        [CcEmail]      NVARCHAR(150)  NULL,
        [Subject]      NVARCHAR(300)  NOT NULL CONSTRAINT [DF_NotificationLogs_Subj] DEFAULT (N''),
        [Body]         NVARCHAR(4000) NOT NULL CONSTRAINT [DF_NotificationLogs_Body] DEFAULT (N''),
        [EmailSent]    BIT            NOT NULL CONSTRAINT [DF_NotificationLogs_Sent] DEFAULT (0),
        [CreatedAtUtc] DATETIME2      NOT NULL CONSTRAINT [DF_NotificationLogs_Created] DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_NotificationLogs] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* ----------------------------------------------------------- MasterItems -- */
IF OBJECT_ID(N'[dbo].[MasterItems]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MasterItems](
        [Id]        INT           IDENTITY(1,1) NOT NULL,
        [Type]      NVARCHAR(50)  NOT NULL CONSTRAINT [DF_MasterItems_Type]  DEFAULT (N''),
        [Value]     NVARCHAR(200) NOT NULL CONSTRAINT [DF_MasterItems_Value] DEFAULT (N''),
        [SortOrder] INT           NOT NULL CONSTRAINT [DF_MasterItems_Sort]  DEFAULT (0),
        [IsActive]  BIT           NOT NULL CONSTRAINT [DF_MasterItems_Active] DEFAULT (1),
        CONSTRAINT [PK_MasterItems] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* =============================================================== INDEXES == */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Users_Email' AND object_id = OBJECT_ID(N'[dbo].[Users]'))
    CREATE UNIQUE INDEX [IX_Users_Email] ON [dbo].[Users]([Email] ASC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Users_ManagerId' AND object_id = OBJECT_ID(N'[dbo].[Users]'))
    CREATE INDEX [IX_Users_ManagerId] ON [dbo].[Users]([ManagerId] ASC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Leads_LeadCode' AND object_id = OBJECT_ID(N'[dbo].[Leads]'))
    CREATE UNIQUE INDEX [IX_Leads_LeadCode] ON [dbo].[Leads]([LeadCode] ASC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Leads_Email' AND object_id = OBJECT_ID(N'[dbo].[Leads]'))
    CREATE INDEX [IX_Leads_Email] ON [dbo].[Leads]([Email] ASC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Leads_Status_IsActive' AND object_id = OBJECT_ID(N'[dbo].[Leads]'))
    CREATE INDEX [IX_Leads_Status_IsActive] ON [dbo].[Leads]([Status] ASC, [IsActive] ASC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Leads_AssignedToUserId' AND object_id = OBJECT_ID(N'[dbo].[Leads]'))
    CREATE INDEX [IX_Leads_AssignedToUserId] ON [dbo].[Leads]([AssignedToUserId] ASC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LeadDayUpdates_LeadId_DayNumber' AND object_id = OBJECT_ID(N'[dbo].[LeadDayUpdates]'))
    CREATE UNIQUE INDEX [IX_LeadDayUpdates_LeadId_DayNumber] ON [dbo].[LeadDayUpdates]([LeadId] ASC, [DayNumber] ASC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_VisitorStats_IpAddress' AND object_id = OBJECT_ID(N'[dbo].[VisitorStats]'))
    CREATE UNIQUE INDEX [IX_VisitorStats_IpAddress] ON [dbo].[VisitorStats]([IpAddress] ASC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_VisitEvents_VisitAtUtc' AND object_id = OBJECT_ID(N'[dbo].[VisitEvents]'))
    CREATE INDEX [IX_VisitEvents_VisitAtUtc] ON [dbo].[VisitEvents]([VisitAtUtc] ASC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_VisitEvents_IpAddress' AND object_id = OBJECT_ID(N'[dbo].[VisitEvents]'))
    CREATE INDEX [IX_VisitEvents_IpAddress] ON [dbo].[VisitEvents]([IpAddress] ASC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MasterItems_Type_Value' AND object_id = OBJECT_ID(N'[dbo].[MasterItems]'))
    CREATE UNIQUE INDEX [IX_MasterItems_Type_Value] ON [dbo].[MasterItems]([Type] ASC, [Value] ASC);
GO

/* =========================================================== FOREIGN KEYS = */

-- User.ManagerId -> Users.Id  (Restrict / NO ACTION)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Users_Users_ManagerId')
    ALTER TABLE [dbo].[Users] WITH CHECK
        ADD CONSTRAINT [FK_Users_Users_ManagerId]
        FOREIGN KEY ([ManagerId]) REFERENCES [dbo].[Users]([Id]) ON DELETE NO ACTION;
GO

-- Lead.AssignedToUserId -> Users.Id  (Restrict / NO ACTION)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Leads_Users_AssignedToUserId')
    ALTER TABLE [dbo].[Leads] WITH CHECK
        ADD CONSTRAINT [FK_Leads_Users_AssignedToUserId]
        FOREIGN KEY ([AssignedToUserId]) REFERENCES [dbo].[Users]([Id]) ON DELETE NO ACTION;
GO

-- LeadDayUpdate.LeadId -> Leads.Id  (Cascade)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_LeadDayUpdates_Leads_LeadId')
    ALTER TABLE [dbo].[LeadDayUpdates] WITH CHECK
        ADD CONSTRAINT [FK_LeadDayUpdates_Leads_LeadId]
        FOREIGN KEY ([LeadId]) REFERENCES [dbo].[Leads]([Id]) ON DELETE CASCADE;
GO

/* ================================================== SEED: MASTER DROPDOWNS =
   Matches DbSeeder.SeedMastersAsync. Because these rows exist, the API's
   seeder will SKIP re-seeding masters (its guard: MasterItems.AnyAsync()).
   ========================================================================== */

;WITH src([Type],[Value],[SortOrder]) AS (
    SELECT * FROM (VALUES
        (N'LostReason', N'No Response From Client', 0),
        (N'LostReason', N'Commercial',              1),
        (N'LostReason', N'Credentials',             2),
        (N'LostReason', N'Student',                 3),
        (N'LostReason', N'Free Info',               4),
        (N'LostReason', N'Duplicate',               5),
        (N'LostReason', N'Other',                   6),
        (N'Industry',   N'Healthcare',              0),
        (N'Industry',   N'BFSI',                    1),
        (N'Industry',   N'Food Processing',         2),
        (N'Industry',   N'Technology',              3),
        (N'Industry',   N'Manufacturing',           4),
        (N'Industry',   N'Energy',                  5),
        (N'Industry',   N'Retail',                  6),
        (N'Industry',   N'Logistics',               7),
        (N'Industry',   N'Pharma',                  8),
        (N'Industry',   N'Automotive',              9),
        (N'Cta',        N'Download Report',         0),
        (N'Cta',        N'Request Sample',          1),
        (N'Cta',        N'Contact Sales',           2),
        (N'Cta',        N'Subscribe',               3)
    ) v([Type],[Value],[SortOrder])
)
INSERT INTO [dbo].[MasterItems]([Type],[Value],[SortOrder],[IsActive])
SELECT s.[Type], s.[Value], s.[SortOrder], 1
FROM src s
WHERE NOT EXISTS (
    SELECT 1 FROM [dbo].[MasterItems] m
    WHERE m.[Type] = s.[Type] AND m.[Value] = s.[Value]
);
GO

/* ================================================ SEED: PERMISSION MATRIX ==
   Matches PermissionActions.Defaults. Stored in MasterItems with
   Type = 'Permission', Value = 'Action:Role', IsActive = allowed flag.
   Because Permission rows exist, PermissionService.SeedDefaultsAsync SKIPS
   re-seeding (guard: MasterItems.AnyAsync(Type == 'Permission')).
   Roles: Admin, Manager, Executive, Basic.
   ========================================================================== */

;WITH perm([Value],[IsActive]) AS (
    SELECT * FROM (VALUES
        -- ViewAllLeads: all true
        (N'ViewAllLeads:Admin',1),(N'ViewAllLeads:Manager',1),(N'ViewAllLeads:Executive',1),(N'ViewAllLeads:Basic',1),
        -- OwnLeads: executive only
        (N'OwnLeads:Admin',0),(N'OwnLeads:Manager',0),(N'OwnLeads:Executive',1),(N'OwnLeads:Basic',0),
        -- CreateLead: admin/manager/executive
        (N'CreateLead:Admin',1),(N'CreateLead:Manager',1),(N'CreateLead:Executive',1),(N'CreateLead:Basic',0),
        -- Reassign: admin/manager
        (N'Reassign:Admin',1),(N'Reassign:Manager',1),(N'Reassign:Executive',0),(N'Reassign:Basic',0),
        -- BulkUpload: admin/manager/executive
        (N'BulkUpload:Admin',1),(N'BulkUpload:Manager',1),(N'BulkUpload:Executive',1),(N'BulkUpload:Basic',0),
        -- Export: admin/manager
        (N'Export:Admin',1),(N'Export:Manager',1),(N'Export:Executive',0),(N'Export:Basic',0),
        -- DeleteLead: admin only
        (N'DeleteLead:Admin',1),(N'DeleteLead:Manager',0),(N'DeleteLead:Executive',0),(N'DeleteLead:Basic',0),
        -- AddUser: admin only
        (N'AddUser:Admin',1),(N'AddUser:Manager',0),(N'AddUser:Executive',0),(N'AddUser:Basic',0),
        -- Page access
        (N'PageDashboard:Admin',1),(N'PageDashboard:Manager',1),(N'PageDashboard:Executive',1),(N'PageDashboard:Basic',1),
        (N'PageAskAI:Admin',1),(N'PageAskAI:Manager',1),(N'PageAskAI:Executive',1),(N'PageAskAI:Basic',1),
        (N'PageLeads:Admin',1),(N'PageLeads:Manager',1),(N'PageLeads:Executive',1),(N'PageLeads:Basic',1),
        (N'PageCentralPool:Admin',1),(N'PageCentralPool:Manager',1),(N'PageCentralPool:Executive',1),(N'PageCentralPool:Basic',1),
        (N'PageBulkUpload:Admin',1),(N'PageBulkUpload:Manager',1),(N'PageBulkUpload:Executive',1),(N'PageBulkUpload:Basic',0),
        (N'PageVisitorAnalytics:Admin',1),(N'PageVisitorAnalytics:Manager',1),(N'PageVisitorAnalytics:Executive',1),(N'PageVisitorAnalytics:Basic',0),
        (N'PageUsersRoles:Admin',1),(N'PageUsersRoles:Manager',0),(N'PageUsersRoles:Executive',0),(N'PageUsersRoles:Basic',0)
    ) v([Value],[IsActive])
)
INSERT INTO [dbo].[MasterItems]([Type],[Value],[SortOrder],[IsActive])
SELECT N'Permission', p.[Value], 0, p.[IsActive]
FROM perm p
WHERE NOT EXISTS (
    SELECT 1 FROM [dbo].[MasterItems] m
    WHERE m.[Type] = N'Permission' AND m.[Value] = p.[Value]
);
GO

/* ============================================================================
   OPTIONAL — application user accounts.
   Left commented on purpose: PasswordHash must be a PBKDF2 hash generated by
   the API's PasswordHasher, which cannot be reproduced in plain T-SQL. Leave
   the Users table empty and start the API once — its DbSeeder creates:
       harshit.mishra@nexdigm.com / Admin@123     (Admin)
       harsh.mittal@nexdigm.com   / Manager@123   (Manager)
       aditi.sharma@nexdigm.com   / Exec@123      (Executive)
       rohan.kulkarni@nexdigm.com / Exec@123      (Executive)
       neha.joshi@nexdigm.com     / Exec@123      (Executive)
       priyank.desai@nexdigm.com  / Basic@123     (Basic)
   ...plus ~55 demo leads and visitor analytics.
   To suppress demo leads set "Seed:SampleLeads": false in appsettings.json.
   ============================================================================ */

PRINT N'Nexdigm LMS schema ready. Tables, indexes, FKs and master/permission seed applied.';
GO
