"use client";

import { useMemo, type ReactNode } from "react";

export type TextUrlSegment = { kind: "text"; raw: string } | { kind: "url"; raw: string; href: string };

function trimUrlForHref(matched: string): string {
  return matched.replace(/[)\].,;:!?'"]+$/g, "");
}

/**
 * Split post body into plain text and URL tokens for safe linkification (no raw HTML in source).
 */
export function splitTextWithUrls(text: string): TextUrlSegment[] {
  const s = text ?? "";
  if (!s) return [{ kind: "text", raw: "" }];
  const out: TextUrlSegment[] = [];
  let last = 0;
  const urlRe = /\bhttps?:\/\/[^\s<>"']+/gi;
  for (const m of s.matchAll(urlRe)) {
    const mi = m.index ?? 0;
    if (mi > last) {
      out.push({ kind: "text", raw: s.slice(last, mi) });
    }
    const raw = m[0];
    out.push({ kind: "url", raw, href: trimUrlForHref(raw) });
    last = mi + raw.length;
  }
  if (last < s.length) {
    out.push({ kind: "text", raw: s.slice(last) });
  }
  if (out.length === 0) {
    return [{ kind: "text", raw: s }];
  }
  return out;
}

const linkClass =
  "break-all font-medium text-sky-700 underline decoration-sky-700/40 underline-offset-[3px] hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300";

/**
 * Renders post copy with `http(s)://…` spans as anchors opening in a new tab.
 */
export function LinkifiedText({
  text,
  className,
  linkClassName,
}: {
  text: string;
  /** Applied to the wrapping span (e.g. body typography + whitespace). */
  className?: string;
  /** Optional override for link styling. */
  linkClassName?: string;
}): ReactNode {
  const segments = useMemo(() => splitTextWithUrls(text ?? ""), [text]);
  const aCls = linkClassName ?? linkClass;

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.kind === "url" ? (
          <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer" className={aCls}>
            {seg.raw}
          </a>
        ) : (
          <span key={i}>{seg.raw}</span>
        ),
      )}
    </span>
  );
}
