/** Build Bluesky richtext mention facets (UTF-8 byte indices) for @handle segments in post text. */

const BSKY_HOST = "https://bsky.social";

/** Match @handle segments plausible on Bluesky (handle chars after @). */
const MENTION_RE = /@([a-zA-Z0-9][a-zA-Z0-9.-]*)/g;

function utf8ByteSliceRange(text: string, charStart: number, charEnd: number): { byteStart: number; byteEnd: number } {
  const enc = new TextEncoder();
  const before = text.slice(0, charStart);
  const segment = text.slice(charStart, charEnd);
  const byteStart = enc.encode(before).length;
  const byteEnd = byteStart + enc.encode(segment).length;
  return { byteStart, byteEnd };
}

const didCache = new Map<string, string | null>();

export async function blueskyResolveHandleDid(handle: string): Promise<string | null> {
  const clean = handle.replace(/^@+/, "").trim().toLowerCase();
  if (!clean) return null;
  if (didCache.has(clean)) return didCache.get(clean) ?? null;
  const res = await fetch(
    `${BSKY_HOST}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(clean)}`,
    { cache: "no-store" },
  );
  const raw = (await res.json().catch(() => ({}))) as { did?: string };
  const did = res.ok && typeof raw.did === "string" && raw.did.startsWith("did:") ? raw.did : null;
  didCache.set(clean, did);
  return did;
}

export type BlueskyFacet = {
  index: { byteStart: number; byteEnd: number };
  features: { $type: "app.bsky.richtext.facet#mention"; did: string }[];
};

/**
 * Returns facets for `@handle` segments in `text` that resolve to a DID.
 */
export async function buildBlueskyMentionFacets(text: string): Promise<BlueskyFacet[] | undefined> {
  const raw: { start: number; end: number; handle: string }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    const full = m[0]!;
    raw.push({ start: m.index, end: m.index + full.length, handle: m[1]! });
  }
  if (raw.length === 0) return undefined;

  raw.sort((a, b) => a.start - b.start);

  const facets: BlueskyFacet[] = [];
  let lastEnd = -1;
  for (const seg of raw) {
    if (seg.start < lastEnd) continue;
    const did = await blueskyResolveHandleDid(seg.handle);
    if (!did) continue;
    const { byteStart, byteEnd } = utf8ByteSliceRange(text, seg.start, seg.end);
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#mention", did }],
    });
    lastEnd = seg.end;
  }

  return facets.length > 0 ? facets : undefined;
}
