import type { Json } from "@/types/database";

const MAX_X_BEARER_LEN = 4096;
const MAX_BSKY_APP_PASSWORD_LEN = 512;

/** Stored on `communities.social_settings` — handles, list URIs, and optional per-workspace API credentials. */
export type WorkspaceSocialSettings = {
  xHandle?: string;
  /** Numeric Twitter/X List ID — members’ posts surface under Investigators & Others (with bearer token). */
  xTwitterListId?: string;
  /** X API v2 Bearer token for this workspace (Settings → Social publishing). */
  xBearerToken?: string;
  /** Bluesky list AT URI for Social Signals → Investigators tab (`at://did:plc:…/app.bsky.graph.list/…`). */
  blueskyListAtUri?: string;
  blueskyHandle?: string;
  /** Bluesky app password for this workspace (Settings → Social publishing). */
  blueskyAppPassword?: string;
  instagramHandle?: string;
  linkedinUrl?: string;
  notes?: string;
};

/** Feed + credential bundle for server-side Social Signals (never send to the browser). */
export type SocialFeedWorkspaceConfig = {
  communityHandle?: string;
  listId?: string;
  blueskyListAtUri?: string;
  xBearerToken?: string;
  /** Login identifier (handle or email) paired with {@link WorkspaceSocialSettings.blueskyAppPassword}. */
  blueskyIdentifier?: string;
  blueskyAppPassword?: string;
};

const STR_KEYS = ["xHandle", "blueskyHandle", "instagramHandle", "linkedinUrl", "notes"] as const;

function parseTwitterListId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 15) return undefined;
  return digits.slice(0, 22);
}

/** Handle (no @) for X API mention search / profile lookup. */
export function normalizedXCommunityHandleForApi(raw?: string): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length < 1) return undefined;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      if (
        u.hostname === "twitter.com" ||
        u.hostname === "www.twitter.com" ||
        u.hostname === "x.com" ||
        u.hostname === "www.x.com"
      ) {
        const path = u.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
        const candidate = path[0];
        if (
          candidate &&
          !/^(status|intent|share|home|explore|i|settings|messages)$/i.test(candidate)
        ) {
          return decodeURIComponent(candidate).replace(/^@+/, "");
        }
      }
      return undefined;
    }
    if (/^(twitter|x)\.com\//i.test(trimmed)) {
      return normalizedXCommunityHandleForApi(`https://${trimmed}`);
    }
  } catch {
    /* fall through */
  }

  const noAt = trimmed.replace(/^@+/, "");
  const first = noAt.split("/")[0]?.split("?")[0];
  if (!first || first.length < 1) return undefined;
  if (!/^[A-Za-z0-9_]{1,30}$/.test(first)) return undefined;
  return first;
}

function parseSecretField(raw: unknown, maxLen: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (t.length < 1) return undefined;
  return t.slice(0, maxLen);
}

/** Bluesky app-password session inputs when both handle and password are stored for this workspace. */
export function workspaceBlueskyAppCredentials(
  settings: WorkspaceSocialSettings,
): { identifier: string; appPassword: string } | null {
  const appPassword = settings.blueskyAppPassword?.trim();
  const handleRaw = settings.blueskyHandle?.trim().replace(/^@+/, "").split("/")[0]?.trim();
  if (!appPassword || !handleRaw) return null;
  return { identifier: handleRaw.slice(0, 320), appPassword: appPassword.slice(0, MAX_BSKY_APP_PASSWORD_LEN) };
}

export function stripWorkspaceSocialSecretsForClient(s: WorkspaceSocialSettings): WorkspaceSocialSettings {
  const { xBearerToken: _x, blueskyAppPassword: _b, ...rest } = s;
  return rest;
}

