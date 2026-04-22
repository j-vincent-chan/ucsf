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
}: {
  className?: string;
  label?: string;
}) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const dark = theme === "dark";

  useEffect(() => {
    const current = getPreferredTheme();
    setTheme(current);
    applyTheme(current);
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
      className={`group flex w-full items-center justify-between rounded-xl border border-[color:var(--border)]/85 bg-[color:var(--muted)]/45 px-3 py-2 transition-colors hover:bg-[color:var(--muted)]/7 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)] ${className}`}
    >
      <span className="text-xs font-medium text-[color:var(--foreground)]">
        {label}
      </span>
      <span
        aria-hidden
        className={`relative h-5 w-10 rounded-full transition-colors ${dark ? "bg-[color:var(--accent)]" : "bg-[color:var(--border)]"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-[color:var(--card)] shadow transition-transform ${dark ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );
}
