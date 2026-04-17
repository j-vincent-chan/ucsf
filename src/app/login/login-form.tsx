"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { SignalLoginLockup } from "@/components/signal-logo";
import { toast } from "sonner";

/** Avoid open redirects; only same-origin relative paths are allowed. */
function safeNextPath(raw: string | null): string {
  const fallback = "/dashboard";
  if (!raw || typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return fallback;
  try {
    const u = new URL(t, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const reason = searchParams.get("reason");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionReasonMessage =
    reason === "session_missing"
      ? "Sign-in appeared to succeed, but no active session was found on the next request. This usually means auth cookies were not accepted by the browser for this host."
      : reason === "profile_missing"
        ? "Your account signed in, but no profile row was found for this user. Please sign in again; the app now auto-creates missing profiles."
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      ok?: boolean;
    };
    setLoading(false);
    if (!res.ok) {
      const msg = payload.error ?? "Sign-in failed";
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }
    const sessionCheck = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!sessionCheck.ok) {
      const detail = (await sessionCheck.json().catch(() => ({}))) as {
        error?: string;
      };
      const msg =
        detail.error ??
        "Login succeeded, but the browser session is still missing. Try clearing site cookies and signing in again.";
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }
    // Full navigation so the browser applies Set-Cookie before middleware runs (client transitions can race).
    window.location.assign(next);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(201,125,99,0.16),transparent_28%),linear-gradient(180deg,#fbf7f1,#f3ece3)] px-4">
      <Card className="w-full max-w-sm border-none">
        <SignalLoginLockup />
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
          {sessionReasonMessage ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {sessionReasonMessage}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}
        </form>
      </Card>
    </div>
  );
}
