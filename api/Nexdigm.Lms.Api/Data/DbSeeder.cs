using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Auth;
using Nexdigm.Lms.Api.Domain;
using Nexdigm.Lms.Api.Services;

namespace Nexdigm.Lms.Api.Data;

/// <summary>Creates the schema on first run and seeds masters, users and demo data.</summary>
public static class DbSeeder
{
    public static async Task InitializeAsync(LmsDbContext db, IConfiguration config, ILogger logger)
    {
        await db.Database.EnsureCreatedAsync();

        if (!config.GetValue<bool>("Seed:Enabled", true)) return;

        await SeedMastersAsync(db);
        await PermissionService.SeedDefaultsAsync(db);
        await SeedUsersAsync(db);

        if (config.GetValue<bool>("Seed:SampleLeads", true))
        {
            await SeedLeadsAsync(db);
            await SeedVisitorsAsync(db);
        }

        logger.LogInformation("Database ready. Users: {U}, Leads: {L}",
            await db.Users.CountAsync(), await db.Leads.CountAsync());
    }

    // ------------------------------------------------------------ masters

    private static async Task SeedMastersAsync(LmsDbContext db)
    {
        if (await db.MasterItems.AnyAsync()) return;

        var lostReasons = new[]
        {
            "No Response From Client", "Commercial", "Credentials",
            "Student", "Free Info", "Duplicate", "Other"
        };
        var industries = new[]
        {
            "Healthcare", "BFSI", "Food Processing", "Technology", "Manufacturing",
            "Energy", "Retail", "Logistics", "Pharma", "Automotive"
        };
        var ctas = new[] { "Download Report", "Request Sample", "Contact Sales", "Subscribe" };

        var items = new List<MasterItem>();
        items.AddRange(lostReasons.Select((v, i) => new MasterItem { Type = "LostReason", Value = v, SortOrder = i }));
        items.AddRange(industries.Select((v, i) => new MasterItem { Type = "Industry", Value = v, SortOrder = i }));
        items.AddRange(ctas.Select((v, i) => new MasterItem { Type = "Cta", Value = v, SortOrder = i }));

        db.MasterItems.AddRange(items);
        await db.SaveChangesAsync();
    }

    // ------------------------------------------------------------ users

    private static async Task SeedUsersAsync(LmsDbContext db)
    {
        if (await db.Users.AnyAsync()) return;

        var admin = new User
        {
            FullName = "Harshit Mishra",
            Email = "harshit.mishra@nexdigm.com",
            PasswordHash = PasswordHasher.Hash("Admin@123"),
            Role = UserRole.Admin
        };
        var manager = new User
        {
            FullName = "Harsh Mittal",
            Email = "harsh.mittal@nexdigm.com",
            PasswordHash = PasswordHasher.Hash("Manager@123"),
            Role = UserRole.Manager
        };
        db.Users.AddRange(admin, manager);
        await db.SaveChangesAsync();

        // Executives are the lead handlers (per "Own / Handle Leads" permission)
        var executives = new[]
        {
            new User { FullName = "Aditi Sharma", Email = "aditi.sharma@nexdigm.com",
                PasswordHash = PasswordHasher.Hash("Exec@123"), Role = UserRole.Executive, ManagerId = manager.Id },
            new User { FullName = "Rohan Kulkarni", Email = "rohan.kulkarni@nexdigm.com",
                PasswordHash = PasswordHasher.Hash("Exec@123"), Role = UserRole.Executive, ManagerId = manager.Id },
            new User { FullName = "Neha Joshi", Email = "neha.joshi@nexdigm.com",
                PasswordHash = PasswordHasher.Hash("Exec@123"), Role = UserRole.Executive, ManagerId = manager.Id }
        };
        var basic = new User
        {
            FullName = "Priyank Desai",
            Email = "priyank.desai@nexdigm.com",
            PasswordHash = PasswordHasher.Hash("Basic@123"),
            Role = UserRole.Basic,
            ManagerId = manager.Id
        };
        db.Users.AddRange(executives);
        db.Users.Add(basic);
        await db.SaveChangesAsync();
    }

    // ------------------------------------------------------------ demo leads

