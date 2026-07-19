/**
 * Browser-side logger — deliberately SEPARATE from the API's server logs.
 *
 *  • Ring buffer of the last 300 entries, persisted per-tab in sessionStorage,
 *    so a crash report can include what happened right before it.
 *  • Mirrors to the browser console with a consistent [LMS] prefix.
 *  • Level flag (like the API's LmsLogging:Level) changeable at runtime:
 *        window.lmsLogger.setLevel("all" | "info" | "error")
 *    or persistently via localStorage key "lms.uilog.level".
 *        all   → every API call + info + errors
 *        info  → info + warnings + errors (default)
 *        error → errors only
 *  • window.lmsLogger.download() saves the buffer as a .txt for bug reports.
 */

export type UiLogLevel = "all" | "info" | "error";

export interface UiLogEntry {
  t: string; // ISO timestamp
  level: "TRACE" | "INFO" | "WARN" | "ERROR";
  msg: string;
  detail?: string;
}

const BUFFER_KEY = "lms.uilog.v1";
const LEVEL_KEY = "lms.uilog.level";
const MAX_ENTRIES = 300;

function readBuffer(): UiLogEntry[] {
  try {
    const raw = sessionStorage.getItem(BUFFER_KEY);
    return raw ? (JSON.parse(raw) as UiLogEntry[]) : [];
  } catch {
    return [];
  }
}

function writeBuffer(entries: UiLogEntry[]) {
  try {
    sessionStorage.setItem(BUFFER_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // storage full — drop oldest half and retry once
    try {
      sessionStorage.setItem(BUFFER_KEY, JSON.stringify(entries.slice(-Math.floor(MAX_ENTRIES / 2))));
    } catch {
      // give up silently; console still has everything
    }
  }
}

function currentLevel(): UiLogLevel {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    if (v === "all" || v === "error") return v;
  } catch {
    // ignore
  }
  return "info";
}

function shouldRecord(level: UiLogEntry["level"]): boolean {
  const flag = currentLevel();
  if (flag === "all") return true;
  if (flag === "error") return level === "ERROR";
  return level !== "TRACE"; // info
}

function push(level: UiLogEntry["level"], msg: string, detail?: unknown) {
  if (!shouldRecord(level)) return;

  const entry: UiLogEntry = {
    t: new Date().toISOString(),
    level,
    msg,
    detail: detail === undefined ? undefined :
      typeof detail === "string" ? detail :
      detail instanceof Error ? `${detail.message}\n${detail.stack ?? ""}` :
      safeStringify(detail)
  };

  const buf = readBuffer();
  buf.push(entry);
  writeBuffer(buf);

  const line = `[LMS] ${entry.msg}`;
  if (level === "ERROR") console.error(line, detail ?? "");
  else if (level === "WARN") console.warn(line, detail ?? "");
  else console.log(line, detail ?? "");
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = {
  /** Verbose tracing (API calls, mode switches) — recorded only when level = all. */
  trace: (msg: string, detail?: unknown) => push("TRACE", msg, detail),
  info: (msg: string, detail?: unknown) => push("INFO", msg, detail),
  warn: (msg: string, detail?: unknown) => push("WARN", msg, detail),
  error: (msg: string, detail?: unknown) => push("ERROR", msg, detail),

  entries: (): UiLogEntry[] => readBuffer(),

  level: currentLevel,

  setLevel(level: UiLogLevel) {
    try {
      localStorage.setItem(LEVEL_KEY, level);
    } catch {
      // ignore
    }
    console.log(`[LMS] UI log level set to '${level}'.`);
  },

  clear() {
    try {
      sessionStorage.removeItem(BUFFER_KEY);
    } catch {
      // ignore
    }
  },

  /** Formats the buffer for clipboard / bug reports. */
  format(): string {
    const header =
      `Nexdigm LMS — UI log (${new Date().toISOString()})\n` +
      `URL: ${window.location.href}\nUserAgent: ${navigator.userAgent}\n` +
      `${"-".repeat(72)}\n`;
    const lines = readBuffer().map(e =>
      `${e.t} [${e.level.padEnd(5)}] ${e.msg}${e.detail ? `\n    ${e.detail.split("\n").join("\n    ")}` : ""}`);
    return header + lines.join("\n");
  },

  /** Downloads the buffer as a .txt file for bug reports. */
  download() {
    const blob = new Blob([logger.format()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lms-ui-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
};

// Console access for support sessions: window.lmsLogger.download(), .setLevel("all"), ...
declare global {
  interface Window {
    lmsLogger: typeof logger;
  }
}
window.lmsLogger = logger;

/** Wire window-level error traps once at startup (called from main.tsx). */
export function installGlobalErrorHandlers() {
  window.addEventListener("error", event => {
    logger.error(
      `Uncaught error: ${event.message}`,
      `${event.filename ?? "?"}:${event.lineno ?? "?"}:${event.colno ?? "?"}\n${event.error?.stack ?? ""}`
    );
  });

  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;
    logger.error(
      `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
      reason instanceof Error ? reason.stack : undefined
    );
  });

  logger.info(`App started (log level: ${logger.level()})`);
}
