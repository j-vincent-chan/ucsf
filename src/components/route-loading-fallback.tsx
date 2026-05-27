import { RenderingStatus } from "@/components/rendering-indicator";

/** Shown by Next.js `loading.tsx` while a server-rendered route segment is resolving. */
export function RouteLoadingFallback({ label = "Rendering…" }: { label?: string }) {
  return <RenderingStatus label={label} />;
}
