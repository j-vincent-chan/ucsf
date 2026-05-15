import { createClient } from "@/lib/supabase/server";
import type { ProfileRole } from "@/types/database";

const defaultBrandName = () =>
  process.env.NEXT_PUBLIC_APP_BRAND_NAME?.trim() || "Community Signal";
import { recentYearMonths } from "@/lib/digest-month";
import { AppShellClient } from "@/components/app-shell-client";

const digestMonths = recentYearMonths(10);

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: ProfileRole | null = null;
  let communityDisplayName = defaultBrandName();
  let platformAdmin = false;
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("role, community_id")
      .eq("id", user.id)
      .maybeSingle();
    role = prof?.role ?? null;
    platformAdmin = role === "admin" && (prof?.community_id === null || prof?.community_id === undefined);
    if (platformAdmin) {
      communityDisplayName = "Platform admin";
    } else if (prof?.community_id) {
      const { data: com } = await supabase
        .from("communities")
        .select("name")
        .eq("id", prof.community_id)
        .maybeSingle();
      const n = com?.name?.trim();
      if (typeof n === "string" && n.length > 0) {
        communityDisplayName = n;
      }
    }
  }

  return (
    <AppShellClient
      role={role}
      platformAdmin={platformAdmin}
      homeHref={platformAdmin ? "/admin/workspaces" : "/dashboard"}
      digestMonths={digestMonths}
      communityDisplayName={communityDisplayName}
      userEmail={user?.email ?? null}
    >
      {children}
    </AppShellClient>
  );
}
