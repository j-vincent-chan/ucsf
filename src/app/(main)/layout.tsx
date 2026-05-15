import { AppShell } from "@/components/app-shell";

/** Fresh profile + workspace on every request (avoids stale “ImmunoX” shell after detaching platform admin). */
export const dynamic = "force-dynamic";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
