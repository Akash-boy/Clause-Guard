import "dotenv/config";
import { MCPServer, isBuilding } from "mcp-use";
import { z } from "zod";
import { registerAuthRoutes } from "./src/auth-routes.js";
import { createUserSupabaseClient } from "./src/supabase.js";
import {
  analyzeContractInput,
  compareContractClauses,
} from "./src/contract-analyzer.js";

const PORT = Number(process.env.PORT || 3000);
const MCP_URL = process.env.MCP_URL || `http://localhost:${PORT}/mcp`;

export const server = new MCPServer({
  name: "ClauseGuard MCP",
  version: "1.0.0",
  description:
    "AI Contract, Terms & Fine-Print Risk Radar. Scans agreements (text or screenshots), flags predatory clauses, generates counter-clauses, and audits negotiated revisions.",
});

// Register OAuth 2.1 + PKCE endpoints on the underlying Hono app
registerAuthRoutes((server as unknown as { app: import("hono").Hono }).app, MCP_URL);

async function getAuthenticatedContext(ctx: {
  request?: { header: (name: string) => string | undefined; raw?: Request };
}) {
  const authHeader =
    ctx.request?.header("authorization") ||
    ctx.request?.raw?.headers?.get("authorization") ||
    "";

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Error(
      "Unauthorized: Missing Bearer access token. Please sign in via OAuth first."
    );
  }

  const supabase = createUserSupabaseClient(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error(
      "Unauthorized: Invalid or expired session token. Please reconnect and sign in again."
    );
  }

  return { supabase, userId: user.id };
}

const ContractSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  title: z.string(),
  category: z.string(),
  overall_risk_score: z.number(),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  summary: z.string(),
  created_at: z.string(),
});

const ClauseSchema = z.object({
  id: z.string(),
  contract_id: z.string(),
  user_id: z.string(),
  clause_title: z.string(),
  original_text: z.string(),
  severity: z.enum(["safe", "caution", "red_flag"]),
  plain_english: z.string(),
  hidden_risk: z.string(),
  suggested_counter_clause: z.string(),
});

// ---------------------------------------------------------------------------
// TOOL 1: scan-contract (Bound to views/risk-radar/view.tsx)
// ---------------------------------------------------------------------------
server.tool(
  {
    name: "scan-contract",
    description:
      "Scan and audit a contract, rental agreement, freelance terms, loan offer, or privacy policy from raw text and/or a base64 document screenshot. Saves the audit to the user's vault and opens the interactive Risk Radar UI.",
    inputSchema: z.object({
      contractText: z
        .string()
        .optional()
        .describe("Raw text pasted from the agreement or terms of service."),
      imageBase64: z
        .string()
        .optional()
        .describe("Base64-encoded screenshot or photo of the contract page."),
      mimeType: z
        .string()
        .optional()
        .default("image/jpeg")
        .describe("MIME type of the image, e.g., image/jpeg or image/png."),
      customTitle: z
        .string()
        .optional()
        .describe("Optional custom name for this agreement."),
    }),
    outputSchema: z.object({
      contract: ContractSchema,
      clauses: z.array(ClauseSchema),
      stats: z.object({
        redFlagCount: z.number(),
        cautionCount: z.number(),
        safeCount: z.number(),
        totalClauses: z.number(),
      }),
    }),
    view: {
      name: "risk-radar",
      description: "Interactive Contract Risk Radar showing red flags, plain-English translations, and counter-clauses.",
    },
  },
  async ({ contractText, imageBase64, mimeType, customTitle }, ctx) => {
    if (!contractText?.trim() && !imageBase64?.trim()) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Please provide either contract text (`contractText`) or a document image (`imageBase64`) to scan.",
          },
        ],
      };
    }

    const { supabase, userId } = await getAuthenticatedContext(ctx);

    const audit = await analyzeContractInput({
      contractText,
      imageBase64,
      mimeType,
      customTitle,
    });

    const { data: savedContract, error: contractErr } = await supabase
      .from("contracts")
      .insert({
        user_id: userId,
        title: audit.title,
        category: audit.category,
        overall_risk_score: audit.overall_risk_score,
        risk_level: audit.risk_level,
        summary: audit.summary,
      })
      .select("*")
      .single();

    if (contractErr || !savedContract) {
      throw new Error(`Failed to save contract: ${contractErr?.message}`);
    }

    const clauseRows = audit.clauses.map((c) => ({
      contract_id: savedContract.id,
      user_id: userId,
      clause_title: c.clause_title,
      original_text: c.original_text,
      severity: c.severity,
      plain_english: c.plain_english,
      hidden_risk: c.hidden_risk,
      suggested_counter_clause: c.suggested_counter_clause,
    }));

    const { data: savedClauses, error: clausesErr } = await supabase
      .from("clauses")
      .insert(clauseRows)
      .select("*");

    if (clausesErr) {
      throw new Error(`Failed to save clauses: ${clausesErr.message}`);
    }

    const clauses = savedClauses ?? [];
    const redFlagCount = clauses.filter((c) => c.severity === "red_flag").length;
    const cautionCount = clauses.filter((c) => c.severity === "caution").length;
    const safeCount = clauses.filter((c) => c.severity === "safe").length;

    const structuredContent = {
      contract: savedContract,
      clauses,
      stats: {
        redFlagCount,
        cautionCount,
        safeCount,
        totalClauses: clauses.length,
      },
    };

    return {
      content: [
        {
          type: "text",
          text: `Audited "${savedContract.title}" (${savedContract.category}). Risk Score: ${savedContract.overall_risk_score}/100 (${savedContract.risk_level.toUpperCase()}). Found ${redFlagCount} red flags, ${cautionCount} cautions, and ${safeCount} safe clauses. Contract ID: ${savedContract.id}`,
        },
      ],
      structuredContent,
    };
  }
);

