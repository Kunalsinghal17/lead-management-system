using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Contracts;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Services;

/// <summary>BRDID12 — bulk upload template generation and validated import.</summary>
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

    public ExcelService(LmsDbContext db, LeadService leads)
    {
        _db = db;
        _leads = leads;
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

        // Example row
        ws.Cell(2, 1).Value = "RC-EXM-0001";
        ws.Cell(2, 2).Value = "Sample Contact";
        ws.Cell(2, 3).Value = "sample.contact@company.com";
        ws.Cell(2, 4).Value = "+91";
        ws.Cell(2, 5).Value = "9800000000";
        ws.Cell(2, 6).Value = "Healthcare";
        ws.Cell(2, 7).Value = "Enquiry";
        ws.Cell(2, 8).Value = "Open";
        ws.Cell(2, 9).Value = "executive@nexdigm.com";
        ws.Cell(2, 10).Value = 250000;
        ws.Cell(2, 11).Value = "Migrated from legacy tracker";

        var hints = wb.Worksheets.Add("Instructions");
        hints.Cell(1, 1).Value = "Nexdigm LMS bulk upload template";
        hints.Cell(2, 1).Value = "Do not rename, remove or reorder columns on the 'Leads' sheet.";
        hints.Cell(3, 1).Value = "Stage: Enquiry / Lead / Proposal / Won / Lost";
        hints.Cell(4, 1).Value = "Status: Open / Won / Lost";
        hints.Cell(5, 1).Value = "Enquiry Handled By: email of an existing LMS user (optional)";
        hints.Cell(6, 1).Value = "Name and Email are mandatory. Duplicate emails already in LMS are rejected.";

        ws.Columns().AdjustToContents();
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    public async Task<BulkUploadResult> ImportAsync(Stream file, CancellationToken ct = default)
    {
        using var wb = new XLWorkbook(file);
        var ws = wb.Worksheets.FirstOrDefault(w => w.Name == "Leads") ?? wb.Worksheets.First();

        // ---- Template validation: header row must match exactly ----
        for (var i = 0; i < TemplateColumns.Length; i++)
        {
            var header = ws.Cell(1, i + 1).GetString().Trim();
            if (!header.Equals(TemplateColumns[i], StringComparison.OrdinalIgnoreCase))
                throw new BusinessRuleException(
                    $"Template mismatch at column {i + 1}: expected '{TemplateColumns[i]}' but found '{header}'. " +
                    "Please use the system-generated template.");
        }

        var errors = new List<BulkRowError>();
        var inserted = 0;
        var total = 0;

        var usersByEmail = await _db.Users
            .Where(u => u.IsActive)
            .ToDictionaryAsync(u => u.Email.ToLowerInvariant(), u => u.Id, ct);

        var existingEmails = new HashSet<string>(
            await _db.Leads.Where(l => l.IsActive).Select(l => l.Email.ToLower()).ToListAsync(ct));

        var seenInFile = new HashSet<string>();

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

            // skip fully blank rows silently
            if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(email) &&
                string.IsNullOrWhiteSpace(reportCode) && string.IsNullOrWhiteSpace(phone))
                continue;

            total++;

            // ---- Row-level validation ----
            if (string.IsNullOrWhiteSpace(name))
            { errors.Add(new BulkRowError(row, "Name is mandatory.")); continue; }
            if (string.IsNullOrWhiteSpace(email) || !email.Contains('@') || !email.Contains('.'))
            { errors.Add(new BulkRowError(row, "A valid Email is mandatory.")); continue; }

            var emailKey = email.ToLowerInvariant();
            if (seenInFile.Contains(emailKey))
            { errors.Add(new BulkRowError(row, $"Duplicate email '{email}' within the file.")); continue; }
            if (existingEmails.Contains(emailKey))
            { errors.Add(new BulkRowError(row, $"Duplicate: a lead with email '{email}' already exists in LMS.")); continue; }

            if (!string.IsNullOrWhiteSpace(stage) && !Enum.TryParse<LeadStage>(stage, true, out _))
            { errors.Add(new BulkRowError(row, $"Invalid Stage '{stage}'. Allowed: Enquiry, Lead, Proposal, Won, Lost.")); continue; }
            if (!string.IsNullOrWhiteSpace(status) && !Enum.TryParse<LeadStatus>(status, true, out _))
            { errors.Add(new BulkRowError(row, $"Invalid Status '{status}'. Allowed: Open, Won, Lost.")); continue; }

            decimal? value = null;
            if (!string.IsNullOrWhiteSpace(valueRaw))
            {
                if (!decimal.TryParse(valueRaw, out var v) || v < 0)
                { errors.Add(new BulkRowError(row, $"Value (INR) '{valueRaw}' is not a valid number.")); continue; }
                value = v;
            }

            int? assignedId = null;
            if (!string.IsNullOrWhiteSpace(handledBy))
            {
                if (!usersByEmail.TryGetValue(handledBy.ToLowerInvariant(), out var uid))
                { errors.Add(new BulkRowError(row, $"'Enquiry Handled By' user '{handledBy}' not found in LMS.")); continue; }
                assignedId = uid;
            }

            try
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

                seenInFile.Add(emailKey);
                inserted++;
            }
            catch (BusinessRuleException ex)
            {
                errors.Add(new BulkRowError(row, ex.Message));
            }
        }

        // File-level consistency: processed rows must equal uploaded rows
        return new BulkUploadResult(total, inserted, errors.Count, errors);
    }
}
