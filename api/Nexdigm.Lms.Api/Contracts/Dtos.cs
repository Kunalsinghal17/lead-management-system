namespace Nexdigm.Lms.Api.Contracts;

// ---------- Auth ----------
public record LoginRequest(string Email, string Password);

public record LoginResponse(
    string Token,
    DateTime ExpiresUtc,
    int UserId,
    string FullName,
    string Email,
    string Role,
    int IdleTimeoutMinutes);

// ---------- Users ----------
public record UserDto(
    int Id,
    string FullName,
    string Email,
    string Role,
    int? ManagerId,
    string? ManagerName,
    bool IsActive);

public record CreateUserRequest(
    string FullName,
    string Email,
    string Password,
    string Role,
    int? ManagerId);

// ---------- Leads ----------
public record DayUpdateDto(int DayNumber, string Note, DateTime? UpdatedAtUtc, string? UpdatedBy);

public record LeadDto(
    int Id,
    string LeadCode,
    string? ReportCode,
    string? ReportTitle,
    string? Industry,
    string Name,
    string Email,
    string MailType,
    string? CountryCode,
    string? Phone,
    string? IpAddress,
    string? Cta,
    string? ReportUrl,
    string? Details,
    string Source,
    DateTime SubmittedAtUtc,
    int? AssignedToUserId,
    string? AssignedToName,
    DateTime? AssignedAtUtc,
    string EnquiryType,
    string LeadType,
    string Stage,
    string Status,
    decimal? ValueInr,
    string? LostReason,
    string? LostReasonOther,
    string? Remarks,
    bool NotificationFlag,
    bool EscalationFlag,
    DateTime CreatedAtUtc,
    DateTime LastUpdateAtUtc,
    DateTime? ClosedAtUtc,
    bool IsActive,
    int AgeDays,
    List<DayUpdateDto> DayUpdates);

public record CreateLeadRequest(
    string Name,
    string Email,
    string? Phone,
    string? CountryCode,
    string? Industry,
    string? ReportCode,
    string? ReportTitle,
    string? Cta,
    string? Details,
    decimal? ValueInr,
    string? Remarks);

/// <summary>Partial update of manual fields. Nulls mean "no change"; auto fields are never editable (BRDID11).</summary>
public record UpdateLeadRequest(
    string? EnquiryType,
    string? LeadType,
    string? Stage,
    string? Status,
    decimal? ValueInr,
    string? LostReason,
    string? LostReasonOther,
    string? Remarks);

public record AssignLeadRequest(int UserId);

public record DayUpdateRequest(int DayNumber, string Note);

// ---------- Ingestion (BRDID02, simulates MarketRAdmin push) ----------
public record IngestEnquiryRequest(
    string? ReportCode,
    string? ReportTitle,
    string? Industry,
    string Name,
    string Email,
    string? CountryCode,
    string? Phone,
    string? IpAddress,
    string? Cta,
    string? ReportUrl,
    string? Details,
    DateTime? SubmittedAt);

// ---------- Visitor analytics (BRDID13) ----------
public record VisitorStatDto(
    int Id,
    string IpAddress,
    int TimeSpentSeconds,
    int VisitCount,
    DateTime FirstVisitAtUtc,
    DateTime LastVisitAtUtc);

public record IngestVisitRequest(string IpAddress, int TimeSpentSeconds, DateTime? VisitAt);

// ---------- Bulk upload (BRDID12) ----------
public record BulkRowError(int Row, string Error);

public record BulkUploadResult(
    int TotalRows,
    int Inserted,
    int Failed,
    List<BulkRowError> Errors);

// ---------- Dashboard ----------
public record TrendPoint(string Date, int Count);
public record NameValue(string Name, decimal Value);

public record DashboardSummary(
    int TotalLeads,
    int OpenLeads,
    int WonLeads,
    int LostLeads,
    int ClosedNotLeads,
    int UnassignedLeads,
    double ConversionRatePct,
    decimal PipelineValueInr,
    decimal WonValueInr,
    decimal LostValueInr,
    List<TrendPoint> LeadsPerDay,
    List<NameValue> BySource,
    List<NameValue> ByStage,
    List<NameValue> ByIndustry,
    List<NameValue> LostReasons);

// ---------- Masters ----------
public record MastersDto(
    List<string> LostReasons,
    List<string> Industries,
    List<string> LeadTypes,
    List<string> Stages,
    List<string> Statuses,
    List<string> EnquiryTypes,
    Dictionary<string, Dictionary<string, bool>> RoleMatrix);
