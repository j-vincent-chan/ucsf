/** Shown by Next.js `loading.tsx` while a server-rendered route segment is resolving. */
export function RouteLoadingFallback({ label = "Rendering…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[min(48vh,380px)] flex-col items-center justify-center gap-4 px-4 py-12"
    >
      <span
        className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-[color:var(--accent)]"
        aria-hidden
      />
      <p className="text-sm font-medium text-[color:var(--muted-foreground)]">{label}</p>
      <p className="max-w-sm text-center text-xs text-[color:var(--muted-foreground)]/90">
        Fetching data from your workspace.
      </p>
    </div>
  );
}
