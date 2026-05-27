/**
 * Dev/single-instance fallback when the OAuth callback lands on the same Node process
 * but the pending cookie is missing. Not reliable on serverless — cookie + short state still primary.
 */
const globalStore = globalThis as unknown as {
  __xOAuthPendingByNonce?: Map<string, { sealed: string; exp: number }>;
};

function pendingMap(): Map<string, { sealed: string; exp: number }> {
  if (!globalStore.__xOAuthPendingByNonce) {
    globalStore.__xOAuthPendingByNonce = new Map();
  }
  return globalStore.__xOAuthPendingByNonce;
}

export function stashXOAuthPendingByNonce(nonce: string, sealed: string, ttlMs = 15 * 60 * 1000): void {
  pendingMap().set(nonce, { sealed, exp: Date.now() + ttlMs });
}

export function takeXOAuthPendingByNonce(nonce: string): string | null {
  const row = pendingMap().get(nonce);
  if (!row) return null;
  pendingMap().delete(nonce);
  if (Date.now() > row.exp) return null;
  return row.sealed;
}
