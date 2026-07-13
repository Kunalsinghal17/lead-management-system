using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexdigm.Lms.Api.Services;

namespace Nexdigm.Lms.Api.Controllers;

/// <summary>
/// Editable role/permission matrix (BRDID01). Reading is open to all signed-in
/// users (the UI adapts to it); editing is strictly Admin.
/// </summary>
[ApiController]
[Route("api/permissions")]
[Authorize]
public class PermissionsController : ControllerBase
{
    private readonly PermissionService _permissions;

    public PermissionsController(PermissionService permissions) => _permissions = permissions;

    [HttpGet]
    public async Task<ActionResult<Dictionary<string, Dictionary<string, bool>>>> Get(CancellationToken ct) =>
        await _permissions.GetMatrixAsync(ct);

    [HttpGet("display-names")]
    public ActionResult<Dictionary<string, string>> DisplayNames() =>
        PermissionActions.DisplayNames.ToDictionary(kv => kv.Key, kv => kv.Value);

    [HttpPut]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<Dictionary<string, Dictionary<string, bool>>>> Update(
        [FromBody] Dictionary<string, Dictionary<string, bool>> matrix, CancellationToken ct)
    {
        await _permissions.UpdateMatrixAsync(matrix, ct);
        return await _permissions.GetMatrixAsync(ct);
    }
}
