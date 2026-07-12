using Microsoft.EntityFrameworkCore;
using Nexdigm.Lms.Api.Domain;

namespace Nexdigm.Lms.Api.Data;

public class LmsDbContext : DbContext
{
    public LmsDbContext(DbContextOptions<LmsDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Lead> Leads => Set<Lead>();
    public DbSet<LeadDayUpdate> LeadDayUpdates => Set<LeadDayUpdate>();
    public DbSet<VisitorStat> VisitorStats => Set<VisitorStat>();
    public DbSet<NotificationLog> NotificationLogs => Set<NotificationLog>();
    public DbSet<MasterItem> MasterItems => Set<MasterItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Role).HasConversion<string>().HasMaxLength(20);
            e.HasOne(u => u.Manager)
             .WithMany()
             .HasForeignKey(u => u.ManagerId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Lead>(e =>
        {
            e.HasIndex(l => l.LeadCode).IsUnique();
            e.HasIndex(l => l.Email);
            e.HasIndex(l => new { l.Status, l.IsActive });
            e.Property(l => l.EnquiryType).HasConversion<string>().HasMaxLength(20);
            e.Property(l => l.LeadType).HasConversion<string>().HasMaxLength(20);
            e.Property(l => l.Stage).HasConversion<string>().HasMaxLength(20);
            e.Property(l => l.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(l => l.Source).HasConversion<string>().HasMaxLength(20);
            e.Property(l => l.ValueInr).HasPrecision(18, 2);
            e.HasOne(l => l.AssignedTo)
             .WithMany()
             .HasForeignKey(l => l.AssignedToUserId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<LeadDayUpdate>(e =>
        {
            e.HasIndex(d => new { d.LeadId, d.DayNumber }).IsUnique();
            e.HasOne(d => d.Lead)
             .WithMany(l => l.DayUpdates)
             .HasForeignKey(d => d.LeadId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VisitorStat>(e =>
        {
            e.HasIndex(v => v.IpAddress).IsUnique();
        });

        modelBuilder.Entity<NotificationLog>(e =>
        {
            e.Property(n => n.Type).HasConversion<string>().HasMaxLength(30);
        });

        modelBuilder.Entity<MasterItem>(e =>
        {
            e.HasIndex(m => new { m.Type, m.Value }).IsUnique();
        });
    }
}
