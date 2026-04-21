import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import type { ProfileWithCommunity } from "@/types/database";
import { redirect } from "next/navigation";

/** Resolves the current user via Supabase Auth (JWT verified server-side). Prefer over getSession(). */
export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function getProfile(): Promise<ProfileWithCommunity | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  let { data: row } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, community_id, created_at, updated_at, login_username",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (!row) {
    const admin = tryCreateAdminClient();
    if (admin) {
      const direct = await admin
        .from("profiles")
        .select(
          "id, full_name, role, community_id, created_at, updated_at, login_username",
        )
        .eq("id", user.id)
        .maybeSingle();
      if (direct.data) {
        row = direct.data;
      }
    }
  }
  if (!row) {
    const admin = tryCreateAdminClient();
    if (admin) {
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
      if (communityId) {
        const fullName =
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : null;
        const { error: insErr } = await admin.from("profiles").insert({
          id: user.id,
          full_name: fullName,
          role: "editor",
          community_id: communityId,
        });
        if (insErr) {
          console.error("getProfile auto-create profile:", insErr.message);
        } else {
          const refetch = await admin
            .from("profiles")
            .select(
              "id, full_name, role, community_id, created_at, updated_at, login_username",
            )
            .eq("id", user.id)
            .maybeSingle();
          row = refetch.data ?? null;
        }
      }
    }
  }
  if (!row) return null;
  let { data: com } = await supabase
    .from("communities")
    .select("name, slug")
    .eq("id", row.community_id)
    .maybeSingle();
  if (!com) {
    const admin = tryCreateAdminClient();
    if (admin) {
      const c = await admin
        .from("communities")
        .select("name, slug")
        .eq("id", row.community_id)
        .maybeSingle();
      com = c.data ?? null;
    }
  }
  return { ...row, community: com };
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireProfile() {
  const user = await requireUser();
  const profile = await getProfile();
  if (!profile) redirect("/login?reason=profile_missing");
  return { user, profile };
}

export async function requireAdmin() {
  const ctx = await requireProfile();
  if (ctx.profile.role !== "admin") {
    redirect("/dashboard");
  }
  return ctx;
}
