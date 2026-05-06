import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import type {
  DigestCoverStore,
  DigestVisualBundle,
  DigestVisualCandidate,
  DigestVisualChannelStyle,
  DigestVisualOriginalSnapshot,
} from "@/lib/digest-visual-types";
import { DIGEST_VISUAL_CHANNEL_STYLES } from "@/lib/digest-visual-types";

const BUCKET = "digest-visuals";

function supabasePublicUrlBase(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}/storage/v1/object/public/${BUCKET}/` : null;
}

/** True if this URL already points at our digest-visuals bucket (skip re-upload). */
export function isDigestVisualsStoragePublicUrl(url: string): boolean {
  const prefix = supabasePublicUrlBase();
  return Boolean(prefix && url.startsWith(prefix));
}

function mimeToExt(mime: string): string {
  const m = mime.trim().toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/gif") return "gif";
  if (m === "image/webp") return "webp";
  return "bin";
}

async function uploadInlineBytes(
  storageClient: SupabaseClient<Database>,
  ctx: { sourceItemId: string; communityId: string },
  fileName: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const path = `${ctx.communityId}/${ctx.sourceItemId}/${fileName}`;
  const { error } = await storageClient.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(error.message ?? "Storage upload failed");
  }
  const { data } = storageClient.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function offloadOriginalSnapshot(
  storageClient: SupabaseClient<Database>,
  ctx: { sourceItemId: string; communityId: string },
  candidateId: string,
  snap: DigestVisualOriginalSnapshot | undefined,
): Promise<DigestVisualOriginalSnapshot | undefined> {
  if (!snap) return snap;
  if (snap.kind === "url" && snap.url?.trim() && isDigestVisualsStoragePublicUrl(snap.url.trim())) {
    return snap;
  }
  if (snap.kind !== "inline" || !snap.base64 || !snap.mime) return snap;
  const bytes = Buffer.from(snap.base64, "base64");
  if (bytes.length === 0) return snap;
  const ext = mimeToExt(snap.mime);
  const url = await uploadInlineBytes(
    storageClient,
    ctx,
    `${candidateId}-orig.${ext}`,
    bytes,
    snap.mime.trim().toLowerCase().replace("image/jpg", "image/jpeg"),
  );
  return { kind: "url", url };
}

async function offloadCandidate(
  storageClient: SupabaseClient<Database>,
  ctx: { sourceItemId: string; communityId: string },
  c: DigestVisualCandidate,
): Promise<DigestVisualCandidate> {
  let next = { ...c };

  if (next.kind === "inline" && next.base64 && next.mime) {
    const bytes = Buffer.from(next.base64, "base64");
    if (bytes.length > 0) {
      const ext = mimeToExt(next.mime);
      const mime = next.mime.trim().toLowerCase().replace("image/jpg", "image/jpeg");
      const url = await uploadInlineBytes(storageClient, ctx, `${next.id}.${ext}`, bytes, mime);
      next = {
        ...next,
        kind: "url",
        url,
        mime: undefined,
        base64: undefined,
      };
    }
  }

  if (next.editOriginal) {
    const eo = await offloadOriginalSnapshot(storageClient, ctx, next.id, next.editOriginal);
    if (eo !== next.editOriginal) {
      next = { ...next, editOriginal: eo };
    }
  }

  return next;
}

async function offloadDigestVisualBundle(
  storageClient: SupabaseClient<Database>,
  bundle: DigestVisualBundle,
  ctx: { sourceItemId: string; communityId: string },
): Promise<DigestVisualBundle> {
  const candidates: DigestVisualCandidate[] = [];
  for (const c of bundle.candidates) {
    candidates.push(await offloadCandidate(storageClient, ctx, c));
  }
  return { ...bundle, candidates };
}

/**
 * Before persisting `digest_cover`, upload inline base64 pixels to Storage and replace candidates with `kind: "url"`.
 * Leaves external URLs and legacy rows unchanged; idempotent for candidates already using our public Storage URLs.
 *
 * Uses the service-role client when `SUPABASE_SERVICE_ROLE_KEY` is set so uploads succeed regardless of
 * storage.objects RLS (the API route has already verified the user). Falls back to the session client for local dev.
 */
export async function offloadDigestCoverStoreInlineImages(
  supabase: SupabaseClient<Database>,
  store: DigestCoverStore,
  ctx: { sourceItemId: string; communityId: string },
): Promise<DigestCoverStore> {
  const storageClient = tryCreateAdminClient() ?? supabase;
  const fallback = store.fallback
    ? await offloadDigestVisualBundle(storageClient, store.fallback, ctx)
    : null;
  const channels: Partial<Record<DigestVisualChannelStyle, DigestVisualBundle>> = {};
  for (const st of DIGEST_VISUAL_CHANNEL_STYLES) {
    const b = store.channels[st];
    if (b) channels[st] = await offloadDigestVisualBundle(storageClient, b, ctx);
  }
  return { v: 3, fallback, channels };
}
