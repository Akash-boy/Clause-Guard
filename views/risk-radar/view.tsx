import React, { useState } from "react";
import { useToolContext } from "mcp-use/react";
import { ShieldAlert, ShieldCheck, AlertTriangle, Copy, Check, FileText } from "lucide-react";

interface ClauseItem {
  id: string;
  clause_title: string;
  original_text: string;
  severity: "safe" | "caution" | "red_flag";
  plain_english: string;
  hidden_risk: string;
  suggested_counter_clause: string;
}

interface RiskRadarOutput {
  contract: {
    id: string;
    title: string;
    category: string;
    overall_risk_score: number;
    risk_level: "low" | "medium" | "high" | "critical";
    summary: string;
  };
  clauses: ClauseItem[];
  stats: {
    redFlagCount: number;
    cautionCount: number;
    safeCount: number;
    totalClauses: number;
  };
}

export default function RiskRadarView() {
  const view = useToolContext();
  const [filter, setFilter] = useState<"all" | "red_flag" | "caution" | "safe">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (view.status === "error") {
    return (
      <div className="p-5 bg-rose-950/40 text-rose-200 rounded-xl border border-rose-500/40 text-sm">
        Failed to scan contract: {view.error.message}
      </div>
    );
  }

  const data = view.toolOutput as RiskRadarOutput | undefined;

  if (view.status === "pending" || !data?.contract) {
    return (
      <div className="p-6 bg-slate-950 text-slate-200 rounded-xl border border-slate-800 animate-pulse">
        Scanning contract clauses and calculating risk score...
      </div>
    );
  }

  const { contract, stats } = data;
  const clauses = data.clauses ?? [];
  const filteredClauses =
    filter === "all" ? clauses : clauses.filter((c) => c.severity === filter);

  const scoreColor =
    contract.overall_risk_score >= 70
      ? "text-rose-400 border-rose-500/40 bg-rose-500/10"
      : contract.overall_risk_score >= 40
      ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
      : "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";

  const handleCopy = (id: string, textToCopy: string) => {
    navigator.clipboard?.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="p-5 bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 space-y-5 font-sans">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {contract.category.replace("_", " ")}
            </span>
            <span className="text-xs text-slate-400 font-mono">ID: {contract.id.slice(0, 8)}</span>
          </div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            {contract.title}
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">{contract.summary}</p>
        </div>

        <div className={`px-4 py-3 rounded-xl border text-center min-w-[120px] ${scoreColor}`}>
          <div className="text-3xl font-extrabold">{contract.overall_risk_score}</div>
          <div className="text-[11px] uppercase font-bold tracking-wider">
            {contract.risk_level} Risk
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: `All (${clauses.length})` },
          { key: "red_flag", label: `Red Flags (${stats?.redFlagCount ?? 0})` },
          { key: "caution", label: `Caution (${stats?.cautionCount ?? 0})` },
          { key: "safe", label: `Safe (${stats?.safeCount ?? 0})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as typeof filter)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === tab.key
                ? "bg-indigo-600 text-white"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredClauses.map((clause) => {
          const isRed = clause.severity === "red_flag";
          const isCaution = clause.severity === "caution";

          return (
            <div
              key={clause.id}
              className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-sm text-white">
                  {isRed ? (
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : isCaution ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <span>{clause.clause_title}</span>
                </div>
                <span
                  className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                    isRed
                      ? "bg-rose-500/20 text-rose-300"
                      : isCaution
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-emerald-500/20 text-emerald-300"
                  }`}
                >
                  {clause.severity.replace("_", " ")}
                </span>
              </div>

              <blockquote className="text-xs italic text-slate-400 border-l-2 border-slate-700 pl-3">
                "{clause.original_text}"
              </blockquote>

              <p className="text-xs text-slate-200">
                <strong className="text-indigo-300">Plain English: </strong>
                {clause.plain_english}
              </p>

              {(isRed || isCaution) && (
                <>
                  <p className="text-xs text-rose-300/90">
                    <strong>Hidden Risk: </strong>
                    {clause.hidden_risk}
                  </p>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-start justify-between gap-3">
                    <div className="text-xs text-emerald-300">
                      <strong className="block text-[11px] uppercase text-emerald-400 mb-0.5">
                        Suggested Counter-Clause
                      </strong>
                      {clause.suggested_counter_clause}
                    </div>
                    <button
                      onClick={() => handleCopy(clause.id, clause.suggested_counter_clause)}
                      className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1 shrink-0"
                    >
                      {copiedId === clause.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}