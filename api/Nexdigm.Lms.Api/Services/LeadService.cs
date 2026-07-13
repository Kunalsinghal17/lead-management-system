using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Contracts;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Services;

/// <summary>Thrown for business-rule violations; surfaces as HTTP 400/403 with a clean message.</summary>
public class BusinessRuleException : Exception
{
    public int StatusCode { get; }
    public BusinessRuleException(string message, int statusCode = 400) : base(message)
        => StatusCode = statusCode;
}

public class LeadService
{
    private readonly LmsDbContext _db;
    private readonly PermissionService _permissions;

    public LeadService(LmsDbContext db, PermissionService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    // ---------------------------------------------------------------- mapping

    public static LeadDto ToDto(Lead l, Dictionary<int, string>? userNames = null)
    {
        var now = DateTime.UtcNow;
        string? assignedName = null;
        if (l.AssignedTo is not null) assignedName = l.AssignedTo.FullName;
        else if (l.AssignedToUserId.HasValue && userNames is not null &&
                 userNames.TryGetValue(l.AssignedToUserId.Value, out var n)) assignedName = n;

        return new LeadDto(
            l.Id, l.LeadCode, l.ReportCode, l.ReportTitle, l.Industry, l.Name, l.Email,
            l.MailType, l.CountryCode, l.Phone, l.IpAddress, l.Cta, l.ReportUrl, l.Details,
            l.Source.ToString(), l.SubmittedAtUtc,
            l.AssignedToUserId, assignedName, l.AssignedAtUtc,
            l.EnquiryType.ToString(), l.LeadType.ToString(), l.Stage.ToString(), l.Status.ToString(),
            l.ValueInr, l.LostReason, l.LostReasonOther, l.Remarks,
            l.NotificationFlag, l.EscalationFlag,
            l.CreatedAtUtc, l.LastUpdateAtUtc, l.ClosedAtUtc, l.IsActive,
            LeadRules.AgeDays(l, now),
            l.DayUpdates
                .OrderBy(d => d.DayNumber)
                .Select(d => new DayUpdateDto(d.DayNumber, d.Note, d.UpdatedAtUtc,
                    userNames is not null && userNames.TryGetValue(d.UpdatedByUserId, out var un) ? un : null))
                .ToList());
    }

    public async Task<Dictionary<int, string>> UserNamesAsync(CancellationToken ct = default) =>
        await _db.Users.ToDictionaryAsync(u => u.Id, u => u.FullName, ct);

    // ---------------------------------------------------------------- creation

    /// <summary>BRDID03 — uniform lead creation used by ingestion, manual entry and bulk upload.</summary>
    public async Task<Lead> CreateLeadAsync(
        LeadSource source,
        string name, string email,
        string? phone = null, string? countryCode = null, string? industry = null,
        string? reportCode = null, string? reportTitle = null, string? cta = null,
        string? ipAddress = null, string? reportUrl = null, string? details = null,
        decimal? valueInr = null, string? remarks = null,
        DateTime? submittedAtUtc = null,
        string? stage = null, string? status = null, int? assignedToUserId = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new BusinessRuleException("Name is required.");
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
            throw new BusinessRuleException("A valid email is required.");

        var lead = new Lead
        {
            Name = name.Trim(),
            Email = email.Trim(),
            MailType = LeadRules.ClassifyMail(email),
            Phone = phone?.Trim(),
            CountryCode = countryCode?.Trim(),
            Industry = industry?.Trim(),
            ReportCode = reportCode?.Trim(),
            ReportTitle = reportTitle?.Trim(),
            Cta = cta?.Trim(),
            IpAddress = ipAddress?.Trim(),
            ReportUrl = reportUrl?.Trim(),
            Details = details?.Trim(),
            ValueInr = valueInr,
            Remarks = remarks?.Trim(),
            Source = source,
            SubmittedAtUtc = submittedAtUtc ?? DateTime.UtcNow,
            // Defaults per BRDID03/07/08: Stage = Enquiry, Status = Open, unassigned (central pool)
            Stage = LeadStage.Enquiry,
            Status = LeadStatus.Open,
            EnquiryType = EnquiryType.Unclassified
        };

        // Bulk upload may carry historical stage/status (BRDID12)
        if (!string.IsNullOrWhiteSpace(stage) && Enum.TryParse<LeadStage>(stage, true, out var st))
            lead.Stage = st;
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<LeadStatus>(status, true, out var s2))
            lead.Status = s2;
        if (lead.Stage != LeadStage.Enquiry || lead.Status != LeadStatus.Open)
            lead.EnquiryType = EnquiryType.Lead; // historical rows are already qualified

        if (assignedToUserId.HasValue)
        {
            lead.AssignedToUserId = assignedToUserId;
            lead.AssignedAtUtc = DateTime.UtcNow;
        }

        if (LeadRules.IsFinal(lead.Status)) lead.ClosedAtUtc = DateTime.UtcNow;

        _db.Leads.Add(lead);
        await _db.SaveChangesAsync(ct);

        // Human-readable code once identity is known (e.g. LMS-04036)
        lead.LeadCode = $"LMS-{lead.Id + 4000:D5}";
        await _db.SaveChangesAsync(ct);
        return lead;
    }

