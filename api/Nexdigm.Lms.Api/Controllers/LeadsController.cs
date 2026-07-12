using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Contracts;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;
using Nexdigm.Lms.Api.Services;

namespace Nexdigm.Lms.Api.Controllers;

[ApiController]
[Route("api/leads")]
[Authorize]
public class LeadsController : ControllerBase
{
    private readonly LmsDbContext _db;
    private readonly LeadService _leads;

    public LeadsController(LmsDbContext db, LeadService leads)
    {
        _db = db;
        _leads = leads;
    }

    /// <summary>
    /// Lead list. view = all | my | pool (central pool, unassigned) | notlead.
    /// Not-Lead pool: Admin sees all; other users see their own (BRDID05).
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<LeadDto>>> List(
        [FromQuery] string view = "all",
        [FromQuery] string? search = null,
        [FromQuery] string? stage = null,
        [FromQuery] string? status = null,
        [FromQuery] string? industry = null,
        [FromQuery] string? source = null,
        [FromQuery] int? ownerId = null,
        CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var q = _db.Leads
            .Include(l => l.AssignedTo)
            .Include(l => l.DayUpdates)
            .Where(l => l.IsActive);

        switch (view.ToLowerInvariant())
        {
            case "my":
                q = q.Where(l => l.AssignedToUserId == userId && l.EnquiryType != EnquiryType.NotLead);
                break;
            case "pool":
                q = q.Where(l => l.AssignedToUserId == null && l.Status == LeadStatus.Open);
                break;
            case "notlead":
                q = q.Where(l => l.EnquiryType == EnquiryType.NotLead);
                if (!User.IsAdmin())
                    q = q.Where(l => l.AssignedToUserId == userId);
                break;
            default:
                q = q.Where(l => l.EnquiryType != EnquiryType.NotLead);
                break;
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(l =>
                l.Name.ToLower().Contains(s) ||
                l.Email.ToLower().Contains(s) ||
                l.LeadCode.ToLower().Contains(s) ||
                (l.ReportTitle != null && l.ReportTitle.ToLower().Contains(s)) ||
                (l.Industry != null && l.Industry.ToLower().Contains(s)));
        }

        if (!string.IsNullOrWhiteSpace(stage) && Enum.TryParse<LeadStage>(stage, true, out var st))
            q = q.Where(l => l.Stage == st);
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<LeadStatus>(status, true, out var s2))
            q = q.Where(l => l.Status == s2);
        if (!string.IsNullOrWhiteSpace(industry))
            q = q.Where(l => l.Industry == industry);
        if (!string.IsNullOrWhiteSpace(source) && Enum.TryParse<LeadSource>(source, true, out var src))
            q = q.Where(l => l.Source == src);
        if (ownerId.HasValue)
            q = q.Where(l => l.AssignedToUserId == ownerId);

        var items = await q.OrderByDescending(l => l.CreatedAtUtc).Take(1000).ToListAsync(ct);
        var names = await _leads.UserNamesAsync(ct);
        return items.Select(l => LeadService.ToDto(l, names)).ToList();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<LeadDto>> Get(int id, CancellationToken ct)
    {
        var lead = await _leads.GetLeadOrThrowAsync(id, ct);
        var names = await _leads.UserNamesAsync(ct);
        return LeadService.ToDto(lead, names);
    }

