using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Contracts;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly LmsDbContext _db;

    public DashboardController(LmsDbContext db) => _db = db;

    [HttpGet("summary")]
    public async Task<ActionResult<DashboardSummary>> Summary([FromQuery] int days = 30, CancellationToken ct = default)
    {
        days = Math.Clamp(days, 7, 365);
        var since = DateTime.UtcNow.Date.AddDays(-days + 1);

        // Small datasets (per BRD: 50–500 enquiries/day) — aggregate in memory,
        // which also keeps decimal aggregation portable across SQL Server and SQLite.
        var leads = await _db.Leads.Where(l => l.IsActive).ToListAsync(ct);

        var real = leads.Where(l => l.EnquiryType != EnquiryType.NotLead).ToList();
        var open = real.Count(l => l.Status == LeadStatus.Open);
        var won = real.Count(l => l.Status == LeadStatus.Won);
        var lost = real.Count(l => l.Status == LeadStatus.Lost);
        var closedNotLead = leads.Count(l => l.EnquiryType == EnquiryType.NotLead);
        var decided = won + lost;

        var trend = Enumerable.Range(0, days)
            .Select(i => since.AddDays(i))
            .Select(d => new TrendPoint(
                d.ToString("yyyy-MM-dd"),
                leads.Count(l => l.CreatedAtUtc.Date == d)))
            .ToList();

        var bySource = leads
            .GroupBy(l => l.Source.ToString())
            .Select(g => new NameValue(g.Key, g.Count()))
            .OrderByDescending(x => x.Value)
            .ToList();

        var byStage = real
            .GroupBy(l => l.Stage.ToString())
            .Select(g => new NameValue(g.Key, g.Count()))
            .ToList();

        var byIndustry = real
            .Where(l => !string.IsNullOrEmpty(l.Industry))
            .GroupBy(l => l.Industry!)
            .Select(g => new NameValue(g.Key, g.Count()))
            .OrderByDescending(x => x.Value)
            .Take(8)
            .ToList();

        var lostReasons = real
            .Where(l => l.Status == LeadStatus.Lost && !string.IsNullOrEmpty(l.LostReason))
            .GroupBy(l => l.LostReason!)
            .Select(g => new NameValue(g.Key, g.Count()))
            .OrderByDescending(x => x.Value)
            .ToList();

        return new DashboardSummary(
            TotalLeads: real.Count,
            OpenLeads: open,
            WonLeads: won,
            LostLeads: lost,
            ClosedNotLeads: closedNotLead,
            UnassignedLeads: real.Count(l => l.AssignedToUserId == null && l.Status == LeadStatus.Open),
            ConversionRatePct: decided == 0 ? 0 : Math.Round(100.0 * won / decided, 1),
            PipelineValueInr: real.Where(l => l.Status == LeadStatus.Open).Sum(l => l.ValueInr ?? 0),
            WonValueInr: real.Where(l => l.Status == LeadStatus.Won).Sum(l => l.ValueInr ?? 0),
            LostValueInr: real.Where(l => l.Status == LeadStatus.Lost).Sum(l => l.ValueInr ?? 0),
            LeadsPerDay: trend,
            BySource: bySource,
            ByStage: byStage,
            ByIndustry: byIndustry,
            LostReasons: lostReasons);
    }
}
