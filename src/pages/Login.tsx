import React, { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useAuth } from "../lib/auth";
import NexdigmLogo from "../components/NexdigmLogo";

/**
 * BRDID01 — login. Masked password, generic error messages, credentials
 * posted in the body (never the URL). DB auth today, AD-ready backend.
 */
export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div
        className="hidden w-1/2 flex-col justify-between p-12 lg:flex"
        style={{ background: "linear-gradient(160deg, #211C48 0%, #2C2561 55%, #645BA8 130%)" }}
      >
        <div className="flex items-center gap-3">
          <NexdigmLogo height={26} onDark />
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#C6BDDD]">
            Lead Management System
          </span>
        </div>

        <div>
          <h1 className="max-w-md text-3xl font-bold leading-snug text-white">
            Every enquiry captured.
            <br />
            Every lead owned.
            <br />
            <span className="text-[#C86AA9]">Every follow-up on time.</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#C6BDDD]">
            Website enquiries flow straight from MarketRAdmin into a single pipeline —
            assigned, tracked day by day, and escalated before anything slips.
          </p>
        </div>

        <p className="text-xs text-[#776DA7]">
          © {new Date().getFullYear()} Nexdigm Private Limited. Internal use only. Think Next.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-white p-8">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <NexdigmLogo height={26} />
            <div className="mt-2 font-bold text-[#333333]">Lead Management System</div>
          </div>

          <h2 className="text-xl font-bold text-[#333333]">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-[#808081]">
            Use your Nexdigm account. Sessions expire after inactivity.
          </p>

          <label className="mb-1 block text-xs font-bold text-[#333333]" htmlFor="email">
            Email / Username
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            maxLength={100}
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="mb-4 w-full rounded-md border border-[#CAC8C7] px-3 py-2 text-sm outline-none focus:border-[#645BA8]"
            placeholder="you@nexdigm.com"
          />

          <label className="mb-1 block text-xs font-bold text-[#333333]" htmlFor="password">
            Password
          </label>
          <div className="relative mb-4">
            <input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              maxLength={100}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-md border border-[#CAC8C7] px-3 py-2 pr-10 text-sm outline-none focus:border-[#645BA8]"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#808081] hover:text-[#333333]"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: "#ECCAE0", color: "#55204F" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: "#645BA8" }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <div className="mt-6 flex items-start gap-2 rounded-md bg-[#DFDDDD] bg-opacity-40 p-3 text-xs text-[#808081]">
            <Lock size={14 } className="mt-0.5 shrink-0" />
            <span>
              Demo accounts — harshit.mishra@nexdigm.com / Admin@123 · harsh.mittal@nexdigm.com /
              Manager@123 · aditi.sharma@nexdigm.com / Exec@123 (also rohan.kulkarni, neha.joshi) ·
              priyank.desai@nexdigm.com / Basic@123
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
