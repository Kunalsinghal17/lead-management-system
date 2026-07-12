import React, { useRef, useState } from "react";
import { CloudUpload, Download, FileSpreadsheet } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { BulkUploadResult } from "../lib/types";

/**
 * BRDID12 — bulk upload of historical/legacy leads via the system template.
 * Template validation, row-level validation and an error report per row.
 */
export default function BulkUpload() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await api.bulkUpload(file);
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#333333]">Bulk Upload</h1>
        <p className="text-sm text-[#808081]">
          Migrate historical or offline leads in one go. Only the system-generated template is accepted —
          columns are validated, then every row is checked before insertion.
        </p>
      </div>

      {/* Step 1 — template */}
      <div className="mb-4 rounded-lg border border-[#DFDDDD] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-[#333333]">1 · Download the template</div>
            <p className="mt-1 text-xs text-[#808081]">
              Fixed columns: Report Code, Name, Email, Country Code, Phone, Industry, Stage, Status,
              Enquiry Handled By, Value (INR), Remarks. Name and Email are mandatory.
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

      {/* Step 2 — upload */}
      <div className="mb-4 rounded-lg border border-[#DFDDDD] p-5">
        <div className="text-sm font-bold text-[#333333]">2 · Upload the filled file</div>
        <div
          className="mt-3 flex cursor-pointer flex-col items-center rounded-md border-2 border-dashed border-[#C6BDDD] px-6 py-10 text-center hover:border-[#645BA8]"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) { setFile(f); setResult(null); setError(null); }
          }}
        >
          <CloudUpload size={28} className="mb-2 text-[#9F91C6]" />
          {file ? (
            <div className="flex items-center gap-2 text-sm font-bold text-[#333333]">
              <FileSpreadsheet size={16} className="text-[#2D7D3E]" /> {file.name}
            </div>
          ) : (
            <>
              <div className="text-sm font-bold text-[#333333]">Drop the file here or click to browse</div>
              <div className="mt-1 text-xs text-[#808081]">.xlsx (live system) · .csv (preview mode)</div>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) { setFile(f); setResult(null); setError(null); }
            }}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={upload}
            disabled={!file || busy}
            className="rounded-md bg-[#645BA8] px-4 py-2 text-sm font-bold text-white hover:bg-[#2C2561] disabled:opacity-50"
          >
            {busy ? "Validating…" : "Validate & import"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md px-4 py-3 text-sm font-bold" style={{ backgroundColor: "#ECCAE0", color: "#55204F" }}>
          {error}
        </div>
      )}

      {/* Step 3 — result */}
      {result && (
        <div className="rounded-lg border border-[#DFDDDD] p-5">
          <div className="mb-3 text-sm font-bold text-[#333333]">3 · Upload summary</div>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Summary label="Rows processed" value={result.totalRows} color="#333333" bg="#DFDDDD" />
            <Summary label="Inserted" value={result.inserted} color="#1C4924" bg="#C4E4C4" />
            <Summary label="Rejected" value={result.failed} color="#55204F" bg="#ECCAE0" />
          </div>

          {result.errors.length > 0 && (
            <div className="overflow-hidden rounded-md border border-[#DFDDDD]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#DFDDDD] bg-opacity-40">
                  <tr>
                    <th className="px-3 py-2 font-bold text-[#333333]">Row</th>
                    <th className="px-3 py-2 font-bold text-[#333333]">Why it was rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className="border-t border-[#DFDDDD]">
                      <td className="px-3 py-2 font-bold text-[#712B69]">{e.row}</td>
                      <td className="px-3 py-2 text-[#333333]">{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.inserted > 0 && (
            <p className="mt-3 text-xs text-[#808081]">
              Imported leads follow the same schema and defaults as auto-created leads (BRDID03) and are
              now available in the Lead Tracker.
            </p>
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
