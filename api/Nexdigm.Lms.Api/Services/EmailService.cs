using System.Net;
using System.Net.Mail;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Services;

public interface IEmailService
{
    /// <summary>Sends an email if SMTP is configured; always logs to the NotificationLogs outbox.</summary>
    Task SendAsync(LmsDbContext db, NotificationType type, int? leadId,
        string to, string? cc, string subject, string body, CancellationToken ct = default);
}

public class EmailService : IEmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IConfiguration config, ILogger<EmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendAsync(LmsDbContext db, NotificationType type, int? leadId,
        string to, string? cc, string subject, string body, CancellationToken ct = default)
    {
        var sent = false;
        var enabled = _config.GetValue<bool>("Email:Enabled");
        var host = _config["Email:SmtpHost"];

        if (enabled && !string.IsNullOrWhiteSpace(host))
        {
            try
            {
                using var client = new SmtpClient(host, _config.GetValue<int>("Email:SmtpPort", 587))
                {
                    EnableSsl = _config.GetValue<bool>("Email:UseSsl", true)
                };
                var user = _config["Email:Username"];
                if (!string.IsNullOrWhiteSpace(user))
                    client.Credentials = new NetworkCredential(user, _config["Email:Password"]);

                var from = new MailAddress(
                    _config["Email:FromAddress"] ?? "lms-notifications@nexdigm.com",
                    _config["Email:FromName"] ?? "Nexdigm LMS");

                using var message = new MailMessage { From = from, Subject = subject, Body = body };
                message.To.Add(to);
                if (!string.IsNullOrWhiteSpace(cc)) message.CC.Add(cc);

                await client.SendMailAsync(message, ct);
                sent = true;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "SMTP send failed; notification kept in outbox log.");
            }
        }
        else
        {
            _logger.LogInformation("[EMAIL-OUTBOX] To={To} Cc={Cc} Subject={Subject}", to, cc, subject);
        }

        db.NotificationLogs.Add(new NotificationLog
        {
            LeadId = leadId,
            Type = type,
            ToEmail = to,
            CcEmail = cc,
            Subject = subject,
            Body = body,
            EmailSent = sent
        });
        await db.SaveChangesAsync(ct);
    }
}
