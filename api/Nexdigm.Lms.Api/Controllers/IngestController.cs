using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexdigm.Lms.Api.Contracts;
using Nexdigm.Lms.Api.Domain;
using Nexdigm.Lms.Api.Services;

namespace Nexdigm.Lms.Api.Controllers;

/// <summary>
/// Web ingestion endpoint for website enquiries.
/// The Nexdigm website pushes each enquiry here in real time; LMS auto-creates the lead
/// and it lands in the central pool. No manual intervention, no email dependency.
/// </summary>
[ApiController]
[Route("api/ingest")]
public class IngestController : ControllerBase
{
    private readonly LeadService _leads;
    private readonly IConfiguration _config;

    public IngestController(LeadService leads, IConfiguration config)
    {
        _leads = leads;
        _config = config;
    }

    [HttpPost("enquiry")]
    [AllowAnonymous]
    public async Task<IActionResult> Enquiry([FromBody] IngestEnquiryRequest req, CancellationToken ct)
    {
        var expected = _config["Ingestion:ApiKey"];
        if (string.IsNullOrEmpty(expected) ||
            Request.Headers["X-Api-Key"].ToString() != expected)
            return Unauthorized(new { message = "Invalid or missing API key." });

        var lead = await _leads.CreateLeadAsync(
            LeadSource.Website,
            req.Name, req.Email,
            phone: req.Phone, countryCode: req.CountryCode, industry: req.Industry,
            reportCode: req.ReportCode, reportTitle: req.ReportTitle, cta: req.Cta,
            ipAddress: req.IpAddress, reportUrl: req.ReportUrl, details: req.Details,
            submittedAtUtc: req.SubmittedAt?.ToUniversalTime(), ct: ct);

        return Ok(new { message = "Lead created.", leadId = lead.Id, leadCode = lead.LeadCode });
    }

    /// <summary>Demo helper — lets an Admin simulate a website enquiry from the UI.</summary>
    [HttpPost("simulate")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<IActionResult> Simulate(CancellationToken ct)
    {
        var rnd = new Random();
        var names = new[] { "Ravi Krishnan", "Tara Bose", "Neel Vaidya", "Alisha Rao", "Farhan Qureshi" };
        var domains = new[] { "globexpharma.com", "steelcoregroup.com", "gmail.com", "brightretail.in" };
        var industries = new[] { "Pharma", "Manufacturing", "Retail", "Technology" };
        var ctas = new[] { "Download Report", "Request Sample", "Contact Sales" };
        var titles = new[] { "API Manufacturing Outlook", "Smart Factory Adoption", "D2C Retail Playbook" };

        var name = names[rnd.Next(names.Length)];
        var email = name.ToLowerInvariant().Replace(" ", ".") + "@" + domains[rnd.Next(domains.Length)];

        var lead = await _leads.CreateLeadAsync(
            LeadSource.Website,
            name, email,
            phone: $"9{rnd.Next(100000000, 999999999)}",
            countryCode: "+91",
            industry: industries[rnd.Next(industries.Length)],
            reportCode: $"RC-SIM-{rnd.Next(1000, 9999)}",
            reportTitle: titles[rnd.Next(titles.Length)],
            cta: ctas[rnd.Next(ctas.Length)],
            ipAddress: $"{rnd.Next(30, 220)}.{rnd.Next(0, 255)}.{rnd.Next(0, 255)}.{rnd.Next(1, 254)}",
            ct: ct);

        return Ok(new { message = "Simulated website enquiry ingested.", leadCode = lead.LeadCode });
    }
}
