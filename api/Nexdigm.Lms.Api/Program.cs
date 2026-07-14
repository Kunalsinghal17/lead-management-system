using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Nexdigm.Lms.Api.Auth;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Services;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ---------------------------------------------------------------- database
// SQL Server first (LocalDB by default). If it is unreachable and
// Database:AllowSqliteFallback is true, fall back to a local SQLite file so
// the app still starts on machines without SQL Server ("clone -> run").
var provider = config["Database:Provider"] ?? "SqlServer";

if (provider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
{
    var sqlConn = config.GetConnectionString("SqlServer")!;
    var canConnect = false;
    try
    {
        var probeOptions = new DbContextOptionsBuilder<LmsDbContext>()
            .UseSqlServer(sqlConn, o => o.CommandTimeout(5))
            .Options;
        using var probe = new LmsDbContext(probeOptions);
        canConnect = probe.Database.CanConnect();
        if (!canConnect)
        {
            // Server reachable but DB missing -> EnsureCreated will create it. Probe the server itself.
            probe.Database.EnsureCreated();
            canConnect = true;
        }
    }
    catch
    {
        canConnect = false;
    }

    if (canConnect)
    {
        builder.Services.AddDbContext<LmsDbContext>(o => o.UseSqlServer(sqlConn));
        Console.WriteLine("[LMS] Database: SQL Server");
    }
    else if (config.GetValue<bool>("Database:AllowSqliteFallback", true))
    {
        builder.Services.AddDbContext<LmsDbContext>(o =>
            o.UseSqlite(config.GetConnectionString("Sqlite") ?? "Data Source=nexdigm-lms.db"));
        Console.WriteLine("[LMS] WARNING: SQL Server unreachable — using local SQLite fallback (nexdigm-lms.db).");
        Console.WriteLine("[LMS] Fix ConnectionStrings:SqlServer in appsettings.json to use SQL Server.");
    }
    else
    {
        throw new InvalidOperationException(
            "SQL Server is unreachable and SQLite fallback is disabled. " +
            "Check ConnectionStrings:SqlServer in appsettings.json.");
    }
}
else
{
    builder.Services.AddDbContext<LmsDbContext>(o =>
        o.UseSqlite(config.GetConnectionString("Sqlite") ?? "Data Source=nexdigm-lms.db"));
    Console.WriteLine("[LMS] Database: SQLite");
}

// ---------------------------------------------------------------- services
builder.Services.AddScoped<IAuthProvider, DbAuthProvider>();   // AD/Entra provider slots in here later
builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<PermissionService>();
builder.Services.AddScoped<LeadService>();
builder.Services.AddScoped<ExcelService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddSingleton<NotificationScheduler>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<NotificationScheduler>());

builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ---------------------------------------------------------------- auth
var jwtKey = config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key missing");
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = config["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = config["Jwt:Audience"],
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });
builder.Services.AddAuthorization();

// ---------------------------------------------------------------- CORS
var allowedOrigins = config.GetSection("Cors:AllowedOrigins").Get<string[]>()
                     ?? new[] { "http://localhost:5173" };
builder.Services.AddCors(o => o.AddPolicy("frontend", p => p
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

// ---------------------------------------------------------------- error handling
// Business-rule violations -> clean JSON with no sensitive details (security control).
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (BusinessRuleException ex)
    {
        context.Response.StatusCode = ex.StatusCode;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new { message = ex.Message });
    }
    catch (Exception)
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new { message = "An unexpected error occurred." });
    }
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.MapGet("/", () => Results.Json(new
{
    application = "Nexdigm Lead Management System API",
    docs = "/swagger",
    health = "/api/health"
}));
app.MapGet("/api/health", () => Results.Json(new { status = "ok", timeUtc = DateTime.UtcNow }));

// ---------------------------------------------------------------- create + seed DB
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<LmsDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    await DbSeeder.InitializeAsync(db, config, logger);
}

app.Run();
