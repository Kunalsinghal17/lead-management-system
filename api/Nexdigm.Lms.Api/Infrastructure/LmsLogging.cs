using System.Text;
using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Data;
using Nexdigm.Lms.Api.Services;

namespace Nexdigm.Lms.Api.Infrastructure;

/// <summary>
/// Self-contained error/request logging for the LMS API. No external packages.
///
///   • Daily rolling file:  logs/lms-api-YYYYMMDD.log  (new file each day)
///   • ErrorLogs SQL table: unexpected exceptions, queryable in SSMS
///   • Error ID on every failure — returned to the UI as { message, errorId }
///     and header X-Error-Id, and written on the matching log lines, so a user
///     report of "Ref: A1B2C3D4" can be grepped straight to the stack trace.
///
/// Verbosity is a single live-reloaded flag in appsettings.json:
///   LmsLogging:Level = "All"   → every request line + Information logs
///                      "Info"  → app info + failed/slow requests + errors (default)
///                      "Error" → errors only
/// </summary>
public static class LmsLogLevelFlag
{
    public const string All = "All";
    public const string Info = "Info";
    public const string Error = "Error";

    public static string Read(IConfiguration config)
    {
        var v = config["LmsLogging:Level"] ?? Info;
        return v.Equals(All, StringComparison.OrdinalIgnoreCase) ? All
             : v.Equals(Error, StringComparison.OrdinalIgnoreCase) ? Error
             : Info;
    }
}

/// <summary>Thread-safe daily-rolling plain-text log file writer.</summary>
public class LmsFileLogWriter
{
    private readonly string _directory;
    private readonly object _gate = new();

    public LmsFileLogWriter(string directory) => _directory = directory;

    public void Write(string level, string category, string message, Exception? exception = null)
    {
        try
        {
            var sb = new StringBuilder();
            sb.Append(DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fff"))
              .Append("Z [").Append(level.ToUpperInvariant().PadRight(5)).Append("] ")
              .Append(category).Append(" | ").Append(message);
            if (exception is not null)
                sb.AppendLine().Append(exception);

            var path = Path.Combine(_directory, $"lms-api-{DateTime.UtcNow:yyyyMMdd}.log");
            lock (_gate)
            {
                Directory.CreateDirectory(_directory);
                File.AppendAllText(path, sb.AppendLine().ToString(), Encoding.UTF8);
            }
        }
        catch
        {
            // Logging must never take the app down. Console still has the entry
            // via the default provider when file IO fails.
        }
    }
}

/// <summary>
/// Routes ALL ILogger output (framework + app _logger calls) into the daily file,
/// filtered by the LmsLogging:Level flag. Framework chatter (Microsoft.*, System.*)
/// only passes at Warning or above so the file stays readable.
/// </summary>
public sealed class LmsFileLoggerProvider : ILoggerProvider
{
    private readonly LmsFileLogWriter _writer;
    private readonly IConfiguration _config;

    public LmsFileLoggerProvider(LmsFileLogWriter writer, IConfiguration config)
    {
        _writer = writer;
        _config = config;
    }

    public ILogger CreateLogger(string categoryName) => new FileLogger(_writer, _config, categoryName);

    public void Dispose() { }

    private sealed class FileLogger : ILogger
    {
        private readonly LmsFileLogWriter _writer;
        private readonly IConfiguration _config;
        private readonly string _category;

        public FileLogger(LmsFileLogWriter writer, IConfiguration config, string category)
        {
            _writer = writer;
            _config = config;
            _category = category;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel)
        {
            var flag = LmsLogLevelFlag.Read(_config);
            var min = flag == LmsLogLevelFlag.Error ? LogLevel.Error
                    : flag == LmsLogLevelFlag.All ? LogLevel.Debug
                    : LogLevel.Information;
            if (logLevel < min) return false;

            // keep framework noise out unless it is a real problem
            if ((_category.StartsWith("Microsoft.") || _category.StartsWith("System.")) &&
                logLevel < LogLevel.Warning)
                return false;

            return true;
        }

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
            Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;
            _writer.Write(Abbrev(logLevel), _category, formatter(state, exception), exception);
        }

