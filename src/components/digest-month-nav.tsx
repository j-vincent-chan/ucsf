"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DigestNavSection({ months }: { months: { ym: string; label: string }[] }) {
  const pathname = usePathname();
  const inDigest = pathname.startsWith("/digest");

  return (
    <div className="px-1 py-1.5">
      <Link
        href="/digest"
        className={`block rounded-xl px-3 py-2 font-medium transition-colors ${
          inDigest
            ? "bg-[color:var(--muted)] text-[color:var(--foreground)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_85%,white)]"
            : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/70 hover:text-[color:var(--foreground)]"
        }`}
      >
        Digest
      </Link>
      <div className="mt-2 space-y-1 border-l border-[color:var(--border)]/80 pl-3">
        {months.map(({ ym, label }) => {
          const href = `/digest/${ym}`;
          const active = pathname === href;
          return (
            <Link
              key={ym}
              href={href}
              className={`block rounded-lg px-2.5 py-1.5 text-xs leading-tight transition-colors ${
                active
                  ? "bg-[color:var(--muted)]/85 font-medium text-[color:var(--foreground)]"
                  : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/55 hover:text-[color:var(--foreground)]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
