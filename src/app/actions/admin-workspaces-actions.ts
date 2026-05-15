"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

export type AdminWorkspaceActionResult = { ok: boolean; message: string };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Supabase Auth treats emails case-insensitively; align with /api/auth/login. */
function normalizeAuthEmail(raw: string): string {
  const t = raw.trim();
  const at = t.lastIndexOf("@");
  if (at <= 0) return t.toLowerCase();
  return `${t.slice(0, at).toLowerCase()}@${t.slice(at + 1).toLowerCase()}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireSessionPlatformAdmin(): Promise<{ userId: string } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("profiles")
    .select("role, community_id")
    .eq("id", user.id)
    .maybeSingle();
  if (row?.role !== "admin" || row.community_id) return null;
  return { userId: user.id };
}

export async function adminCreateCommunityAction(
  _prev: AdminWorkspaceActionResult | undefined,
  formData: FormData,
): Promise<AdminWorkspaceActionResult> {
  const gate = await requireSessionPlatformAdmin();
  if (!gate) return { ok: false, message: "Platform administrator sign-in required (admin with no workspace)." };

  let slug = ((formData.get("slug") as string) ?? "").trim().toLowerCase();
  slug = slug.replace(/^e\.g\.[\s:,-]*/i, "").trim();
  const name = ((formData.get("name") as string) ?? "").trim();
  if (slug.length < 2 || slug.length > 48) {
    return { ok: false, message: "Slug must be 2–48 characters (lowercase letters, numbers, hyphens)." };
  }
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      message: "Slug: use lowercase letters, digits, and single hyphens between words (e.g. diabetes-center).",
    };
  }
  if (name.length < 1 || name.length > 120) {
    return { ok: false, message: "Workspace name must be 1–120 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("communities").insert({
    slug,
    name,
    social_settings: {},
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "That slug is already taken. Pick another." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/workspaces");
  revalidatePath("/settings");
  return { ok: true, message: `Workspace “${name}” (${slug}) created.` };
}

export async function adminAssignProfileCommunityAction(
  _prev: AdminWorkspaceActionResult | undefined,
  formData: FormData,
): Promise<AdminWorkspaceActionResult> {
  const gate = await requireSessionPlatformAdmin();
  if (!gate) return { ok: false, message: "Platform administrator sign-in required (admin with no workspace)." };

  const supabase = await createClient();

  const profileId = ((formData.get("profileId") as string) ?? "").trim();
  const communityId = ((formData.get("communityId") as string) ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(profileId) || !/^[0-9a-f-]{36}$/i.test(communityId)) {
    return { ok: false, message: "Invalid profile or workspace id." };
  }

  const { data: com, error: cErr } = await supabase
    .from("communities")
    .select("id, name, slug")
    .eq("id", communityId)
    .maybeSingle();
  if (cErr || !com) return { ok: false, message: "Workspace not found." };

  const { error } = await supabase.from("profiles").update({ community_id: communityId }).eq("id", profileId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/workspaces");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: `User assigned to ${com.name} (${com.slug}).` };
}

/**
 * Creates an Auth user; `handle_new_user` inserts `profiles` with tenant from `user_metadata.community_slug`.
 * Requires `SUPABASE_SERVICE_ROLE_KEY` (Auth Admin API is not available on the user session).
 */
export async function adminCreateUserAction(
  _prev: AdminWorkspaceActionResult | undefined,
  formData: FormData,
): Promise<AdminWorkspaceActionResult> {
  const gate = await requireSessionPlatformAdmin();
  if (!gate) return { ok: false, message: "Platform administrator sign-in required (admin with no workspace)." };

  const serviceRoleRaw = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const anonRaw = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (serviceRoleRaw && anonRaw && serviceRoleRaw === anonRaw) {
    return {
      ok: false,
      message:
        "SUPABASE_SERVICE_ROLE_KEY is identical to NEXT_PUBLIC_SUPABASE_ANON_KEY. Use the service_role secret from Supabase → Project Settings → API (not the anon / publishable key).",
    };
  }

  const admin = tryCreateAdminClient();
  if (!admin) {
    return {
      ok: false,
      message:
        "Creating users needs SUPABASE_SERVICE_ROLE_KEY on the server (Auth Admin). Add it to the deployment env or .env.local and restart.",
    };
  }

  const emailRaw = ((formData.get("email") as string) ?? "").trim();
  const email = normalizeAuthEmail(emailRaw);
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const fullNameRaw = ((formData.get("fullName") as string) ?? "").trim();
  const fullName = fullNameRaw.length > 0 ? fullNameRaw.slice(0, 200) : null;

  const communityId = ((formData.get("nuCommunityId") as string) ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(communityId)) {
    return { ok: false, message: "Choose a workspace." };
  }

  const roleRaw = ((formData.get("role") as string) ?? "").trim().toLowerCase();
  const role = roleRaw === "admin" ? "admin" : "editor";

  const password = (formData.get("password") as string) ?? "";
  const passwordConfirm = (formData.get("passwordConfirm") as string) ?? "";
  if (password.length < 10) {
    return { ok: false, message: "Password must be at least 10 characters." };
  }
  if (password !== passwordConfirm) {
    return { ok: false, message: "Password and confirmation do not match." };
  }

  // Resolve workspace with the admin session (RLS: communities_select_admin), not the service
  // client — service_role can be misconfigured or differ from the session project in rare setups.
  const supabase = await createClient();
  const { data: com, error: cErr } = await supabase
    .from("communities")
    .select("id, name, slug")
    .eq("id", communityId)
    .maybeSingle();
  if (cErr) {
    return { ok: false, message: cErr.message || "Could not verify workspace." };
  }
  if (!com) {
    return {
      ok: false,
      message:
        "Workspace not found for this selection. Pick a workspace from the list again (reload the page if the list looks stale).",
    };
  }

  const { data: created, error: uErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName ?? "",
      role,
      community_slug: com.slug,
    },
  });

  if (uErr || !created.user) {
    const msg = uErr?.message ?? "Could not create user.";
    if (/already|registered|exists/i.test(msg)) {
      return { ok: false, message: "That email is already registered." };
    }
    if (/valid bearer token|bearer token/i.test(msg)) {
      return {
        ok: false,
        message:
          "Supabase rejected the server API key for Auth Admin. Copy the service_role JWT from Supabase → Project Settings → API (legacy keys section if you see publishable/secret keys), set SUPABASE_SERVICE_ROLE_KEY with no quotes or extra spaces, redeploy, and ensure it is not the anon key.",
      };
    }
    return { ok: false, message: msg };
  }

  revalidatePath("/admin/workspaces");
  revalidatePath("/settings");
  return {
    ok: true,
    message: `User ${email} created in ${com.name} (${com.slug}) as ${role}. They can sign in with this email and the password you set.`,
  };
}
