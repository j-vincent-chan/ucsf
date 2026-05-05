/** Detect whether `articleUrl` already appears in body (substring / hostname-style checks). */
export function articleUrlAlreadyInText(body: string, articleUrl: string): boolean {
  const u = articleUrl.trim();
  if (!u) return true;
  const lowerBase = body.toLowerCase();
  const lowerUrl = u.toLowerCase();
  const normUrl = u.replace(/\/$/, "").toLowerCase();
  let hostPath = "";
  try {
    const parsed = new URL(u);
    hostPath = `${parsed.hostname}${parsed.pathname}`.toLowerCase().replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  return (
    lowerBase.includes(lowerUrl) ||
    lowerBase.includes(normUrl) ||
    (hostPath.length > 0 && lowerBase.includes(hostPath))
  );
}

/** Append article URL on its own lines when missing (for social posts with images). */
export function appendArticleUrlIfAbsent(body: string, articleUrl: string): string {
  const u = articleUrl.trim();
  const b = body.trim();
  if (!u) return b;
  if (articleUrlAlreadyInText(b, u)) return b;
  return `${b}\n\n${u}`;
}
