"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DigestNavSection({ months }: { months: { ym: string; label: string }[] }) {
  const pathname = usePathname();
  const inDigest = pathname.startsWith("/digest");

  return (
    <div className="px-2 py-1">
      <Link
        href="/digest"
        className={`block rounded-md py-1.5 font-medium ${
          inDigest
            ? "bg-neutral-200/90 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50"
            : "text-neutral-700 hover:bg-neutral-200/80 dark:text-neutral-200 dark:hover:bg-neutral-800"
        }`}
      >
        Digest
      </Link>
      <div className="mt-1 space-y-0.5 border-l border-neutral-200 pl-2 dark:border-neutral-700">
        {months.map(({ ym, label }) => {
          const href = `/digest/${ym}`;
          const active = pathname === href;
          return (
            <Link
              key={ym}
              href={href}
              className={`block rounded-md py-1 pl-2 text-xs leading-tight ${
                active
                  ? "bg-neutral-200/90 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50"
                  : "text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800/80"
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
