using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Auth;
using Nexdigm.Lms.Api.Contracts;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;
using Nexdigm.Lms.Api.Services;

namespace Nexdigm.Lms.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly LmsDbContext _db;
    private readonly PermissionService _permissions;

    public UsersController(LmsDbContext db, PermissionService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    /// <summary>Users whose role has the "Own / Handle Leads" permission — valid assignment targets.</summary>
    [HttpGet("assignable")]
    public async Task<ActionResult<List<UserDto>>> Assignable(CancellationToken ct)
    {
        var roles = await _permissions.RolesWithAsync(PermissionActions.OwnLeads, ct);
        var users = await _db.Users
            .Include(u => u.Manager)
            .Where(u => u.IsActive && roles.Contains(u.Role))
            .OrderBy(u => u.FullName)
            .ToListAsync(ct);
        return users.Select(u => new UserDto(
            u.Id, u.FullName, u.Email, u.Role.ToString(),
            u.ManagerId, u.Manager?.FullName, u.IsActive)).ToList();
    }

    /// <summary>All active users — used for owner dropdowns.</summary>
    [HttpGet]
    public async Task<ActionResult<List<UserDto>>> List(CancellationToken ct)
    {
        var users = await _db.Users.Include(u => u.Manager)
            .OrderBy(u => u.FullName).ToListAsync(ct);
        return users.Select(u => new UserDto(
            u.Id, u.FullName, u.Email, u.Role.ToString(),
            u.ManagerId, u.Manager?.FullName, u.IsActive)).ToList();
    }

    /// <summary>Add user — "Add User" permission (default: Admin).</summary>
    [HttpPost]
    public async Task<ActionResult<UserDto>> Create([FromBody] CreateUserRequest req, CancellationToken ct)
    {
        await _permissions.EnsureAsync(User.GetRole(), PermissionActions.AddUser, ct);
        if (string.IsNullOrWhiteSpace(req.FullName) || string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { message = "Full name and email are required." });
        if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
            return BadRequest(new { message = "Password must be at least 8 characters." });
        if (!Enum.TryParse<UserRole>(req.Role, true, out var role))
            return BadRequest(new { message = "Role must be Admin, Manager, Executive or Basic." });

        var email = req.Email.Trim().ToLowerInvariant();
        if (await _db.Users.AnyAsync(u => u.Email.ToLower() == email, ct))
            return Conflict(new { message = "A user with this email already exists." });

        var user = new User
        {
            FullName = req.FullName.Trim(),
            Email = email,
            PasswordHash = PasswordHasher.Hash(req.Password),
            Role = role,
            ManagerId = req.ManagerId,
            AdId = string.IsNullOrWhiteSpace(req.AdId) ? null : req.AdId.Trim()
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        return new UserDto(user.Id, user.FullName, user.Email, user.Role.ToString(),
            user.ManagerId, null, user.IsActive);
    }

    /// <summary>
    /// Edit a user — role, reporting manager, active status, optional password reset.
    /// Guard: the last active Admin can never be demoted or deactivated.
    /// </summary>
    [HttpPut("{id:int}")]
    public async Task<ActionResult<UserDto>> Update(int id, [FromBody] UpdateUserRequest req, CancellationToken ct)
    {
        await _permissions.EnsureAsync(User.GetRole(), PermissionActions.AddUser, ct);

        var user = await _db.Users.Include(u => u.Manager).FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NotFound();

        if (string.IsNullOrWhiteSpace(req.FullName))
            return BadRequest(new { message = "Full name is required." });
        if (!Enum.TryParse<UserRole>(req.Role, true, out var role))
            return BadRequest(new { message = "Role must be Admin, Manager, Executive or Basic." });
        if (req.ManagerId == id)
            return BadRequest(new { message = "A user cannot report to themselves." });
        if (!string.IsNullOrEmpty(req.NewPassword) && req.NewPassword.Length < 8)
            return BadRequest(new { message = "New password must be at least 8 characters." });

        // Lockout guard — keep at least one active Admin at all times
        var losesAdmin = user.Role == UserRole.Admin && (role != UserRole.Admin || !req.IsActive);
        if (losesAdmin)
        {
            var otherAdmins = await _db.Users.CountAsync(
                u => u.Id != id && u.Role == UserRole.Admin && u.IsActive, ct);
            if (otherAdmins == 0)
                return BadRequest(new { message = "This is the last active Admin — assign another Admin first." });
        }

        user.FullName = req.FullName.Trim();
        user.Role = role;
        user.ManagerId = req.ManagerId;
        user.IsActive = req.IsActive;
        user.AdId = string.IsNullOrWhiteSpace(req.AdId) ? null : req.AdId.Trim();
        if (!string.IsNullOrEmpty(req.NewPassword))
            user.PasswordHash = PasswordHasher.Hash(req.NewPassword);

        await _db.SaveChangesAsync(ct);

        var manager = req.ManagerId.HasValue
            ? await _db.Users.FindAsync(new object[] { req.ManagerId.Value }, ct)
            : null;
        return new UserDto(user.Id, user.FullName, user.Email, user.Role.ToString(),
            user.ManagerId, manager?.FullName, user.IsActive);
    }

    /// <summary>Deactivate a user — "Manage Users" permission. The last active Admin is protected.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Deactivate(int id, CancellationToken ct)
    {
        await _permissions.EnsureAsync(User.GetRole(), PermissionActions.AddUser, ct);
        var user = await _db.Users.FindAsync(new object[] { id }, ct);
        if (user is null) return NotFound();

        if (user.Role == UserRole.Admin && user.IsActive)
        {
            var otherAdmins = await _db.Users.CountAsync(
                u => u.Id != id && u.Role == UserRole.Admin && u.IsActive, ct);
            if (otherAdmins == 0)
                return BadRequest(new { message = "This is the last active Admin — assign another Admin first." });
        }

        user.IsActive = false;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }
}
