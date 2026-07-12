using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Auth;

/// <summary>Database-backed credential check (development / until AD integration goes live).</summary>
public class DbAuthProvider : IAuthProvider
{
    private readonly LmsDbContext _db;

    public DbAuthProvider(LmsDbContext db) => _db = db;

    public async Task<User?> AuthenticateAsync(string email, string password, CancellationToken ct = default)
    {
        var normalized = email.Trim().ToLowerInvariant();
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Email.ToLower() == normalized && u.IsActive, ct);

        if (user is null) return null;
        return PasswordHasher.Verify(password, user.PasswordHash) ? user : null;
    }
}
