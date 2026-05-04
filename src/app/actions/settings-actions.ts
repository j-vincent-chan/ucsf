"use server";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import {
  normalizedXCommunityHandleForApi,
  sanitizeWorkspaceSocialSettings,
  socialSettingsToJson,
  type WorkspaceSocialSettings,
} from "@/lib/workspace-social-settings";

function parseBlueskyListAtUri(raw: string): string | undefined {
  const t = raw.trim();
  if (!t.startsWith("at://") || t.length > 512) return undefined;
  if (!t.includes("/app.bsky.graph.list/")) return undefined;
  return t;
}
import { revalidatePath } from "next/cache";

function normalizeAuthEmail(raw: string): string {
  const t = raw.trim();
  const at = t.lastIndexOf("@");
  if (at <= 0) return t.toLowerCase();
  return `${t.slice(0, at).toLowerCase()}@${t.slice(at + 1).toLowerCase()}`;
}

export type ActionResult = { ok: boolean; message: string };

export async function updateDisplayNameAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const fullName = (formData.get("fullName") as string)?.trim() ?? "";
  if (fullName.length < 1) {
    return { ok: false, message: "Enter a display name." };
  }
  if (fullName.length > 200) {
    return { ok: false, message: "Display name is too long." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: "Display name saved." };
}

export async function updateWorkspaceAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const name = (formData.get("workspaceName") as string)?.trim() ?? "";
  if (name.length < 1) {
    return { ok: false, message: "Enter a workspace name." };
  }
  if (name.length > 120) {
    return { ok: false, message: "Workspace name is too long." };
  }

  const profile = await getProfile();
  if (!profile) return { ok: false, message: "Profile not found." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("communities")
    .update({ name })
    .eq("id", profile.community_id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: "Workspace name saved." };
}

export async function updateSocialSettingsAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile) return { ok: false, message: "Profile not found." };

  const xHandleRaw = ((formData.get("xHandle") as string) ?? "").trim();
  const xTwitterListIdRaw = ((formData.get("xTwitterListId") as string) ?? "").trim();
  const listDigitsOnly = xTwitterListIdRaw.replace(/\D/g, "");
  if (xTwitterListIdRaw.length > 0 && listDigitsOnly.length < 15) {
    return {
      ok: false,
      message:
        "Investigator List ID looks short or invalid — paste the long numeric ID from your X/Twitter List (usually 18–19 digits).",
    };
  }
  if (xHandleRaw.length > 0 && !normalizedXCommunityHandleForApi(xHandleRaw)) {
    return {
      ok: false,
      message: 'X profile: enter @handle, a plain username, or a link like https://x.com/yourprogram — not status URLs.',
    };
  }
  const bskyListRaw = ((formData.get("blueskyListAtUri") as string) ?? "").trim();
  if (bskyListRaw.length > 0 && !parseBlueskyListAtUri(bskyListRaw)) {
    return {
      ok: false,
      message:
        "Bluesky list: paste the at://…/app.bsky.graph.list/… URI (from the list’s “Copy link” on bsky.app).",
    };
  }

  const raw: WorkspaceSocialSettings = {
    xHandle: (formData.get("xHandle") as string) ?? "",
    xTwitterListId: (formData.get("xTwitterListId") as string) ?? "",
    blueskyListAtUri: (formData.get("blueskyListAtUri") as string) ?? "",
    blueskyHandle: (formData.get("blueskyHandle") as string) ?? "",
    instagramHandle: (formData.get("instagramHandle") as string) ?? "",
    linkedinUrl: (formData.get("linkedinUrl") as string) ?? "",
    notes: (formData.get("socialNotes") as string) ?? "",
  };
  const social_settings = socialSettingsToJson(sanitizeWorkspaceSocialSettings(raw));

  const supabase = await createClient();
  const { error } = await supabase
    .from("communities")
    .update({ social_settings })
    .eq("id", profile.community_id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/settings");
  revalidatePath("/social-signals");
  return { ok: true, message: "Social publishing fields saved." };
}

export async function changePasswordAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const currentPassword = (formData.get("currentPassword") as string) ?? "";
  const newPassword = (formData.get("newPassword") as string) ?? "";
  const confirmPassword = (formData.get("confirmPassword") as string) ?? "";

  if (newPassword.length < 8) {
    return { ok: false, message: "New password must be at least 8 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, message: "New password and confirmation do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, message: "Signed-in account has no email; password changes are not supported here." };
  }

  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: normalizeAuthEmail(user.email),
    password: currentPassword,
  });
  if (verifyErr) {
    return { ok: false, message: "Current password is incorrect." };
  }

  const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updErr) {
    return { ok: false, message: updErr.message };
  }

  const { error: rpcErr } = await supabase.rpc("set_own_profile_password", {
    p_plain: newPassword,
  });
  if (rpcErr) {
    return {
      ok: false,
      message: `Auth password updated, but syncing app login hash failed: ${rpcErr.message}`,
    };
  }

  revalidatePath("/settings");
  return { ok: true, message: "Password updated." };
}
