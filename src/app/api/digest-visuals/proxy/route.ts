import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const USER_AGENT = "CommunitySignalDigest/1.0 (digest-visual-proxy)";

function isLikelyImageResponse(ct: string | null): boolean {
  if (!ct) return true;
  const c = ct.toLowerCase();
  if (c.includes("text/html") || c.includes("application/json") || c.includes("text/plain")) {
    return false;
  }
  return c.startsWith("image/") || c.includes("octet-stream") || c.includes("binary");
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url");
  if (!raw?.trim()) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Invalid url scheme" }, { status: 400 });
  }

  try {
    const res = await fetch(target.toString(), {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Upstream returned ${res.status}` }, { status: 502 });
    }
    const ct = res.headers.get("content-type");
    if (ct && !isLikelyImageResponse(ct)) {
      return NextResponse.json({ error: "URL is not an image" }, { status: 400 });
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 12_000_000) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }
    const outType =
      ct && ct.toLowerCase().startsWith("image/") ? ct.split(";")[0]!.trim() : "image/jpeg";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": outType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch image" }, { status: 502 });
  }
}
