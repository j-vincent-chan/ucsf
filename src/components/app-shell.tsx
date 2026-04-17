import Link from "next/link";
import { signOut } from "@/app/actions/auth-actions";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRole } from "@/types/database";

const defaultBrandName = () =>
  process.env.NEXT_PUBLIC_APP_BRAND_NAME?.trim() || "ImmunoX";
import { SignalLogo } from "@/components/signal-logo";
import { recentYearMonths } from "@/lib/digest-month";
import { SidebarNav } from "@/components/sidebar-nav";

const digestMonths = recentYearMonths(12);

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: ProfileRole | null = null;
  let communityDisplayName = defaultBrandName();
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("role, community_id")
      .eq("id", user.id)
      .maybeSingle();
    role = prof?.role ?? null;
    if (prof?.community_id) {
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
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(201,125,99,0.12),transparent_24%),linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),var(--background))] lg:flex">
      <aside className="border-b border-[color:var(--border)]/80 bg-[color:var(--background)]/92 lg:min-h-screen lg:w-80 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col p-5 lg:p-6">
          <Link
            href="/dashboard"
            className="surface-card mb-6 block shrink-0 rounded-[1.6rem] px-4 py-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
          >
            <SignalLogo />
          </Link>
          <div className="surface-subtle mb-4 rounded-[1.25rem] px-3 py-2.5">
            <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Workspace</p>
            <p className="mt-0.5 truncate text-sm font-medium text-[color:var(--foreground)]">
              {communityDisplayName}
            </p>
          </div>

          <SidebarNav role={role} digestMonths={digestMonths} workspaceLabel="Workspace" />

          <div className="surface-subtle mt-6 rounded-[1.25rem] px-3 py-3">
            <p className="truncate px-1 text-xs font-medium text-[color:var(--muted-foreground)]/90">
              {user?.email}
            </p>
            <p className="px-1 pt-1 text-[11px] text-[color:var(--muted-foreground)]/80">
              Need help? Visit Readme for workflow guidance.
            </p>
            <form action={signOut}>
              <button
                type="submit"
                className="mt-2 w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/80 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">{children}</main>
    </div>
  );
}
