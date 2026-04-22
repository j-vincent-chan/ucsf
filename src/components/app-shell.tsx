import Link from "next/link";
import { signOut } from "@/app/actions/auth-actions";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRole } from "@/types/database";

const defaultBrandName = () =>
  process.env.NEXT_PUBLIC_APP_BRAND_NAME?.trim() || "ImmunoX";
import { SignalLogo } from "@/components/signal-logo";
import { recentYearMonths } from "@/lib/digest-month";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";

const digestMonths = recentYearMonths(10);

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

          <SidebarNav role={role} digestMonths={digestMonths} workspaceLabel="Monitor" />

          <div className="mt-auto space-y-3 pt-6">
            <div className="rounded-[1.1rem] border border-[color:var(--border)]/75 bg-[color:var(--card)]/55 p-3">
              <p className="truncate text-xs font-medium text-[color:var(--foreground)]/90">{user?.email}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  href="/readme"
                  className="rounded-lg border border-[color:var(--border)]/75 bg-[color:var(--muted)]/32 px-2.5 py-1.5 text-center text-xs font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/6 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
                >
                  Help
                </Link>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-[color:var(--border)]/75 bg-[color:var(--muted)]/32 px-2.5 py-1.5 text-center text-xs font-medium text-[color:var(--foreground)]/90 transition-colors hover:bg-[color:var(--muted)]/72 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
            <ThemeToggle label="Dark mode" />
            <a
              href="https://ocr.ucsf.edu/"
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-[color:var(--border)]/75 bg-[color:var(--muted)]/24 px-3 py-2 text-[11px] font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/5 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
            >
              Powered by UCSF Office of Collaborative Research
            </a>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">{children}</main>
    </div>
  );
}