    /// <summary>BRDID03 — manual lead creation (roles per Role Master; Basic cannot create).</summary>
    [HttpPost]
    [Authorize(Roles = "Admin,Manager,Executive")]
    public async Task<ActionResult<LeadDto>> Create([FromBody] CreateLeadRequest req, CancellationToken ct)
    {
        var lead = await _leads.CreateLeadAsync(
            LeadSource.Manual,
            req.Name, req.Email,
            phone: req.Phone, countryCode: req.CountryCode, industry: req.Industry,
            reportCode: req.ReportCode, reportTitle: req.ReportTitle, cta: req.Cta,
            details: req.Details, valueInr: req.ValueInr, remarks: req.Remarks, ct: ct);

        var names = await _leads.UserNamesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = lead.Id }, LeadService.ToDto(lead, names));
    }

    /// <summary>Manual field updates with all BRD business rules enforced server-side.</summary>
    [HttpPut("{id:int}")]
    public async Task<ActionResult<LeadDto>> Update(int id, [FromBody] UpdateLeadRequest req, CancellationToken ct)
    {
        var lead = await _leads.UpdateAsync(id, req, User.GetUserId(), User.GetRole(), ct);
        var names = await _leads.UserNamesAsync(ct);
        return LeadService.ToDto(lead, names);
    }

    /// <summary>BRDID04 — pick from pool (self) or re-assign (Admin/Manager).</summary>
    [HttpPost("{id:int}/assign")]
    public async Task<ActionResult<LeadDto>> Assign(int id, [FromBody] AssignLeadRequest req, CancellationToken ct)
    {
        var lead = await _leads.AssignAsync(id, req.UserId, User.GetUserId(), User.GetRole(), ct);
        var names = await _leads.UserNamesAsync(ct);
        return LeadService.ToDto(lead, names);
    }

    /// <summary>BRDID06 — D1–D5 day-wise follow-up updates.</summary>
    [HttpPost("{id:int}/day-updates")]
    public async Task<ActionResult<LeadDto>> AddDayUpdate(int id, [FromBody] DayUpdateRequest req, CancellationToken ct)
    {
        var lead = await _leads.AddDayUpdateAsync(id, req, User.GetUserId(), User.GetRole(), ct);
        var names = await _leads.UserNamesAsync(ct);
        return LeadService.ToDto(lead, names);
    }

    /// <summary>Soft delete — Admin only per Role Master ("Delete/Inactive").</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Deactivate(int id, CancellationToken ct)
    {
        var lead = await _leads.GetLeadOrThrowAsync(id, ct);
        lead.IsActive = false;
        lead.LastUpdateAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>CSV export — Admin/Manager only per Role Master.</summary>
    [HttpGet("export")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<IActionResult> Export([FromQuery] string view = "all", CancellationToken ct = default)
    {
        var q = _db.Leads.Include(l => l.AssignedTo).Where(l => l.IsActive);
        if (view.Equals("notlead", StringComparison.OrdinalIgnoreCase))
            q = q.Where(l => l.EnquiryType == EnquiryType.NotLead);

        var leads = await q.OrderByDescending(l => l.CreatedAtUtc).ToListAsync(ct);

        var sb = new StringBuilder();
        sb.AppendLine("Lead ID,Name,Email,Mail Type,Phone,Industry,Report Code,Report Title,CTA,Source," +
                      "Enquiry Type,Lead Type,Stage,Status,Value (INR),Lost Reason,Owner,Age (days),Created (UTC)");
        foreach (var l in leads)
        {
            sb.AppendLine(string.Join(",",
                Csv(l.LeadCode), Csv(l.Name), Csv(l.Email), Csv(l.MailType), Csv(l.Phone),
                Csv(l.Industry), Csv(l.ReportCode), Csv(l.ReportTitle), Csv(l.Cta), Csv(l.Source.ToString()),
                Csv(l.EnquiryType.ToString()), Csv(l.LeadType.ToString()), Csv(l.Stage.ToString()),
                Csv(l.Status.ToString()), Csv(l.ValueInr?.ToString("0.##")), Csv(l.LostReason),
                Csv(l.AssignedTo?.FullName), Csv(LeadRules.AgeDays(l, DateTime.UtcNow).ToString()),
                Csv(l.CreatedAtUtc.ToString("yyyy-MM-dd HH:mm"))));
        }

        return File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv",
            $"nexdigm-leads-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
    }

    private static string Csv(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        return value.Contains(',') || value.Contains('"')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
    }
}
