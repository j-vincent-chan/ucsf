import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const socialPostBookmarkSchema = z
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

const postBodySchema = z.object({
  post: socialPostBookmarkSchema,
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("social_signal_bookmarks")
    .select("post_id, post, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true as const,
    items: data ?? [],
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const post = parsed.data.post as Record<string, unknown>;
  const postId = String(post.id);

  const { error } = await supabase.from("social_signal_bookmarks").upsert(
    {
      user_id: user.id,
      post_id: postId,
      post: post as never,
    },
    { onConflict: "user_id,post_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, bookmarked: true as const });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const postId = url.searchParams.get("postId")?.trim();
  if (!postId) {
    return NextResponse.json({ error: "Missing postId" }, { status: 400 });
  }

  const { error } = await supabase
    .from("social_signal_bookmarks")
    .delete()
    .eq("user_id", user.id)
    .eq("post_id", postId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, bookmarked: false as const });
}
