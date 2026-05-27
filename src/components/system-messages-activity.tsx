"use client";

import { useEffect } from "react";
import { useSystemMessages } from "@/components/system-messages-context";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function kindStyles(kind: string): string {
  switch (kind) {
    case "error":
      return "border-red-500/35 bg-red-500/8 text-red-950 dark:text-red-100";
    case "warning":
      return "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100";
    case "info":
      return "border-[color:var(--border)]/60 bg-[color:var(--muted)]/20 text-[color:var(--foreground)]";
    default:
      return "border-emerald-600/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100";
  }
}

export function SystemMessagesActivity() {
  const { messages, markAllRead, clearAll, refresh, lastReadAt } = useSystemMessages();

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--foreground)]">Activity log</h2>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            System confirmations and feedback messages are saved here so you can read them anytime. New items also
            appear as toasts for about 18 seconds with a <span className="font-medium">View log</span> link.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            className="rounded-xl border border-[color:var(--border)]/70 px-3 py-1.5 text-xs font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--muted)]/20"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={messages.length === 0}
            className="rounded-xl border border-[color:var(--border)]/70 px-3 py-1.5 text-xs font-semibold text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] disabled:opacity-45"
          >
            Clear all
          </button>
        </div>
      </div>

      {lastReadAt ? (
        <p className="text-[11px] text-[color:var(--muted-foreground)]">
          Last viewed {formatWhen(lastReadAt)}
        </p>
      ) : null}

      {messages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--border)]/70 bg-[color:var(--card)]/60 px-6 py-14 text-center text-sm text-[color:var(--muted-foreground)]">
          No messages yet. Feedback on AI Companion suggestions and other system confirmations will show up here.
        </div>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${kindStyles(m.kind)}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{m.title}</p>
                <time className="shrink-0 text-[11px] opacity-75" dateTime={m.at}>
                  {formatWhen(m.at)}
                </time>
              </div>
              {m.detail ? <p className="mt-1 text-[13px] opacity-90">{m.detail}</p> : null}
              {m.source ? (
                <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">{m.source}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SystemMessagesLogDialog() {
  const { logOpen, setLogOpen, messages, markAllRead, clearAll } = useSystemMessages();

  useEffect(() => {
    if (logOpen) markAllRead();
  }, [logOpen, markAllRead]);

  if (!logOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal
      aria-labelledby="system-log-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default"
        aria-label="Close activity log"
        onClick={() => setLogOpen(false)}
      />
      <div className="relative z-10 flex max-h-[min(85vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[color:var(--border)]/80 bg-[color:var(--background)] shadow-xl">
        <header className="flex items-center justify-between gap-2 border-b border-[color:var(--border)]/55 px-4 py-3">
          <h2 id="system-log-title" className="text-base font-semibold text-[color:var(--foreground)]">
            Activity log
          </h2>
          <button
            type="button"
            onClick={() => setLogOpen(false)}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)]"
          >
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--muted-foreground)]">No messages saved yet.</p>
          ) : (
            <ul className="space-y-2">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-xl border px-3 py-2.5 text-sm leading-relaxed ${kindStyles(m.kind)}`}
                >
                  <p className="font-medium">{m.title}</p>
                  {m.detail ? <p className="mt-0.5 text-[12px] opacity-90">{m.detail}</p> : null}
                  <p className="mt-1 text-[10px] opacity-70">
                    {m.source ? `${m.source} · ` : ""}
                    {formatWhen(m.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-[color:var(--border)]/55 px-4 py-2.5">
          <button
            type="button"
            onClick={clearAll}
            disabled={messages.length === 0}
            className="rounded-xl border border-[color:var(--border)]/70 px-3 py-1.5 text-xs font-semibold disabled:opacity-45"
          >
            Clear all
          </button>
        </footer>
      </div>
    </div>
  );
}
