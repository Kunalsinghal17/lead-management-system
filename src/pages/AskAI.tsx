import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, SendHorizontal, Sparkles } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { api } from "../lib/api";
import { DashboardSummary, Lead } from "../lib/types";
import { answerQuestion, NlqAnswer } from "../lib/nlq";
import { useAuth } from "../lib/auth";

const SERIES = ["#645BA8", "#C86AA9", "#26AD8B", "#F0AA31", "#467082", "#2D7D3E", "#D9E138"];

interface ChatItem {
  role: "user" | "assistant";
  question?: string;
  answer?: NlqAnswer;
}

/**
 * Ask AI — natural-language questions over live LMS data.
 * Powered by a deterministic, rule-based query engine (no external AI API):
 * every answer is computed directly from the pipeline, so it is always
 * grounded and auditable.
 */
export default function AskAI() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const location = useLocation();
  const handedOff = useRef(false);

  useEffect(() => {
    Promise.all([api.listLeads({}), api.dashboard(30)])
      .then(([l, s]) => {
        setLeads(l);
        setSummary(s);
        // Question handed off from the Leads search bar ("ask in plain English")
        const q = (location.state as { q?: string } | null)?.q;
        if (q && !handedOff.current) {
          handedOff.current = true;
          window.setTimeout(() => askWith(q, l, s), 100);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, thinking]);

  const askWith = (q: string, l: Lead[], s: DashboardSummary) => {
    setChat(c => [...c, { role: "user", question: q }]);
    setThinking(true);
    window.setTimeout(() => {
      const answer = answerQuestion(q, l, s);
      setChat(c => [...c, { role: "assistant", answer }]);
      setThinking(false);
    }, 350);
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || !summary) return;
    setInput("");

    // Refresh data so answers reflect the latest pipeline
    const [l, s] = await Promise.all([api.listLeads({}), api.dashboard(30)]);
    setLeads(l);
    setSummary(s);
    askWith(q, l, s);
  };

  const starterChips = [
    "Give me an overview of how we are doing right now",
    "Which leads need follow-up?",
    "Show hot leads",
    "Breakdown by lead source",
    "Lost reason analysis",
    "Leads older than 5 days"
  ];

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-[#333333]">Ask AI</h1>
        <p className="text-sm text-[#808081]">
          Ask about leads, the pool, follow-ups, conversion or visitors. Answers are computed live from
          your pipeline by a rule-based engine — no data leaves the system.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-[#DFDDDD] p-4">
        {chat.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "linear-gradient(135deg, #645BA8, #C86AA9)" }}
            >
              <Sparkles size={20} className="text-white" />
            </div>
            <div className="font-bold text-[#333333]">Ask me anything about your pipeline</div>
            <p className="mb-4 mt-1 max-w-sm text-sm text-[#808081]">
              Hi {user?.fullName?.split(" ")[0]} — try one of these to start:
            </p>
            <div className="flex max-w-lg flex-wrap justify-center gap-2">
              {starterChips.map(c => <Chip key={c} text={c} onClick={() => ask(c)} />)}
            </div>
          </div>
        )}

        {chat.map((item, i) =>
          item.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-[#645BA8] px-4 py-2.5 text-sm text-white">
                {item.question}
              </div>
            </div>
          ) : (
            <AnswerCard key={i} answer={item.answer!} onChip={ask} onNavigate={navigate} />
          )
        )}

        {thinking && (
          <div className="flex items-center gap-2 text-sm text-[#808081]">
            <Sparkles size={14} className="text-[#C86AA9]" /> Analysing your pipeline…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={e => { e.preventDefault(); ask(input); }}
        className="mt-3 flex items-center gap-2 rounded-lg border border-[#CAC8C7] px-3 py-2 focus-within:border-[#645BA8]"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about leads, pipeline, the pool, visitors…"
          className="flex-1 bg-transparent text-sm outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || thinking}
          className="rounded-md p-2 text-white disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #645BA8, #C86AA9)" }}
          aria-label="Send"
        >
          <SendHorizontal size={15} />
        </button>
      </form>
    </div>
  );
}

function AnswerCard({ answer, onChip, onNavigate }: {
  answer: NlqAnswer;
  onChip: (q: string) => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="flex gap-3">
      <div
        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: "linear-gradient(135deg, #645BA8, #C86AA9)" }}
      >
        <Sparkles size={13} className="text-white" />
      </div>
      <div className="max-w-[85%] flex-1">
        <div className="rounded-2xl rounded-tl-sm border border-[#DFDDDD] p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-[#808081]">{answer.title}</div>
          <p className="text-sm leading-relaxed text-[#333333]">{answer.text}</p>

          {answer.kpis && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {answer.kpis.map(k => (
                <div key={k.label} className="rounded-md border border-[#DFDDDD] px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#808081]">{k.label}</div>
                  <div
                    className="text-lg font-bold"
                    style={{
                      color: k.accent === "green" ? "#2D7D3E"
                        : k.accent === "magenta" ? "#712B69"
                        : k.accent === "purple" ? "#645BA8"
                        : "#333333"
                    }}
                  >
                    {k.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {answer.chart && answer.chart.data.length > 0 && (
            <div className="mt-3 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={answer.chart.data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#808081" }} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: "#808081" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderColor: "#DFDDDD" }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Count">
                    {answer.chart.data.map((_, i) => (
                      <Cell key={i} fill={SERIES[i % SERIES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {answer.table && (
            <div className="mt-3 overflow-x-auto rounded-md border border-[#DFDDDD]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#DFDDDD] bg-opacity-40">
                  <tr>
                    {answer.table.headers.map(h => (
                      <th key={h} className="px-3 py-2 font-bold text-[#333333]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {answer.table.rows.map((row, i) => (
                    <tr key={i} className="border-t border-[#DFDDDD]">
                      {row.map((cell, j) => (
                        <td key={j} className={`px-3 py-2 ${j === 0 ? "font-bold text-[#645BA8]" : "text-[#333333]"}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {answer.chips.map(c => <Chip key={c} text={c} onClick={() => onChip(c)} />)}
          <button
            onClick={() => onNavigate("/leads")}
            className="flex items-center gap-1 rounded-md border border-[#CAC8C7] px-2.5 py-1 text-[11px] font-bold text-[#333333] hover:bg-[#DFDDDD]"
          >
            View All Leads <ArrowUpRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border border-[#C6BDDD] px-2.5 py-1 text-[11px] font-bold text-[#645BA8] hover:bg-[#C6BDDD] hover:bg-opacity-20"
    >
      <Sparkles size={10} /> {text}
    </button>
  );
}
