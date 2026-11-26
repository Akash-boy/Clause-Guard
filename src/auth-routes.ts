import { Hono } from "hono";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createAnonSupabaseClient } from "./supabase.js";

interface PendingMcpAuth {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  clientId: string;
  codeVerifier?: string;
  createdAt: number;
}

interface IssuedAuthCode {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  clientId: string;
  createdAt: number;
}

const pendingGoogleLogins = new Map<string, PendingMcpAuth>();
const issuedCodes = new Map<string, IssuedAuthCode>();

function getPublicBaseUrl(req: Request, fallbackMcpUrl: string): string {
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (proto && host) {
    return `${proto}://${host}`;
  }
  try {
    return new URL(req.url).origin;
  } catch {
    return new URL(fallbackMcpUrl).origin;
  }
}

function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (!challenge) return true;
  if (method === "S256") {
    const hash = crypto.createHash("sha256").update(verifier).digest("base64url");
    return hash === challenge;
  }
  return verifier === challenge;
}

function renderLoginPage(params: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  clientId: string;
  error?: string;
}) {
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  const googleParams = new URLSearchParams({
    redirect_uri: params.redirectUri,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: params.codeChallengeMethod,
    client_id: params.clientId,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign In — ClauseGuard MCP</title>
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #090d16; color: #f8fafc; padding: 16px; }
    .card { width: 100%; max-width: 400px; background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 28px; box-shadow: 0 20px 45px rgba(0,0,0,0.45); }
    .badge { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #a5b4fc; background: rgba(99,102,241,0.16); border: 1px solid rgba(99,102,241,0.35); padding: 4px 10px; border-radius: 999px; margin-bottom: 12px; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    p.sub { margin: 0 0 20px; font-size: 13px; color: #9ca3af; }
    .google-btn { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 11px 14px; border-radius: 10px; border: 1px solid #374151; background: #ffffff; color: #111827; font-size: 14px; font-weight: 600; text-decoration: none; transition: background 0.15s; }
    .google-btn:hover { background: #f3f4f6; }
    .divider { display: flex; align-items: center; text-align: center; color: #6b7280; font-size: 12px; margin: 18px 0; }
    .divider::before, .divider::after { content: ""; flex: 1; border-bottom: 1px solid #1f2937; }
    .divider:not(:empty)::before { margin-right: 10px; }
    .divider:not(:empty)::after { margin-left: 10px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #d1d5db; margin-bottom: 6px; }
    input[type="email"], input[type="password"] { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #374151; background: #0f172a; color: #f8fafc; font-size: 14px; margin-bottom: 14px; }
    .actions { display: flex; gap: 10px; margin-top: 4px; }
    button { flex: 1; padding: 10px; border-radius: 8px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn-primary { background: #4f46e5; color: #fff; }
    .btn-primary:hover { background: #4338ca; }
    .btn-secondary { background: #1f2937; color: #e5e7eb; border: 1px solid #374151; }
    .btn-secondary:hover { background: #374151; }
    .error { background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.4); color: #fca5a5; padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">ClauseGuard MCP</div>
    <h1>Connect Your Vault</h1>
    <p class="sub">Sign in to audit contracts and save your private risk reports.</p>

    ${params.error ? `<div class="error">${esc(params.error)}</div>` : ""}

    <a class="google-btn" href="/oauth/google?${googleParams.toString()}">
      <svg width="18" height="18" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      Continue with Google
    </a>

    <div class="divider">or continue with email</div>

    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="redirect_uri" value="${esc(params.redirectUri)}" />
      <input type="hidden" name="state" value="${esc(params.state)}" />
      <input type="hidden" name="code_challenge" value="${esc(params.codeChallenge)}" />
      <input type="hidden" name="code_challenge_method" value="${esc(params.codeChallengeMethod)}" />
      <input type="hidden" name="client_id" value="${esc(params.clientId)}" />

      <label for="email">Email</label>
      <input id="email" name="email" type="email" required placeholder="you@example.com" />

      <label for="password">Password</label>
      <input id="password" name="password" type="password" required minlength="6" placeholder="••••••••" />

      <div class="actions">
        <button type="submit" name="mode" value="signin" class="btn-primary">Sign In</button>
        <button type="submit" name="mode" value="signup" class="btn-secondary">Sign Up</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

export function registerAuthRoutes(app: Hono, mcpUrl: string) {
  // 1. OAuth 2.1 Protected Resource Metadata (RFC 9728)
  app.get("/.well-known/oauth-protected-resource", (c) => {
    const baseUrl = getPublicBaseUrl(c.req.raw, mcpUrl);
    return c.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
    });
  });

  app.get("/.well-known/oauth-protected-resource/mcp", (c) => {
    const baseUrl = getPublicBaseUrl(c.req.raw, mcpUrl);
    return c.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
    });
  });

  // 2. OAuth 2.1 Authorization Server Metadata (RFC 8414)
  app.get("/.well-known/oauth-authorization-server", (c) => {
    const baseUrl = getPublicBaseUrl(c.req.raw, mcpUrl);
    return c.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    });
  });

  // 3. Dynamic Client Registration (RFC 7591)
  app.post("/oauth/register", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(
      {
        client_id: `clauseguard_${crypto.randomBytes(10).toString("hex")}`,
        client_name: body.client_name || "MCP Client",
        redirect_uris: body.redirect_uris || [],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201
    );
  });

  // 4. Authorization Screen (GET)
  app.get("/oauth/authorize", (c) => {
    const redirectUri = c.req.query("redirect_uri") || "";
    const state = c.req.query("state") || "";
    const codeChallenge = c.req.query("code_challenge") || "";
    const codeChallengeMethod = c.req.query("code_challenge_method") || "S256";
    const clientId = c.req.query("client_id") || "";

    return c.html(
      renderLoginPage({
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        clientId,
      })
    );
  });

  // 5. Start Google OAuth Flow
  app.get("/oauth/google", async (c) => {
    const redirectUri = c.req.query("redirect_uri") || "";
    const state = c.req.query("state") || "";
    const codeChallenge = c.req.query("code_challenge") || "";
    const codeChallengeMethod = c.req.query("code_challenge_method") || "S256";
    const clientId = c.req.query("client_id") || "";

    const baseUrl = getPublicBaseUrl(c.req.raw, mcpUrl);
    const txId = crypto.randomBytes(16).toString("hex");

    // In-memory PKCE storage so Supabase server-side PKCE works cleanly in Node/Hono
    const pkceStore = new Map<string, string>();
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: {
          flowType: "pkce",
          autoRefreshToken: false,
          persistSession: true,
          detectSessionInUrl: false,
          storage: {
            getItem: (key) => pkceStore.get(key) ?? null,
            setItem: (key, value) => {
              pkceStore.set(key, value);
            },
            removeItem: (key) => {
              pkceStore.delete(key);
            },
          },
        },
      }
    );

    const callbackUrl = `${baseUrl}/oauth/google/callback?tx=${txId}`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      return c.html(
        renderLoginPage({
          redirectUri,
          state,
          codeChallenge,
          codeChallengeMethod,
          clientId,
          error: error?.message || "Failed to start Google sign-in.",
        }),
        400
      );
    }

    // Extract the PKCE code_verifier generated by Supabase SDK
    const verifierEntry = Array.from(pkceStore.entries()).find(([k]) =>
      k.includes("code-verifier")
    );

    pendingGoogleLogins.set(txId, {
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
      clientId,
      codeVerifier: verifierEntry?.[1],
      createdAt: Date.now(),
    });

    return c.redirect(data.url);
  });

  // 6. Google OAuth Callback from Supabase
  app.get("/oauth/google/callback", async (c) => {
    const txId = c.req.query("tx") || "";
    const supabaseCode = c.req.query("code") || "";
    const oauthError = c.req.query("error_description") || c.req.query("error");

    const pending = pendingGoogleLogins.get(txId);
    pendingGoogleLogins.delete(txId);

    if (!pending) {
      return c.text("Login session expired. Please close this tab and click Connect again.", 400);
    }

    if (oauthError || !supabaseCode) {
      return c.html(
        renderLoginPage({
          ...pending,
          error: oauthError || "Google sign-in was cancelled or returned no code.",
        }),
        400
      );
    }

    const pkceStore = new Map<string, string>();
    if (pending.codeVerifier) {
      // Populate the exact storage key Supabase looks up during exchangeCodeForSession
      const projectRef = new URL(process.env.SUPABASE_URL!).hostname.split(".")[0];
      pkceStore.set(`sb-${projectRef}-auth-token-code-verifier`, pending.codeVerifier);
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: {
          flowType: "pkce",
          autoRefreshToken: false,
          persistSession: true,
          detectSessionInUrl: false,
          storage: {
            getItem: (key) => pkceStore.get(key) ?? null,
            setItem: (key, value) => {
              pkceStore.set(key, value);
            },
            removeItem: (key) => {
              pkceStore.delete(key);
            },
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(supabaseCode);

    if (error || !data.session) {
      return c.html(
        renderLoginPage({
          ...pending,
          error: error?.message || "Could not complete Google session exchange.",
        }),
        400
      );
    }

    const mcpAuthCode = crypto.randomBytes(24).toString("hex");
    issuedCodes.set(mcpAuthCode, {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in || 3600,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: pending.codeChallengeMethod,
      clientId: pending.clientId,
      createdAt: Date.now(),
    });

    const target = new URL(pending.redirectUri);
    target.searchParams.set("code", mcpAuthCode);
    if (pending.state) target.searchParams.set("state", pending.state);

    return c.redirect(target.toString());
  });

  // 7. Email/Password Form Submission (POST)
  app.post("/oauth/authorize", async (c) => {
    const form = await c.req.parseBody();
    const email = String(form.email || "").trim();
    const password = String(form.password || "");
    const mode = String(form.mode || "signin");
    const redirectUri = String(form.redirect_uri || "");
    const state = String(form.state || "");
    const codeChallenge = String(form.code_challenge || "");
    const codeChallengeMethod = String(form.code_challenge_method || "S256");
    const clientId = String(form.client_id || "");

    const supabase = createAnonSupabaseClient();
    const authRes =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (authRes.error || !authRes.data.session) {
      return c.html(
        renderLoginPage({
          redirectUri,
          state,
          codeChallenge,
          codeChallengeMethod,
          clientId,
          error:
            authRes.error?.message ||
            "Authentication failed. If signing up, ensure email confirmation is disabled in Supabase.",
        }),
        400
      );
    }

    const mcpAuthCode = crypto.randomBytes(24).toString("hex");
    issuedCodes.set(mcpAuthCode, {
      accessToken: authRes.data.session.access_token,
      refreshToken: authRes.data.session.refresh_token,
      expiresIn: authRes.data.session.expires_in || 3600,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      clientId,
      createdAt: Date.now(),
    });

    const target = new URL(redirectUri);
    target.searchParams.set("code", mcpAuthCode);
    if (state) target.searchParams.set("state", state);

    return c.redirect(target.toString());
  });

  // 8. OAuth 2.1 Token Exchange (Authorization Code + Refresh Token)
  app.post("/oauth/token", async (c) => {
    const contentType = c.req.header("content-type") || "";
    const params: Record<string, string> = contentType.includes("application/json")
      ? await c.req.json()
      : Object.fromEntries(
          Object.entries(await c.req.parseBody()).map(([k, v]) => [k, String(v)])
        );

    const grantType = params.grant_type;

    if (grantType === "authorization_code") {
      const code = params.code || "";
      const codeVerifier = params.code_verifier || "";
      const record = issuedCodes.get(code);
      issuedCodes.delete(code);

      if (!record) {
        return c.json({ error: "invalid_grant", error_description: "Invalid or expired code" }, 400);
      }

      if (!verifyPkce(codeVerifier, record.codeChallenge, record.codeChallengeMethod)) {
        return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
      }

      return c.json({
        access_token: record.accessToken,
        token_type: "Bearer",
        expires_in: record.expiresIn,
        refresh_token: record.refreshToken,
      });
    }

    if (grantType === "refresh_token") {
      const refreshToken = params.refresh_token || "";
      const supabase = createAnonSupabaseClient();
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

      if (error || !data.session) {
        return c.json({ error: "invalid_grant", error_description: "Refresh token expired" }, 400);
      }

      return c.json({
        access_token: data.session.access_token,
        token_type: "Bearer",
        expires_in: data.session.expires_in || 3600,
        refresh_token: data.session.refresh_token,
      });
    }

    return c.json({ error: "unsupported_grant_type" }, 400);
  });
}