import type { Hono } from "hono";
import crypto from "node:crypto";
import { createAnonSupabaseClient } from "./supabase.js";

interface AuthCodeRecord {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  redirectUri: string;
  codeChallenge?: string;
  expiresAt: number;
}

const authCodes = new Map<string, AuthCodeRecord>();

export function registerAuthRoutes(app: Hono, mcpUrl: string) {
  const baseUrl = mcpUrl.replace(/\/mcp\/?$/, "");

  app.get("/.well-known/oauth-protected-resource", (c) => {
    return c.json({
      resource: mcpUrl,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
    });
  });

  app.get("/.well-known/oauth-authorization-server", (c) => {
    return c.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    });
  });

  app.post("/oauth/register", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(
      {
        client_id: `clauseguard_${crypto.randomUUID()}`,
        client_name: body.client_name || "ClauseGuard MCP Client",
        redirect_uris: body.redirect_uris || [],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201
    );
  });

  app.get("/oauth/authorize", (c) => {
    const redirectUri = c.req.query("redirect_uri") || "";
    const state = c.req.query("state") || "";
    const codeChallenge = c.req.query("code_challenge") || "";
    const errorMsg = c.req.query("error") || "";

    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ClauseGuard MCP — Sign In</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
    body { background: #0b0f19; color: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 32px; width: 100%; max-width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.45); }
    .badge { display: inline-block; background: rgba(99,102,241,0.15); color: #818cf8; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; margin-bottom: 12px; }
    h1 { font-size: 22px; margin-bottom: 6px; }
    p.sub { color: #94a3b8; font-size: 14px; margin-bottom: 22px; }
    label { display: block; font-size: 13px; color: #cbd5e1; margin-bottom: 6px; }
    input[type="email"], input[type="password"] { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #f8fafc; margin-bottom: 16px; font-size: 14px; }
    input:focus { outline: none; border-color: #6366f1; }
    .actions { display: flex; gap: 10px; margin-top: 6px; }
    button { flex: 1; padding: 11px; border-radius: 8px; border: none; font-weight: 600; font-size: 14px; cursor: pointer; }
    .btn-primary { background: #6366f1; color: white; }
    .btn-primary:hover { background: #4f46e5; }
    .btn-secondary { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; }
    .err { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4); color: #fca5a5; padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">ClauseGuard MCP</span>
    <h1>Audit Contracts Safely</h1>
    <p class="sub">Sign in or create an account to save and inspect your contract risk reports.</p>
    ${errorMsg ? `<div class="err">${errorMsg}</div>` : ""}
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="redirect_uri" value="${redirectUri}" />
      <input type="hidden" name="state" value="${state}" />
      <input type="hidden" name="code_challenge" value="${codeChallenge}" />
      <label>Email</label>
      <input type="email" name="email" required placeholder="you@example.com" />
      <label>Password</label>
      <input type="password" name="password" required minlength="6" placeholder="••••••••" />
      <div class="actions">
        <button type="submit" name="mode" value="signin" class="btn-primary">Sign In</button>
        <button type="submit" name="mode" value="signup" class="btn-secondary">Sign Up</button>
      </div>
    </form>
  </div>
</body>
</html>`);
  });

  app.post("/oauth/authorize", async (c) => {
    const form = await c.req.parseBody();
    const email = String(form.email || "").trim();
    const password = String(form.password || "");
    const mode = String(form.mode || "signin");
    const redirectUri = String(form.redirect_uri || "");
    const state = String(form.state || "");
    const codeChallenge = String(form.code_challenge || "");

    const supabase = createAnonSupabaseClient();
    const authResult =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (authResult.error || !authResult.data.session || !authResult.data.user) {
      const msg = encodeURIComponent(authResult.error?.message || "Authentication failed. Check email confirmation settings.");
      return c.redirect(`/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(codeChallenge)}&error=${msg}`);
    }

    const code = crypto.randomBytes(24).toString("hex");
    authCodes.set(code, {
      accessToken: authResult.data.session.access_token,
      refreshToken: authResult.data.session.refresh_token,
      userId: authResult.data.user.id,
      email: authResult.data.user.email || email,
      redirectUri,
      codeChallenge: codeChallenge || undefined,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    if (state) target.searchParams.set("state", state);
    return c.redirect(target.toString());
  });

  app.post("/oauth/token", async (c) => {
    const contentType = c.req.header("content-type") || "";
    const body = contentType.includes("application/json")
      ? await c.req.json()
      : await c.req.parseBody();

    const grantType = String(body.grant_type || "");

    if (grantType === "authorization_code") {
      const code = String(body.code || "");
      const codeVerifier = String(body.code_verifier || "");
      const record = authCodes.get(code);

      if (!record || record.expiresAt < Date.now()) {
        authCodes.delete(code);
        return c.json({ error: "invalid_grant", error_description: "Invalid or expired authorization code" }, 400);
      }

      if (record.codeChallenge && codeVerifier) {
        const computed = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
        if (computed !== record.codeChallenge) {
          return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
        }
      }

      authCodes.delete(code);
      return c.json({
        access_token: record.accessToken,
        refresh_token: record.refreshToken,
        token_type: "Bearer",
        expires_in: 3600,
      });
    }

    if (grantType === "refresh_token") {
      const refreshToken = String(body.refresh_token || "");
      const supabase = createAnonSupabaseClient();
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) {
        return c.json({ error: "invalid_grant", error_description: "Refresh token expired" }, 400);
      }
      return c.json({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        token_type: "Bearer",
        expires_in: 3600,
      });
    }

    return c.json({ error: "unsupported_grant_type" }, 400);
  });
}