// ---------------------------------------------------------------------------
// TOOL 2: list-contracts (Bound to views/contract-vault/view.tsx)
// ---------------------------------------------------------------------------
server.tool(
  {
    name: "list-contracts",
    description:
      "List all previously audited contracts stored in the user's ClauseGuard Vault with risk scores and categories.",
    inputSchema: z.object({
      category: z
        .enum(["all", "rental", "freelance", "loan", "privacy_policy", "employment", "other"])
        .optional()
        .default("all")
        .describe("Optional category filter."),
    }),
    outputSchema: z.object({
      contracts: z.array(ContractSchema),
      activeCategory: z.string(),
    }),
    view: {
      name: "contract-vault",
      description: "Saved Contract Vault showing all previously audited agreements and risk scores.",
    },
  },
  async ({ category }, ctx) => {
    const { supabase } = await getAuthenticatedContext(ctx);

    let query = supabase
      .from("contracts")
      .select("*")
      .order("created_at", { ascending: false });

    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch contracts: ${error.message}`);
    }

    const contracts = data ?? [];
    const activeCategory = category || "all";

    return {
      content: [
        {
          type: "text",
          text:
            contracts.length === 0
              ? "Your Contract Vault is empty. Use `scan-contract` to audit your first agreement."
              : `Found ${contracts.length} audited contract(s) in your vault:\n` +
                contracts
                  .map(
                    (c) =>
                      `- [${c.id}] ${c.title} (${c.category}) — Risk: ${c.overall_risk_score}/100 (${c.risk_level})`
                  )
                  .join("\n"),
        },
      ],
      structuredContent: {
        contracts,
        activeCategory,
      },
    };
  }
);

// ---------------------------------------------------------------------------
// TOOL 3: get-contract-report (Detailed clause lookup by contract ID)
// ---------------------------------------------------------------------------
server.tool(
  {
    name: "get-contract-report",
    description:
      "Retrieve the full clause-by-clause audit report, hidden risks, and suggested counter-clauses for a specific saved contract ID.",
    inputSchema: z.object({
      contractId: z.string().uuid().describe("UUID of the contract from list-contracts."),
    }),
  },
  async ({ contractId }, ctx) => {
    const { supabase } = await getAuthenticatedContext(ctx);

    const { data: contract, error: contractErr } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (contractErr || !contract) {
      throw new Error(`Contract not found: ${contractErr?.message || contractId}`);
    }

    const { data: clauses, error: clausesErr } = await supabase
      .from("clauses")
      .select("*")
      .eq("contract_id", contractId)
      .order("created_at", { ascending: true });

    if (clausesErr) {
      throw new Error(`Failed to fetch clauses: ${clausesErr.message}`);
    }

    const list = clauses ?? [];
    const formattedClauses = list
      .map(
        (c, idx) =>
          `${idx + 1}. [${c.severity.toUpperCase()}] ${c.clause_title}\n` +
          `   Plain English: ${c.plain_english}\n` +
          `   Hidden Risk: ${c.hidden_risk}\n` +
          `   Counter-Clause: ${c.suggested_counter_clause}`
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text:
            `=== ${contract.title} (${contract.category.toUpperCase()}) ===\n` +
            `Risk Score: ${contract.overall_risk_score}/100 (${contract.risk_level.toUpperCase()})\n` +
            `Summary: ${contract.summary}\n\n` +
            `--- CLAUSES (${list.length}) ---\n${formattedClauses}`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// TOOL 4: compare-clauses (Bound to views/clause-diff/view.tsx)
// ---------------------------------------------------------------------------
server.tool(
  {
    name: "compare-clauses",
    description:
      "Compare an original risky contract clause against a revised clause proposed by the other party to verify if the trap was genuinely removed or if a new loophole was added.",
    inputSchema: z.object({
      originalClause: z.string().min(5).describe("The original clause wording."),
      revisedClause: z.string().min(5).describe("The newly proposed revision from the other party."),
      context: z
        .string()
        .optional()
        .describe("Optional context, e.g., '11-month apartment rental agreement'."),
    }),
    outputSchema: z.object({
      originalClause: z.string(),
      revisedClause: z.string(),
      comparison: z.object({
        verdict: z.enum(["trap_removed", "partially_fixed", "still_risky", "new_trap_added"]),
        risk_delta: z.number(),
        explanation: z.string(),
        remaining_concerns: z.array(z.string()),
        recommended_reply: z.string(),
      }),
    }),
    view: {
      name: "clause-diff",
      description: "Side-by-side Clause Revision Audit verifying if a negotiated change fixed the trap.",
    },
  },
  async ({ originalClause, revisedClause, context }) => {
    const comparison = await compareContractClauses({
      originalClause,
      revisedClause,
      context,
    });

    return {
      content: [
        {
          type: "text",
          text: `Verdict: ${comparison.verdict.toUpperCase()} (Risk Delta: ${
            comparison.risk_delta > 0 ? `+${comparison.risk_delta}` : comparison.risk_delta
          })\nExplanation: ${comparison.explanation}\nRecommended Reply: ${comparison.recommended_reply}`,
        },
      ],
      structuredContent: {
        originalClause,
        revisedClause,
        comparison,
      },
    };
  }
);

// ---------------------------------------------------------------------------
// TOOL 5: delete-contract (Removes a saved contract & cascades clauses)
// ---------------------------------------------------------------------------
server.tool(
  {
    name: "delete-contract",
    description:
      "Permanently delete a saved contract and its audited clauses from the user's Contract Vault.",
    inputSchema: z.object({
      contractId: z.string().uuid().describe("UUID of the contract to delete."),
    }),
  },
  async ({ contractId }, ctx) => {
    const { supabase } = await getAuthenticatedContext(ctx);

    const { error } = await supabase
      .from("contracts")
      .delete()
      .eq("id", contractId);

    if (error) {
      throw new Error(`Failed to delete contract: ${error.message}`);
    }

    return {
      content: [
        {
          type: "text",
          text: `Deleted contract ${contractId} and all associated clauses from your vault.`,
        },
      ],
    };
  }
);


import { pathToFileURL } from "node:url";

export default server;

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution && !isBuilding()) {
  await server.listen(PORT);
  console.log(`ClauseGuard MCP server running at ${MCP_URL}`);
}