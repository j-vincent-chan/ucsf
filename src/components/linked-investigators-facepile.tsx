"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveTrackedEntityHeadshotSrc } from "@/lib/investigator-headshots";

export type InvestigatorFacepileEntry = {
  id: string;
  name: string;
  headshot_url?: string | null;
  headshot_storage_path?: string | null;
};

type Props = {
  investigators: InvestigatorFacepileEntry[];
  /** Avatars shown before the "+N" overflow (default 3). */
  maxVisible?: number;
  className?: string;
  /**
   * `card` — bordered panel (legacy “prominent” block).
   * `inline` — one tight row (avatars + overflow), for digest cards / reference rows.
   */
  variant?: "card" | "inline";
  /**
   * @deprecated Prefer `variant`. When set without `variant`, false maps to `inline`.
   */
  showCardChrome?: boolean;
};

/**
 * “Linked investigators”: circular headshots + optional overflow count.
 */
export function LinkedInvestigatorsFacepile({
  investigators,
  maxVisible = 3,
  className = "",
  variant: variantProp,
  showCardChrome,
}: Props) {
  const variant =
    variantProp ?? (showCardChrome === false ? "inline" : showCardChrome === true ? "card" : "card");

  const supabase = useMemo(() => createClient(), []);
  const resolved = useMemo(
    () =>
      investigators.map((inv) => ({
        id: inv.id,
        name: inv.name,
        src: resolveTrackedEntityHeadshotSrc(supabase, {
          headshot_storage_path: inv.headshot_storage_path ?? null,
          headshot_url: inv.headshot_url ?? null,
        }),
      })),
    [investigators, supabase],
  );

  if (resolved.length === 0) return null;

  const visible = resolved.slice(0, maxVisible);
  const overflow = resolved.length - visible.length;

  if (variant === "inline") {
    return (
      <div
        className={`flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 ${className}`.trim()}
        aria-label="Linked investigators"
      >
        <div className="flex items-center gap-1">
          {visible.map((inv) => (
            <div key={inv.id} title={inv.name}>
              {inv.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={inv.src}
                  alt=""
                  className="h-6 w-6 rounded-full border border-[color:var(--border)]/55 object-cover"
                />
              ) : (
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--border)]/55 bg-[color:var(--muted)]/45 text-[9px] font-semibold text-[color:var(--foreground)]"
                  aria-hidden
                >
                  {inv.name.trim().charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </div>
          ))}
        </div>
        {overflow > 0 ? (
          <span className="text-[10px] font-semibold tabular-nums text-[color:var(--muted-foreground)]">+{overflow}</span>
        ) : null}
      </div>
    );
  }

  const inner = (
    <>
      <p className="text-[11px] font-semibold leading-none text-[color:var(--foreground)]">Linked investigators</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          {visible.map((inv) => (
            <div key={inv.id} title={inv.name}>
              {inv.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={inv.src}
                  alt=""
                  className="h-8 w-8 rounded-full border border-[color:var(--border)]/60 object-cover shadow-sm sm:h-9 sm:w-9"
                />
              ) : (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--border)]/60 bg-[color:var(--muted)]/50 text-[11px] font-semibold text-[color:var(--foreground)] shadow-sm sm:h-9 sm:w-9"
                  aria-hidden
                >
                  {inv.name.trim().charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </div>
          ))}
        </div>
        {overflow > 0 ? (
          <span className="text-xs font-semibold tabular-nums text-[color:var(--muted-foreground)]">+{overflow}</span>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      className={`rounded-xl border border-[color:var(--border)]/60 bg-[color:var(--card)]/90 px-3 py-2.5 ${className}`.trim()}
    >
      {inner}
    </div>
  );
}
