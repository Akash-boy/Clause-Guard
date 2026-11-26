import React from "react";
import { useToolContext } from "mcp-use/react";
import { GitCompare, CheckCircle2, AlertOctagon, AlertTriangle } from "lucide-react";

interface ClauseDiffOutput {
  originalClause: string;
  revisedClause: string;
  comparison: {
    verdict: "trap_removed" | "partially_fixed" | "still_risky" | "new_trap_added";
    risk_delta: number;
    explanation: string;
    remaining_concerns: string[];
    recommended_reply: string;
  };
}

export default function ClauseDiffView() {
  const view = useToolContext();

  if (view.status === "error") {
    return (
      <div className="p-5 bg-rose-950/40 text-rose-200 rounded-xl border border-rose-500/40 text-sm">
        Failed to compare clauses: {view.error.message}
      </div>
    );
  }

  const data = view.toolOutput as ClauseDiffOutput | undefined;

  if (view.status === "pending" || !data?.comparison) {
    return (
      <div className="p-6 bg-slate-950 text-slate-300 rounded-xl border border-slate-800 animate-pulse">
        Auditing negotiated revision for hidden loopholes...
      </div>
    );
  }

  const { originalClause, revisedClause, comparison } = data;
  const concerns = comparison.remaining_concerns ?? [];
  const isSafe = comparison.verdict === "trap_removed";
  const isPartial = comparison.verdict === "partially_fixed";

  return (
    <div className="p-5 bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 space-y-4 font-sans">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-bold text-white">Clause Revision Audit</h2>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1.5 ${
            isSafe
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : isPartial
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
          }`}
        >
          {isSafe ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : isPartial ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : (
            <AlertOctagon className="w-3.5 h-3.5" />
          )}
          {comparison.verdict.replace("_", " ")} (
          {comparison.risk_delta > 0 ? `+${comparison.risk_delta}` : comparison.risk_delta} pts)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-1">
          <div className="text-[11px] font-bold uppercase text-rose-400">Original Clause</div>
          <p className="text-xs text-slate-300 leading-relaxed">{originalClause}</p>
        </div>

        <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-1">
          <div className="text-[11px] font-bold uppercase text-indigo-300">Proposed Revision</div>
          <p className="text-xs text-slate-200 leading-relaxed">{revisedClause}</p>
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
        <p className="text-xs text-slate-200 leading-relaxed">{comparison.explanation}</p>

        {concerns.length > 0 && (
          <div className="space-y-1 pt-1">
            <div className="text-[11px] font-bold uppercase text-amber-400">Remaining Concerns</div>
            <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
              {concerns.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-2 border-t border-slate-800">
          <div className="text-[11px] font-bold uppercase text-emerald-400 mb-1">
            Recommended Reply
          </div>
          <p className="text-xs text-emerald-200 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            {comparison.recommended_reply}
          </p>
        </div>
      </div>
    </div>
  );
}