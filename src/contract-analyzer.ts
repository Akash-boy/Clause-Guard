import { GoogleGenAI, Type } from "@google/genai";

export interface AnalyzedClause {
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
  clauses: AnalyzedClause[];
}

export interface ClauseComparisonResult {
  verdict: "trap_removed" | "partially_fixed" | "still_risky" | "new_trap_added";
  risk_delta: number;
  explanation: string;
  remaining_concerns: string[];
  recommended_reply: string;
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment variables.");
  }
  return new GoogleGenAI({ apiKey });
}
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export async function analyzeContractInput(params: {
  contractText?: string;
  imageBase64?: string;
  mimeType?: string;
  customTitle?: string;
}): Promise<ContractAuditResult> {
  const ai = getGeminiClient();

  const prompt = `You are ClauseGuard, an expert consumer-protection and contract-auditing AI.
Analyze the provided agreement (either raw text, a document screenshot/photo, or both).
1. Identify a clear document title${params.customTitle ? ` (user suggested: "${params.customTitle}")` : ""}.
2. Classify the category into one of: rental, freelance, loan, privacy_policy, employment, other.
3. Calculate an overall_risk_score from 0 (completely fair/standard) to 100 (predatory/dangerous) and assign risk_level (low: 0-29, medium: 30-59, high: 60-79, critical: 80-100).
4. Write a concise 2-3 sentence executive summary highlighting the biggest financial, legal, or privacy traps.
5. Extract 4 to 10 key clauses covering the most important terms (include both red_flag/caution traps AND key safe clauses for balance).
For each clause:
- clause_title: Short descriptive heading
- original_text: Exact or near-exact quote from the document
- severity: "red_flag" (predatory, one-sided, hidden penalty, IP/data grab), "caution" (ambiguous or slightly unfavorable), or "safe" (fair/standard protection)
- plain_english: Clear 1-2 sentence explanation a non-lawyer understands immediately
- hidden_risk: Specific worst-case consequence for the signer (or "None — standard fair term." if safe)
- suggested_counter_clause: Ready-to-paste balanced replacement wording the user can send back to negotiate (or "No changes needed." if safe).`;

  const contents: Array<string | { inlineData: { data: string; mimeType: string } }> = [prompt];

  if (params.contractText && params.contractText.trim().length > 0) {
    contents.push(`--- CONTRACT TEXT ---\n${params.contractText.trim()}`);
  }

  if (params.imageBase64 && params.imageBase64.trim().length > 0) {
    const cleanBase64 = params.imageBase64.replace(/^data:[^;]+;base64,/, "");
    contents.push({
      inlineData: {
        data: cleanBase64,
        mimeType: params.mimeType || "image/jpeg",
      },
    });
  }

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          category: {
            type: Type.STRING,
            enum: ["rental", "freelance", "loan", "privacy_policy", "employment", "other"],
          },
          overall_risk_score: { type: Type.INTEGER },
          risk_level: {
            type: Type.STRING,
            enum: ["low", "medium", "high", "critical"],
          },
          summary: { type: Type.STRING },
          clauses: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                clause_title: { type: Type.STRING },
                original_text: { type: Type.STRING },
                severity: { type: Type.STRING, enum: ["safe", "caution", "red_flag"] },
                plain_english: { type: Type.STRING },
                hidden_risk: { type: Type.STRING },
                suggested_counter_clause: { type: Type.STRING },
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
        required: ["title", "category", "overall_risk_score", "risk_level", "summary", "clauses"],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response while analyzing the contract.");
  }

  return JSON.parse(text) as ContractAuditResult;
}

export async function compareContractClauses(params: {
  originalClause: string;
  revisedClause: string;
  context?: string;
}): Promise<ClauseComparisonResult> {
  const ai = getGeminiClient();

  const prompt = `You are ClauseGuard, an expert contract negotiation auditor.
Compare the ORIGINAL risky clause against the REVISED clause sent back by the other party.
Check carefully if the other party genuinely removed the trap, only softened the wording cosmetically, or snuck in a brand-new loophole.

${params.context ? `Contract context: ${params.context}\n` : ""}
ORIGINAL CLAUSE:
${params.originalClause}

REVISED CLAUSE:
${params.revisedClause}`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          verdict: {
            type: Type.STRING,
            enum: ["trap_removed", "partially_fixed", "still_risky", "new_trap_added"],
          },
          risk_delta: {
            type: Type.INTEGER,
            description: "Negative number if risk decreased (e.g., -45), positive if risk increased (e.g., +20).",
          },
          explanation: { type: Type.STRING },
          remaining_concerns: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          recommended_reply: { type: Type.STRING },
        },
        required: ["verdict", "risk_delta", "explanation", "remaining_concerns", "recommended_reply"],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response while comparing clauses.");
  }

  return JSON.parse(text) as ClauseComparisonResult;
}

async function generateWithRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("429");
      if (!isTransient || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error("Model temporarily unavailable after retries.");
}