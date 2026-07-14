using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Contracts;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Services;

namespace Nexdigm.Lms.Api.Controllers;

[ApiController]
[Route("api/visitors")]
public class VisitorsController : ControllerBase
{
    private readonly LmsDbContext _db;
    private readonly IConfiguration _config;
    private readonly PermissionService _permissions;

    public VisitorsController(LmsDbContext db, IConfiguration config, PermissionService permissions)
    {
        _db = db;
        _config = config;
        _permissions = permissions;
    }

    /// <summary>Visitor timestamping and visit counts.</summary>
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<List<VisitorStatDto>>> List(CancellationToken ct)
    {
        var stats = await _db.VisitorStats
            .OrderByDescending(v => v.LastVisitAtUtc)
            .Take(2000)
            .ToListAsync(ct);
        return stats.Select(v => new VisitorStatDto(
            v.Id, v.IpAddress, v.TimeSpentSeconds, v.VisitCount, v.FirstVisitAtUtc, v.LastVisitAtUtc)).ToList();
    }

    /// <summary>
    /// Aggregated visitor analytics: daily new-vs-returning visits, visit-frequency and
    /// time-on-site distributions.
    /// </summary>
    [HttpGet("analytics")]
    [Authorize]
    public async Task<ActionResult<VisitorAnalytics>> Analytics([FromQuery] int days = 30, CancellationToken ct = default)
    {
        days = Math.Clamp(days, 7, 365);
        var since = DateTime.UtcNow.Date.AddDays(-days + 1);

        var stats = await _db.VisitorStats.ToListAsync(ct);
        var events = await _db.VisitEvents.Where(e => e.VisitAtUtc >= since).ToListAsync(ct);
        var firstSeen = stats.ToDictionary(s => s.IpAddress, s => s.FirstVisitAtUtc.Date);

        var daily = Enumerable.Range(0, days)
            .Select(i => since.AddDays(i))
            .Select(d =>
            {
                var dayEvents = events.Where(e => e.VisitAtUtc.Date == d).ToList();
                var newV = dayEvents.Count(e => firstSeen.TryGetValue(e.IpAddress, out var f) && f == d);
                return new DailyVisits(d.ToString("yyyy-MM-dd"), newV, dayEvents.Count - newV);
            })
            .ToList();

        static List<DistributionBucket> Distribute(List<(string Name, int Count)> raw)
        {
            var total = raw.Sum(r => r.Count);
            return raw.Select(r => new DistributionBucket(
                r.Name, r.Count, total == 0 ? 0 : Math.Round(100.0 * r.Count / total, 0))).ToList();
        }

        var frequency = Distribute(new List<(string, int)>
        {
            ("1 visit", stats.Count(s => s.VisitCount == 1)),
            ("2 visits", stats.Count(s => s.VisitCount == 2)),
            ("3–5 visits", stats.Count(s => s.VisitCount >= 3 && s.VisitCount <= 5)),
            ("6+ visits", stats.Count(s => s.VisitCount >= 6))
        });

        var timeOnSite = Distribute(new List<(string, int)>
        {
            ("Under 1m", stats.Count(s => s.TimeSpentSeconds < 60)),
            ("1–3m", stats.Count(s => s.TimeSpentSeconds >= 60 && s.TimeSpentSeconds < 180)),
            ("3–5m", stats.Count(s => s.TimeSpentSeconds >= 180 && s.TimeSpentSeconds < 300)),
            ("5m+", stats.Count(s => s.TimeSpentSeconds >= 300))
        });

        var visitsPerDay = daily.Select(d => d.NewVisitors + d.ReturningVisitors).ToList();
        return new VisitorAnalytics(
            TotalVisits: events.Count,
            UniqueVisitors: events.Select(e => e.IpAddress).Distinct().Count(),
            ReturningVisitors: stats.Count(s => s.VisitCount > 1),
            AvgTimeSeconds: stats.Count == 0 ? 0 : (int)stats.Average(s => s.TimeSpentSeconds),
            PeakDayVisits: visitsPerDay.Count == 0 ? 0 : visitsPerDay.Max(),
            AvgVisitsPerDay: visitsPerDay.Count == 0 ? 0 : Math.Round(visitsPerDay.Average(), 1),
            Daily: daily,
            Frequency: frequency,
            TimeOnSite: timeOnSite);
    }

    /// <summary>Export visitor data — "Export" permission.</summary>
    [HttpGet("export")]
    [Authorize]
    public async Task<IActionResult> Export(CancellationToken ct)
    {
        await _permissions.EnsureAsync(User.GetRole(), PermissionActions.Export, ct);
        var stats = await _db.VisitorStats.OrderByDescending(v => v.LastVisitAtUtc).ToListAsync(ct);
        var sb = new StringBuilder();
        sb.AppendLine("IP Address,Time Spent (seconds),No. of Visits,First Visit (UTC),Last Visit (UTC)");
        foreach (var v in stats)
            sb.AppendLine($"{v.IpAddress},{v.TimeSpentSeconds},{v.VisitCount}," +
                          $"{v.FirstVisitAtUtc:yyyy-MM-dd HH:mm},{v.LastVisitAtUtc:yyyy-MM-dd HH:mm}");

        return File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv",
            $"nexdigm-visitor-analytics-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
    }

    /// <summary>
    /// Real-time ingestion from the third-party visitor tracking tool.
    /// Secured by API key header (X-Api-Key), same trust model as website enquiry ingestion.
    /// </summary>
    [HttpPost("ingest")]
    [AllowAnonymous]
    public async Task<IActionResult> Ingest([FromBody] IngestVisitRequest req, CancellationToken ct)
    {
        var expected = _config["Ingestion:ApiKey"];
        if (string.IsNullOrEmpty(expected) ||
            Request.Headers["X-Api-Key"].ToString() != expected)
            return Unauthorized(new { message = "Invalid or missing API key." });

        if (string.IsNullOrWhiteSpace(req.IpAddress))
            return BadRequest(new { message = "IpAddress is required." });

        var when = req.VisitAt?.ToUniversalTime() ?? DateTime.UtcNow;

        // Event-level record feeds the daily new-vs-returning analytics
        _db.VisitEvents.Add(new Domain.VisitEvent
        {
            IpAddress = req.IpAddress.Trim(),
            VisitAtUtc = when,
            TimeSpentSeconds = Math.Max(0, req.TimeSpentSeconds)
        });

        var stat = await _db.VisitorStats.FirstOrDefaultAsync(v => v.IpAddress == req.IpAddress, ct);
        if (stat is null)
        {
            _db.VisitorStats.Add(new Domain.VisitorStat
            {
                IpAddress = req.IpAddress.Trim(),
                TimeSpentSeconds = Math.Max(0, req.TimeSpentSeconds),
                VisitCount = 1,
                FirstVisitAtUtc = when,
                LastVisitAtUtc = when
            });
        }
        else
        {
            stat.TimeSpentSeconds += Math.Max(0, req.TimeSpentSeconds);
            stat.VisitCount += 1;
            stat.LastVisitAtUtc = when;
        }
        await _db.SaveChangesAsync(ct);
        return Ok(new { message = "Recorded." });
    }
}
