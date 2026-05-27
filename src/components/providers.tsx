"use client";

import { Toaster } from "sonner";
import { SystemMessagesProvider } from "@/components/system-messages-context";
import { SystemMessagesLogDialog } from "@/components/system-messages-activity";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SystemMessagesProvider scope="global">
      {children}
      <SystemMessagesLogDialog />
      <Toaster richColors position="top-right" duration={8000} closeButton visibleToasts={4} />
    </SystemMessagesProvider>
  );
}
