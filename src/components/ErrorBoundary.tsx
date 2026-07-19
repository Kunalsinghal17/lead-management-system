import React from "react";
import { logger } from "../lib/logger";

interface State {
  error: Error | null;
  errorId: string;
  copied: boolean;
}

/**
 * Catches any unhandled React render error, logs it to the UI logger and shows
 * a brand-styled recovery screen with a reference ID + copy/download actions —
 * instead of a silent white page.
 */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, errorId: "", copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = "UI-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    return { error, errorId, copied: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error(
      `[${this.state.errorId}] React render crash: ${error.message}`,
      `${error.stack ?? ""}\nComponent stack:${info.componentStack ?? ""}`
    );
  }

  private copyDetails = async () => {
    const { error, errorId } = this.state;
    const details =
      `Nexdigm LMS crash report ${errorId}\n` +
      `Time: ${new Date().toISOString()}\nURL: ${window.location.href}\n` +
      `Error: ${error?.message}\n${error?.stack ?? ""}\n\n` +
      `Recent UI log:\n${logger.format()}`;
    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      logger.warn("Clipboard unavailable — use Download log instead.");
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        <div className="w-full max-w-md rounded-lg border border-[#DFDDDD] p-8 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold text-white"
            style={{ background: "linear-gradient(135deg, #645BA8, #C86AA9)" }}
            aria-hidden
          >
            !
          </div>
          <h1 className="text-lg font-bold text-[#333333]">Something went wrong on this screen</h1>
          <p className="mt-2 text-sm text-[color:var(--nx-muted)]">
            The error has been recorded in the browser log. Share reference{" "}
            <span className="font-bold text-[#645BA8]">{this.state.errorId}</span> with IT,
            or copy the details below.
          </p>
          <p className="mt-2 break-words rounded bg-[#DFDDDD] bg-opacity-40 p-2 text-xs text-[#333333]">
            {this.state.error.message}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-[#645BA8] px-4 py-2 text-sm font-bold text-white hover:bg-[#2C2561]"
            >
              Reload app
            </button>
            <button
              onClick={this.copyDetails}
              className="rounded-md border border-[#CAC8C7] px-4 py-2 text-sm font-bold text-[#333333] hover:bg-[#DFDDDD]"
            >
              {this.state.copied ? "Copied ✓" : "Copy details"}
            </button>
            <button
              onClick={() => logger.download()}
              className="rounded-md border border-[#CAC8C7] px-4 py-2 text-sm font-bold text-[#333333] hover:bg-[#DFDDDD]"
            >
              Download log
            </button>
          </div>
        </div>
      </div>
    );
  }
}
