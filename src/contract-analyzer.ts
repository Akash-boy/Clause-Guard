import { GoogleGenAI, Type, type Schema } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";

export interface AuditedClause {
  clause_title: string;
  original_text: string;
  severity: "safe" | "caution" | "red_flag";
  plain_english: string;
  hidden_risk: string;
  suggested_counter_clause: string;
}

export interface ContractAuditResult {
  title: string;
  category: "rental" | "freelance" | "loan" | "privacy_policy" | "employment" | "other";
  overall_risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  summary: string;
  clauses: AuditedClause[];
}

export interface ClauseComparisonResult {
  verdict: "trap_removed" | "partially_fixed" | "still_risky" | "new_trap_added";
  risk_delta: number;
  explanation: string;
  remaining_concerns: string[];
  recommended_reply: string;
}

async function callGeminiWithTimeout<T>(
  run: (model: string) => Promise<T>,
  timeoutMs = 35_000
): Promise<T> {
  const models =
    PRIMARY_MODEL === FALLBACK_MODEL
      ? [PRIMARY_MODEL]
      : [PRIMARY_MODEL, FALLBACK_MODEL];

  let lastError: unknown;
  for (const model of models) {
    try {
      return await Promise.race([
        run(model),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${timeoutMs}ms on ${model}`)),
            timeoutMs
          )
        ),
      ]);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

const contractAuditSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "Concise descriptive title of the agreement.",
    },
    category: {
      type: Type.STRING,
      enum: ["rental", "freelance", "loan", "privacy_policy", "employment", "other"],
    },
    overall_risk_score: {
      type: Type.INTEGER,
      description: "Overall risk score from 0 (completely safe) to 100 (predatory/critical risk).",
    },
    risk_level: {
      type: Type.STRING,
      enum: ["low", "medium", "high", "critical"],
    },
    summary: {
      type: Type.STRING,
      description: "2-3 sentence executive summary of the agreement's fairness and biggest traps.",
    },
    clauses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          clause_title: { type: Type.STRING },
          original_text: { type: Type.STRING },
          severity: {
            type: Type.STRING,
            enum: ["safe", "caution", "red_flag"],
          },
          plain_english: {
            type: Type.STRING,
            description: "Clear, jargon-free explanation of what this clause actually means.",
          },
          hidden_risk: {
            type: Type.STRING,
            description:
              "Specific financial, legal, or unilateral trap hidden in this clause (or 'None — standard balanced term.' if safe).",
          },
          suggested_counter_clause: {
            type: Type.STRING,
            description:
              "Polite, balanced replacement wording the user can propose (or 'No changes needed.' if safe).",
          },
        },
        required: [
          "clause_title",
          "original_text",
          "severity",
          "plain_english",
          "hidden_risk",
          "suggested_counter_clause",
        ],
      },
    },
  },
  required: [
    "title",
    "category",
    "overall_risk_score",
    "risk_level",
    "summary",
    "clauses",
  ],
};

const clauseComparisonSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    verdict: {
      type: Type.STRING,
      enum: ["trap_removed", "partially_fixed", "still_risky", "new_trap_added"],
    },
    risk_delta: {
      type: Type.INTEGER,
      description:
        "Estimated change in risk points (negative means safer, e.g., -40; positive means riskier, e.g., +15).",
    },
    explanation: {
      type: Type.STRING,
      description: "Clear comparison of what changed legally/financially between the two versions.",
    },
    remaining_concerns: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Any lingering ambiguities, one-sided terms, or new loopholes (empty array if none).",
    },
    recommended_reply: {
      type: Type.STRING,
      description: "Short, ready-to-send reply accepting the revision or requesting final tweaks.",
    },
  },
  required: [
    "verdict",
    "risk_delta",
    "explanation",
    "remaining_concerns",
    "recommended_reply",
  ],
};

export async function analyzeContractInput(params: {
  contractText?: string;
  imageBase64?: string;
  mimeType?: string;
  customTitle?: string;
}): Promise<ContractAuditResult> {
  const { contractText, imageBase64, mimeType = "image/jpeg", customTitle } = params;

  const prompt = `You are ClauseGuard, an expert consumer-protection and contract-auditing legal analyst.
Analyze the provided agreement (from text and/or document image). Extract every distinct clause, classify its severity ("safe", "caution", or "red_flag"), translate it into plain English, expose any one-sided or hidden financial/legal traps, and draft fair counter-clauses for any "caution" or "red_flag" items.
${customTitle ? `Use "${customTitle}" as the contract title.` : ""}
${contractText ? `\n--- CONTRACT TEXT ---\n${contractText}` : ""}`;

  const contents: Array<string | { inlineData: { data: string; mimeType: string } }> = [prompt];

  if (imageBase64?.trim()) {
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "").trim();
    contents.push({
      inlineData: {
        data: cleanBase64,
        mimeType,
      },
    });
  }

  const response = await callGeminiWithTimeout((model) =>
    ai.models.generateContent({
      model,
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: contractAuditSchema,
        temperature: 0.2,
      },
    })
  );

  const rawText = response.text;
  if (!rawText) {
    throw new Error("Gemini returned an empty response while analyzing the contract.");
  }

  const parsed = JSON.parse(rawText) as ContractAuditResult;
  if (customTitle?.trim()) {
    parsed.title = customTitle.trim();
  }
  return parsed;
}

export async function compareContractClauses(params: {
  originalClause: string;
  revisedClause: string;
  context?: string;
}): Promise<ClauseComparisonResult> {
  const { originalClause, revisedClause, context } = params;

  const prompt = `You are ClauseGuard, an expert contract negotiation auditor.
Compare the ORIGINAL CLAUSE against the REVISED CLAUSE proposed by the other party.
Determine whether the original trap was genuinely fixed, only partially addressed, left intact, or replaced with a new loophole.
${context ? `Agreement Context: ${context}\n` : ""}
--- ORIGINAL CLAUSE ---
${originalClause}

--- REVISED CLAUSE ---
${revisedClause}`;

  const response = await callGeminiWithTimeout((model) =>
    ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: clauseComparisonSchema,
        temperature: 0.2,
      },
    })
  );

  const rawText = response.text;
  if (!rawText) {
    throw new Error("Gemini returned an empty response while comparing clauses.");
  }

  return JSON.parse(rawText) as ClauseComparisonResult;
}