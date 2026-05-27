import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { sealXOAuthPending } from "@/lib/oauth-seal";
import { stashXOAuthPendingByNonce } from "@/lib/x-oauth-pending-store";
import { buildAuthorizeUrl, generatePkce, resolveXOAuthRedirectUri } from "@/lib/x-oauth";

const COOKIE = "x_oauth_pending";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  const redirectUri = resolveXOAuthRedirectUri(request.nextUrl.origin);

  const nonce = base64Url(randomBytes(24));
  const { codeVerifier, codeChallenge } = generatePkce();

  /** Short `state` for X (500 char max); full payload in httpOnly cookie + dev memory stash. */
  let sealed: string;
  try {
    sealed = sealXOAuthPending({ userId: user.id, codeVerifier, nonce, redirectUri });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth seal failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  stashXOAuthPendingByNonce(nonce, sealed);

  const url = buildAuthorizeUrl({ state: nonce, codeChallenge, redirectUri });

  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE, sealed, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
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
