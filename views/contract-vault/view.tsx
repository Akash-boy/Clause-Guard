import React from "react";
import { useToolContext } from "mcp-use/react";
import { FolderLock, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";

interface SavedContract {
  id: string;
  title: string;
  category: string;
  overall_risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  summary: string;
  created_at: string;
}

interface ContractVaultOutput {
  contracts: SavedContract[];
  activeCategory: string;
}

export default function ContractVaultView() {
  const view = useToolContext();

  if (view.status === "error") {
    return (
      <div className="p-5 bg-rose-950/40 text-rose-200 rounded-xl border border-rose-500/40 text-sm">
        Failed to load Contract Vault: {view.error.message}
      </div>
    );
  }

  if (view.status === "pending") {
    return (
      <div className="p-6 bg-slate-950 text-slate-300 rounded-xl border border-slate-800 animate-pulse">
        Loading your Contract Vault...
      </div>
    );
  }

  const data = view.toolOutput as ContractVaultOutput | undefined;
  const contracts = data?.contracts ?? [];

  return (
    <div className="p-5 bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 space-y-4 font-sans">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <FolderLock className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-bold text-white">ClauseGuard Vault</h2>
        </div>
        <span className="text-xs text-slate-400">
          {contracts.length} saved agreement{contracts.length === 1 ? "" : "s"}
        </span>
      </div>

      {contracts.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400 bg-slate-900/60 rounded-xl border border-slate-800">
          No contracts audited yet. Ask ClauseGuard to scan any rental agreement, freelance contract, or privacy policy!
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((item) => {
            const highRisk = item.overall_risk_score >= 60;
            const medRisk = item.overall_risk_score >= 30 && item.overall_risk_score < 60;

            return (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                      {item.category.replace("_", " ")}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">{item.id}</span>
                  </div>
                  <h3 className="font-semibold text-sm text-white">{item.title}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2">{item.summary}</p>
                  <p className="text-[11px] text-slate-500">
                    Scanned {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div
                  className={`px-3 py-2 rounded-lg text-center shrink-0 border ${
                    highRisk
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                      : medRisk
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1 font-bold text-base">
                    {highRisk ? (
                      <ShieldAlert className="w-4 h-4" />
                    ) : medRisk ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    {item.overall_risk_score}
                  </div>
                  <div className="text-[10px] uppercase font-semibold">{item.risk_level}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}