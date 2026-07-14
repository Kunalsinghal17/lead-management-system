using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Services;

/// <summary>
/// Central catalogue of customizable permission actions (role/access mapping).
/// Stored per role in the database so Admins can re-map access without a deployment.
/// </summary>
public static class PermissionActions
{
    public const string ViewAllLeads = "ViewAllLeads";
    public const string OwnLeads = "OwnLeads";
    public const string CreateLead = "CreateLead";
    public const string Reassign = "Reassign";
    public const string BulkUpload = "BulkUpload";
    public const string Export = "Export";
    public const string DeleteLead = "DeleteLead";
    public const string AddUser = "AddUser";

    // Page/module access — controls which pages a role can open (nav + route guards).
    public const string PageDashboard = "PageDashboard";
    public const string PageAskAI = "PageAskAI";
    public const string PageLeads = "PageLeads";
    public const string PageCentralPool = "PageCentralPool";
    public const string PageBulkUpload = "PageBulkUpload";
    public const string PageVisitorAnalytics = "PageVisitorAnalytics";
    public const string PageUsersRoles = "PageUsersRoles";

    public static readonly string[] All =
    {
        ViewAllLeads, OwnLeads, CreateLead, Reassign, BulkUpload, Export, DeleteLead, AddUser,
        PageDashboard, PageAskAI, PageLeads, PageCentralPool, PageBulkUpload,
        PageVisitorAnalytics, PageUsersRoles
    };

    public static readonly IReadOnlyDictionary<string, string> DisplayNames =
        new Dictionary<string, string>
        {
            [ViewAllLeads] = "View All Leads",
            [OwnLeads] = "Own / Handle Leads",
            [CreateLead] = "Create Lead (Manual)",
            [Reassign] = "Re-assignment of leads",
            [BulkUpload] = "Bulk Upload",
            [Export] = "Export",
            [DeleteLead] = "Delete/Inactive",
            [AddUser] = "Manage Users",
            [PageDashboard] = "Page: Dashboard",
            [PageAskAI] = "Page: Ask AI",
            [PageLeads] = "Page: Leads",
            [PageCentralPool] = "Page: Central Pool",
            [PageBulkUpload] = "Page: Bulk Upload",
            [PageVisitorAnalytics] = "Page: Visitor Analytics",
            [PageUsersRoles] = "Page: Users & Roles"
        };

    /// <summary>Default matrix — Role Master plus "leads are handled by Executives".</summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<UserRole, bool>> Defaults =
        new Dictionary<string, IReadOnlyDictionary<UserRole, bool>>
        {
            [ViewAllLeads] = D(admin: true, manager: true, executive: true, basic: true),
            [OwnLeads]     = D(admin: false, manager: false, executive: true, basic: false),
            [CreateLead]   = D(admin: true, manager: true, executive: true, basic: false),
            [Reassign]     = D(admin: true, manager: true, executive: false, basic: false),
            [BulkUpload]   = D(admin: true, manager: true, executive: true, basic: false),
            [Export]       = D(admin: true, manager: true, executive: false, basic: false),
            [DeleteLead]   = D(admin: true, manager: false, executive: false, basic: false),
            [AddUser]      = D(admin: true, manager: false, executive: false, basic: false),

            [PageDashboard]        = D(admin: true, manager: true, executive: true, basic: true),
            [PageAskAI]            = D(admin: true, manager: true, executive: true, basic: true),
            [PageLeads]            = D(admin: true, manager: true, executive: true, basic: true),
            [PageCentralPool]      = D(admin: true, manager: true, executive: true, basic: true),
            [PageBulkUpload]       = D(admin: true, manager: true, executive: true, basic: false),
            [PageVisitorAnalytics] = D(admin: true, manager: true, executive: true, basic: false),
            [PageUsersRoles]       = D(admin: true, manager: false, executive: false, basic: false)
        };

    /// <summary>Permissions locked to true so an Admin can never lock themselves out.</summary>
    public static bool IsLocked(string action, UserRole role) =>
        role == UserRole.Admin && (action == AddUser || action == PageUsersRoles);

