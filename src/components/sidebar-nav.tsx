"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import type { ProfileRole } from "@/types/database";
import { ThemeToggle } from "@/components/theme-toggle";

function iconBase() {
  return "h-4 w-4 shrink-0";
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconBase()}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" />
      <rect x="13" y="3.5" width="7.5" height="4.5" rx="2" />
      <rect x="13" y="10" width="7.5" height="10.5" rx="2" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconBase()}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8M8 12h8M8 15h5" />
    </svg>
  );
}

function SubmitIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconBase()}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function DigestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconBase()}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

function WatchlistIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconBase()}>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 18a5.5 5.5 0 0 1 11 0" />
      <path d="M16.5 8.5h4M18.5 6.5v4" />
    </svg>
  );
}

function SocialSignalsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconBase()}>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M18 6l2 2M4 18l2-2M18 18l2-2M4 6l2 2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`h-4 w-4 shrink-0 text-[color:var(--muted-foreground)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function itemClass(active: boolean) {
  if (active) {
    return "group flex items-center gap-3 rounded-2xl bg-[color:var(--muted)] px-3.5 py-2.5 text-sm font-medium text-[color:var(--foreground)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_85%,white)] transition-all";
  }
  return "group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium text-[color:var(--muted-foreground)] transition-all duration-200 hover:bg-[color:var(--muted)]/62 hover:text-[color:var(--foreground)]";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]/80">
      {children}
    </p>
  );
}

export function SidebarNav({
  role,
  digestMonths,
  workspaceLabel = "Monitor",
  collapsed = false,
}: {
  role: ProfileRole | null;
  digestMonths: { ym: string; label: string }[];
  workspaceLabel?: string;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const inDigest = pathname === "/digest" || pathname.startsWith("/digest/");
  const [digestOpen, setDigestOpen] = useState(inDigest);
  const prevInDigest = useRef(false);

  useEffect(() => {
    startTransition(() => {
      if (inDigest && !prevInDigest.current) setDigestOpen(true);
      if (!inDigest && prevInDigest.current) setDigestOpen(false);
      prevInDigest.current = inDigest;
    });
  }, [inDigest]);

  const railItem = collapsed ? "lg:!px-2" : "";

  return (
    <nav className="flex min-w-0 flex-1 flex-col">
      {!collapsed ? <SectionLabel>{workspaceLabel}</SectionLabel> : null}
      <div className="space-y-1.5">
        <Link
          href="/dashboard"
          className={`${collapsed ? `group flex items-center justify-center rounded-2xl px-3.5 py-2.5 text-[color:var(--muted-foreground)] transition-all duration-200 hover:bg-[color:var(--muted)]/62 hover:text-[color:var(--foreground)] ${railItem}` : itemClass(pathname === "/dashboard")}`}
          title={collapsed ? "Dashboard" : undefined}
          aria-label="Dashboard"
        >
          <DashboardIcon />
          {!collapsed ? <span>Dashboard</span> : null}
        </Link>
        <Link
          href="/items"
          className={`${collapsed ? `group flex items-center justify-center rounded-2xl px-3.5 py-2.5 text-[color:var(--muted-foreground)] transition-all duration-200 hover:bg-[color:var(--muted)]/62 hover:text-[color:var(--foreground)] ${railItem}` : itemClass(pathname.startsWith("/items"))}`}
          title={collapsed ? "Signals" : undefined}
          aria-label="Signals"
        >
          <QueueIcon />
          {!collapsed ? <span>Signals</span> : null}
        </Link>
        <Link
          href="/submit"
          className={`${collapsed ? `group flex items-center justify-center rounded-2xl px-3.5 py-2.5 text-[color:var(--muted-foreground)] transition-all duration-200 hover:bg-[color:var(--muted)]/62 hover:text-[color:var(--foreground)] ${railItem}` : itemClass(pathname === "/submit")}`}
          title={collapsed ? "Add Signal" : undefined}
          aria-label="Add Signal"
        >
          <SubmitIcon />
          {!collapsed ? <span>Add Signal</span> : null}
        </Link>
      </div>

      {!collapsed ? <SectionLabel>Social</SectionLabel> : null}
      <div className="space-y-1.5">
        <Link
          href="/social-signals"
          className={`${collapsed ? `group flex items-center justify-center rounded-2xl px-3.5 py-2.5 text-[color:var(--muted-foreground)] transition-all duration-200 hover:bg-[color:var(--muted)]/62 hover:text-[color:var(--foreground)] ${railItem}` : itemClass(pathname.startsWith("/social-signals"))}`}
          title={collapsed ? "Social Signals" : undefined}
          aria-label="Social Signals"
        >
          <SocialSignalsIcon />
          {!collapsed ? <span>Social Signals</span> : null}
        </Link>
      </div>

      {!collapsed ? <SectionLabel>Publish</SectionLabel> : null}
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setDigestOpen((o) => !o)}
          className={`${collapsed ? `group flex w-full min-w-0 items-center justify-center rounded-2xl px-3.5 py-2.5 text-[color:var(--muted-foreground)] transition-all duration-200 hover:bg-[color:var(--muted)]/62 hover:text-[color:var(--foreground)] ${railItem}` : itemClass(inDigest)} ${collapsed ? "" : "w-full"}`}
          aria-expanded={digestOpen}
          aria-controls="sidebar-digest-months"
          id="sidebar-digest-trigger"
          title={collapsed ? "Digests" : undefined}
          aria-label="Digests"
        >
          <DigestIcon />
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1 text-left">Digests</span>
              <ChevronDownIcon open={digestOpen} />
            </>
          ) : null}
        </button>
        {digestOpen && !collapsed ? (
          <div
            id="sidebar-digest-months"
            role="region"
            aria-labelledby="sidebar-digest-trigger"
            className="ml-5 space-y-1 border-l border-[color:var(--border)]/75 pl-3"
          >
            {digestMonths.map(({ ym, label }) => {
              const href = `/digest/${ym}`;
              const active = pathname === href;
              return (
                <Link
                  key={ym}
                  href={href}
                  className={
                    active
                      ? "block rounded-xl bg-[color:var(--muted)]/80 px-2.5 py-1.5 text-xs font-medium text-[color:var(--foreground)]"
                      : "block rounded-xl px-2.5 py-1.5 text-xs text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/50 hover:text-[color:var(--foreground)]"
                  }
                >
                  {label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      {role === "admin" ? (
        <>
          {!collapsed ? <SectionLabel>Admin</SectionLabel> : null}
          <div className="space-y-1.5">
            <Link
              href="/entities"
              className={`${collapsed ? `group flex items-center justify-center rounded-2xl px-3.5 py-2.5 text-[color:var(--muted-foreground)] transition-all duration-200 hover:bg-[color:var(--muted)]/62 hover:text-[color:var(--foreground)] ${railItem}` : itemClass(pathname.startsWith("/entities"))}`}
              title={collapsed ? "People" : undefined}
              aria-label="People"
            >
              <WatchlistIcon />
              {!collapsed ? <span>People</span> : null}
            </Link>
          </div>
        </>
      ) : null}

      <div className="mt-5 shrink-0 border-t border-[color:var(--border)]/55 pt-4">
        <ThemeToggle label="Dark mode" compact={collapsed} className={collapsed ? "mx-auto" : ""} />
      </div>
    </nav>
  );
}
