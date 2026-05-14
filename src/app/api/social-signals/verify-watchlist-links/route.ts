import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildWatchlistMatchTerms,
  extractHttpUrlsFromText,
  fetchUrlPlainText,
  isAllowedPublicHttpUrl,
  plainTextMatchesWatchlistTerms,
} from "@/lib/social-signals/ai-companion/watchlist-link-verification";
import { extractDois } from "@/lib/social-signals/ai-companion/signal-features";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  posts: z.array(z.object({ id: z.string().min(1), text: z.string() })).max(80),
});

/** Dedupe URL fetches within one request. */
async function plainTextForUrlCached(url: string, cache: Map<string, string | null>): Promise<string | null> {
  const key = url.split("#")[0] ?? url;
  if (cache.has(key)) return cache.get(key) ?? null;
  const plain = await fetchUrlPlainText(key);
  cache.set(key, plain);
  return plain;
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

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("community_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr || !profile?.community_id) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: entities } = await supabase
    .from("tracked_entities")
    .select("name, last_name, x_handle, bluesky_handle")
    .eq("community_id", profile.community_id)
    .eq("active", true);

  const rows = entities ?? [];
  const terms = buildWatchlistMatchTerms(rows);
  const hasTerms =
    terms.lastNames.length > 0 || terms.namePhrases.length > 0 || terms.handleHints.length > 0;

  const verified: Record<string, boolean> = {};
  const urlCache = new Map<string, string | null>();

  for (const post of parsed.data.posts) {
    const httpUrls = extractHttpUrlsFromText(post.text);
    const doiUrls = extractDois(post.text).map((d) => `https://doi.org/${d}`);
    const urls = [...new Set([...httpUrls, ...doiUrls])];
    if (urls.length === 0) {
      verified[post.id] = false;
      continue;
    }
    if (!hasTerms) {
      verified[post.id] = false;
      continue;
    }

    let matched = false;
    const uniqueUrls = [...new Set(urls)].filter(isAllowedPublicHttpUrl).slice(0, 6);
    for (const url of uniqueUrls) {
      const plain = await plainTextForUrlCached(url, urlCache);
      if (plain && plainTextMatchesWatchlistTerms(plain, terms)) {
        matched = true;
        break;
      }
    }
    verified[post.id] = matched;
  }

  return NextResponse.json({ verified });
}
