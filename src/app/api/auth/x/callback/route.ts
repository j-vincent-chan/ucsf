import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { resolveXOAuthPending } from "@/lib/x-oauth-pending-resolve";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { exchangeCodeForTokens } from "@/lib/x-oauth";

const COOKIE = "x_oauth_pending";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const errRedirect = (msg: string) =>
    NextResponse.redirect(new URL(`/settings?x_oauth_error=${encodeURIComponent(msg)}`, origin));

  const sp = request.nextUrl.searchParams;
  const err = sp.get("error");
  const errDesc = sp.get("error_description");
  if (err) {
    const msg = errDesc?.trim() || err;
    return errRedirect(msg);
  }

  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) {
    return errRedirect("Missing authorization code or state.");
  }

  const cookieStore = await cookies();
  const sealedFromCookie = cookieStore.get(COOKIE)?.value;
  const { pending, error: pendingErr } = resolveXOAuthPending(state, sealedFromCookie);
  if (!pending || pendingErr) {
    return errRedirect(pendingErr ?? "OAuth session expired. Try Connect again.");
  }

  let bundle;
  try {
    bundle = await exchangeCodeForTokens(code, pending.codeVerifier, pending.redirectUri);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token exchange failed";
    return errRedirect(msg);
  }

  const admin = tryCreateAdminClient();
  if (!admin) {
    return errRedirect("Server missing SUPABASE_SERVICE_ROLE_KEY; cannot save tokens.");
  }

  const { error: upErr } = await admin
    .from("profiles")
    .update({
      x_oauth: JSON.parse(JSON.stringify(bundle)) as import("@/types/database").Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pending.userId);

  if (upErr) {
    console.error("x_oauth profile update:", upErr.message);
    return errRedirect("Could not save X connection. Check database migration (profiles.x_oauth).");
  }

  const ok = NextResponse.redirect(new URL("/settings?x_oauth=connected", origin));
  ok.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return ok;
}
