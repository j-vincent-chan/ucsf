import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";

type Body = { email?: string; password?: string };

function normalizeRpcUuid(data: unknown): string | null {
  if (typeof data === "string" && data.length > 0) return data;
  if (Array.isArray(data) && typeof data[0] === "string") return data[0];
  return null;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  /** Single response object so Supabase can attach Set-Cookie headers (Route Handler + cookies() is unreliable). */
  const res = NextResponse.json({ ok: true });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options),
        );
      },
    },
  });

  let authEmail = email;

  try {
    const admin = createAdminClient();
    const { data: rpcData, error: rpcError } = await admin.rpc(
      "profile_password_matches",
      { p_username: email, p_plain: password },
    );

    if (rpcError) {
      console.warn(
        "profile_password_matches skipped (run migrations or check DB):",
        rpcError.message,
      );
    } else {
      const profileUserId = normalizeRpcUuid(rpcData);
      if (profileUserId) {
        const { data: userData, error: getErr } = await admin.auth.admin.getUserById(
          profileUserId,
        );
        if (!getErr && userData.user?.email) {
          authEmail = userData.user.email;
          const { error: updErr } = await admin.auth.admin.updateUserById(profileUserId, {
            password,
          });
          if (updErr) {
            console.error("sync auth password:", updErr.message);
          }
        }
      }
    }
  } catch (e) {
    console.warn("profile login path skipped (e.g. missing SUPABASE_SERVICE_ROLE_KEY):", e);
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return res;
}