        private static string Abbrev(LogLevel l) => l switch
        {
            LogLevel.Trace => "TRACE",
            LogLevel.Debug => "DEBUG",
            LogLevel.Information => "INFO",
            LogLevel.Warning => "WARN",
            LogLevel.Error => "ERROR",
            LogLevel.Critical => "FATAL",
            _ => "INFO"
        };
    }
}

/// <summary>One row per unexpected API exception (SQL Server or SQLite).</summary>
public record ErrorLogEntry(
    string ErrorId,
    string Level,
    string Message,
    string? Exception,
    string? Method,
    string? Path,
    int? UserId,
    string? UserRole,
    int? StatusCode,
    long? ElapsedMs);

/// <summary>
/// Writes error rows to the ErrorLogs table. The table is created on demand
/// (provider-aware), so existing databases need no migration. If the database
/// is unreachable the failure is noted in the file log and the app carries on.
/// </summary>
public class LmsDbErrorSink
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly LmsFileLogWriter _file;
    private volatile bool _tableEnsured;

    public LmsDbErrorSink(IServiceScopeFactory scopeFactory, IConfiguration config, LmsFileLogWriter file)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _file = file;
    }

    public async Task WriteAsync(ErrorLogEntry entry)
    {
        if (!_config.GetValue<bool>("LmsLogging:DatabaseErrors", true)) return;

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<LmsDbContext>();

            if (!_tableEnsured)
            {
                await EnsureTableAsync(db);
                _tableEnsured = true;
            }

            var conn = db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            await using var cmd = conn.CreateCommand();
            cmd.CommandText =
                "INSERT INTO ErrorLogs (ErrorId, Level, Message, Exception, Method, Path, UserId, UserRole, StatusCode, ElapsedMs, CreatedAtUtc) " +
                "VALUES (@ErrorId, @Level, @Message, @Exception, @Method, @Path, @UserId, @UserRole, @StatusCode, @ElapsedMs, @CreatedAtUtc)";

            void Add(string name, object? value)
            {
                var p = cmd.CreateParameter();
                p.ParameterName = name;
                p.Value = value ?? DBNull.Value;
                cmd.Parameters.Add(p);
            }

            Add("@ErrorId", entry.ErrorId);
            Add("@Level", entry.Level);
            Add("@Message", Truncate(entry.Message, 2000));
            Add("@Exception", entry.Exception);
            Add("@Method", entry.Method);
            Add("@Path", Truncate(entry.Path, 500));
            Add("@UserId", entry.UserId);
            Add("@UserRole", entry.UserRole);
            Add("@StatusCode", entry.StatusCode);
            Add("@ElapsedMs", entry.ElapsedMs);
            Add("@CreatedAtUtc", DateTime.UtcNow);

            await cmd.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            _file.Write("WARN", "LmsDbErrorSink",
                $"Could not write error {entry.ErrorId} to the ErrorLogs table — file log still has it. {ex.Message}");
        }
    }

    private static async Task EnsureTableAsync(LmsDbContext db)
    {
        var sql = db.Database.IsSqlServer()
            ? @"IF OBJECT_ID(N'dbo.ErrorLogs', N'U') IS NULL
                CREATE TABLE dbo.ErrorLogs (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    ErrorId NVARCHAR(12) NOT NULL,
                    Level NVARCHAR(10) NOT NULL,
                    Message NVARCHAR(2000) NOT NULL,
                    Exception NVARCHAR(MAX) NULL,
                    Method NVARCHAR(10) NULL,
                    Path NVARCHAR(500) NULL,
                    UserId INT NULL,
                    UserRole NVARCHAR(20) NULL,
                    StatusCode INT NULL,
                    ElapsedMs BIGINT NULL,
                    CreatedAtUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
                );"
            : @"CREATE TABLE IF NOT EXISTS ErrorLogs (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ErrorId TEXT NOT NULL,
                    Level TEXT NOT NULL,
                    Message TEXT NOT NULL,
                    Exception TEXT NULL,
                    Method TEXT NULL,
                    Path TEXT NULL,
                    UserId INTEGER NULL,
                    UserRole TEXT NULL,
                    StatusCode INTEGER NULL,
                    ElapsedMs INTEGER NULL,
                    CreatedAtUtc TEXT NOT NULL
                );";
        await db.Database.ExecuteSqlRawAsync(sql);
    }

    private static string? Truncate(string? s, int max) =>
        s is null ? null : s.Length <= max ? s : s[..max];
}

