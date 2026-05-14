"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EMOJI_BY_TAB,
  EMOJI_TAB_ORDER,
  RECENT_EMOJI_MAX,
  RECENT_EMOJI_STORAGE_KEY,
  type EmojiTabId,
} from "./emoji-picker-data";

function TabGlyph({ id, className = "" }: { id: EmojiTabId; className?: string }) {
  const cn = `h-5 w-5 shrink-0 ${className}`;
  switch (id) {
    case "recent":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 7v6l4 2" />
        </svg>
      );
    case "smileys":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M9 10h.01M15 10h.01M9.5 14a3.5 3 0 005 0" />
        </svg>
      );
    case "nature":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 3c3 3 4 6 4 9a4 4 0 11-8 0c0-3 1-6 4-9z" />
          <path strokeLinecap="round" d="M12 21v-6" />
        </svg>
      );
    case "food":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 11h16v2a5 5 0 01-5 5H9a5 5 0 01-5-5v-2z" />
          <path strokeLinecap="round" d="M8 11V8a4 4 0 018 0v3" />
        </svg>
      );
    case "activity":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 7v3l2 2" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "travel":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 17h18l-2-9H5l-2 9zM7 17v3M17 17v3" strokeLinecap="round" />
          <path d="M7 8l2-4h6l2 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "objects":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 18h6M10 22h4M12 3v1M8 14l-2 5h12l-2-5" strokeLinecap="round" />
          <path d="M12 4a5 5 0 015 5v5H7V9a5 5 0 015-5z" />
        </svg>
      );
    case "symbols":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path strokeLinecap="round" d="M8 9h8M8 15h5M10 5L6 19M15 5l4 14" />
        </svg>
      );
    case "flags":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M5 4v16M5 5l16-2v10l-16 2" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

export function EmojiTabPicker({
  open,
  onPick,
}: {
  open: boolean;
  onPick: (emoji: string) => void;
}) {
  const [tab, setTab] = useState<EmojiTabId>("smileys");
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(RECENT_EMOJI_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setRecent(parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_EMOJI_MAX));
        }
      }
    } catch {
      setRecent([]);
    }
    setTab("smileys");
  }, [open]);

  const gridEmojis = useMemo(() => {
    if (tab === "recent") return recent;
    return EMOJI_BY_TAB[tab];
  }, [tab, recent]);

  const sectionLabel = EMOJI_TAB_ORDER.find((t) => t.id === tab)?.label ?? "";

  function handlePick(em: string) {
    onPick(em);
    setRecent((prev) => {
      const next = [em, ...prev.filter((x) => x !== em)].slice(0, RECENT_EMOJI_MAX);
      try {
        localStorage.setItem(RECENT_EMOJI_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  }

  return (
    <div
      className="absolute bottom-full left-0 z-[70] mb-2 flex w-[min(100vw-2rem,420px)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)] shadow-lg"
      role="dialog"
      aria-label="Emoji picker"
    >
      <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[color:var(--border)]/55 px-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {EMOJI_TAB_ORDER.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-current={active ? "true" : undefined}
              onClick={() => setTab(id)}
              className={`flex min-w-[2.25rem] shrink-0 flex-col items-center justify-center rounded-t-lg px-2 py-2 transition-colors ${
                active
                  ? "bg-[color:var(--muted)]/25 text-sky-600 dark:text-sky-400"
                  : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/15 hover:text-[color:var(--foreground)]"
              }`}
            >
              <TabGlyph id={id} className={active ? "" : "opacity-85"} />
              {active ? (
                <span className="mt-1 h-0.5 w-6 rounded-full bg-sky-500 dark:bg-sky-400" aria-hidden />
              ) : (
                <span className="mt-1 h-0.5 w-6" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <p className="shrink-0 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
        {sectionLabel}
      </p>

      <div className="max-h-[min(300px,42vh)] min-h-[220px] overflow-y-auto overscroll-y-contain px-1.5 pb-2">
        {tab === "recent" && recent.length === 0 ? (
          <p className="flex min-h-[200px] items-center justify-center px-4 text-center text-sm text-[color:var(--muted-foreground)]">
            Tap any emoji to save recents here — same idea as X / Bluesky.
          </p>
        ) : (
          <div className="emoji-picker-glyphs grid grid-cols-6 gap-px sm:grid-cols-7">
            {gridEmojis.map((em, i) => (
              <button
                key={`${tab}-${i}-${em}`}
                type="button"
                className="flex aspect-square w-full min-h-0 min-w-0 items-center justify-center rounded-md p-0 text-[1.85rem] leading-none hover:bg-[color:var(--muted)]/35 sm:text-[2rem]"
                onClick={() => handlePick(em)}
              >
                <span className="pointer-events-none inline-block overflow-visible">{em}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
