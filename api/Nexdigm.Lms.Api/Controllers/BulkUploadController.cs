using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexdigm.Lms.Api.Contracts;
using Nexdigm.Lms.Api.Services;

namespace Nexdigm.Lms.Api.Controllers;

[ApiController]
[Route("api/bulk-upload")]
[Authorize]
public class BulkUploadController : ControllerBase
{
    private readonly ExcelService _excel;
    private readonly PermissionService _permissions;

    public BulkUploadController(ExcelService excel, PermissionService permissions)
    {
        _excel = excel;
        _permissions = permissions;
    }

    /// <summary>Downloadable standard Excel template.</summary>
    [HttpGet("template")]
    public async Task<IActionResult> Template(CancellationToken ct)
    {
        await _permissions.EnsureAsync(User.GetRole(), PermissionActions.BulkUpload, ct);
        var bytes = _excel.BuildTemplate();
        return File(bytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "nexdigm-lms-bulk-upload-template.xlsx");
    }

    /// <summary>
    /// Two-step import. dryRun=true validates and returns a full row-by-row
    /// preview (Valid / Error / Duplicate); dryRun=false imports the valid rows.
    /// </summary>
    [HttpPost]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<ActionResult<BulkUploadResult>> Upload(IFormFile file, [FromQuery] bool dryRun = false, CancellationToken ct = default)
    {
        await _permissions.EnsureAsync(User.GetRole(), PermissionActions.BulkUpload, ct);
        if (file is null || file.Length == 0)
            return BadRequest(new { message = "Please choose an .xlsx file to upload." });
        if (!file.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Only .xlsx files exported from the system template are accepted." });

        await using var stream = file.OpenReadStream();
        var result = await _excel.ImportAsync(stream, dryRun, ct);
        return result;
    }
}