/// <summary>
/// Global exception + request logging middleware. Sits first in the pipeline.
///   • BusinessRuleException → clean 4xx { message, errorId }, WARN in file
///   • unexpected exception  → 500 { message, errorId }, ERROR in file + DB row
///   • request lines per the LmsLogging:Level flag (All = every request,
///     Info = failed or >3s requests, Error = 5xx only)
/// </summary>
public class ErrorHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly LmsFileLogWriter _file;
    private readonly LmsDbErrorSink _dbSink;
    private readonly IConfiguration _config;

    public ErrorHandlingMiddleware(RequestDelegate next, LmsFileLogWriter file,
        LmsDbErrorSink dbSink, IConfiguration config)
    {
        _next = next;
        _file = file;
        _dbSink = dbSink;
        _config = config;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var started = System.Diagnostics.Stopwatch.StartNew();
        var errorId = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();

        try
        {
            await _next(context);
            started.Stop();
            LogRequestLine(context, context.Response.StatusCode, started.ElapsedMilliseconds, null);
        }
        catch (BusinessRuleException ex)
        {
            started.Stop();
            _file.Write("WARN", "BusinessRule",
                $"[{errorId}] {ex.Message} | {Describe(context)} | {started.ElapsedMilliseconds}ms");
            LogRequestLine(context, ex.StatusCode, started.ElapsedMilliseconds, errorId);

            context.Response.StatusCode = ex.StatusCode;
            context.Response.ContentType = "application/json";
            context.Response.Headers["X-Error-Id"] = errorId;
            await context.Response.WriteAsJsonAsync(new { message = ex.Message, errorId });
        }
        catch (Exception ex)
        {
            started.Stop();
            _file.Write("ERROR", "Unhandled",
                $"[{errorId}] {ex.Message} | {Describe(context)} | {started.ElapsedMilliseconds}ms", ex);

            await _dbSink.WriteAsync(new ErrorLogEntry(
                errorId, "Error", ex.Message, ex.ToString(),
                context.Request.Method, context.Request.Path.ToString(),
                UserId(context), UserRole(context), 500, started.ElapsedMilliseconds));

            context.Response.StatusCode = 500;
            context.Response.ContentType = "application/json";
            context.Response.Headers["X-Error-Id"] = errorId;
            await context.Response.WriteAsJsonAsync(new
            {
                message = $"An unexpected error occurred. Please share reference {errorId} with IT.",
                errorId
            });
        }
    }

    private void LogRequestLine(HttpContext ctx, int status, long elapsedMs, string? errorId)
    {
        var flag = LmsLogLevelFlag.Read(_config);
        var shouldLog = flag switch
        {
            LmsLogLevelFlag.All => true,
            LmsLogLevelFlag.Error => status >= 500,
            _ => status >= 400 || elapsedMs > 3000 // Info
        };
        if (!shouldLog) return;

        var level = status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";
        var reference = errorId is null ? "" : $" ref={errorId}";
        _file.Write(level, "Request",
            $"{ctx.Request.Method} {ctx.Request.Path}{ctx.Request.QueryString} → {status} | {Who(ctx)} | {elapsedMs}ms{reference}");
    }

    private static string Describe(HttpContext ctx) =>
        $"{ctx.Request.Method} {ctx.Request.Path}{ctx.Request.QueryString} | {Who(ctx)}";

    private static string Who(HttpContext ctx)
    {
        var id = UserId(ctx);
        return id is null ? "anonymous" : $"user={id}({UserRole(ctx)})";
    }

    private static int? UserId(HttpContext ctx)
    {
        if (ctx.User?.Identity?.IsAuthenticated != true) return null;
        var id = ctx.User.GetUserId();
        return id == 0 ? null : id;
    }

    private static string? UserRole(HttpContext ctx) =>
        ctx.User?.Identity?.IsAuthenticated == true ? ctx.User.GetRole().ToString() : null;
}
