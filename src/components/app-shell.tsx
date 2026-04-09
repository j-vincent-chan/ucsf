import Link from "next/link";
import { signOut } from "@/app/actions/auth-actions";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRole } from "@/types/database";
import { SignalLogo } from "@/components/signal-logo";
import { DigestNavSection } from "@/components/digest-month-nav";
import { recentYearMonths } from "@/lib/digest-month";

const digestMonths = recentYearMonths(12);

const navLinkClass =
  "block rounded-md px-2 py-1.5 text-neutral-700 hover:bg-neutral-200/80 dark:text-neutral-200 dark:hover:bg-neutral-800";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: ProfileRole | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role = data?.role ?? null;
  }

  return (
    <div className="min-h-full flex">
      <aside className="w-52 shrink-0 border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40">
        <div className="flex h-full flex-col p-4">
          <Link
            href="/dashboard"
            className="mb-6 block shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <SignalLogo />
          </Link>
          <nav className="flex flex-1 flex-col gap-0.5 text-sm">
            <Link href="/dashboard" className={navLinkClass}>
              Dashboard
            </Link>
            {role === "admin" ? (
              <Link href="/entities" className={navLinkClass}>
                Watchlist
              </Link>
            ) : null}
            <Link href="/items" className={navLinkClass}>
              Review Queue
            </Link>
            <Link href="/submit" className={navLinkClass}>
              Manual Submission
            </Link>
            <DigestNavSection months={digestMonths} />
            <Link href="/readme" className={navLinkClass}>
              Readme
            </Link>
          </nav>
          <div className="mt-auto border-t border-neutral-200 pt-3 dark:border-neutral-700">
            <p className="truncate px-2 text-xs text-neutral-500">{user?.email}</p>
            <form action={signOut}>
              <button
                type="submit"
                className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm text-neutral-600 hover:bg-neutral-200/80 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
