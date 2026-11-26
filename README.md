# ClauseGuard MCP 🛡️

**AI-Powered Contract, Terms & Fine-Print Risk Radar built with the Model Context Protocol (`mcp-use`), TypeScript, React, Supabase, and Gemini.**

ClauseGuard MCP turns dense rental agreements, freelance contracts, loan offers, employment terms, and privacy policies into interactive risk audits directly inside AI chat interfaces. Users can paste contract text or upload screenshots/photos of printed pages to uncover hidden traps, read plain-English translations, copy ready-to-send negotiation counter-clauses, and audit revised clauses side by side.

---

## ✨ Key Features

- **Multimodal Contract Auditing (`scan-contract`):** Accepts raw contract text, base64 document screenshots/photos (via Gemini 2.5 Flash Vision), or both. Generates a `0–100` risk score, severity classification (`low`, `medium`, `high`, `critical`), plain-English clause explanations, and copyable counter-clauses inside an interactive **Risk Radar** UI.
- **Negotiation Revision Diff (`compare-clauses`):** Compares an original risky clause against a revised clause proposed by the other party to verify whether the trap was genuinely removed or if a new loophole was introduced, rendered in a side-by-side **Clause Revision Audit** UI.
- **Encrypted Personal Contract Vault (`list-contracts`, `get-contract-report`, `delete-contract`):** Stores audited agreements and clauses in PostgreSQL (Supabase) protected by **OAuth 2.1 + PKCE** authentication and strict **Row-Level Security (RLS)** so each user's documents remain strictly private.

---

## 🧰 MCP Tools & Interactive Views

| Tool Name | Interactive MCP View | Description |
| :--- | :--- | :--- |
| `scan-contract` | `risk-radar` | Audits pasted text or document images, saves results to Supabase, and renders the interactive Risk Radar dashboard. |
| `list-contracts` | `contract-vault` | Displays all previously scanned contracts for the authenticated user with category filters and risk scores. |
| `get-contract-report` | — | Retrieves the full clause-by-clause audit breakdown and counter-clauses for a saved contract UUID. |
| `compare-clauses` | `clause-diff` | Compares an original clause against a proposed revision and renders a side-by-side diff verdict. |
| `delete-contract` | — | Permanently deletes a saved contract and cascades deletion to its associated clauses. |

---

## 🏗️ Tech Stack

- **MCP Framework:** [`mcp-use`](https://github.com/mcp-use/mcp-use) (TypeScript server + React MCP App views)
- **AI Extraction & Vision:** Google Gemini (`gemini-2.5-flash` via `@google/genai`) with structured JSON Schema outputs
- **Database & Auth:** Supabase (PostgreSQL, Row-Level Security, OAuth 2.1 + PKCE flow via Hono)
- **Validation & Frontend:** Zod v4, React 19, Tailwind CSS, Lucide Icons

---

## 🚀 Local Setup & Development

### 1. Clone & Install Dependencies
```bash
git clone [https://github.com/Akash-boy/clauseguard-mcp.git](https://github.com/Akash-boy/clauseguard-mcp.git)
cd clauseguard-mcp
npm install