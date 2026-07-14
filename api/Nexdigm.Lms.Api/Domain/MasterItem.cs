using System.ComponentModel.DataAnnotations;

namespace Nexdigm.Lms.Api.Domain;

/// <summary>Generic dropdown master values (lost reasons, industries, ...).</summary>
public class MasterItem
{
    public int Id { get; set; }

    /// <summary>e.g. "LostReason", "Industry", "Cta"</summary>
    [MaxLength(50)]
    public string Type { get; set; } = "";

    [MaxLength(200)]
    public string Value { get; set; } = "";

    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}
