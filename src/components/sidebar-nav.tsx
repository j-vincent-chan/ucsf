"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import type { ProfileRole } from "@/types/database";
import { ThemeToggle } from "@/components/theme-toggle";

function DashboardIcon({ className, strokeWidth = "1.65" }: { className: string; strokeWidth?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" />
      <rect x="13" y="3.5" width="7.5" height="4.5" rx="2" />
      <rect x="13" y="10" width="7.5" height="10.5" rx="2" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" />
    </svg>
  );
}

/** Approval queue — clipboard + check (review items before publish). */
function SignalsIcon({ className, strokeWidth = "1.65" }: { className: string; strokeWidth?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
      <rect x="7.5" y="3.75" width="9" height="2.75" rx="1.1" strokeLinejoin="round" />
      <rect x="5" y="5.5" width="14" height="14.5" rx="1.75" strokeLinejoin="round" />
      <path d="M8 12.25l1.75 1.75 4.5-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 16.75h8" strokeLinecap="round" />
    </svg>
  );
}

function SubmitIcon({ className, strokeWidth = "1.65" }: { className: string; strokeWidth?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

/** Monthly digest — calendar month (distinct from Signals clipboard). */
function DigestIcon({ className, strokeWidth = "1.65" }: { className: string; strokeWidth?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
      <path d="M8 4.25v2.25M16 4.25v2.25" strokeLinecap="round" />
      <rect x="4.5" y="6.25" width="15" height="14" rx="2" strokeLinejoin="round" />
      <path d="M4.5 10.25h15" strokeLinecap="round" />
      <circle cx="9" cy="14" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9" cy="17.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="17.25" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function WatchlistIcon({ className, strokeWidth = "1.65" }: { className: string; strokeWidth?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 18a5.5 5.5 0 0 1 11 0" />
      <path d="M16.5 8.5h4M18.5 6.5v4" />
    </svg>
  );
}

function WorkspacesAdminIcon({ className, strokeWidth = "1.65" }: { className: string; strokeWidth?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

function SocialSignalsIcon({ className, strokeWidth = "1.65" }: { className: string; strokeWidth?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
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
  platformAdmin = false,
  digestMonths,
  workspaceLabel = "Monitor",
  collapsed = false,
}: {
  role: ProfileRole | null;
  /** Admin with no tenant — hide product nav; only Workspaces. */
  platformAdmin?: boolean;
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

  /** Collapsed rail: slightly larger than expanded row, lighter stroke so it stays airy next to the mark. */
  const navIconClass = collapsed ? "h-[1.375rem] w-[1.375rem] shrink-0" : "h-4 w-4 shrink-0";
  const navStroke = collapsed ? "1.48" : "1.65";
  const railBase =
    "group flex items-center justify-center rounded-xl p-1 transition-colors duration-200";
  const railActive = `${railBase} bg-[color:var(--muted)]/85 text-[color:var(--foreground)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_70%,transparent)]`;
  const railIdle = `${railBase} text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/62 hover:text-[color:var(--foreground)]`;

  function linkClass(collapsedRail: boolean, active: boolean) {
    if (!collapsedRail) return itemClass(active);
    return active ? railActive : railIdle;
  }

  const itemStack = collapsed ? "space-y-2" : "space-y-1.5";
  const railSectionTop = collapsed ? "mt-2.5" : "";
  const latestDigestHref = digestMonths[0] ? `/digest/${digestMonths[0].ym}` : "/digest";

  return (
    <nav className={`flex min-w-0 flex-1 flex-col ${collapsed ? "mt-3 min-h-0" : ""}`}>
      {!platformAdmin ? (
        <>
          {!collapsed ? <SectionLabel>{workspaceLabel}</SectionLabel> : null}
          <div className={itemStack}>
            <Link
              href="/dashboard"
              className={`${linkClass(collapsed, pathname === "/dashboard")}`}
              title={collapsed ? "Dashboard" : undefined}
              aria-label="Dashboard"
            >
              <DashboardIcon className={navIconClass} strokeWidth={navStroke} />
              {!collapsed ? <span>Dashboard</span> : null}
            </Link>
            <Link
              href="/items"
              className={`${linkClass(collapsed, pathname.startsWith("/items"))}`}
              title={collapsed ? "Signals" : undefined}
              aria-label="Signals"
            >
              <SignalsIcon className={navIconClass} strokeWidth={navStroke} />
              {!collapsed ? <span>Signals</span> : null}
            </Link>
            <Link
              href="/submit"
              className={`${linkClass(collapsed, pathname === "/submit")}`}
              title={collapsed ? "Add Signal" : undefined}
              aria-label="Add Signal"
            >
              <SubmitIcon className={navIconClass} strokeWidth={navStroke} />
              {!collapsed ? <span>Add Signal</span> : null}
            </Link>
          </div>

          {!collapsed ? <SectionLabel>Social</SectionLabel> : null}
          <div className={`${railSectionTop} ${itemStack}`.trim()}>
            <Link
              href="/social-signals"
              className={`${linkClass(collapsed, pathname.startsWith("/social-signals"))}`}
              title={collapsed ? "Social Signals" : undefined}
              aria-label="Social Signals"
            >
              <SocialSignalsIcon className={navIconClass} strokeWidth={navStroke} />
              {!collapsed ? <span>Social Signals</span> : null}
            </Link>
          </div>

          {!collapsed ? <SectionLabel>Publish</SectionLabel> : null}
          <div className={`${railSectionTop} ${itemStack}`.trim()}>
            {collapsed ? (
              <Link
                href={latestDigestHref}
                className={linkClass(true, inDigest)}
                title="Digests"
                aria-label="Digests"
              >
                <DigestIcon className={navIconClass} strokeWidth={navStroke} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setDigestOpen((o) => !o)}
                className={`${itemClass(inDigest)} w-full`}
                aria-expanded={digestOpen}
                aria-controls="sidebar-digest-months"
                id="sidebar-digest-trigger"
                aria-label="Digests"
              >
                <DigestIcon className={navIconClass} strokeWidth={navStroke} />
                <span className="min-w-0 flex-1 text-left">Digests</span>
                <ChevronDownIcon open={digestOpen} />
              </button>
            )}
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
        </>
      ) : null}

      {(role === "admin" && platformAdmin) || ((role === "admin" || role === "editor") && !platformAdmin) ? (
        <>
          {!collapsed ? <SectionLabel>Admin</SectionLabel> : null}
          <div className={`${railSectionTop} ${itemStack}`.trim()}>
            {(role === "admin" || role === "editor") && !platformAdmin ? (
              <Link
                href="/entities"
                className={`${linkClass(collapsed, pathname.startsWith("/entities"))}`}
                title={collapsed ? "People" : undefined}
                aria-label="People"
              >
                <WatchlistIcon className={navIconClass} strokeWidth={navStroke} />
                {!collapsed ? <span>People</span> : null}
              </Link>
            ) : null}
            {role === "admin" && platformAdmin ? (
              <Link
                href="/admin/workspaces"
                className={`${linkClass(collapsed, pathname.startsWith("/admin/workspaces"))}`}
                title={collapsed ? "Workspaces" : undefined}
                aria-label="Workspaces"
              >
                <WorkspacesAdminIcon className={navIconClass} strokeWidth={navStroke} />
                {!collapsed ? <span>Workspaces</span> : null}
              </Link>
            ) : null}
          </div>
        </>
      ) : null}

      <div
        className={`shrink-0 border-t border-[color:var(--border)]/55 ${collapsed ? "mt-4 pt-3" : "mt-5 pt-4"}`}
      >
        <ThemeToggle label="Dark mode" compact={collapsed} className={collapsed ? "mx-auto" : ""} />
      </div>
    </nav>
  );
}
