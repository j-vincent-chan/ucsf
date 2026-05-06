import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchGiphySearch } from "@/lib/giphy";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 24;

  const { items, configured, detail } = await fetchGiphySearch(q, Number.isFinite(limit) ? limit : 24);

  if (!configured) {
    return NextResponse.json(
      { error: "GIPHY search is not configured. Add GIPHY_API_KEY to server env and redeploy.", items: [] },
      { status: 503 },
    );
  }

  if (detail && items.length === 0) {
    return NextResponse.json({ error: detail, items: [] }, { status: 502 });
  }

  return NextResponse.json({ items });
}