/** Resolved X feed config for Social Signals ingest (Bearer from workspace or env). */
export function socialFeedXFromWorkspace(settings: WorkspaceSocialSettings): {
  communityHandle?: string;
  listId?: string;
} {
  const communityHandle = normalizedXCommunityHandleForApi(settings.xHandle);
  const listId = settings.xTwitterListId ? settings.xTwitterListId.replace(/\D/g, "").slice(0, 22) : undefined;
  return {
    communityHandle: communityHandle || undefined,
    listId: listId && listId.length >= 15 ? listId : undefined,
  };
}

function parseBlueskyListAtUri(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t.startsWith("at://") || t.length > 512) return undefined;
  if (!t.includes("/app.bsky.graph.list/")) return undefined;
  return t;
}

/** Workspace-driven ingest targets (handles & list URIs only — use {@link socialFeedWorkspaceConfigFromSettings} for API keys). */
export function socialFeedIngestFromWorkspace(settings: WorkspaceSocialSettings): {
  communityHandle?: string;
  listId?: string;
  blueskyListAtUri?: string;
} {
  const x = socialFeedXFromWorkspace(settings);
  return {
    ...x,
    blueskyListAtUri: parseBlueskyListAtUri(settings.blueskyListAtUri),
  };
}

/** Full server config for Social Signals fetch (workspace credentials only — no deployment env fallback). */
export function socialFeedWorkspaceConfigFromSettings(settings: WorkspaceSocialSettings): SocialFeedWorkspaceConfig {
  const base = socialFeedIngestFromWorkspace(settings);
  const bearer = parseSecretField(settings.xBearerToken, MAX_X_BEARER_LEN);
  const bsky = workspaceBlueskyAppCredentials(settings);
  return {
    ...base,
    ...(bearer ? { xBearerToken: bearer } : {}),
    ...(bsky ? { blueskyIdentifier: bsky.identifier, blueskyAppPassword: bsky.appPassword } : {}),
  };
}

export function parseWorkspaceSocialSettings(raw: Json | null | undefined): WorkspaceSocialSettings {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: WorkspaceSocialSettings = {};
  for (const k of STR_KEYS) {
    const v = o[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t.length > 0) out[k] = t.slice(0, 500);
    }
  }
  const listId = parseTwitterListId(o.xTwitterListId);
  if (listId) out.xTwitterListId = listId;
  const bskyList = parseBlueskyListAtUri(o.blueskyListAtUri);
  if (bskyList) out.blueskyListAtUri = bskyList;
  const xBearer = parseSecretField(o.xBearerToken, MAX_X_BEARER_LEN);
  if (xBearer) out.xBearerToken = xBearer;
  const bskyPw = parseSecretField(o.blueskyAppPassword, MAX_BSKY_APP_PASSWORD_LEN);
  if (bskyPw) out.blueskyAppPassword = bskyPw;
  return out;
}

export function sanitizeWorkspaceSocialSettings(input: WorkspaceSocialSettings): WorkspaceSocialSettings {
  const out: WorkspaceSocialSettings = {};
  for (const k of STR_KEYS) {
    const v = input[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t.length > 0) out[k] = t.slice(0, 500);
    }
  }
  const lr = input.xTwitterListId;
  if (typeof lr === "string") {
    const listId = parseTwitterListId(lr);
    if (listId) out.xTwitterListId = listId;
  }
  const bskyIn = input.blueskyListAtUri;
  if (typeof bskyIn === "string") {
    const bskyList = parseBlueskyListAtUri(bskyIn);
    if (bskyList) out.blueskyListAtUri = bskyList;
  }
  const xb = parseSecretField(input.xBearerToken, MAX_X_BEARER_LEN);
  if (xb) out.xBearerToken = xb;
  const bp = parseSecretField(input.blueskyAppPassword, MAX_BSKY_APP_PASSWORD_LEN);
  if (bp) out.blueskyAppPassword = bp;
  return out;
}

export function socialSettingsToJson(s: WorkspaceSocialSettings): Json {
  return sanitizeWorkspaceSocialSettings(s) as unknown as Json;
}
