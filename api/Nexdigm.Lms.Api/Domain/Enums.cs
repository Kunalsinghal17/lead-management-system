namespace Nexdigm.Lms.Api.Domain;

/// <summary>Application roles as per the Role &amp; Access Mapping.</summary>
public enum UserRole
{
    Admin,
    Manager,
    Executive,
    Basic
}

/// <summary>Enquiry Type classification. Mandatory before further processing.</summary>
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

/// <summary>Lifecycle stages. Strict forward-only progression.</summary>
public enum LeadStage
{
    Enquiry,
    Lead,
    Proposal,
    Won,
    Lost
}

/// <summary>Status, independent of stage. Closed is set by the system for Not-Lead.</summary>
public enum LeadStatus
{
    Open,
    Won,
    Lost,
    Closed
}

/// <summary>How the lead entered the system.</summary>
public enum LeadSource
{
    Website,
    Manual,
    BulkUpload
}

/// <summary>Notification log categories.</summary>
public enum NotificationType
{
    MissingDayUpdate,
    AgingReminder,
    Escalation,
    System
}
