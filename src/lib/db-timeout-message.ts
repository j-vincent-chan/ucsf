/** Matches Postgres `statement_timeout` / cancel messages from Supabase clients. */
export function isDbStatementTimeoutErrorMessage(message: string): boolean {
  return /canceling statement due to statement timeout|statement timeout/i.test(message);
}

/** Cloudflare / edge / origin glitches (520), gateway errors, or huge JSON payloads — not fixed by statement_timeout alone. */
export function isDigestVisualTransientFailure(message: string, httpStatus = 0): boolean {
  if (isDbStatementTimeoutErrorMessage(message)) return true;
  if (httpStatus >= 502 && httpStatus <= 504) return true;
  if (httpStatus === 520) return true;
  return /cloudflare|\b520\b|bad gateway|gateway timeout|returning an unknown error|connection reset|econnreset|load failed|failed to fetch|networkerror|fetch failed/i.test(
    message,
  );
}

/** Maps Postgres statement_timeout errors to actionable copy for UI surfaces. */
export function userFacingDbStatementTimeoutMessage(message: string): string {
  if (isDbStatementTimeoutErrorMessage(message)) {
    return "The database timed out on this request. Try again in a moment. If it keeps happening, apply pending Supabase migrations (digest/dashboard indexes) or raise statement_timeout for your project.";
  }
  return message;
}

/** Toast copy for digest visual API failures (timeouts + Supabase/CF edge). */
export function userFacingDigestVisualErrorMessage(message: string, httpStatus = 0): string {
  if (isDbStatementTimeoutErrorMessage(message)) {
    return userFacingDbStatementTimeoutMessage(message);
  }
  if (isDigestVisualTransientFailure(message, httpStatus)) {
    return "Supabase or the edge network dropped this request (520 / timeout), often when saving large hero JSON. Wait a moment, try again, and avoid rapid-fire selections. Long-term: smaller images or storing visuals in Storage instead of inline base64.";
  }
  return message;
}
