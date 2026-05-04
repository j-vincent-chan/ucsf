import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { unsealXOAuthPending } from "@/lib/oauth-seal";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { exchangeCodeForTokens } from "@/lib/x-oauth";

const COOKIE = "x_oauth_pending";

function siteOrigin(): string {
  const u = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (u) return u.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  const origin = siteOrigin();
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
  const sealed = cookieStore.get(COOKIE)?.value;
  if (!sealed) {
    return errRedirect("OAuth session expired. Try Connect again.");
  }

  const pending = unsealXOAuthPending(sealed);
  if (!pending || pending.state !== state) {
    return errRedirect("Invalid OAuth state. Try Connect again.");
  }

  let bundle;
  try {
    bundle = await exchangeCodeForTokens(code, pending.codeVerifier);
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
