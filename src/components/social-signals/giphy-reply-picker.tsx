"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GiphyPick = { gifUrl: string; previewUrl: string };

type ApiItem = { id: string; title: string; previewUrl: string; gifUrl: string };

export function GiphyReplyPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (pick: GiphyPick) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<ApiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("limit", "24");
      const res = await fetch(`/api/giphy/search?${params}`, { method: "GET" });
      const data = (await res.json().catch(() => ({}))) as { items?: ApiItem[]; error?: string };
      if (!res.ok) {
        setItems([]);
        setError(typeof data.error === "string" ? data.error : "Could not load GIFs");
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load(debounced);
  }, [open, debounced, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
      setItems([]);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal
      aria-labelledby="giphy-picker-title"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close GIF search" onClick={onClose} />
      <div
        ref={wrapRef}
        className="relative z-[1] flex max-h-[min(520px,85dvh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[color:var(--border)]/80 bg-[color:var(--background)] shadow-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border)]/60 px-3 py-2">
          <h2 id="giphy-picker-title" className="text-sm font-semibold text-[color:var(--foreground)]">
            Search GIPHY
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs font-semibold text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="shrink-0 px-3 pt-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a GIF…"
            className="w-full rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-3 py-2 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)]"
            autoFocus
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
          {loading ? (
            <p className="py-8 text-center text-sm text-[color:var(--muted-foreground)]">Loading…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-700 dark:text-red-300">{error}</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--muted-foreground)]">No GIFs found.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="overflow-hidden rounded-lg border border-[color:var(--border)]/60 bg-[color:var(--muted)]/10 transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  onClick={() => {
                    onPick({ gifUrl: g.gifUrl, previewUrl: g.previewUrl });
                    onClose();
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote GIPHY preview */}
                  <img src={g.previewUrl} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="border-t border-[color:var(--border)]/50 px-3 py-2 text-[10px] text-[color:var(--muted-foreground)]">
          <a href="https://giphy.com" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            Powered by GIPHY
          </a>
        </p>
      </div>
    </div>
  );
}
