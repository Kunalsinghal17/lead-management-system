using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Services;

/// <summary>
/// Role-based data visibility. When a role does NOT have "View All Leads":
///  - Manager  -> own leads + leads of their direct reports (team context)
///  - Others   -> own leads only
/// This applies uniformly to the lead list, dashboard and Ask AI, so every
/// number a user sees is in their own context.
/// </summary>
public static class DataScope
{
    public static async Task<(IQueryable<Lead> Query, string Scope)> ApplyAsync(
        IQueryable<Lead> query,
        LmsDbContext db,
        PermissionService permissions,
        int userId,
        UserRole role,
        CancellationToken ct = default)
    {
        if (await permissions.IsAllowedAsync(role, PermissionActions.ViewAllLeads, ct))
            return (query, "all");

        if (role == UserRole.Manager)
        {
            var teamIds = await db.Users
                .Where(u => u.ManagerId == userId && u.IsActive)
                .Select(u => u.Id)
                .ToListAsync(ct);
            teamIds.Add(userId);
            return (query.Where(l => l.AssignedToUserId != null && teamIds.Contains(l.AssignedToUserId.Value)), "team");
        }

        return (query.Where(l => l.AssignedToUserId == userId), "own");
    }
}
