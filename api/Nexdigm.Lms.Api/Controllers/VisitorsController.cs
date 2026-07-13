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

    /// <summary>BRDID13 — visitor timestamping and visit counts.</summary>
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
    /// BRDID13 — real-time ingestion from the third-party visitor tracking tool.
    /// Secured by API key header (X-Api-Key), same trust model as MarketRAdmin ingestion.
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
