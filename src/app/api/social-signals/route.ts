import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchSocialFeed } from "@/lib/social-signals/aggregate";
import type { SocialFeedTab } from "@/lib/social-signals/types";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const tabParam = url.searchParams.get("tab");
  const tab: SocialFeedTab = tabParam === "mentions" ? "mentions" : "following";

  try {
    const data = await fetchSocialFeed(tab);
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load social feed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