    // ---------------------------------------------------------------- assignment (BRDID04)

    public async Task<Lead> AssignAsync(int leadId, int targetUserId, int actingUserId, UserRole actingRole,
        CancellationToken ct = default)
    {
        var lead = await GetLeadOrThrowAsync(leadId, ct);

        if (LeadRules.IsFinal(lead.Status))
            throw new BusinessRuleException("This lead is closed and can no longer be assigned.");

        var target = await _db.Users.FirstOrDefaultAsync(u => u.Id == targetUserId && u.IsActive, ct)
            ?? throw new BusinessRuleException("Target user not found or inactive.");

        // Only roles with "Own / Handle Leads" can be lead handlers (default: Executives).
        if (!await _permissions.IsAllowedAsync(target.Role, PermissionActions.OwnLeads, ct))
            throw new BusinessRuleException(
                $"{target.FullName} ({target.Role}) cannot own leads. Leads can only be assigned to roles " +
                "with the 'Own / Handle Leads' permission (see Users & Roles).");

        var isReassignment = lead.AssignedToUserId.HasValue && lead.AssignedToUserId != targetUserId;

        // Picking from the central pool for yourself needs OwnLeads (checked above for the target).
        // Assigning to someone else — pool or re-assignment — needs the Reassign permission.
        if ((isReassignment || targetUserId != actingUserId) &&
            !await _permissions.IsAllowedAsync(actingRole, PermissionActions.Reassign, ct))
            throw new BusinessRuleException(
                "Your role does not have the 'Re-assignment of leads' permission.", 403);

        lead.AssignedToUserId = target.Id;
        lead.AssignedAtUtc ??= DateTime.UtcNow;
        if (isReassignment) lead.AssignedAtUtc = DateTime.UtcNow;
        lead.LastUpdateAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        return lead;
    }

    // ---------------------------------------------------------------- updates (BRDID05, 07, 08, 09)

