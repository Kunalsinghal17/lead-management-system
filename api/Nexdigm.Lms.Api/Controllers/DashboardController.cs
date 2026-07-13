using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Contracts;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;
using Nexdigm.Lms.Api.Services;

namespace Nexdigm.Lms.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly LmsDbContext _db;
    private readonly PermissionService _permissions;

    public DashboardController(LmsDbContext db, PermissionService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    /// <summary>
    /// Dashboard summary — always computed in the caller's data scope
    /// (all / team / own), so an Executive only ever sees their own numbers.
    /// </summary>
    [HttpGet("summary")]
    public async Task<ActionResult<DashboardSummary>> Summary([FromQuery] int days = 30, CancellationToken ct = default)
    {
        days = Math.Clamp(days, 7, 365);
        var nowUtc = DateTime.UtcNow;
        var since = nowUtc.Date.AddDays(-days + 1);
        var prevSince = since.AddDays(-days);

        var baseQuery = _db.Leads.Include(l => l.DayUpdates).Where(l => l.IsActive);
        var (scoped, scope) = await DataScope.ApplyAsync(
            baseQuery, _db, _permissions, User.GetUserId(), User.GetRole(), ct);

        // Small datasets per the BRD workload — aggregate in memory (also keeps
        // decimal math portable across SQL Server and SQLite).
        var leads = await scoped.ToListAsync(ct);

        var real = leads.Where(l => l.EnquiryType != EnquiryType.NotLead).ToList();
        var open = real.Where(l => l.Status == LeadStatus.Open).ToList();
        var won = real.Count(l => l.Status == LeadStatus.Won);
        var lost = real.Count(l => l.Status == LeadStatus.Lost);
        var decided = won + lost;

        var trend = Enumerable.Range(0, days)
            .Select(i => since.AddDays(i))
            .Select(d => new TrendPoint(d.ToString("yyyy-MM-dd"), leads.Count(l => l.CreatedAtUtc.Date == d)))
            .ToList();

        List<NameValue> Group(IEnumerable<Lead> src, Func<Lead, string?> key, int? take = null)
        {
            var list = src.GroupBy(key)
                .Where(g => !string.IsNullOrEmpty(g.Key))
                .Select(g => new NameValue(g.Key!, g.Count()))
                .OrderByDescending(x => x.Value)
                .ToList();
            return take.HasValue ? list.Take(take.Value).ToList() : list;
        }

        // ---- Needs attention (actionable backlog) ----
        int CurrentDay(Lead l) => LeadRules.CurrentDayNumber(l, nowUtc);
        var missingUpdates = open.Count(l =>
            l.AssignedToUserId != null && l.EnquiryType == EnquiryType.Lead &&
            CurrentDay(l) is >= 1 and <= 5 &&
            !l.DayUpdates.Any(d => d.DayNumber == Math.Min(5, CurrentDay(l))));
        var needs = new NeedsAttention(
            Escalated: open.Count(l => LeadRules.AgeDays(l, nowUtc) > 10),
            MissingUpdates: missingUpdates,
            Aging: open.Count(l => LeadRules.AgeDays(l, nowUtc) > 5 && LeadRules.AgeDays(l, nowUtc) <= 10),
            Unassigned: real.Count(l => l.AssignedToUserId == null && l.Status == LeadStatus.Open),
            Unclassified: leads.Count(l => l.EnquiryType == EnquiryType.Unclassified && l.Status == LeadStatus.Open));

        // ---- Follow-up adherence (D1–D5 discipline vs the 90% target) ----
        var totalDue = 0; var totalFilled = 0; var onTrack = 0; var missed = 0;
        foreach (var l in real.Where(x => x.AssignedToUserId != null && x.EnquiryType == EnquiryType.Lead && x.AssignedAtUtc != null))
        {
            var endUtc = l.ClosedAtUtc ?? nowUtc;
            var daysSinceAssign = Math.Max(0, (int)(endUtc.Date - l.AssignedAtUtc!.Value.Date).TotalDays);
            var due = Math.Min(5, daysSinceAssign + 1);
            var filled = l.DayUpdates.Count(d => d.DayNumber <= due);
            totalDue += due;
            totalFilled += Math.Min(filled, due);
            if (filled >= due) onTrack++; else missed++;
        }
        var adherence = totalDue == 0 ? 100 : Math.Round(100.0 * totalFilled / totalDue, 0);

        // ---- Period-over-period deltas ----
        var current = real.Where(l => l.CreatedAtUtc >= since).ToList();
        var previous = real.Where(l => l.CreatedAtUtc >= prevSince && l.CreatedAtUtc < since).ToList();
        var curWon = real.Where(l => l.Status == LeadStatus.Won && (l.ClosedAtUtc ?? l.LastUpdateAtUtc) >= since).ToList();
        var prevWon = real.Where(l => l.Status == LeadStatus.Won && (l.ClosedAtUtc ?? l.LastUpdateAtUtc) >= prevSince
                                      && (l.ClosedAtUtc ?? l.LastUpdateAtUtc) < since).ToList();
        var curLost = real.Count(l => l.Status == LeadStatus.Lost && (l.ClosedAtUtc ?? l.LastUpdateAtUtc) >= since);
        var prevLost = real.Count(l => l.Status == LeadStatus.Lost && (l.ClosedAtUtc ?? l.LastUpdateAtUtc) >= prevSince
                                       && (l.ClosedAtUtc ?? l.LastUpdateAtUtc) < since);

        static double PctChange(double cur, double prev) =>
            prev == 0 ? (cur > 0 ? 100 : 0) : Math.Round(100.0 * (cur - prev) / prev, 1);
        static double Conv(int w, int l) => w + l == 0 ? 0 : 100.0 * w / (w + l);

        var deltas = new PeriodDeltas(
            TotalLeadsPct: PctChange(current.Count, previous.Count),
            WonPct: PctChange(curWon.Count, prevWon.Count),
            ConversionPts: Math.Round(Conv(curWon.Count, curLost) - Conv(prevWon.Count, prevLost), 1),
            PipelineValuePct: PctChange(
                (double)current.Where(l => l.Status == LeadStatus.Open).Sum(l => l.ValueInr ?? 0),
                (double)previous.Where(l => l.Status == LeadStatus.Open).Sum(l => l.ValueInr ?? 0)),
            WonValuePct: PctChange(
                (double)curWon.Sum(l => l.ValueInr ?? 0),
                (double)prevWon.Sum(l => l.ValueInr ?? 0)));

        return new DashboardSummary(
            TotalLeads: real.Count,
            OpenLeads: open.Count,
            WonLeads: won,
            LostLeads: lost,
            ClosedNotLeads: leads.Count(l => l.EnquiryType == EnquiryType.NotLead),
            UnassignedLeads: needs.Unassigned,
            ConversionRatePct: decided == 0 ? 0 : Math.Round(100.0 * won / decided, 1),
            PipelineValueInr: open.Sum(l => l.ValueInr ?? 0),
            WonValueInr: real.Where(l => l.Status == LeadStatus.Won).Sum(l => l.ValueInr ?? 0),
            LostValueInr: real.Where(l => l.Status == LeadStatus.Lost).Sum(l => l.ValueInr ?? 0),
            LeadsPerDay: trend,
            BySource: Group(leads, l => l.Source.ToString()),
            ByStage: Group(real, l => l.Stage.ToString()),
            ByIndustry: Group(real, l => l.Industry, 8),
            LostReasons: Group(real.Where(l => l.Status == LeadStatus.Lost), l => l.LostReason),
            NeedsAttention: needs,
            AdherencePct: adherence,
            AdherenceOnTrack: onTrack,
            AdherenceMissed: missed,
            Deltas: deltas,
            Scope: scope);
    }
}
