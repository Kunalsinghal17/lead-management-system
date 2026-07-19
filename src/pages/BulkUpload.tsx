import React, { useRef, useState } from "react";
import { CircleCheck, CloudUpload, Download, FileSpreadsheet, RotateCcw } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { BulkUploadResult } from "../lib/types";

/**
 * bulk upload with a validate-first flow:
 *   1) choose file → 2) validation preview (Valid / Error / Duplicate per row)
 *   → 3) import only the valid rows → summary.
 * Duplicate rule: same email already in LMS within the last 7 days = duplicate;
 * older matches are treated as repeat business and allowed.
 */
export default function BulkUpload() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BulkUploadResult | null>(null);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const pick = (f: File) => {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const validate = async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      setPreview(await api.bulkUpload(file, true));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Validation failed.");
    } finally {
      setBusy(false);
    }
  };

  const importValid = async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.bulkUpload(file, false);
      setResult(res);
      setPreview(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const statusChip = (s: string) => {
    const styles: Record<string, { bg: string; fg: string }> = {
      Valid: { bg: "#C4E4C4", fg: "#1C4924" },
      Error: { bg: "#ECCAE0", fg: "#55204F" },
      Duplicate: { bg: "#FBE5C3", fg: "#725220" }
    };
    const st = styles[s] ?? styles.Error;
    return (
      <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ backgroundColor: st.bg, color: st.fg }}>
        {s}
      </span>
    );
  };

  const rowsTable = (data: BulkUploadResult) => (
    <div className="max-h-96 overflow-auto rounded-md border border-[#DFDDDD]">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="sticky top-0 bg-[#DFDDDD]">
          <tr className="text-[#333333]">
            <th className="px-3 py-2 font-bold">Row</th>
            <th className="px-3 py-2 font-bold">Name</th>
            <th className="px-3 py-2 font-bold">Email</th>
            <th className="px-3 py-2 font-bold">Industry</th>
            <th className="px-3 py-2 font-bold">Stage</th>
            <th className="px-3 py-2 font-bold">Status</th>
            <th className="px-3 py-2 font-bold">Handled by</th>
            <th className="px-3 py-2 font-bold">Result</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map(r => (
            <tr key={r.row} className="border-t border-[#DFDDDD] align-top">
              <td className="px-3 py-2 font-bold text-[#645BA8]">{r.row}</td>
              <td className="px-3 py-2 text-[#333333]">{r.name || "—"}</td>
              <td className="px-3 py-2 text-[#333333]">{r.email || "—"}</td>
              <td className="px-3 py-2 text-[#333333]">{r.industry || "—"}</td>
              <td className="px-3 py-2 text-[#333333]">{r.stage || "—"}</td>
              <td className="px-3 py-2 text-[#333333]">{r.status || "—"}</td>
              <td className="px-3 py-2 text-[#333333]">{r.handledBy || "—"}</td>
              <td className="px-3 py-2">
                {statusChip(r.rowStatus)}
                {r.error && <div className="mt-0.5 text-[11px]" style={{ color: r.rowStatus === "Duplicate" ? "#725220" : "#712B69" }}>{r.error}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#333333]">Bulk Upload</h1>
        <p className="text-sm text-[color:var(--nx-muted)]">
          Migrate historical or offline leads. Every row is validated first — you review the preview,
          then import only the clean rows. Emails repeated within 7 days are flagged as duplicates;
          older matches count as repeat business.
        </p>
      </div>

      {/* Step 1 — template */}
      <div className="mb-4 rounded-lg border border-[#DFDDDD] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-[#333333]">1 · Download the template</div>
            <p className="mt-1 text-xs text-[color:var(--nx-muted)]">
              Fixed columns: Report Code, Name, Email, Country Code, Phone, Industry, Stage, Status,
              Enquiry Handled By, Value (INR), Remarks. Name and Email are mandatory; "Enquiry Handled By"
              must be an executive's email or blank (stays in the central pool).
            </p>
          </div>
          <button
            onClick={() => api.downloadTemplate()}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#C6BDDD] px-3 py-2 text-xs font-bold text-[#645BA8] hover:bg-[#C6BDDD] hover:bg-opacity-20"
          >
            <Download size={13} /> Template
          </button>
        </div>
      </div>

      {/* Step 2 — file + validate */}
      <div className="mb-4 rounded-lg border border-[#DFDDDD] p-5">
        <div className="text-sm font-bold text-[#333333]">2 · Upload & validate</div>
        <div
          className="mt-3 flex cursor-pointer flex-col items-center rounded-md border-2 border-dashed border-[#C6BDDD] px-6 py-8 text-center hover:border-[#645BA8]"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) pick(f);
          }}
        >
          <CloudUpload size={26} className="mb-2 text-[#9F91C6]" />
          {file ? (
            <div className="flex items-center gap-2 text-sm font-bold text-[#333333]">
              <FileSpreadsheet size={16} className="text-[#2D7D3E]" /> {file.name}
            </div>
          ) : (
            <>
              <div className="text-sm font-bold text-[#333333]">Drop the file here or click to browse</div>
              <div className="mt-1 text-xs text-[color:var(--nx-muted)]">.xlsx (live system) · .csv (preview mode)</div>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) pick(f);
            }}
          />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          {file && (
            <button
              onClick={reset}
              className="flex items-center gap-1 rounded-md border border-[#CAC8C7] px-3 py-2 text-xs font-bold text-[#333333] hover:bg-[#DFDDDD]"
            >
              <RotateCcw size={12} /> Start over
            </button>
          )}
          <button
            onClick={validate}
            disabled={!file || busy}
            className="rounded-md bg-[#645BA8] px-4 py-2 text-sm font-bold text-white hover:bg-[#2C2561] disabled:opacity-50"
          >
            {busy && !preview ? "Validating…" : "Validate file"}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-md px-4 py-3 text-sm font-bold" style={{ backgroundColor: "#ECCAE0", color: "#55204F" }}>
          {error}
        </div>
      )}

      {/* Step 3 — preview & confirm */}
      {preview && (
        <div className="mb-4 rounded-lg border border-[#DFDDDD] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-[#333333]">3 · Review & import</div>
              <div className="text-xs text-[color:var(--nx-muted)]">
                {preview.validRows} valid · {preview.errorRows} errors · {preview.duplicateRows} duplicates.
                Error and duplicate rows are skipped — fix them in the file and re-validate if needed.
              </div>
            </div>
            <button
              onClick={importValid}
              disabled={busy || preview.validRows === 0}
              className="rounded-md bg-[#2D7D3E] px-4 py-2 text-sm font-bold text-white hover:bg-[#1C4924] disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${preview.validRows} lead${preview.validRows === 1 ? "" : "s"}`}
            </button>
          </div>
          {rowsTable(preview)}
        </div>
      )}

      {/* Step 4 — result */}
      {result && (
        <div className="rounded-lg border border-[#DFDDDD] p-5">
          <div className="mb-3 flex items-center gap-2">
            <CircleCheck size={18} className="text-[#2D7D3E]" />
            <div className="text-sm font-bold text-[#333333]">
              Imported {result.inserted} leads — they are now in the Lead Tracker
              {result.rows.some(r => r.rowStatus === "Valid" && !r.handledBy) ? " and the central pool" : ""}.
            </div>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Summary label="Rows processed" value={result.totalRows} color="#333333" bg="#DFDDDD" />
            <Summary label="Imported" value={result.inserted} color="#1C4924" bg="#C4E4C4" />
            <Summary label="Skipped" value={result.errorRows + result.duplicateRows} color="#55204F" bg="#ECCAE0" />
          </div>
          {(result.errorRows > 0 || result.duplicateRows > 0) && rowsTable(
            { ...result, rows: result.rows.filter(r => r.rowStatus !== "Valid") }
          )}
        </div>
      )}
    </div>
  );
}

function Summary({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className="rounded-md p-3 text-center" style={{ backgroundColor: bg }}>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[11px] font-bold" style={{ color }}>{label}</div>
    </div>
  );
}
