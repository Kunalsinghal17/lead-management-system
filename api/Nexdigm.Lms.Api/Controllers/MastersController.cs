using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Contracts;
using Nexdigm.Lms.Api.Data;

namespace Nexdigm.Lms.Api.Controllers;

[ApiController]
[Route("api/masters")]
[Authorize]
public class MastersController : ControllerBase
{
    private readonly LmsDbContext _db;

    public MastersController(LmsDbContext db) => _db = db;

    /// <summary>All dropdown masters and the role/permission matrix (BRDID01, Master File).</summary>
    [HttpGet]
    public async Task<ActionResult<MastersDto>> Get(CancellationToken ct)
    {
        var lostReasons = await Values("LostReason", ct);
        var industries = await Values("Industry", ct);

        var roleMatrix = new Dictionary<string, Dictionary<string, bool>>
        {
            ["View All Leads"]        = new() { ["Admin"] = true,  ["Manager"] = true,  ["Executive"] = true,  ["Basic"] = true },
            ["View Own Leads"]        = new() { ["Admin"] = true,  ["Manager"] = true,  ["Executive"] = true,  ["Basic"] = true },
            ["Export"]                = new() { ["Admin"] = true,  ["Manager"] = true,  ["Executive"] = false, ["Basic"] = false },
            ["Delete/Inactive"]       = new() { ["Admin"] = true,  ["Manager"] = false, ["Executive"] = false, ["Basic"] = false },
            ["Add User"]              = new() { ["Admin"] = true,  ["Manager"] = false, ["Executive"] = false, ["Basic"] = false },
            ["Re-assignment of leads"] = new() { ["Admin"] = true, ["Manager"] = true,  ["Executive"] = false, ["Basic"] = false }
        };

        return new MastersDto(
            lostReasons,
            industries,
            new List<string> { "Custom", "Syndicate" },
            new List<string> { "Enquiry", "Lead", "Proposal", "Won", "Lost" },
            new List<string> { "Open", "Won", "Lost" },
            new List<string> { "Lead", "NotLead" },
            roleMatrix);
    }

    private async Task<List<string>> Values(string type, CancellationToken ct) =>
        await _db.MasterItems
            .Where(m => m.Type == type && m.IsActive)
            .OrderBy(m => m.SortOrder)
            .Select(m => m.Value)
            .ToListAsync(ct);
}
