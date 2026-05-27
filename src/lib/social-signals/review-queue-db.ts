/** Columns always present on `social_review_queue_posts`. */
export const REVIEW_QUEUE_SELECT_BASE =
  "id, source_item_id, platform, status, text, image_url, source_url, created_at, updated_at, scheduled_at";

/** Added in migration `20260527140000_social_review_queue_publish_meta.sql`. */
const REVIEW_QUEUE_PUBLISH_META = "published_at, publish_error";

function missingPublishMetaColumn(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("publish_error") ||
    (m.includes("published_at") && m.includes("social_review_queue"))
  );
}

/** Cached after first failed query in this runtime. */
let publishMetaAvailable: boolean | null = null;

export function reviewQueueSelectColumns(opts?: { sourceItemId?: boolean }): string {
  const base = opts?.sourceItemId
    ? `${REVIEW_QUEUE_SELECT_BASE}, source_item_id`
    : REVIEW_QUEUE_SELECT_BASE;
  if (publishMetaAvailable === false) return base;
  return `${base}, ${REVIEW_QUEUE_PUBLISH_META}`;
}

export type ReviewQueueQueryResult<T> = { data: T | null; error: { message: string } | null };

async function runReviewQueueQuery<T>(
  run: (select: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  select: string,
): Promise<ReviewQueueQueryResult<T>> {
  const res = await run(select);
  return { data: (res.data as T | null) ?? null, error: res.error };
}

export async function selectReviewQueuePosts<T>(
  run: (select: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  opts?: { sourceItemId?: boolean },
): Promise<ReviewQueueQueryResult<T>> {
  if (publishMetaAvailable === false) {
    return runReviewQueueQuery(run, reviewQueueSelectColumns(opts));
  }

  const full = reviewQueueSelectColumns(opts);
  const res = await runReviewQueueQuery<T>(run, full);
  if (!res.error) {
    publishMetaAvailable = true;
    return res;
  }
  if (!missingPublishMetaColumn(res.error.message)) {
    return res;
  }

  publishMetaAvailable = false;
  return runReviewQueueQuery(run, reviewQueueSelectColumns(opts));
}

export function stripPublishMetaFromPatch(patch: Record<string, unknown>): Record<string, unknown> {
  if (publishMetaAvailable !== false) return patch;
  const next = { ...patch };
  delete next.published_at;
  delete next.publish_error;
  return next;
}

export async function updateReviewQueuePost<T>(
  run: (patch: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  patch: Record<string, unknown>,
): Promise<ReviewQueueQueryResult<T>> {
  if (publishMetaAvailable === false) {
    const res = await run(stripPublishMetaFromPatch(patch));
    return { data: (res.data as T | null) ?? null, error: res.error };
  }

  let res = await run(patch);
  if (!res.error) {
    publishMetaAvailable = true;
    return { data: (res.data as T | null) ?? null, error: res.error };
  }
  if (!missingPublishMetaColumn(res.error.message)) {
    return { data: (res.data as T | null) ?? null, error: res.error };
  }

  publishMetaAvailable = false;
  const retry = await run(stripPublishMetaFromPatch(patch));
  return { data: (retry.data as T | null) ?? null, error: retry.error };
}
