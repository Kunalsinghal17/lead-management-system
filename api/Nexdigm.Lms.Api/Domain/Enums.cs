namespace Nexdigm.Lms.Api.Domain;

/// <summary>Application roles as per BRDID01 Role &amp; Access Mapping.</summary>
public enum UserRole
{
    Admin,
    Manager,
    Executive,
    Basic
}

/// <summary>BRDID05 — Enquiry Type classification. Mandatory before further processing.</summary>
public enum EnquiryType
{
    Unclassified,
    Lead,
    NotLead
}

/// <summary>Lead Type master (Custom / Syndicate).</summary>
public enum LeadType
{
    Unspecified,
    Custom,
    Syndicate
}

/// <summary>BRDID07 — Lifecycle stages. Strict forward-only progression.</summary>
public enum LeadStage
{
    Enquiry,
    Lead,
    Proposal,
    Won,
    Lost
}

/// <summary>BRDID08 — Status, independent of stage. Closed is set by the system for Not-Lead.</summary>
public enum LeadStatus
{
    Open,
    Won,
    Lost,
    Closed
}

/// <summary>How the lead entered the system (BRDID02 / 03 / 12).</summary>
public enum LeadSource
{
    Website,
    Manual,
    BulkUpload
}

/// <summary>Notification log categories (BRDID10).</summary>
public enum NotificationType
{
    MissingDayUpdate,
    AgingReminder,
    Escalation,
    System
}
