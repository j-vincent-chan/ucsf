import { createHash, randomBytes } from "node:crypto";

/** Scopes needed for posting and token refresh (offline access). */
export const X_OAUTH_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
] as const;

const AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";

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

export function getXOAuthRedirectUri(): string {
  const explicit = process.env.X_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (site) return `${site}/api/auth/x/callback`;
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}/api/auth/x/callback`;
  return "http://localhost:3000/api/auth/x/callback";
}

export function buildAuthorizeUrl(params: {
  state: string;
  codeChallenge: string;
}): string {
  const clientId = process.env.X_OAUTH_CLIENT_ID?.trim();
  if (!clientId) throw new Error("Missing X_OAUTH_CLIENT_ID");
  const redirectUri = getXOAuthRedirectUri();
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

export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<XOAuthTokenBundle> {
  const clientId = process.env.X_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.X_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Missing X_OAUTH_CLIENT_ID or X_OAUTH_CLIENT_SECRET");
  }
  const redirectUri = getXOAuthRedirectUri();
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof raw.error_description === "string"
        ? raw.error_description
        : typeof raw.error === "string"
          ? raw.error
          : res.statusText;
    throw new Error(`X token exchange failed: ${msg}`);
  }

  const access_token = typeof raw.access_token === "string" ? raw.access_token : "";
  const refresh_token = typeof raw.refresh_token === "string" ? raw.refresh_token : undefined;
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
