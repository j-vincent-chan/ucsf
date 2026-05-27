import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

type PendingPayload = {
  userId: string;
  codeVerifier: string;
  /** Random nonce — sent to X as the OAuth `state` param (short, under 500 chars). */
  nonce: string;
  /** Exact redirect_uri used in authorize + token exchange (must match). */
  redirectUri: string;
  exp: number;
};

function sealKey(): Buffer {
  const secret =
    process.env.X_OAUTH_STATE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error(
      "Set X_OAUTH_STATE_SECRET (recommended) or SUPABASE_SERVICE_ROLE_KEY for X OAuth state sealing.",
    );
  }
  return scryptSync(secret, "x-oauth-pending-v1", 32);
}

/** Encrypted cookie payload for OAuth PKCE (prevents CSRF / tampering). ~15 min TTL. */
export function sealXOAuthPending(data: Omit<PendingPayload, "exp">): string {
  const payload: PendingPayload = {
    ...data,
    exp: Date.now() + 15 * 60 * 1000,
  };
  const key = sealKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(payload), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function unsealXOAuthPending(sealed: string): PendingPayload | null {
  try {
    const buf = Buffer.from(sealed, "base64url");
    if (buf.length < 12 + 16 + 1) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const key = sealKey();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    const payload = JSON.parse(dec.toString("utf8")) as Record<string, unknown>;
    const nonce =
      typeof payload.nonce === "string"
        ? payload.nonce
        : typeof payload.state === "string"
          ? payload.state
          : null;
    const redirectUri =
      typeof payload.redirectUri === "string" && payload.redirectUri.trim()
        ? payload.redirectUri.trim()
        : null;
    if (
      typeof payload.userId !== "string" ||
      typeof payload.codeVerifier !== "string" ||
      !nonce ||
      !redirectUri ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    const parsed: PendingPayload = {
      userId: payload.userId,
      codeVerifier: payload.codeVerifier,
      nonce,
      redirectUri,
      exp: payload.exp,
    };
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}
