using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexdigm.Lms.Api.Auth;
using Nexdigm.Lms.Api.Contracts;

namespace Nexdigm.Lms.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthProvider _authProvider;
    private readonly TokenService _tokens;
    private readonly IConfiguration _config;

    public AuthController(IAuthProvider authProvider, TokenService tokens, IConfiguration config)
    {
        _authProvider = authProvider;
        _tokens = tokens;
        _config = config;
    }

    /// <summary>BRDID01 — login. Credentials in body (never via URL); errors stay generic.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Email and password are required." });

        var user = await _authProvider.AuthenticateAsync(request.Email, request.Password, ct);
        if (user is null)
            return Unauthorized(new { message = "Invalid email or password." });

        var (token, expires) = _tokens.CreateToken(user);
        var idle = int.TryParse(_config["Jwt:IdleTimeoutMinutes"], out var m) ? m : 30;

        return new LoginResponse(token, expires, user.Id, user.FullName, user.Email, user.Role.ToString(), idle);
    }
}
