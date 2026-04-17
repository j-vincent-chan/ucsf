import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

type Body = { email?: string; password?: string };

function normalizeRpcUuid(data: unknown): string | null {
  if (typeof data === "string" && data.length > 0) return data;
  if (Array.isArray(data) && typeof data[0] === "string") return data[0];
  return null;
}

/** Supabase Auth treats emails case-insensitively; normalize for sign-in. */
function normalizeAuthEmail(raw: string): string {
  const t = raw.trim();
  const at = t.lastIndexOf("@");
  if (at <= 0) return t.toLowerCase();
  return `${t.slice(0, at).toLowerCase()}@${t.slice(at + 1).toLowerCase()}`;
}

/**
 * profiles.login_username + bcrypt → sync Auth password → session sign-in.
 * Returns true if the user is signed in afterward.
 */
async function tryProfilePasswordLogin(
  supabase: ReturnType<typeof createServerClient<Database>>,
  emailInput: string,
  password: string,
): Promise<{ ok: boolean; userId: string | null; fullName: string | null }> {
  const admin = tryCreateAdminClient();
  if (!admin) return { ok: false, userId: null, fullName: null };

  const { data: rpcData, error: rpcError } = await admin.rpc(
    "profile_password_matches",
    { p_username: emailInput, p_plain: password },
  );

  if (rpcError) {
    console.warn("profile_password_matches:", rpcError.message);
    return { ok: false, userId: null, fullName: null };
  }

  const profileUserId = normalizeRpcUuid(rpcData);
  if (!profileUserId) return { ok: false, userId: null, fullName: null };

  const { data: userData, error: getErr } = await admin.auth.admin.getUserById(
    profileUserId,
  );
  if (getErr || !userData.user?.email) {
    console.error("getUserById after profile match:", getErr?.message);
    return { ok: false, userId: null, fullName: null };
  }

  const authEmail = userData.user.email;
  const fullName =
    typeof userData.user.user_metadata?.full_name === "string"
      ? userData.user.user_metadata.full_name
      : null;
  const { error: updErr } = await admin.auth.admin.updateUserById(profileUserId, {
    password,
  });
  if (updErr) {
    console.error("sync auth password:", updErr.message);
  }

  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: normalizeAuthEmail(authEmail),
    password,
  });

  return {
    ok: !signErr,
    userId: !signErr ? profileUserId : null,
    fullName: !signErr ? fullName : null,
  };
}

/**
 * Some users may exist in auth.users but miss a matching public.profiles row
 * (e.g. accounts created before trigger/migrations were applied).
 * Backfill the profile to prevent dashboard redirects back to /login.
 */
async function ensureProfileForSignedInUser(
  userId: string,
  fullName: string | null,
): Promise<void> {
  const admin = tryCreateAdminClient();
  if (!admin) return;

  const { data: existing, error: exErr } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (exErr || existing) return;

  // Prefer ImmunoX default slug, then first available community.
  let communityId: string | null = null;
  const { data: immunox } = await admin
    .from("communities")
    .select("id")
    .eq("slug", "immunox")
    .maybeSingle();
  communityId = immunox?.id ?? null;
  if (!communityId) {
    const { data: first } = await admin
      .from("communities")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    communityId = first?.id ?? null;
  }
  if (!communityId) return;

  const { error: insErr } = await admin.from("profiles").insert({
    id: userId,
    full_name: fullName,
    role: "editor",
    community_id: communityId,
  });
  if (insErr) {
    console.error("ensureProfileForSignedInUser:", insErr.message);
  }
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!emailRaw || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const cookieStore = await cookies();
  let wroteAuthCookies = false;

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            if (name.includes("-auth-token")) wroteAuthCookies = true;
            cookieStore.set(name, value, options);
          });
        } catch (e) {
          console.error("login setAll cookies:", e);
        }
      },
    },
  });

  const authEmail = normalizeAuthEmail(emailRaw);
  // Prevent stale/invalid refresh tokens from causing immediate redirect loops.
  await supabase.auth.signOut().catch(() => null);

  let loggedIn = false;
  let signedInUserId: string | null = null;
  let signedInFullName: string | null = null;

  const primary = await supabase.auth.signInWithPassword({
    email: authEmail,
    password,
  });
  if (!primary.error) {
    loggedIn = true;
    signedInUserId = primary.data.user?.id ?? null;
    signedInFullName =
      typeof primary.data.user?.user_metadata?.full_name === "string"
        ? primary.data.user.user_metadata.full_name
        : null;
  } else {
    let lastError = primary.error.message;

    if (authEmail !== emailRaw) {
      const secondary = await supabase.auth.signInWithPassword({
        email: emailRaw,
        password,
      });
      if (!secondary.error) {
        loggedIn = true;
        signedInUserId = secondary.data.user?.id ?? null;
        signedInFullName =
          typeof secondary.data.user?.user_metadata?.full_name === "string"
            ? secondary.data.user.user_metadata.full_name
            : null;
      } else {
        lastError = secondary.error.message;
      }
    }

    if (!loggedIn) {
      const viaProfile = await tryProfilePasswordLogin(supabase, emailRaw, password);
      if (viaProfile.ok) {
        loggedIn = true;
        signedInUserId = viaProfile.userId;
        signedInFullName = viaProfile.fullName;
      } else {
        return NextResponse.json(
          { error: lastError || "Invalid login credentials" },
          { status: 401 },
        );
      }
    }
  }

  const hasAuthCookie = cookieStore
    .getAll()
    .some((c) => c.name.includes("-auth-token"));
  if (loggedIn && !wroteAuthCookies && !hasAuthCookie) {
    return NextResponse.json(
      { error: "Login succeeded but session cookie could not be set." },
      { status: 500 },
    );
  }

  if (signedInUserId) {
    await ensureProfileForSignedInUser(signedInUserId, signedInFullName);
  }

  return NextResponse.json({ ok: true });
}
