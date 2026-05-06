import { NextResponse } from "next/server";
import { fetchLinkPreviewMeta, isLikelyPublicHttpArticleUrl } from "@/lib/fetch-link-preview-meta";
import { createClient } from "@/lib/supabase/server";

/**
 * Authenticated OG / Twitter card scrape for digest UI when "link preview" attachment is chosen.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url")?.trim() ?? "";
  if (!raw) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  if (!isLikelyPublicHttpArticleUrl(raw)) {
    return NextResponse.json({ error: "Invalid or disallowed URL" }, { status: 400 });
  }

  const meta = await fetchLinkPreviewMeta(raw);
  return NextResponse.json(meta, {
    headers: { "Cache-Control": "private, max-age=120" },
  });
}
