import { unsealXOAuthPending } from "@/lib/oauth-seal";
import { takeXOAuthPendingByNonce } from "@/lib/x-oauth-pending-store";
import { getXOAuthRedirectUri } from "@/lib/x-oauth";

export type ResolvedXOAuthPending = {
  userId: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
};

/** Looks like our sealed blob (legacy) vs short nonce (current). */
function looksLikeSealedBlob(value: string): boolean {
  return value.length > 48;
}

/**
 * Resolve PKCE pending state from in-memory stash, cookie, or legacy full sealed `state` param.
 */
export function resolveXOAuthPending(
  stateParam: string,
  cookieSealed: string | undefined,
): { pending: ResolvedXOAuthPending | null; error: string | null } {
  const nonce = stateParam.trim();
  if (!nonce) {
    return { pending: null, error: "Missing OAuth state from X." };
  }

  let sealed: string | null = null;
  if (looksLikeSealedBlob(nonce)) {
    sealed = nonce;
  } else {
    sealed = takeXOAuthPendingByNonce(nonce) ?? cookieSealed?.trim() ?? null;
  }

  if (!sealed) {
    const configured = getXOAuthRedirectUri();
    return {
      pending: null,
      error: `OAuth session was lost before callback finished. You started on one host but X redirected to another (configured callback: ${configured}). Use the same URL for Connect and callback, or set X_OAUTH_REDIRECT_URI to match where you are testing.`,
    };
  }

  const pending = unsealXOAuthPending(sealed);
  if (!pending) {
    return {
      pending: null,
      error:
        "OAuth session could not be verified (expired, wrong X_OAUTH_STATE_SECRET, or server restarted). Click Connect again. If you rotated secrets, set a stable X_OAUTH_STATE_SECRET and restart the dev server.",
    };
  }

  if (!looksLikeSealedBlob(nonce) && pending.nonce !== nonce) {
    return { pending: null, error: "OAuth state mismatch. Try Connect again." };
  }

  return {
    pending: {
      userId: pending.userId,
      codeVerifier: pending.codeVerifier,
      nonce: pending.nonce,
      redirectUri: pending.redirectUri,
    },
    error: null,
  };
}
