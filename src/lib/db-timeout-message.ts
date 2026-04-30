/** Maps Postgres statement_timeout errors to actionable copy for UI surfaces. */
export function userFacingDbStatementTimeoutMessage(message: string): string {
  if (/canceling statement due to statement timeout|statement timeout/i.test(message)) {
    return "The database timed out on this request. Try again in a moment. If it keeps happening, apply pending Supabase migrations (digest/dashboard indexes) or raise statement_timeout for your project.";
  }
  return message;
}
