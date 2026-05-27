export type SystemMessageKind = "info" | "success" | "warning" | "error";

export type SystemMessage = {
  id: string;
  at: string;
  kind: SystemMessageKind;
  title: string;
  detail?: string;
  source?: string;
};

type StoredLog = {
  messages: SystemMessage[];
  lastReadAt: string | null;
};

const MAX_MESSAGES = 200;
const STORAGE_PREFIX = "signal.systemMessages.v1";

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}:${scope}`;
}

function readRaw(scope: string): StoredLog {
  if (typeof window === "undefined") {
    return { messages: [], lastReadAt: null };
  }
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return { messages: [], lastReadAt: null };
    const parsed = JSON.parse(raw) as StoredLog;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      lastReadAt: typeof parsed.lastReadAt === "string" ? parsed.lastReadAt : null,
    };
  } catch {
    return { messages: [], lastReadAt: null };
  }
}

function writeRaw(scope: string, data: StoredLog): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(data));
  } catch {
    // quota or private mode
  }
}

export function loadSystemMessages(scope: string): SystemMessage[] {
  return readRaw(scope).messages;
}

export function loadLastReadAt(scope: string): string | null {
  return readRaw(scope).lastReadAt;
}

export function appendSystemMessage(
  scope: string,
  input: {
    kind: SystemMessageKind;
    title: string;
    detail?: string;
    source?: string;
  },
): SystemMessage {
  const entry: SystemMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    at: new Date().toISOString(),
    kind: input.kind,
    title: input.title.trim(),
    ...(input.detail?.trim() ? { detail: input.detail.trim() } : {}),
    ...(input.source?.trim() ? { source: input.source.trim() } : {}),
  };

  const stored = readRaw(scope);
  const messages = [entry, ...stored.messages].slice(0, MAX_MESSAGES);
  writeRaw(scope, { ...stored, messages });
  return entry;
}

export function markSystemMessagesRead(scope: string, atIso = new Date().toISOString()): void {
  const stored = readRaw(scope);
  writeRaw(scope, { ...stored, lastReadAt: atIso });
}

export function clearSystemMessages(scope: string): void {
  writeRaw(scope, { messages: [], lastReadAt: new Date().toISOString() });
}

export function countUnreadSystemMessages(scope: string): number {
  const stored = readRaw(scope);
  if (!stored.lastReadAt) return stored.messages.length;
  const t = Date.parse(stored.lastReadAt);
  if (Number.isNaN(t)) return stored.messages.length;
  return stored.messages.filter((m) => Date.parse(m.at) > t).length;
}
