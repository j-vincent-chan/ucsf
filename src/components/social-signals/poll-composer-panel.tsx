"use client";

import {
  POLL_DURATION_PRESETS,
  X_POLL_MAX_OPTIONS,
  X_POLL_OPTION_MAX_LEN,
  type SocialPollDraft,
} from "@/lib/social-poll";

export function PollComposerPanel({
  draft,
  onChange,
  onRemove,
  disabled = false,
  platformNote,
}: {
  draft: SocialPollDraft;
  onChange: (next: SocialPollDraft) => void;
  onRemove: () => void;
  disabled?: boolean;
  /** e.g. "X only" */
  platformNote?: string;
}) {
  const setOption = (index: number, value: string) => {
    const options = [...draft.options];
    options[index] = value.slice(0, X_POLL_OPTION_MAX_LEN);
    onChange({ ...draft, options });
  };

  const addOption = () => {
    if (draft.options.length >= X_POLL_MAX_OPTIONS) return;
    onChange({ ...draft, options: [...draft.options, ""] });
  };

  const removeOption = (index: number) => {
    if (draft.options.length <= 2) return;
    onChange({ ...draft, options: draft.options.filter((_, i) => i !== index) });
  };

  return (
    <div className="mt-2 rounded-xl border border-sky-500/25 bg-sky-500/5 px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[color:var(--foreground)]">
          Poll{platformNote ? ` · ${platformNote}` : ""}
        </p>
        <button
          type="button"
          disabled={disabled}
          className="text-xs font-medium text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
          onClick={onRemove}
        >
          Remove poll
        </button>
      </div>
      <ul className="space-y-2">
        {draft.options.map((opt, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-[color:var(--muted-foreground)]">
              {i + 1}
            </span>
            <input
              type="text"
              value={opt}
              disabled={disabled}
              maxLength={X_POLL_OPTION_MAX_LEN}
              placeholder={`Choice ${i + 1}`}
              className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)] px-2.5 py-1.5 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)]/70"
              onChange={(e) => setOption(i, e.target.value)}
            />
            {draft.options.length > 2 ? (
              <button
                type="button"
                disabled={disabled}
                className="shrink-0 rounded-full p-1 text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/30"
                aria-label={`Remove choice ${i + 1}`}
                onClick={() => removeOption(i)}
              >
                ×
              </button>
            ) : (
              <span className="w-6 shrink-0" aria-hidden />
            )}
          </li>
        ))}
      </ul>
      {draft.options.length < X_POLL_MAX_OPTIONS ? (
        <button
          type="button"
          disabled={disabled}
          className="mt-2 text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400"
          onClick={addOption}
        >
          Add choice
        </button>
      ) : null}
      <label className="mt-3 block text-xs font-medium text-[color:var(--muted-foreground)]">
        Duration
        <select
          disabled={disabled}
          value={draft.durationMinutes}
          className="mt-1 block w-full rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)] px-2.5 py-1.5 text-sm text-[color:var(--foreground)]"
          onChange={(e) =>
            onChange({ ...draft, durationMinutes: Number.parseInt(e.target.value, 10) })
          }
        >
          {POLL_DURATION_PRESETS.map((p) => (
            <option key={p.minutes} value={p.minutes}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
