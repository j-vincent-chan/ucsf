/**
 * Supabase/PostgREST sometimes returns `message: ""` with useful `details`/`hint`/`code`,
 * or fetch-layer errors with status but no message. Normalize for UI and logs.
 */
export function formatPostgrestError(err: unknown): string {
  if (err == null) return "Unknown error";
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err instanceof Error) {
    const m = err.message?.trim();
    if (m) return m;
    if (err.name && err.name !== "Error") return err.name;
  }

  if (typeof err === "object" && err !== null) {
    const o = err as Record<string, unknown>;
    const message = String(o.message ?? "").trim();
    const details = o.details != null ? String(o.details).trim() : "";
    const hint = o.hint != null ? String(o.hint).trim() : "";
    const code = o.code != null ? String(o.code).trim() : "";
    const parts: string[] = [];
    if (message) parts.push(message);
    if (details && details !== message) parts.push(details);
    if (hint) parts.push(hint);
    if (code) parts.push(`(code ${code})`);

    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!message && name && name !== "Error") parts.push(name);

    const status = o.status != null ? String(o.status).trim() : "";
    const statusText = typeof o.statusText === "string" ? o.statusText.trim() : "";
    if (status && statusText) parts.push(`HTTP ${status} ${statusText}`);
    else if (status) parts.push(`HTTP ${status}`);

    const errorDesc =
      typeof o.error_description === "string" ? o.error_description.trim() : "";
    if (errorDesc) parts.push(errorDesc);

    if (parts.length > 0) return parts.join(" — ");

    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") {
        return json.length > 280 ? `${json.slice(0, 277)}…` : json;
      }
    } catch {
      /* ignore */
    }
  }

  return "Database request failed (no error message returned).";
}
