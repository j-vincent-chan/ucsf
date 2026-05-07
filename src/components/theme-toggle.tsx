"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

function getPreferredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem("theme", theme);
}

export function ThemeToggle({
  className = "",
  label = "Theme",
  compact = false,
}: {
  className?: string;
  label?: string;
  /** Icon-rail: square control, switch only. */
  compact?: boolean;
}) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const dark = theme === "dark";

  useEffect(() => {
    const current = getPreferredTheme();
    queueMicrotask(() => {
      setTheme(current);
      applyTheme(current);
    });
  }, []);

  const toggle = () => {
    const next: ThemeMode = dark ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Toggle light and dark mode"
      onClick={toggle}
      className={`group flex items-center rounded-xl border border-[color:var(--border)]/85 bg-[color:var(--muted)]/45 transition-colors hover:bg-[color:var(--muted)]/7 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)] ${compact ? "h-10 w-10 shrink-0 justify-center px-0 py-0" : "w-full justify-between px-3 py-2"} ${className}`}
    >
      {compact ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="text-xs font-medium text-[color:var(--foreground)]">{label}</span>
      )}
      <span
        aria-hidden
        className={`relative rounded-full transition-colors ${compact ? "h-4 w-8" : "h-5 w-10"} ${dark ? "bg-[color:var(--accent)]" : "bg-[color:var(--border)]"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 rounded-full bg-[color:var(--card)] shadow transition-transform ${compact ? `h-3 w-3 ${dark ? "translate-x-4" : "translate-x-0"}` : `h-4 w-4 ${dark ? "translate-x-5" : "translate-x-0"}`}`}
        />
      </span>
    </button>
  );
}