    public async Task<Lead> UpdateAsync(int leadId, UpdateLeadRequest req, int actingUserId, UserRole actingRole,
        CancellationToken ct = default)
    {
        var lead = await GetLeadOrThrowAsync(leadId, ct);
        var isOwner = lead.AssignedToUserId == actingUserId;
        var isElevated = actingRole is UserRole.Admin or UserRole.Manager;

        if (!isOwner && !isElevated)
            throw new BusinessRuleException("Only the assigned user (or Admin/Manager) can update this lead.", 403);

        var wasFinal = LeadRules.IsFinal(lead.Status);

        // --- Remarks & value: allowed while lead is active ---
        if (req.Remarks is not null)
        {
            if (wasFinal && !isElevated)
                throw new BusinessRuleException("Lead is closed. Only Admin/Manager can edit it.", 403);
            lead.Remarks = req.Remarks;
        }
        if (req.ValueInr is not null)
        {
            if (wasFinal && !isElevated)
                throw new BusinessRuleException("Lead is closed. Only Admin/Manager can edit it.", 403);
            lead.ValueInr = req.ValueInr;
        }

        // --- BRDID05: Enquiry Type classification ---
        // Not a process blocker: the owner may re-classify to Not Lead at any point
        // while the lead is still active.
        if (!string.IsNullOrWhiteSpace(req.EnquiryType))
        {
            if (wasFinal && !isElevated)
                throw new BusinessRuleException("Lead is closed. Only Admin/Manager can re-classify it.", 403);
            if (!Enum.TryParse<EnquiryType>(req.EnquiryType.Replace(" ", ""), true, out var et) ||
                et == EnquiryType.Unclassified)
                throw new BusinessRuleException("Enquiry Type must be 'Lead' or 'NotLead'.");

            lead.EnquiryType = et;
            if (et == EnquiryType.NotLead)
            {
                // Auto closure — no stage movement, no follow-ups (BRDID05)
                lead.Status = LeadStatus.Closed;
                lead.ClosedAtUtc = DateTime.UtcNow;
            }
        }

        var classified = lead.EnquiryType != EnquiryType.Unclassified;

        // --- Lead Type ---
        if (!string.IsNullOrWhiteSpace(req.LeadType))
        {
            if (!classified)
                throw new BusinessRuleException("Classify the enquiry (Lead / Not Lead) before updating other fields.");
            if (!Enum.TryParse<LeadType>(req.LeadType, true, out var lt))
                throw new BusinessRuleException("Lead Type must be 'Custom' or 'Syndicate'.");
            lead.LeadType = lt;
        }

        // --- BRDID07: forward-only stage movement ---
        if (!string.IsNullOrWhiteSpace(req.Stage))
        {
            if (!classified)
                throw new BusinessRuleException("Classify the enquiry (Lead / Not Lead) before moving stages.");
            if (lead.EnquiryType == EnquiryType.NotLead)
                throw new BusinessRuleException("Not-Lead enquiries are closed — no stage movement allowed.");
            if (!Enum.TryParse<LeadStage>(req.Stage, true, out var newStage))
                throw new BusinessRuleException("Unknown stage value.");

            if (newStage != lead.Stage)
            {
                var allowed = LeadRules.NextStages(lead.Stage);
                if (!allowed.Contains(newStage))
                    throw new BusinessRuleException(
                        $"Invalid stage move: {lead.Stage} → {newStage}. Stages are strictly forward-only " +
                        "(Enquiry → Lead → Proposal → Won/Lost).");

                lead.Stage = newStage;
                if (newStage == LeadStage.Won) req = req with { Status = "Won" };
                if (newStage == LeadStage.Lost) req = req with { Status = req.Status ?? "Lost" };
            }
        }

        // --- BRDID08 / BRDID09: status and lost reason ---
        if (!string.IsNullOrWhiteSpace(req.Status))
        {
            if (!classified)
                throw new BusinessRuleException("Classify the enquiry (Lead / Not Lead) before updating status.");
            if (lead.EnquiryType == EnquiryType.NotLead)
                throw new BusinessRuleException("Not-Lead enquiries are closed by the system.");
            if (!Enum.TryParse<LeadStatus>(req.Status, true, out var newStatus))
                throw new BusinessRuleException("Status must be Open, Won or Lost.");
            if (newStatus == LeadStatus.Closed)
                throw new BusinessRuleException("'Closed' is system-set for Not-Lead enquiries.");

            if (wasFinal && newStatus != lead.Status && !isElevated)
                throw new BusinessRuleException("Closed leads can only be corrected by Admin/Manager.", 403);

            if (newStatus == LeadStatus.Lost)
            {
                var reason = req.LostReason ?? lead.LostReason;
                if (string.IsNullOrWhiteSpace(reason))
                    throw new BusinessRuleException("Lost Reason is mandatory when marking a lead as Lost.");
                if (reason.Equals("Other", StringComparison.OrdinalIgnoreCase) &&
                    string.IsNullOrWhiteSpace(req.LostReasonOther ?? lead.LostReasonOther))
                    throw new BusinessRuleException("Please describe the reason when 'Other' is selected.");

                lead.LostReason = reason;
                lead.LostReasonOther = req.LostReasonOther ?? lead.LostReasonOther;
            }

            lead.Status = newStatus;
            if (LeadRules.IsFinal(newStatus)) lead.ClosedAtUtc = DateTime.UtcNow;
            else lead.ClosedAtUtc = null;
        }
        else if (!string.IsNullOrWhiteSpace(req.LostReason) || !string.IsNullOrWhiteSpace(req.LostReasonOther))
        {
            // Editing a saved lost reason afterwards: Admin/Manager only (BRDID09)
            if (!isElevated)
                throw new BusinessRuleException("Saved Lost Reason can only be edited by Admin/Manager.", 403);
            if (!string.IsNullOrWhiteSpace(req.LostReason)) lead.LostReason = req.LostReason;
            if (!string.IsNullOrWhiteSpace(req.LostReasonOther)) lead.LostReasonOther = req.LostReasonOther;
        }

        lead.LastUpdateAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return lead;
    }

