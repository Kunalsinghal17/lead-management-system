using System.ComponentModel.DataAnnotations;

namespace Nexdigm.Lms.Api.Domain;

/// <summary>Application user. DB-backed today; designed so Active Directory (Gene) can plug in later via IAuthProvider.</summary>
public class User
{
    public int Id { get; set; }

    [MaxLength(100)]
    public string FullName { get; set; } = "";

    [MaxLength(150)]
    public string Email { get; set; } = "";

    /// <summary>PBKDF2 hash. Empty when the account authenticates via Active Directory.</summary>
    [MaxLength(500)]
    public string PasswordHash { get; set; } = "";

    /// <summary>AD identifier placeholder (from Gene) for future Active Directory integration.</summary>
    [MaxLength(100)]
    public string? AdId { get; set; }

    public UserRole Role { get; set; } = UserRole.Basic;

    /// <summary>Reporting manager — target of BRDID10 escalations.</summary>
    public int? ManagerId { get; set; }
    public User? Manager { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>The lead record — single source of truth (BRDID11 field catalogue).</summary>
public class Lead
{
    public int Id { get; set; }

    /// <summary>Human-readable lead id, e.g. LMS-04036. Unique placeholder until the identity is known.</summary>
    [MaxLength(20)]
    public string LeadCode { get; set; } = Guid.NewGuid().ToString("N")[..20];

    // ---- Auto fields (BRDID02 ingestion — read-only for users) ----
    [MaxLength(50)]  public string? ReportCode { get; set; }
    [MaxLength(300)] public string? ReportTitle { get; set; }
    [MaxLength(100)] public string? Industry { get; set; }
    [MaxLength(150)] public string Name { get; set; } = "";
    [MaxLength(150)] public string Email { get; set; } = "";
    /// <summary>Auto: Professional (company domain) / Personal (gmail/yahoo/...).</summary>
    [MaxLength(20)]  public string MailType { get; set; } = "Professional";
    [MaxLength(10)]  public string? CountryCode { get; set; }
    [MaxLength(30)]  public string? Phone { get; set; }
    [MaxLength(50)]  public string? IpAddress { get; set; }
    [MaxLength(100)] public string? Cta { get; set; }
    [MaxLength(500)] public string? ReportUrl { get; set; }
    /// <summary>Free text submitted on the website (SEO/business requirement details).</summary>
    [MaxLength(2000)] public string? Details { get; set; }
    /// <summary>Website enquiry submission timestamp (IST displayed on UI).</summary>
    public DateTime SubmittedAtUtc { get; set; } = DateTime.UtcNow;

    public LeadSource Source { get; set; } = LeadSource.Website;

    // ---- Ownership (BRDID04 central assignment) ----
    public int? AssignedToUserId { get; set; }
    public User? AssignedTo { get; set; }
    public DateTime? AssignedAtUtc { get; set; }

    // ---- Manual fields ----
    public EnquiryType EnquiryType { get; set; } = EnquiryType.Unclassified;
    public LeadType LeadType { get; set; } = LeadType.Unspecified;
    public LeadStage Stage { get; set; } = LeadStage.Enquiry;
    public LeadStatus Status { get; set; } = LeadStatus.Open;

    /// <summary>Deal value in INR if known.</summary>
    public decimal? ValueInr { get; set; }

    [MaxLength(100)]  public string? LostReason { get; set; }
    [MaxLength(1000)] public string? LostReasonOther { get; set; }
    [MaxLength(2000)] public string? Remarks { get; set; }

    // ---- System tracking (BRDID10) ----
    public bool NotificationFlag { get; set; }
    public bool EscalationFlag { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime LastUpdateAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ClosedAtUtc { get; set; }

    /// <summary>Soft delete — Admin only ("Delete/Inactive" permission).</summary>
    public bool IsActive { get; set; } = true;

    public ICollection<LeadDayUpdate> DayUpdates { get; set; } = new List<LeadDayUpdate>();
}

/// <summary>BRDID06 — day-wise follow-up updates D1..D5 after assignment.</summary>
public class LeadDayUpdate
{
    public int Id { get; set; }
    public int LeadId { get; set; }
    public Lead? Lead { get; set; }

    /// <summary>1..5</summary>
    public int DayNumber { get; set; }

    [MaxLength(2000)]
    public string Note { get; set; } = "";

    public int UpdatedByUserId { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>Individual visit event (feeds daily new-vs-returning analytics).</summary>
public class VisitEvent
{
    public int Id { get; set; }

    [MaxLength(50)]
    public string IpAddress { get; set; } = "";

    public DateTime VisitAtUtc { get; set; } = DateTime.UtcNow;
    public int TimeSpentSeconds { get; set; }
}

/// <summary>BRDID13 — visitor timestamping and visit counts received from the third-party tool.</summary>
public class VisitorStat
{
    public int Id { get; set; }

    [MaxLength(50)]
    public string IpAddress { get; set; } = "";

    /// <summary>Total time spent on the website, in seconds.</summary>
    public int TimeSpentSeconds { get; set; }

    public int VisitCount { get; set; }
    public DateTime FirstVisitAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime LastVisitAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>BRDID10 — outbound notification/escalation log (also acts as the outbox when SMTP is disabled).</summary>
public class NotificationLog
{
    public int Id { get; set; }
    public int? LeadId { get; set; }
    public NotificationType Type { get; set; }

    [MaxLength(150)] public string ToEmail { get; set; } = "";
    [MaxLength(150)] public string? CcEmail { get; set; }
    [MaxLength(300)] public string Subject { get; set; } = "";
    [MaxLength(4000)] public string Body { get; set; } = "";

    public bool EmailSent { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>Generic dropdown master values (lost reasons, industries, ...).</summary>
public class MasterItem
{
    public int Id { get; set; }

    /// <summary>e.g. "LostReason", "Industry", "Cta"</summary>
    [MaxLength(50)]
    public string Type { get; set; } = "";

    [MaxLength(200)]
    public string Value { get; set; } = "";

    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}