    private static IReadOnlyDictionary<UserRole, bool> D(bool admin, bool manager, bool executive, bool basic) =>
        new Dictionary<UserRole, bool>
        {
            [UserRole.Admin] = admin,
            [UserRole.Manager] = manager,
            [UserRole.Executive] = executive,
            [UserRole.Basic] = basic
        };
}

/// <summary>DB-backed permission checks. Rows live in MasterItems (Type = "Permission", Value = "Action:Role").</summary>
public class PermissionService
{
    private const string Type = "Permission";
    private readonly LmsDbContext _db;

    public PermissionService(LmsDbContext db) => _db = db;

    public async Task<bool> IsAllowedAsync(UserRole role, string action, CancellationToken ct = default)
    {
        var item = await _db.MasterItems
            .FirstOrDefaultAsync(m => m.Type == Type && m.Value == action + ":" + role, ct);
        if (item is not null) return item.IsActive;

        // Fall back to defaults if the row is missing
        return PermissionActions.Defaults.TryGetValue(action, out var row) && row[role];
    }

    /// <summary>Throws (-> HTTP 403) when the role lacks the permission.</summary>
    public async Task EnsureAsync(UserRole role, string action, CancellationToken ct = default)
    {
        if (!await IsAllowedAsync(role, action, ct))
        {
            var name = PermissionActions.DisplayNames.TryGetValue(action, out var d) ? d : action;
            throw new BusinessRuleException($"Your role does not have the '{name}' permission.", 403);
        }
    }

    public async Task<List<UserRole>> RolesWithAsync(string action, CancellationToken ct = default)
    {
        var result = new List<UserRole>();
        foreach (var role in Enum.GetValues<UserRole>())
            if (await IsAllowedAsync(role, action, ct))
                result.Add(role);
        return result;
    }

    /// <summary>Full matrix keyed by display name -> role -> allowed (shape shared with the frontend).</summary>
    public async Task<Dictionary<string, Dictionary<string, bool>>> GetMatrixAsync(CancellationToken ct = default)
    {
        var rows = await _db.MasterItems.Where(m => m.Type == Type).ToListAsync(ct);
        var matrix = new Dictionary<string, Dictionary<string, bool>>();
        foreach (var action in PermissionActions.All)
        {
            var roleMap = new Dictionary<string, bool>();
            foreach (var role in Enum.GetValues<UserRole>())
            {
                var item = rows.FirstOrDefault(r => r.Value == action + ":" + role);
                roleMap[role.ToString()] = item?.IsActive
                    ?? (PermissionActions.Defaults.TryGetValue(action, out var d) && d[role]);
            }
            matrix[action] = roleMap;
        }
        return matrix;
    }

    /// <summary>Applies an updated matrix. "AddUser:Admin" stays locked on so Admins can never lock themselves out.</summary>
    public async Task UpdateMatrixAsync(Dictionary<string, Dictionary<string, bool>> matrix, CancellationToken ct = default)
    {
        var rows = await _db.MasterItems.Where(m => m.Type == Type).ToListAsync(ct);
        foreach (var (action, roleMap) in matrix)
        {
            if (!PermissionActions.All.Contains(action)) continue;
            foreach (var (roleName, allowedRaw) in roleMap)
            {
                if (!Enum.TryParse<UserRole>(roleName, true, out var role)) continue;
                var allowed = allowedRaw;
                if (PermissionActions.IsLocked(action, role)) allowed = true; // lockout guard

                var key = action + ":" + role;
                var row = rows.FirstOrDefault(r => r.Value == key);
                if (row is null)
                    _db.MasterItems.Add(new MasterItem { Type = Type, Value = key, IsActive = allowed });
                else
                    row.IsActive = allowed;
            }
        }
        await _db.SaveChangesAsync(ct);
    }

    public static async Task SeedDefaultsAsync(LmsDbContext db)
    {
        if (await db.MasterItems.AnyAsync(m => m.Type == Type)) return;
        foreach (var (action, roleMap) in PermissionActions.Defaults)
            foreach (var (role, allowed) in roleMap)
                db.MasterItems.Add(new MasterItem { Type = Type, Value = action + ":" + role, IsActive = allowed });
        await db.SaveChangesAsync();
    }
}
