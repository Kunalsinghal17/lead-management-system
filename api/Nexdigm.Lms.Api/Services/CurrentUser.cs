using System.Security.Claims;
using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Services;

public static class CurrentUser
{
    public static int GetUserId(this ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue("uid")
                  ?? principal.FindFirstValue(ClaimTypes.NameIdentifier)
                  ?? "0";
        return int.TryParse(raw, out var id) ? id : 0;
    }

    public static UserRole GetRole(this ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue(ClaimTypes.Role) ?? "Basic";
        return Enum.TryParse<UserRole>(raw, out var role) ? role : UserRole.Basic;
    }

    public static bool IsAdmin(this ClaimsPrincipal p) => p.GetRole() == UserRole.Admin;
    public static bool IsAdminOrManager(this ClaimsPrincipal p) =>
        p.GetRole() is UserRole.Admin or UserRole.Manager;
}