    private static async Task SeedLeadsAsync(LmsDbContext db)
    {
        if (await db.Leads.AnyAsync()) return;

        var users = await db.Users.ToListAsync();
        // Leads are handled by Executives only (default "Own / Handle Leads" permission)
        var executives = users.Where(u => u.Role == UserRole.Executive).ToList();

        var industries = await db.MasterItems.Where(m => m.Type == "Industry").Select(m => m.Value).ToListAsync();
        var ctas = await db.MasterItems.Where(m => m.Type == "Cta").Select(m => m.Value).ToListAsync();
        var lostReasons = new[] { "No Response From Client", "Commercial", "Student", "Free Info" };

        var firstNames = new[] { "Aarav", "Priya", "Zoya", "Meera", "Nadia", "Rohan", "Kabir", "Ananya", "Vikram", "Isha", "Dev", "Sana" };
        var lastNames = new[] { "Bhalla", "Deshmukh", "Sethi", "Iyer", "Malhotra", "Fernandes", "Menon", "Nair", "Kapoor", "Shah" };
        var companies = new[] { "renew", "maerskgroup", "adani", "relianceenergy", "tataprojects", "infra-corp", "medlife", "agrofoods" };
        var personal = new[] { "gmail.com", "yahoo.com", "outlook.com" };
        var titles = new[]
        {
            "Quick-Commerce Grocery Trends", "EV Battery Supply Chain Outlook", "Hospital Digitization Index",
            "Cold Chain Logistics Forecast", "Fintech Lending Landscape", "Specialty Chemicals Deep-Dive",
            "Renewable Grid Storage Report", "OTC Pharma Distribution Study"
        };

        var rnd = new Random(42);
        var now = DateTime.UtcNow;
        var reportSeq = 1000;

        for (var i = 0; i < 55; i++)
        {
            var fn = firstNames[rnd.Next(firstNames.Length)];
            var ln = lastNames[rnd.Next(lastNames.Length)];
            var professional = rnd.NextDouble() > 0.3;
            var domain = professional
                ? companies[rnd.Next(companies.Length)] + ".com"
                : personal[rnd.Next(personal.Length)];
            var email = $"{fn}.{ln}{(professional ? "" : rnd.Next(10, 99).ToString())}@{domain}".ToLowerInvariant();

            var ageDays = rnd.Next(0, 30);
            var created = now.AddDays(-ageDays).AddMinutes(-rnd.Next(0, 600));

            var source = rnd.Next(10) switch
            {
                < 6 => LeadSource.Website,
                < 8 => LeadSource.BulkUpload,
                _   => LeadSource.Manual
            };

            var lead = new Lead
            {
                Name = $"{fn} {ln}",
                Email = email,
                MailType = LeadRules.ClassifyMail(email),
                CountryCode = "+91",
                Phone = $"9{rnd.Next(100000000, 999999999)}",
                Industry = industries[rnd.Next(industries.Count)],
                ReportCode = $"RC-{lead3(rnd)}-{reportSeq++}",
                ReportTitle = titles[rnd.Next(titles.Length)],
                Cta = ctas[rnd.Next(ctas.Count)],
                IpAddress = $"{rnd.Next(30, 220)}.{rnd.Next(0, 255)}.{rnd.Next(0, 255)}.{rnd.Next(1, 254)}",
                ReportUrl = "https://www.nexdigm.com/market-research/reports/sample",
                Details = rnd.NextDouble() > 0.6 ? "Interested in customized scope and regional splits." : null,
                Source = source,
                SubmittedAtUtc = created,
                CreatedAtUtc = created,
                LastUpdateAtUtc = created
            };

            // Distribute lifecycle states
            var bucket = rnd.Next(100);
            if (bucket < 18)
            {
                // Fresh, unassigned, unclassified — sits in central pool
            }
            else if (bucket < 28)
            {
                // Classified Not-Lead → closed by system
                Assign(lead, executives[rnd.Next(executives.Count)], created.AddHours(rnd.Next(1, 24)));
                lead.EnquiryType = EnquiryType.NotLead;
                lead.Status = LeadStatus.Closed;
                lead.ClosedAtUtc = created.AddHours(rnd.Next(24, 72));
            }
            else
            {
                var owner = executives[rnd.Next(executives.Count)];
                Assign(lead, owner, created.AddHours(rnd.Next(1, 24)));
                lead.EnquiryType = EnquiryType.Lead;
                lead.LeadType = rnd.NextDouble() > 0.5 ? LeadType.Custom : LeadType.Syndicate;
                lead.ValueInr = rnd.Next(1, 60) * 100000m;

                if (bucket < 55)
                {
                    lead.Stage = LeadStage.Lead;
                }
                else if (bucket < 72)
                {
                    lead.Stage = LeadStage.Proposal;
                }
                else if (bucket < 88)
                {
                    lead.Stage = LeadStage.Won;
                    lead.Status = LeadStatus.Won;
                    lead.ClosedAtUtc = created.AddDays(rnd.Next(2, 10));
                }
                else
                {
                    lead.Stage = LeadStage.Lost;
                    lead.Status = LeadStatus.Lost;
                    lead.LostReason = lostReasons[rnd.Next(lostReasons.Length)];
                    lead.ClosedAtUtc = created.AddDays(rnd.Next(2, 10));
                }
            }

            db.Leads.Add(lead);
            await db.SaveChangesAsync();
            lead.LeadCode = $"LMS-{lead.Id + 4000:D5}";

            // Day-wise updates for assigned, qualified leads
            if (lead.EnquiryType == EnquiryType.Lead && lead.AssignedToUserId.HasValue)
            {
                var daysSinceAssign = Math.Min(5, Math.Max(0, (int)(now.Date - lead.AssignedAtUtc!.Value.Date).TotalDays + 1));
                var filled = rnd.Next(0, daysSinceAssign + 1);
                var notes = new[]
                {
                    "Intro call attempted — left voicemail.", "Connected on call, shared brochure.",
                    "Email sent with sample pages.", "Client reviewing internally, follow-up booked.",
                    "Discussed scope customization on call."
                };
                for (var d = 1; d <= filled; d++)
                {
                    db.LeadDayUpdates.Add(new LeadDayUpdate
                    {
                        LeadId = lead.Id,
                        DayNumber = d,
                        Note = notes[(d - 1) % notes.Length],
                        UpdatedByUserId = lead.AssignedToUserId.Value,
                        UpdatedAtUtc = lead.AssignedAtUtc.Value.AddDays(d - 1).AddHours(6)
                    });
                }
            }
            await db.SaveChangesAsync();
        }

        static string lead3(Random rnd)
        {
            var abbr = new[] { "BFS", "HLC", "TEC", "MFG", "ENR", "RTL", "LOG", "PHM" };
            return abbr[rnd.Next(abbr.Length)];
        }

        static void Assign(Lead lead, User owner, DateTime whenUtc)
        {
            lead.AssignedToUserId = owner.Id;
            lead.AssignedAtUtc = whenUtc;
        }
    }

