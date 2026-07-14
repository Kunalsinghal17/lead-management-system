using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Services;

/// <summary>Pure business rules shared across the API.</summary>
public static class LeadRules
{
    public static readonly string[] PersonalDomains =
    {
        "gmail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com",
        "rediffmail.com", "icloud.com", "protonmail.com", "aol.com", "live.com", "msn.com"
    };

    /// <summary>Auto logic for "Type of Mail ID": Professional vs Personal domain.</summary>
    public static string ClassifyMail(string email)
    {
        var at = email.LastIndexOf('@');
        if (at < 0 || at == email.Length - 1) return "Personal";
        var domain = email[(at + 1)..].Trim().ToLowerInvariant();
        return PersonalDomains.Contains(domain) ? "Personal" : "Professional";
    }

    /// <summary>Strict forward-only lifecycle. Returns valid next stages.</summary>
    public static LeadStage[] NextStages(LeadStage current) => current switch
    {
        LeadStage.Enquiry  => new[] { LeadStage.Lead },
        LeadStage.Lead     => new[] { LeadStage.Proposal },
        LeadStage.Proposal => new[] { LeadStage.Won, LeadStage.Lost },
        _ => Array.Empty<LeadStage>()
    };

    public static bool IsFinal(LeadStatus status) =>
        status is LeadStatus.Won or LeadStatus.Lost or LeadStatus.Closed;

    /// <summary>Lead age in whole days since creation (aging).</summary>
    public static int AgeDays(Lead lead, DateTime nowUtc) =>
        Math.Max(0, (int)(nowUtc.Date - lead.CreatedAtUtc.Date).TotalDays);

    /// <summary>Day counter for D1-D5: Day 1 = assignment date.</summary>
    public static int CurrentDayNumber(Lead lead, DateTime nowUtc)
    {
        if (lead.AssignedAtUtc is null) return 0;
        return (int)(nowUtc.Date - lead.AssignedAtUtc.Value.Date).TotalDays + 1;
    }
}
