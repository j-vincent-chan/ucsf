"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import type { InvestigatorMentionOption } from "@/lib/investigator-mentions";
import { resolveInsertHandle } from "@/lib/investigator-mentions";
import { Textarea } from "@/components/ui/textarea";

export type InvestigatorMentionTextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "ref"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Bluesky-first digests default to Bluesky handles; scheduler drafts use the post platform. */
  mentionNetwork?: "bluesky" | "x";
};

function activeMentionQuery(text: string, cursor: number): { atIndex: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/@([^\s@]*)$/);
  if (!match || match.index === undefined) return null;
  return { atIndex: match.index, query: match[1] ?? "" };
}

export const InvestigatorMentionTextarea = forwardRef<HTMLTextAreaElement, InvestigatorMentionTextareaProps>(
  function InvestigatorMentionTextarea(
    {
      value,
      onChange,
      mentionNetwork = "bluesky",
      onKeyDown,
      onBlur,
      className = "",
      ...rest
    },
    ref,
  ) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement, []);

    const [pickerOpen, setPickerOpen] = useState(false);
    const [list, setList] = useState<InvestigatorMentionOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const abortRef = useRef<AbortController | null>(null);

    const fetchMentions = useCallback(async (q: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const url = `/api/investigators/mentions?q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: ac.signal });
        const data = (await res.json()) as {
          investigators?: InvestigatorMentionOption[];
          error?: string;
        };
        if (!res.ok) {
          setList([]);
          if (data.error) toast.error(data.error);
          return;
        }
        setList(data.investigators ?? []);
        setHighlight(0);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setList([]);
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      if (!pickerOpen) return;
      const t = window.setTimeout(() => {
        const el = innerRef.current;
        const cursor = el?.selectionStart ?? value.length;
        const q = activeMentionQuery(value, cursor)?.query ?? "";
        void fetchMentions(q);
      }, 200);
      return () => window.clearTimeout(t);
    }, [pickerOpen, value, fetchMentions]);

    const openPickerIfMention = useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      const cursor = el.selectionStart ?? value.length;
      const ctx = activeMentionQuery(value, cursor);
      if (ctx && cursor >= ctx.atIndex) {
        setPickerOpen(true);
      } else {
        setPickerOpen(false);
      }
    }, [value]);

    const insertHandle = useCallback(
      (opt: InvestigatorMentionOption) => {
        const el = innerRef.current;
        if (!el) return;
        const cursor = el.selectionStart ?? value.length;
        const ctx = activeMentionQuery(value, cursor);
        if (!ctx) {
          setPickerOpen(false);
          return;
        }
        const handle = resolveInsertHandle(opt, mentionNetwork);
        if (!handle) {
          toast.error("Add X / Bluesky handles for this person under Entities.");
          return;
        }
        const before = value.slice(0, ctx.atIndex);
        const after = value.slice(cursor);
        const insertion = `@${handle} `;
        const next = before + insertion + after;
        const caret = before.length + insertion.length;
        onChange(next);
        setPickerOpen(false);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(caret, caret);
        });
      },
      [value, onChange, mentionNetwork],
    );

    const onInternalKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (pickerOpen && list.length > 0) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(list.length - 1, h + 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(0, h - 1));
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const opt = list[highlight];
            if (opt) insertHandle(opt);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setPickerOpen(false);
            return;
          }
        }
        onKeyDown?.(e);
      },
      [pickerOpen, list, highlight, insertHandle, onKeyDown],
    );

    const pickerVisual = useMemo(() => {
      if (!pickerOpen) return null;
      return (
        <div
          className="absolute left-0 right-0 top-full z-[120] mt-1 overflow-hidden rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)] shadow-[0_12px_36px_-16px_rgba(38,24,17,0.45)]"
          role="listbox"
          aria-label="Investigator mentions"
        >
          <div className="border-b border-[color:var(--border)]/50 px-2 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Faculty @{mentionNetwork === "bluesky" ? "Bluesky" : "X"} (fallback to other if only one set)
            </p>
          </div>
          <div className="max-h-[min(14rem,40vh)] overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-2 text-xs text-[color:var(--muted-foreground)]">Loading…</p>
            ) : list.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[color:var(--muted-foreground)]">
                No matches — try another search or add handles on Entities.
              </p>
            ) : (
              list.map((opt, i) => {
                const bx = opt.bluesky_handle?.replace(/^@+/, "").trim();
                const xx = opt.x_handle?.replace(/^@+/, "").trim();
                const preview =
                  mentionNetwork === "bluesky"
                    ? bx
                      ? `@${bx}`
                      : xx
                        ? `@${xx} (X)`
                        : "—"
                    : xx
                      ? `@${xx}`
                      : bx
                        ? `@${bx} (Bluesky)`
                        : "—";
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors ${
                      i === highlight ? "bg-[color:var(--accent)]/14" : "hover:bg-[color:var(--muted)]/12"
                    }`}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      insertHandle(opt);
                    }}
                  >
                    <span className="font-medium text-[color:var(--foreground)]">{opt.name}</span>
                    <span className="text-[11px] text-[color:var(--muted-foreground)]">{preview}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      );
    }, [pickerOpen, loading, list, highlight, insertHandle, mentionNetwork]);

    return (
      <div className="relative">
        <Textarea
          ref={innerRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            requestAnimationFrame(openPickerIfMention);
          }}
          onKeyDown={onInternalKeyDown}
          onBlur={(ev) => {
            window.setTimeout(() => setPickerOpen(false), 150);
            onBlur?.(ev);
          }}
          onSelect={openPickerIfMention}
          className={className}
          {...rest}
        />
        {pickerVisual}
      </div>
    );
  },
);

InvestigatorMentionTextarea.displayName = "InvestigatorMentionTextarea";
