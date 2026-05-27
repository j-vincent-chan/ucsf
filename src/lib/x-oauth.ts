import { createHash, randomBytes } from "node:crypto";

/** Scopes needed for posting, v2 media upload, and token refresh (offline access). */
export const X_OAUTH_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
  /** Required for POST /2/media/upload/* (see docs.x.com x-api/media). */
  "media.write",
  /** Likes from Social Signals feed (reconnect X in Settings if likes fail). */
  "like.write",
] as const;

const AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
const TOKEN_URLS = [
  "https://api.x.com/2/oauth2/token",
  "https://api.twitter.com/2/oauth2/token",
] as const;

export type XOAuthTokenBundle = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  /** Epoch ms when access_token expires (derived). */
  expires_at?: number;
  token_type: string;
  scope?: string;
};

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** RFC 7636 PKCE: code_verifier and S256 code_challenge. */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export function xOAuthCredentialsConfigured(): boolean {
  return Boolean(process.env.X_OAUTH_CLIENT_ID?.trim());
}

function xOAuthClientCredentials(): { clientId: string; clientSecret?: string } | null {
  const clientId = process.env.X_OAUTH_CLIENT_ID?.trim();
  if (!clientId) return null;
  const clientSecret = process.env.X_OAUTH_CLIENT_SECRET?.trim();
  return { clientId, clientSecret: clientSecret || undefined };
}

function parseTokenResponse(
  raw: Record<string, unknown>,
  priorRefreshToken?: string,
): XOAuthTokenBundle {
  const access_token = typeof raw.access_token === "string" ? raw.access_token : "";
  const refresh_token =
    typeof raw.refresh_token === "string"
      ? raw.refresh_token
      : priorRefreshToken;
  const expires_in = typeof raw.expires_in === "number" ? raw.expires_in : undefined;
  const token_type = typeof raw.token_type === "string" ? raw.token_type : "bearer";
  const scope = typeof raw.scope === "string" ? raw.scope : undefined;

  if (!access_token) throw new Error("X token response missing access_token");

  const expires_at =
    expires_in !== undefined ? Date.now() + expires_in * 1000 : undefined;

  return {
    access_token,
    refresh_token,
    expires_in,
    expires_at,
    token_type,
    scope,
  };
}

function tokenErrorMessage(raw: Record<string, unknown>, statusText: string): string {
  return (
    (typeof raw.error_description === "string" ? raw.error_description : "") ||
    (typeof raw.error === "string" ? raw.error : "") ||
    statusText
  );
}

/**
 * X OAuth token endpoint is picky: confidential clients use Basic auth; public PKCE clients
 * send client_id in the body only. Some apps still expect client_id in both places on refresh.
 */