    // ---------------------------------------------------------------- day updates (BRDID06)

    public async Task<Lead> AddDayUpdateAsync(int leadId, DayUpdateRequest req, int actingUserId, UserRole actingRole,
        CancellationToken ct = default)
    {
        var lead = await GetLeadOrThrowAsync(leadId, ct);
        var isOwner = lead.AssignedToUserId == actingUserId;
        var isElevated = actingRole is UserRole.Admin or UserRole.Manager;

        if (!isOwner && !isElevated)
            throw new BusinessRuleException("Only the assigned user (or Admin/Manager) can add day-wise updates.", 403);
        if (lead.AssignedToUserId is null)
            throw new BusinessRuleException("Assign the lead before recording day-wise updates.");
        if (lead.EnquiryType != EnquiryType.Lead)
            throw new BusinessRuleException("Day-wise updates apply to classified Leads only.");
        if (LeadRules.IsFinal(lead.Status))
            throw new BusinessRuleException("Lead is closed — day-wise updates are no longer required.");
        if (req.DayNumber is < 1 or > 5)
            throw new BusinessRuleException("Day number must be between 1 and 5.");
        if (string.IsNullOrWhiteSpace(req.Note))
            throw new BusinessRuleException("Update note cannot be empty.");

        // Sequence check: D(n) requires D(n-1)
        if (req.DayNumber > 1)
        {
            var prevExists = await _db.LeadDayUpdates
                .AnyAsync(d => d.LeadId == leadId && d.DayNumber == req.DayNumber - 1, ct);
            if (!prevExists)
                throw new BusinessRuleException($"Please fill Day {req.DayNumber - 1} before Day {req.DayNumber} (updates must be sequential).");
        }

        var existing = await _db.LeadDayUpdates
            .FirstOrDefaultAsync(d => d.LeadId == leadId && d.DayNumber == req.DayNumber, ct);

        if (existing is null)
        {
            _db.LeadDayUpdates.Add(new LeadDayUpdate
            {
                LeadId = leadId,
                DayNumber = req.DayNumber,
                Note = req.Note.Trim(),
                UpdatedByUserId = actingUserId
            });
        }
        else
        {
            existing.Note = req.Note.Trim();
            existing.UpdatedByUserId = actingUserId;
            existing.UpdatedAtUtc = DateTime.UtcNow;
        }

        lead.LastUpdateAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return lead;
    }

    // ---------------------------------------------------------------- helpers

    public async Task<Lead> GetLeadOrThrowAsync(int leadId, CancellationToken ct = default)
    {
        var lead = await _db.Leads
            .Include(l => l.DayUpdates)
            .Include(l => l.AssignedTo)
            .FirstOrDefaultAsync(l => l.Id == leadId && l.IsActive, ct);
        return lead ?? throw new BusinessRuleException("Lead not found.", 404);
    }
}
