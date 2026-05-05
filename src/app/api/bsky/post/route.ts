import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { publishBlueskyText } from "@/lib/social-signals/bluesky";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { fetchLinkPreviewMeta } from "@/lib/fetch-link-preview-meta";
import {
  resolvePublishSourceUrlForItem,
  resolvePublishVisualForSourceItem,
} from "@/lib/publish-source-visual";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(25_000),
  source_item_id: z.string().uuid().optional(),
  /** Default: attach digest visual when available; `source_link` uses article URL + OG preview instead. */
  attachment: z.enum(["digest_visual", "source_link"]).optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const attachment = parsed.data.attachment ?? "digest_visual";

  let image: { buffer: Buffer; mime: string } | undefined;
  let linkPreview: { uri: string; title: string; description: string } | undefined;
  let articleUrl: string | undefined;

  if (attachment === "source_link") {
    if (!parsed.data.source_item_id) {
      return NextResponse.json(
        { error: "source_item_id is required for link preview attachment." },
        { status: 400 },
      );
    }
    const admin = tryCreateAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Server misconfigured (service role)" }, { status: 500 });
    }
    const url = await resolvePublishSourceUrlForItem(admin, user.id, parsed.data.source_item_id);
    if (!url) {
      return NextResponse.json(
        { error: "No http(s) article URL on this item — add a source URL or use digest image." },
        { status: 400 },
      );
    }
    const meta = await fetchLinkPreviewMeta(url);
    linkPreview = { uri: url, title: meta.title, description: meta.description };
  } else if (parsed.data.source_item_id) {
    const admin = tryCreateAdminClient();
    if (admin) {
      const itemId = parsed.data.source_item_id;
      const [visual, urlForCaption] = await Promise.all([
        resolvePublishVisualForSourceItem(admin, user.id, itemId),
        resolvePublishSourceUrlForItem(admin, user.id, itemId),
      ]);
      if (visual) image = visual;
      if (urlForCaption) articleUrl = urlForCaption;
    }
  }

  try {
    const result = await publishBlueskyText(parsed.data.text, {
      ...(linkPreview ? { linkPreview } : {}),
      ...(image ? { image } : {}),
      ...(articleUrl ? { articleUrl } : {}),
    });
    return NextResponse.json(result);
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    const msg = e instanceof Error ? e.message : "Post failed";
    if (name === "BlueskyNotConfigured") {
      return NextResponse.json(
        { error: "Set BSKY_IDENTIFIER and BSKY_APP_PASSWORD on the server (workspace Bluesky account)." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
