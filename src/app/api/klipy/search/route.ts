import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchKlipySearch } from "@/lib/klipy";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 24;

  const { items, configured, detail } = await fetchKlipySearch(q, Number.isFinite(limit) ? limit : 24);

  if (!configured) {
    return NextResponse.json(
      {
        error:
          "Klipy GIF search is not configured. Add KLIPY_API_KEY to server env (optional: KLIPY_LOCALE, e.g. en_US) and redeploy.",
        items: [],
      },
      { status: 503 },
    );
  }

  if (detail && items.length === 0) {
    return NextResponse.json({ error: detail, items: [] }, { status: 502 });
  }

  return NextResponse.json({ items });
}
