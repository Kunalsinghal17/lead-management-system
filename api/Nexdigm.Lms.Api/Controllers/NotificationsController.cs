using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;
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

    /// <summary>
    /// Notification/escalation log. Acts as the email outbox when SMTP is off.
    /// Admin/Manager see everything; other roles only see notifications addressed to them.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var query = _db.NotificationLogs.AsQueryable();
        if (!User.IsAdminOrManager())
        {
            var me = await _db.Users.FindAsync(new object[] { User.GetUserId() }, ct);
            var email = me?.Email ?? "";
            query = query.Where(n => n.ToEmail == email || n.CcEmail == email);
        }

        var logs = await query
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
