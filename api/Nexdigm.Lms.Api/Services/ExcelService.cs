using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Contracts;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Services;

/// <summary>
/// Bulk upload with a two-step flow:
///   1) dry run: validate every row, return a full preview (Valid / Error / Duplicate)
///   2) import: insert only the valid rows.
/// Duplicate rule: an email that already exists in LMS counts as a duplicate only when the
/// existing lead was created within the configured window (default 7 days). Older matches
/// are treated as repeat business and allowed.
/// </summary>
public class ExcelService
{
    /// <summary>Exact template columns — uploads must match this header row.</summary>
    public static readonly string[] TemplateColumns =
    {
        "Report Code", "Name", "Email", "Country Code", "Phone", "Industry",
        "Stage", "Status", "Enquiry Handled By", "Value (INR)", "Remarks"
    };

    private readonly LmsDbContext _db;
    private readonly LeadService _leads;
    private readonly PermissionService _permissions;
    private readonly IConfiguration _config;

    public ExcelService(LmsDbContext db, LeadService leads, PermissionService permissions, IConfiguration config)
    {
        _db = db;
        _leads = leads;
        _permissions = permissions;
        _config = config;
    }

    public byte[] BuildTemplate()
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Leads");

        for (var i = 0; i < TemplateColumns.Length; i++)
        {
            var cell = ws.Cell(1, i + 1);
            cell.Value = TemplateColumns[i];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#645BA8");
            cell.Style.Font.FontColor = XLColor.White;
        }

        ws.Cell(2, 1).Value = "RC-EXM-0001";
        ws.Cell(2, 2).Value = "Sample Contact";
        ws.Cell(2, 3).Value = "sample.contact@company.com";
        ws.Cell(2, 4).Value = "+91";
        ws.Cell(2, 5).Value = "9800000000";
        ws.Cell(2, 6).Value = "Healthcare";
        ws.Cell(2, 7).Value = "Enquiry";
        ws.Cell(2, 8).Value = "Open";
        ws.Cell(2, 9).Value = "aditi.sharma@nexdigm.com";
        ws.Cell(2, 10).Value = 250000;
        ws.Cell(2, 11).Value = "Migrated from legacy tracker";

        var hints = wb.Worksheets.Add("Instructions");
        hints.Cell(1, 1).Value = "Nexdigm LMS bulk upload template";
        hints.Cell(2, 1).Value = "Do not rename, remove or reorder columns on the 'Leads' sheet.";
        hints.Cell(3, 1).Value = "Stage: Enquiry / Lead / Proposal / Won / Lost";
        hints.Cell(4, 1).Value = "Status: Open / Won / Lost";
        hints.Cell(5, 1).Value = "Enquiry Handled By: email of a user allowed to own leads, e.g. an Executive (optional)";
        hints.Cell(6, 1).Value = "Name and Email are mandatory. Emails already in LMS within the recent window are flagged as duplicates.";

