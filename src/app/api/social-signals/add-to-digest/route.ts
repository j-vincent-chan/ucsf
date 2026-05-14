import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatYearMonthLabel } from "@/lib/digest-month";

export const dynamic = "force-dynamic";

const socialPostSchema = z
  .object({
    id: z.string().min(3),
    platform: z.enum(["x", "bluesky"]),
    authorName: z.string(),
    authorHandle: z.string(),
    authorAvatarUrl: z.string().optional(),
    text: z.string(),
    url: z.string().min(4),
    postedAt: z.string(),
    mediaUrls: z.array(z.string()).optional(),
    repostedBy: z
      .object({
        displayName: z.string(),
        handle: z.string(),
      })
      .optional(),
    conversationId: z.string().optional(),
    replyCount: z.number().optional(),
    repostCount: z.number().optional(),
    likeCount: z.number().optional(),
    viewCount: z.number().optional(),
    bskyRecordCid: z.string().optional(),
    viewerReposted: z.boolean().optional(),
    bskyViewerRepostUri: z.string().optional(),
    viewerLiked: z.boolean().optional(),
    bskyViewerLikeUri: z.string().optional(),
  })
  .passthrough();

const bodySchema = z.object({
  post: socialPostSchema,
});

function titleFromPost(text: string, platform: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return `Social post (${platform})`;
  return t.length <= 180 ? t : `${t.slice(0, 179)}…`;
}

function digestMonthFromPostedAt(postedAtIso: string): string {
  const d = new Date(postedAtIso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const post = parsed.data.post;
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("community_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr || !profile?.community_id) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const communityId = profile.community_id;
  const digestMonth = digestMonthFromPostedAt(post.postedAt);
  if (!digestMonth) {
    return NextResponse.json({ error: "Invalid post date" }, { status: 400 });
  }

  let sourceDomain: string | null = null;
  try {
    sourceDomain = new URL(post.url).hostname;
  } catch {
    sourceDomain = null;
  }

  const { data: dupe } = await supabase
    .from("source_items")
    .select("id")
    .eq("community_id", communityId)
    .eq("source_url", post.url)
    .maybeSingle();

  if (dupe?.id) {
    return NextResponse.json({
      ok: true as const,
      duplicate: true as const,
      source_item_id: dupe.id,
      digestMonth,
      digestMonthLabel: formatYearMonthLabel(digestMonth),
    });
  }

  const summarySnippet = titleFromPost(post.text, post.platform);

  const { data: inserted, error: insErr } = await supabase
    .from("source_items")
    .insert({
      community_id: communityId,
      tracked_entity_id: null,
      source_type: "manual",
      title: titleFromPost(post.text, post.platform),
      source_url: post.url,
      source_domain: sourceDomain,
      published_at: post.postedAt,
      raw_text: post.text,
      raw_summary: summarySnippet.length > 360 ? `${summarySnippet.slice(0, 359)}…` : summarySnippet,
      submitted_by: user.id,
      status: "new",
      category: "community_update",
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? "Could not add to digest" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true as const,
    duplicate: false as const,
    source_item_id: inserted.id,
    digestMonth,
    digestMonthLabel: formatYearMonthLabel(digestMonth),
  });
}
