"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { ProfileRole } from "@/types/database";
import { SidebarNav } from "@/components/sidebar-nav";
import { SignalLogo } from "@/components/signal-logo";
import { signOut } from "@/app/actions/auth-actions";

const STORAGE_KEY = "ui.sidebar.collapsed";
/** When viewport is in this inclusive width range (desktop `lg` layout), force icon rail so the main column wins space before we drop the Social sidebar. */
const NAV_AUTO_COLLAPSE_MAX = 1399;

/** Shell segment shared by SSR/preflight aside and real aside (avoids hydration class drift). */
const ASIDE_BASE =
  "min-h-screen min-w-0 shrink-0 overflow-hidden border-r border-[color:var(--border)]/80 bg-[color:var(--background)]/92";

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform duration-200 ${collapsed ? "h-3.5 w-3.5 rotate-180" : "h-4 w-4"}`}
      aria-hidden
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function AppShellClient({
  children,
  role,
  platformAdmin = false,
  homeHref = "/dashboard",
  digestMonths,
  communityDisplayName,
  userEmail,
}: {
  children: React.ReactNode;
  role: ProfileRole | null;
  /** Admin with no workspace — minimal nav (Workspaces only). */
  platformAdmin?: boolean;
  homeHref?: string;
  digestMonths: { ym: string; label: string }[];
  communityDisplayName: string;
  userEmail: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  /** Preflight aside matches SSR + first paint; swap to interactive shell before paint via useLayoutEffect. */
  const [shellReady, setShellReady] = useState(false);

  useLayoutEffect(() => {
    queueMicrotask(() => {
      try {
        const w = window.innerWidth;
        if (w >= 1024 && w <= NAV_AUTO_COLLAPSE_MAX) {
          setCollapsed(true);
        } else if (w > NAV_AUTO_COLLAPSE_MAX) {
          setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
        }
      } catch {
        // ignore
      }
      setShellReady(true);
    });
  }, []);

  useEffect(() => {
    if (!shellReady) return;
    const onResize = () => {
      const w = window.innerWidth;
      try {
        if (w >= 1024 && w <= NAV_AUTO_COLLAPSE_MAX) {
          setCollapsed(true);
        } else if (w > NAV_AUTO_COLLAPSE_MAX) {
          setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
        }
      } catch {
        if (w >= 1024 && w <= NAV_AUTO_COLLAPSE_MAX) setCollapsed(true);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [shellReady]);

  useEffect(() => {
    if (!shellReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed, shellReady]);

  const asideWidth = useMemo(() => (collapsed ? "w-20" : "w-80"), [collapsed]);

  if (!shellReady) {
    return (
      <div className="flex min-h-full bg-[radial-gradient(circle_at_top_left,rgba(201,125,99,0.12),transparent_24%),linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),var(--background))]">
        <aside
          className={`${ASIDE_BASE} w-80`}
          aria-label="Sidebar"
        >
          <div className="flex h-full min-w-0 flex-col p-5 lg:p-6" aria-hidden>
            <div className="h-16 w-[min(100%,14rem)] max-w-full rounded-[1.6rem] bg-[color:var(--muted)]/35" />
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-3 sm:p-5 md:p-6 lg:p-8 xl:p-10">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full bg-[radial-gradient(circle_at_top_left,rgba(201,125,99,0.12),transparent_24%),linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),var(--background))]">
      <aside
        className={`${ASIDE_BASE} ${asideWidth} transition-[width] duration-200 ease-out`}
        aria-label="Sidebar"
      >
        <div
          className={`flex h-full min-w-0 flex-col ${collapsed ? "px-1.5 py-2 pt-2" : "p-5"}`}
        >
          <div
            className={`flex min-w-0 shrink-0 ${collapsed ? "flex-col items-center gap-2.5" : "w-full items-start gap-2"}`}
          >
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[color:var(--border)]/80 bg-[color:var(--card)]/90 text-[color:var(--muted-foreground)] shadow-[0_8px_20px_-14px_rgba(48,32,25,0.55)] ring-1 ring-[color:var(--border)]/30 transition-colors hover:bg-[color:var(--muted)]/20 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)] ${
                collapsed ? "mx-auto h-8 w-8" : "mt-1 h-9 w-9"
              }`}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <CollapseIcon collapsed={collapsed} />
            </button>
            <Link
              href={homeHref}
              className={`block min-w-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)] ${
                collapsed
                  ? "surface-card mx-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl p-0"
                  : "min-w-0 flex-1 rounded-xl py-2 ps-0 pe-1 transition-colors hover:bg-[color:var(--muted)]/25"
              }`}
              aria-label={homeHref === "/admin/workspaces" ? "Go to workspaces" : "Go to dashboard"}
            >
              {collapsed ? <SignalLogo variant="mark" /> : <SignalLogo showSubtitle />}
            </Link>
          </div>

          <Link
            href="/settings"
            className={`surface-subtle mb-4 mt-6 block rounded-[1.25rem] px-3 py-2.5 transition-colors hover:bg-[color:var(--muted)]/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)] ${collapsed ? "hidden" : ""}`}
          >
            <p className="text-xs font-medium text-[color:var(--muted-foreground)]">
              {platformAdmin ? "Access" : "Workspace"}
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-[color:var(--foreground)]">
              {communityDisplayName}
            </p>
            <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">Profile &amp; settings</p>
          </Link>

          <SidebarNav
            role={role}
            platformAdmin={platformAdmin}
            digestMonths={digestMonths}
            workspaceLabel="Monitor"
            collapsed={collapsed}
          />

          <div className={`mt-auto space-y-3 pt-6 ${collapsed ? "hidden" : ""}`}>
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
      <main className="min-w-0 flex-1 p-3 sm:p-5 md:p-6 lg:p-8 xl:p-10">{children}</main>
    </div>
  );
}