        ws.Columns().AdjustToContents();
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    public async Task<BulkUploadResult> ImportAsync(Stream file, bool dryRun, CancellationToken ct = default)
    {
        using var wb = new XLWorkbook(file);
        var ws = wb.Worksheets.FirstOrDefault(w => w.Name == "Leads") ?? wb.Worksheets.First();

        // ---- Template validation ----
        for (var i = 0; i < TemplateColumns.Length; i++)
        {
            var header = ws.Cell(1, i + 1).GetString().Trim();
            if (!header.Equals(TemplateColumns[i], StringComparison.OrdinalIgnoreCase))
                throw new BusinessRuleException(
                    $"Template mismatch at column {i + 1}: expected '{TemplateColumns[i]}' but found '{header}'. " +
                    "Please use the system-generated template.");
        }

        var windowDays = _config.GetValue<int>("BulkUpload:DuplicateWindowDays", 7);
        var duplicateCutoff = DateTime.UtcNow.AddDays(-windowDays);

        var handlerRoles = await _permissions.RolesWithAsync(PermissionActions.OwnLeads, ct);
        var usersByEmail = await _db.Users
            .Where(u => u.IsActive && handlerRoles.Contains(u.Role))
            .ToDictionaryAsync(u => u.Email.ToLowerInvariant(), u => u.Id, ct);

        // email -> most recent creation date among active leads (for the duplicate window)
        var existing = (await _db.Leads
                .Where(l => l.IsActive)
                .Select(l => new { l.Email, l.CreatedAtUtc })
                .ToListAsync(ct))
            .GroupBy(x => x.Email.ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.Max(x => x.CreatedAtUtc));

        var rows = new List<BulkRowPreview>();
        var seenInFile = new HashSet<string>();
        var inserted = 0;

        var lastRow = ws.LastRowUsed()?.RowNumber() ?? 1;
        for (var row = 2; row <= lastRow; row++)
        {
            ct.ThrowIfCancellationRequested();

            string Cell(int col) => ws.Cell(row, col).GetString().Trim();

            var reportCode = Cell(1);
            var name = Cell(2);
            var email = Cell(3);
            var countryCode = Cell(4);
            var phone = Cell(5);
            var industry = Cell(6);
            var stage = Cell(7);
            var status = Cell(8);
            var handledBy = Cell(9);
            var valueRaw = Cell(10);
            var remarks = Cell(11);

            if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(email) &&
                string.IsNullOrWhiteSpace(reportCode) && string.IsNullOrWhiteSpace(phone))
                continue; // fully blank rows are ignored

            void Reject(string error) =>
                rows.Add(new BulkRowPreview(row, name, email, industry, stage, status, handledBy, "Error", error));
            void Duplicate(string why) =>
                rows.Add(new BulkRowPreview(row, name, email, industry, stage, status, handledBy, "Duplicate", why));

            // ---- Row-level validation ----
            if (string.IsNullOrWhiteSpace(name)) { Reject("Name is required."); continue; }
            if (string.IsNullOrWhiteSpace(email) || !email.Contains('@') || !email.Contains('.'))
            { Reject("Invalid email format."); continue; }

            var emailKey = email.ToLowerInvariant();
            if (seenInFile.Contains(emailKey))
            { Duplicate("Duplicate of an earlier row in this file (same email)."); continue; }
            if (existing.TryGetValue(emailKey, out var lastCreated) && lastCreated >= duplicateCutoff)
            { Duplicate($"A lead with this email was created in LMS within the last {windowDays} days."); continue; }

            if (!string.IsNullOrWhiteSpace(stage) && !Enum.TryParse<LeadStage>(stage, true, out _))
            { Reject($"'{stage}' is not a valid Stage value."); continue; }
            if (!string.IsNullOrWhiteSpace(status) && !Enum.TryParse<LeadStatus>(status, true, out _))
            { Reject($"'{status}' is not a valid Status value."); continue; }

            decimal? value = null;
            if (!string.IsNullOrWhiteSpace(valueRaw))
            {
                if (!decimal.TryParse(valueRaw.Replace(",", ""), out var v) || v < 0)
                { Reject($"Value (INR) '{valueRaw}' is not a valid number."); continue; }
                value = v;
            }

            int? assignedId = null;
            if (!string.IsNullOrWhiteSpace(handledBy))
            {
                if (!usersByEmail.TryGetValue(handledBy.ToLowerInvariant(), out var uid))
                { Reject($"'{handledBy}' is not on the team or cannot own leads — use an executive's email, or leave blank."); continue; }
                assignedId = uid;
            }

            // ---- Valid ----
            seenInFile.Add(emailKey);
            rows.Add(new BulkRowPreview(row, name, email, industry, stage, status, handledBy, "Valid", null));

            if (!dryRun)
            {
                await _leads.CreateLeadAsync(
                    LeadSource.BulkUpload,
                    name, email,
                    phone: string.IsNullOrWhiteSpace(phone) ? null : phone,
                    countryCode: string.IsNullOrWhiteSpace(countryCode) ? null : countryCode,
                    industry: string.IsNullOrWhiteSpace(industry) ? null : industry,
                    reportCode: string.IsNullOrWhiteSpace(reportCode) ? null : reportCode,
                    remarks: string.IsNullOrWhiteSpace(remarks) ? null : remarks,
                    valueInr: value,
                    stage: string.IsNullOrWhiteSpace(stage) ? null : stage,
                    status: string.IsNullOrWhiteSpace(status) ? null : status,
                    assignedToUserId: assignedId,
                    ct: ct);
                inserted++;
            }
        }

        var valid = rows.Count(r => r.RowStatus == "Valid");
        return new BulkUploadResult(
            TotalRows: rows.Count,
            ValidRows: valid,
            Inserted: inserted,
            ErrorRows: rows.Count(r => r.RowStatus == "Error"),
            DuplicateRows: rows.Count(r => r.RowStatus == "Duplicate"),
            DryRun: dryRun,
            Rows: rows);
    }
}
