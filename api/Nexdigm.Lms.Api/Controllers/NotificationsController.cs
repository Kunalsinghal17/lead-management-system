using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Services;

namespace Nexdigm.Lms.Api.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly LmsDbContext _db;
    private readonly NotificationScheduler _scheduler;

    public NotificationsController(LmsDbContext db, NotificationScheduler scheduler)
    {
        _db = db;
        _scheduler = scheduler;
    }

    /// <summary>Notification/escalation log (BRDID10). Acts as the email outbox when SMTP is off.</summary>
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var logs = await _db.NotificationLogs
            .OrderByDescending(n => n.CreatedAtUtc)
            .Take(200)
            .Select(n => new
            {
                n.Id,
                n.LeadId,
                Type = n.Type.ToString(),
                n.ToEmail,
                n.CcEmail,
                n.Subject,
                n.EmailSent,
                n.CreatedAtUtc
            })
            .ToListAsync(ct);
        return Ok(logs);
    }

    /// <summary>Demo helper — trigger the 6 PM sweep on demand (Admin/Manager).</summary>
    [HttpPost("run-now")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<IActionResult> RunNow(CancellationToken ct)
    {
        await _scheduler.RunSweepAsync(ct);
        return Ok(new { message = "Notification sweep executed. Check the log below." });
    }
}
