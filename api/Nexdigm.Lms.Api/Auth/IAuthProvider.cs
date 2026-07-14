using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Auth;

/// <summary>
/// Authentication abstraction.
/// Today: DbAuthProvider (database users).
/// Later: swap in an ActiveDirectoryAuthProvider (AD/Entra ID) without touching controllers.
/// </summary>
public interface IAuthProvider
{
    /// <summary>Returns the authenticated user, or null when credentials are invalid.</summary>
    Task<User?> AuthenticateAsync(string email, string password, CancellationToken ct = default);
}
