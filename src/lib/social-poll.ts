/** X API v2 poll on POST /2/tweets (not available on Bluesky or X replies). */

export const X_POLL_OPTION_MAX_LEN = 25;
export const X_POLL_MIN_OPTIONS = 2;
export const X_POLL_MAX_OPTIONS = 4;
export const X_POLL_MIN_DURATION_MINUTES = 5;
export const X_POLL_MAX_DURATION_MINUTES = 10_080;

export type SocialPollDraft = {
  options: string[];
  durationMinutes: number;
};

export const POLL_DURATION_PRESETS: { label: string; minutes: number }[] = [
  { label: "1 hour", minutes: 60 },
  { label: "6 hours", minutes: 360 },
  { label: "1 day", minutes: 1440 },
  { label: "3 days", minutes: 4320 },
  { label: "7 days", minutes: 10_080 },
];

export function emptyPollDraft(): SocialPollDraft {
  return { options: ["", ""], durationMinutes: 1440 };
}

export function validateSocialPoll(draft: SocialPollDraft): { ok: true; options: string[] } | { ok: false; error: string } {
  const options = draft.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < X_POLL_MIN_OPTIONS) {
    return { ok: false, error: `Add at least ${X_POLL_MIN_OPTIONS} poll choices.` };
  }
  if (options.length > X_POLL_MAX_OPTIONS) {
    return { ok: false, error: `At most ${X_POLL_MAX_OPTIONS} choices.` };
  }
  const seen = new Set<string>();
  for (const opt of options) {
    if (opt.length > X_POLL_OPTION_MAX_LEN) {
      return { ok: false, error: `Each choice must be ${X_POLL_OPTION_MAX_LEN} characters or fewer.` };
    }
    const key = opt.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: "Poll choices must be unique." };
    }
    seen.add(key);
  }
  const duration = Math.round(draft.durationMinutes);
  if (!Number.isFinite(duration) || duration < X_POLL_MIN_DURATION_MINUTES) {
    return { ok: false, error: `Poll duration must be at least ${X_POLL_MIN_DURATION_MINUTES} minutes.` };
  }
  if (duration > X_POLL_MAX_DURATION_MINUTES) {
    return { ok: false, error: `Poll duration cannot exceed ${X_POLL_MAX_DURATION_MINUTES} minutes (7 days).` };
  }
  return { ok: true, options };
}

export function parsePollFromFormData(form: FormData): SocialPollDraft | null {
  const raw = form.get("pollOptions");
  if (raw == null || String(raw).trim() === "") return null;
  let options: unknown;
  try {
    options = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (!Array.isArray(options)) return null;
  const durationRaw = form.get("pollDurationMinutes");
  const durationMinutes = Number.parseInt(String(durationRaw ?? ""), 10);
  return {
    options: options.map((o) => String(o ?? "")),
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 1440,
  };
}

export function pollDraftFromJson(input: unknown): SocialPollDraft | null {
  if (!input || typeof input !== "object") return null;
  const o = input as { options?: unknown; durationMinutes?: unknown };
  if (!Array.isArray(o.options)) return null;
  const durationMinutes = Number(o.durationMinutes);
  return {
    options: o.options.map((x) => String(x ?? "")),
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 1440,
  };
}
