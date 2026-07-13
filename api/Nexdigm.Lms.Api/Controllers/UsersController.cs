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

    /// <summary>Users whose role has the "Own / Handle Leads" permission — valid assignment targets (BRDID04).</summary>
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

    /// <summary>All active users — used for owner dropdowns (BRDID04).</summary>
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
            ManagerId = req.ManagerId
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        return new UserDto(user.Id, user.FullName, user.Email, user.Role.ToString(),
            user.ManagerId, null, user.IsActive);
    }

    /// <summary>Deactivate a user — "Add User" (user management) permission.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Deactivate(int id, CancellationToken ct)
    {
        await _permissions.EnsureAsync(User.GetRole(), PermissionActions.AddUser, ct);
        var user = await _db.Users.FindAsync(new object[] { id }, ct);
        if (user is null) return NotFound();
        user.IsActive = false;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }
}
