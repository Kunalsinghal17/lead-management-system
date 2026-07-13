using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Contracts;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Services;

namespace Nexdigm.Lms.Api.Controllers;

[ApiController]
[Route("api/masters")]
[Authorize]
public class MastersController : ControllerBase
{
    private readonly LmsDbContext _db;
    private readonly PermissionService _permissions;

    public MastersController(LmsDbContext db, PermissionService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    /// <summary>All dropdown masters and the live (editable) role/permission matrix.</summary>
    [HttpGet]
    public async Task<ActionResult<MastersDto>> Get(CancellationToken ct)
    {
        var lostReasons = await Values("LostReason", ct);
        var industries = await Values("Industry", ct);
        var roleMatrix = await _permissions.GetMatrixAsync(ct);

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
