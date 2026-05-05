"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function XOAuthSettings({
  connected,
  flash,
}: {
  connected: boolean;
  flash?: { ok: boolean; message: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/x/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Disconnect failed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-[color:var(--border)]/60 pt-6">
      {flash ? (
        <p
          className={`mb-4 text-sm ${flash.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}
          role="status"
        >
          {flash.message}
        </p>
      ) : null}
      <p className="text-sm text-[color:var(--muted-foreground)]">
        Authorize Community Signal to post to X as your workspace account (OAuth 2.0), including photo uploads via X API
        v2 (<span className="font-mono text-[11px]">media.write</span> scope). Uses the callback URL you registered in the
        X Developer Portal — set{" "}
        <code className="rounded bg-[color:var(--muted)]/45 px-1 py-0.5 font-mono text-xs">X_OAUTH_REDIRECT_URI</code> or{" "}
        <code className="rounded bg-[color:var(--muted)]/45 px-1 py-0.5 font-mono text-xs">NEXT_PUBLIC_SITE_URL</code> so
        it matches exactly. If posting worked as text-only before, disconnect and connect again so your token picks up
        current scopes.
      </p>
      <p className="mt-3 text-xs text-[color:var(--muted-foreground)]">
        The <span className="font-medium text-[color:var(--foreground)]/90">Access Token</span> on the Developer Portal is
        separate from Community Signal: use <span className="font-medium">Connect X</span> here so we store your
        user-context token. Ensure deployment env <span className="font-mono text-[11px]">X_OAUTH_CLIENT_ID</span> matches
        that same app.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {connected ? (
          <>
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Connected for posting</span>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void disconnect()}>
              {busy ? "Disconnecting…" : "Disconnect X"}
            </Button>
          </>
        ) : (
          <a
            href="/api/auth/x/connect"
            className="inline-flex items-center justify-center rounded-xl bg-[color:var(--foreground)] px-4 py-2 text-xs font-semibold text-[color:var(--background)]"
          >
            Connect X for posting
          </a>
        )}
      </div>
    </div>
  );
}
