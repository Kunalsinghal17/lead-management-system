using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Services;

/// <summary>
/// Daily 6:00 PM IST sweep over all Open leads:
///  • missing day-wise update (D1-D5)  -> email reminder to owner
///  • lead open > 5 days                -> aging reminder to owner
///  • lead open > 10 days               -> escalation to owner's manager (owner in CC)
/// Set Notifications:DemoIntervalMinutes > 0 to also run every N minutes while demoing.
/// </summary>
public class NotificationScheduler : BackgroundService
{
    private static readonly TimeZoneInfo Ist = ResolveIst();
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<NotificationScheduler> _logger;
    private DateOnly? _lastDailyRun;
    private DateTime _lastDemoRun = DateTime.MinValue;

    public NotificationScheduler(IServiceScopeFactory scopeFactory, IConfiguration config,
        ILogger<NotificationScheduler> logger)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _logger = logger;
    }

    private static TimeZoneInfo ResolveIst()
    {
        foreach (var id in new[] { "India Standard Time", "Asia/Kolkata" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
        }
        return TimeZoneInfo.CreateCustomTimeZone("IST", TimeSpan.FromMinutes(330), "IST", "IST");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Notification scheduler started (daily {Hour}:00 IST).",
            _config.GetValue<int>("Notifications:DailyRunHourIst", 18));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var nowIst = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Ist);
                var runHour = _config.GetValue<int>("Notifications:DailyRunHourIst", 18);
                var today = DateOnly.FromDateTime(nowIst);

                var dueDaily = nowIst.Hour >= runHour && _lastDailyRun != today;

                var demoEvery = _config.GetValue<int>("Notifications:DemoIntervalMinutes", 0);
                var dueDemo = demoEvery > 0 &&
                              (DateTime.UtcNow - _lastDemoRun).TotalMinutes >= demoEvery;

                if (dueDaily || dueDemo)
                {
                    await RunSweepAsync(stoppingToken);
                    if (dueDaily) _lastDailyRun = today;
                    _lastDemoRun = DateTime.UtcNow;
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Notification sweep failed; will retry on next tick.");
            }

            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }

    public async Task RunSweepAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LmsDbContext>();
        var email = scope.ServiceProvider.GetRequiredService<IEmailService>();

        var agingDays = _config.GetValue<int>("Notifications:AgingReminderDays", 5);
        var escalationDays = _config.GetValue<int>("Notifications:EscalationDays", 10);
        var nowUtc = DateTime.UtcNow;

        var openLeads = await db.Leads
            .Include(l => l.AssignedTo).ThenInclude(u => u!.Manager)
            .Include(l => l.DayUpdates)
            .Where(l => l.IsActive && l.Status == LeadStatus.Open)
            .ToListAsync(ct);

        var reminders = 0; var aging = 0; var escalations = 0;

        foreach (var lead in openLeads)
        {
            var owner = lead.AssignedTo;
            var age = LeadRules.AgeDays(lead, nowUtc);

            // 1) Missing day-wise update within the D1-D5 window (owner required)
            if (owner is not null && lead.EnquiryType == EnquiryType.Lead)
            {
                var day = LeadRules.CurrentDayNumber(lead, nowUtc);
                if (day is >= 1 and <= 5 && !lead.DayUpdates.Any(d => d.DayNumber == day))
                {
                    await email.SendAsync(db, NotificationType.MissingDayUpdate, lead.Id,
                        owner.Email, null,
                        $"[Nexdigm LMS] Day {day} update pending — {lead.LeadCode} ({lead.Name})",
                        $"Hi {owner.FullName},\n\nYour Day {day} follow-up update for lead {lead.LeadCode} " +
                        $"({lead.Name}, {lead.Email}) has not been recorded yet. Please add it in the LMS.\n\n" +
                        "— Nexdigm LMS (automated reminder, daily 6 PM IST)", ct);
                    reminders++;
                }
            }

            // 2) Aging reminder: open > N days
            if (owner is not null && age > agingDays && age <= escalationDays)
            {
                await email.SendAsync(db, NotificationType.AgingReminder, lead.Id,
                    owner.Email, null,
                    $"[Nexdigm LMS] Lead open {age} days — {lead.LeadCode} ({lead.Name})",
                    $"Hi {owner.FullName},\n\nLead {lead.LeadCode} ({lead.Name}) has been open for {age} days. " +
                    "Please take action or update its status.\n\n— Nexdigm LMS", ct);
                lead.NotificationFlag = true;
                aging++;
            }

            // 3) Escalation: open > M days -> manager (owner in CC)
            if (age > escalationDays)
            {
                var managerEmail = owner?.Manager?.Email;
                var to = managerEmail ?? owner?.Email;
                if (to is not null)
                {
                    await email.SendAsync(db, NotificationType.Escalation, lead.Id,
                        to, managerEmail is not null ? owner!.Email : null,
                        $"[Nexdigm LMS] ESCALATION — {lead.LeadCode} open {age} days",
                        $"Lead details:\n  Lead: {lead.LeadCode} — {lead.Name} ({lead.Email})\n" +
                        $"  Owner: {owner?.FullName ?? "Unassigned"}\n  Days pending: {age}\n" +
                        $"  Stage: {lead.Stage}  |  Status: {lead.Status}\n\n" +
                        "This lead has crossed the escalation threshold. Please review.\n\n— Nexdigm LMS", ct);
                    lead.EscalationFlag = true;
                    escalations++;
                }
            }
        }

        await db.SaveChangesAsync(ct);
        _logger.LogInformation(
            "Notification sweep done: {Reminders} day-update reminders, {Aging} aging alerts, {Esc} escalations.",
            reminders, aging, escalations);
    }
}
