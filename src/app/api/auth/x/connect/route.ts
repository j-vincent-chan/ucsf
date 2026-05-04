import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { sealXOAuthPending } from "@/lib/oauth-seal";
import { buildAuthorizeUrl, generatePkce, getXOAuthRedirectUri } from "@/lib/x-oauth";

const COOKIE = "x_oauth_pending";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  try {
    getXOAuthRedirectUri();
  } catch {
    return NextResponse.json(
      { error: "Set X_OAUTH_REDIRECT_URI or NEXT_PUBLIC_SITE_URL so the callback URL matches the X Developer Portal." },
      { status: 500 },
    );
  }

  const state = base64Url(randomBytes(24));
  const { codeVerifier, codeChallenge } = generatePkce();

  let sealed: string;
  try {
    sealed = sealXOAuthPending({ userId: user.id, codeVerifier, state });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth seal failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const url = buildAuthorizeUrl({ state, codeChallenge });

  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });
  return res;
}

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
