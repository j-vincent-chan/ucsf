"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ProfileRole } from "@/types/database";
import { SidebarNav } from "@/components/sidebar-nav";
import { SignalLogo } from "@/components/signal-logo";
import { signOut } from "@/app/actions/auth-actions";

const STORAGE_KEY = "ui.sidebar.collapsed";

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function AppShellClient({
  children,
  role,
  digestMonths,
  communityDisplayName,
  userEmail,
}: {
  children: React.ReactNode;
  role: ProfileRole | null;
  digestMonths: { ym: string; label: string }[];
  communityDisplayName: string;
  userEmail: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "1") queueMicrotask(() => setCollapsed(true));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed]);

  const asideWidth = useMemo(() => (collapsed ? "lg:w-20" : "lg:w-80"), [collapsed]);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(201,125,99,0.12),transparent_24%),linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),var(--background))] lg:flex">
      <aside
        className={`min-w-0 overflow-hidden border-b border-[color:var(--border)]/80 bg-[color:var(--background)]/92 lg:min-h-screen lg:shrink-0 lg:border-r lg:border-b-0 ${asideWidth} transition-[width] duration-200 ease-out`}
        aria-label="Sidebar"
      >
        <div
          className={`flex h-full min-w-0 flex-col ${collapsed ? "p-5 lg:px-2 lg:pb-3 lg:pt-3" : "p-5 lg:p-6"}`}
        >
          <div
            className={`flex min-w-0 shrink-0 items-start gap-2 ${collapsed ? "lg:flex-col lg:items-center" : "justify-between"}`}
          >
            <Link
              href="/dashboard"
              className={`surface-card block min-w-0 shrink-0 rounded-[1.6rem] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)] ${collapsed ? "lg:flex lg:h-11 lg:w-11 lg:items-center lg:justify-center lg:p-0 lg:rounded-2xl" : "px-4 py-4"}`}
              aria-label="Go to dashboard"
            >
              {collapsed ? <SignalLogo variant="mark" /> : <SignalLogo showSubtitle />}
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--border)]/80 bg-[color:var(--card)]/90 text-[color:var(--muted-foreground)] shadow-[0_8px_20px_-14px_rgba(48,32,25,0.55)] ring-1 ring-[color:var(--border)]/30 transition-colors hover:bg-[color:var(--muted)]/20 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)] lg:mt-0"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <CollapseIcon collapsed={collapsed} />
            </button>
          </div>

          <Link
            href="/settings"
            className={`surface-subtle mb-4 mt-6 block rounded-[1.25rem] px-3 py-2.5 transition-colors hover:bg-[color:var(--muted)]/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)] ${collapsed ? "lg:hidden" : ""}`}
          >
            <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Workspace</p>
            <p className="mt-0.5 truncate text-sm font-medium text-[color:var(--foreground)]">
              {communityDisplayName}
            </p>
            <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">Profile &amp; settings</p>
          </Link>

          <SidebarNav
            role={role}
            digestMonths={digestMonths}
            workspaceLabel="Monitor"
            collapsed={collapsed}
          />

          <div className={`mt-auto space-y-3 pt-6 ${collapsed ? "lg:hidden" : ""}`}>
            <div className="rounded-[1.1rem] border border-[color:var(--border)]/75 bg-[color:var(--card)]/55 p-3">
              <p className="truncate text-xs font-medium text-[color:var(--foreground)]/90">{userEmail}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  href="/settings"
                  className="rounded-lg border border-[color:var(--border)]/75 bg-[color:var(--muted)]/32 px-2.5 py-1.5 text-center text-xs font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/6 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
                >
                  Settings
                </Link>
                <Link
                  href="/readme"
                  className="rounded-lg border border-[color:var(--border)]/75 bg-[color:var(--muted)]/32 px-2.5 py-1.5 text-center text-xs font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/6 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
                >
                  Help
                </Link>
                <form action={signOut} className="col-span-2">
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-[color:var(--border)]/75 bg-[color:var(--muted)]/32 px-2.5 py-1.5 text-center text-xs font-medium text-[color:var(--foreground)]/90 transition-colors hover:bg-[color:var(--muted)]/72 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
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