    // ------------------------------------------------------------ visitor stats (BRDID13)

    private static async Task SeedVisitorsAsync(LmsDbContext db)
    {
        if (await db.VisitorStats.AnyAsync()) return;

        var rnd = new Random(7);
        var now = DateTime.UtcNow;
        var stats = new List<VisitorStat>();

        // Reuse lead IPs so analytics correlate with enquiries
        var leadIps = await db.Leads
            .Where(l => l.IpAddress != null)
            .Select(l => l.IpAddress!)
            .Distinct()
            .Take(25)
            .ToListAsync();

        foreach (var ip in leadIps)
        {
            var visits = rnd.Next(1, 12);
            stats.Add(new VisitorStat
            {
                IpAddress = ip,
                VisitCount = visits,
                TimeSpentSeconds = visits * rnd.Next(60, 600),
                FirstVisitAtUtc = now.AddDays(-rnd.Next(5, 40)),
                LastVisitAtUtc = now.AddDays(-rnd.Next(0, 4))
            });
        }

        for (var i = 0; i < 15; i++)
        {
            stats.Add(new VisitorStat
            {
                IpAddress = $"{rnd.Next(30, 220)}.{rnd.Next(0, 255)}.{rnd.Next(0, 255)}.{rnd.Next(1, 254)}",
                VisitCount = rnd.Next(1, 6),
                TimeSpentSeconds = rnd.Next(30, 1800),
                FirstVisitAtUtc = now.AddDays(-rnd.Next(2, 30)),
                LastVisitAtUtc = now.AddDays(-rnd.Next(0, 2))
            });
        }

        db.VisitorStats.AddRange(stats);

        // Individual visit events consistent with the per-IP aggregates —
        // first event on FirstVisit day, the rest spread up to LastVisit.
        foreach (var s in stats)
        {
            var span = Math.Max(0, (int)(s.LastVisitAtUtc.Date - s.FirstVisitAtUtc.Date).TotalDays);
            var perVisit = Math.Max(20, s.TimeSpentSeconds / Math.Max(1, s.VisitCount));
            for (var v = 0; v < s.VisitCount; v++)
            {
                var when = v == 0
                    ? s.FirstVisitAtUtc
                    : s.FirstVisitAtUtc.AddDays(rnd.Next(0, span + 1)).AddHours(rnd.Next(6, 22));
                db.VisitEvents.Add(new VisitEvent
                {
                    IpAddress = s.IpAddress,
                    VisitAtUtc = when,
                    TimeSpentSeconds = perVisit
                });
            }
        }

        await db.SaveChangesAsync();
    }
}