async function postXOAuthToken(
  body: URLSearchParams,
  priorRefreshToken?: string,
): Promise<XOAuthTokenBundle> {
  const creds = xOAuthClientCredentials();
  if (!creds) throw new Error("Missing X_OAUTH_CLIENT_ID");

  type Attempt = { headers: HeadersInit; body: URLSearchParams };
  const attempts: Attempt[] = [];

  if (creds.clientSecret) {
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`, "utf8").toString("base64");
    const confidentialBody = new URLSearchParams(body);
    confidentialBody.delete("client_id");
    attempts.push({
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: confidentialBody,
    });
    const withClientId = new URLSearchParams(body);
    withClientId.set("client_id", creds.clientId);
    attempts.push({
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: withClientId,
    });
  } else {
    const publicBody = new URLSearchParams(body);
    publicBody.set("client_id", creds.clientId);
    attempts.push({
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publicBody,
    });
  }

  let lastMsg = "X token request failed";
  for (const url of TOKEN_URLS) {
    for (const attempt of attempts) {
      const res = await fetch(url, {
        method: "POST",
        headers: attempt.headers,
        body: attempt.body.toString(),
      });
      const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        return parseTokenResponse(raw, priorRefreshToken);
      }
      lastMsg = tokenErrorMessage(raw, res.statusText);
    }
  }

  throw new Error(`X token request failed: ${lastMsg}`);
}

/** Callback URL from env only (production / configured deployment). */
export function getXOAuthRedirectUri(): string {
  const explicit = process.env.X_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (site) return `${site}/api/auth/x/callback`;
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}/api/auth/x/callback`;
  return "http://localhost:3000/api/auth/x/callback";
}

/**
 * Callback URL for this browser session. In local dev, uses the current origin when it
 * differs from X_OAUTH_REDIRECT_URI so state sealing and callback hit the same server.
 */
export function resolveXOAuthRedirectUri(requestOrigin?: string): string {
  const configured = getXOAuthRedirectUri();
  if (!requestOrigin?.trim()) return configured;
  try {
    const req = new URL(requestOrigin.trim());
    const cfg = new URL(configured);
    if (req.origin === cfg.origin) return configured;
    if (process.env.NODE_ENV === "development") {
      return `${req.origin.replace(/\/$/, "")}/api/auth/x/callback`;
    }
  } catch {
    /* ignore invalid origin */
  }
  return configured;
}

export type XOAuthSetupDiagnostics = {
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  stateSecretConfigured: boolean;
  configuredRedirectUri: string;
  effectiveRedirectUri: string;
  redirectUriMismatch: boolean;
};

export function xOAuthSetupDiagnostics(requestOrigin?: string): XOAuthSetupDiagnostics {
  const configuredRedirectUri = getXOAuthRedirectUri();
  const effectiveRedirectUri = resolveXOAuthRedirectUri(requestOrigin);
  let redirectUriMismatch = false;
  try {
    redirectUriMismatch =
      new URL(configuredRedirectUri).origin !== new URL(effectiveRedirectUri).origin;
  } catch {
    redirectUriMismatch = false;
  }
  return {
    clientIdConfigured: Boolean(process.env.X_OAUTH_CLIENT_ID?.trim()),
    clientSecretConfigured: Boolean(process.env.X_OAUTH_CLIENT_SECRET?.trim()),
    stateSecretConfigured: Boolean(
      process.env.X_OAUTH_STATE_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    ),
    configuredRedirectUri,
    effectiveRedirectUri,
    redirectUriMismatch,
  };
}

export function buildAuthorizeUrl(params: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}): string {
  const clientId = process.env.X_OAUTH_CLIENT_ID?.trim();
  if (!clientId) throw new Error("Missing X_OAUTH_CLIENT_ID");
  const redirectUri = params.redirectUri.replace(/\/$/, "");
  const scope = X_OAUTH_SCOPES.join(" ");
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", scope);
  u.searchParams.set("state", params.state);
  u.searchParams.set("code_challenge", params.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<XOAuthTokenBundle> {
  if (!xOAuthClientCredentials()) {
    throw new Error("Missing X_OAUTH_CLIENT_ID");
  }
  const redirect = redirectUri.replace(/\/$/, "");

  try {
    return await postXOAuthToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect,
        code_verifier: codeVerifier,
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "X token exchange failed";
    throw new Error(msg.startsWith("X token") ? msg.replace("request", "exchange") : `X token exchange failed: ${msg}`);
  }
}

/** Stored JSON shape in `profiles.x_oauth` (plus legacy rows missing fields). */
export type StoredXOAuth = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

export function bundleFromStored(raw: unknown): XOAuthTokenBundle | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as StoredXOAuth;
  const access_token = typeof o.access_token === "string" ? o.access_token : "";
  if (!access_token) return null;
  const refresh_token = typeof o.refresh_token === "string" ? o.refresh_token : undefined;
  const expires_at = typeof o.expires_at === "number" ? o.expires_at : undefined;
  const expires_in = typeof o.expires_in === "number" ? o.expires_in : undefined;
  const token_type = typeof o.token_type === "string" ? o.token_type : "bearer";
  const scope = typeof o.scope === "string" ? o.scope : undefined;
  return {
    access_token,
    refresh_token,
    expires_in,
    expires_at,
    token_type,
    scope,
  };
}

/** Rotate access token using refresh_token (OAuth 2.0). */
export async function refreshAccessToken(refreshToken: string): Promise<XOAuthTokenBundle> {
  try {
    return await postXOAuthToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      refreshToken,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "X token refresh failed";
    throw new Error(msg.startsWith("X token") ? msg.replace("request", "refresh") : `X token refresh failed: ${msg}`);
  }
}

const ACCESS_SKEW_MS = 90_000;

/** Returns true if access token should be refreshed before use. */
export function accessTokenLikelyExpired(bundle: XOAuthTokenBundle): boolean {
  if (bundle.expires_at === undefined) return false;
  return Date.now() >= bundle.expires_at - ACCESS_SKEW_MS;
}
