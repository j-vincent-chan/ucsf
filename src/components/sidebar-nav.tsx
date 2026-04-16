"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ProfileRole } from "@/types/database";

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

function ReadmeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconBase()}>
      <path d="M6 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6z" />
      <path d="M8 8h7M8 12h7M8 16h5" />
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
}: {
  role: ProfileRole | null;
  digestMonths: { ym: string; label: string }[];
}) {
  const pathname = usePathname();
  const inDigest = pathname === "/digest" || pathname.startsWith("/digest/");

  return (
    <nav className="flex flex-1 flex-col">
      <SectionLabel>Workspace</SectionLabel>
      <div className="space-y-1.5">
        <Link href="/dashboard" className={itemClass(pathname === "/dashboard")}>
          <DashboardIcon />
          <span>Dashboard</span>
        </Link>
        <Link href="/items" className={itemClass(pathname.startsWith("/items"))}>
          <QueueIcon />
          <span>Review Queue</span>
        </Link>
        <Link href="/submit" className={itemClass(pathname === "/submit")}>
          <SubmitIcon />
          <span>Manual Submission</span>
        </Link>
      </div>

      <SectionLabel>Publishing</SectionLabel>
      <div className="space-y-1.5">
        <Link href="/digest" className={itemClass(inDigest)}>
          <DigestIcon />
          <span>Digest</span>
        </Link>
        <div className="ml-5 space-y-1 border-l border-[color:var(--border)]/75 pl-3">
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
        <Link href="/readme" className={itemClass(pathname.startsWith("/readme"))}>
          <ReadmeIcon />
          <span>Readme</span>
        </Link>
      </div>

      {role === "admin" ? (
        <>
          <SectionLabel>Administration</SectionLabel>
          <div className="space-y-1.5">
            <Link href="/entities" className={itemClass(pathname.startsWith("/entities"))}>
              <WatchlistIcon />
              <span>Watchlist</span>
            </Link>
          </div>
        </>
      ) : null}
    </nav>
  );
}
