"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  appendSystemMessage,
  clearSystemMessages,
  countUnreadSystemMessages,
  loadLastReadAt,
  loadSystemMessages,
  markSystemMessagesRead,
  type SystemMessage,
  type SystemMessageKind,
} from "@/lib/system-message-log";

export type NotifySystemMessageInput = {
  title: string;
  detail?: string;
  kind?: SystemMessageKind;
  source?: string;
};

type SystemMessagesContextValue = {
  scope: string;
  messages: SystemMessage[];
  unreadCount: number;
  lastReadAt: string | null;
  /** Persist + show a longer toast with “View log”. */
  notify: (input: NotifySystemMessageInput) => void;
  refresh: () => void;
  markAllRead: () => void;
  clearAll: () => void;
  openLog: () => void;
  logOpen: boolean;
  setLogOpen: (open: boolean) => void;
};

const SystemMessagesContext = createContext<SystemMessagesContextValue | null>(null);

const TOAST_DURATION_MS = 18_000;

export function SystemMessagesProvider({
  scope = "global",
  children,
}: {
  scope?: string;
  children: ReactNode;
}) {
  const [messages, setMessages] = useState<SystemMessage[]>([]);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const refresh = useCallback(() => {
    setMessages(loadSystemMessages(scope));
    setLastReadAt(loadLastReadAt(scope));
  }, [scope]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unreadCount = useMemo(() => countUnreadSystemMessages(scope), [scope, messages, lastReadAt]);

  const markAllRead = useCallback(() => {
    markSystemMessagesRead(scope);
    refresh();
  }, [scope, refresh]);

  const clearAll = useCallback(() => {
    clearSystemMessages(scope);
    refresh();
  }, [scope, refresh]);

  const openLog = useCallback(() => {
    setLogOpen(true);
    markSystemMessagesRead(scope);
    refresh();
  }, [scope, refresh]);

  const notify = useCallback(
    (input: NotifySystemMessageInput) => {
      const kind = input.kind ?? "success";
      appendSystemMessage(scope, {
        kind,
        title: input.title,
        detail: input.detail,
        source: input.source,
      });
      refresh();

      const toastOpts = {
        duration: TOAST_DURATION_MS,
        closeButton: true,
        action: {
          label: "View log",
          onClick: openLog,
        },
      };

      if (kind === "error") {
        toast.error(input.title, { ...toastOpts, description: input.detail });
      } else if (kind === "warning") {
        toast.warning(input.title, { ...toastOpts, description: input.detail });
      } else if (kind === "info") {
        toast.message(input.title, { ...toastOpts, description: input.detail });
      } else {
        toast.success(input.title, { ...toastOpts, description: input.detail });
      }
    },
    [scope, refresh, openLog],
  );

  const value = useMemo(
    () => ({
      scope,
      messages,
      unreadCount,
      lastReadAt,
      notify,
      refresh,
      markAllRead,
      clearAll,
      openLog,
      logOpen,
      setLogOpen,
    }),
    [scope, messages, unreadCount, lastReadAt, notify, refresh, markAllRead, clearAll, openLog, logOpen],
  );

  return <SystemMessagesContext.Provider value={value}>{children}</SystemMessagesContext.Provider>;
}

export function useSystemMessages(): SystemMessagesContextValue {
  const ctx = useContext(SystemMessagesContext);
  if (!ctx) {
    throw new Error("useSystemMessages must be used within SystemMessagesProvider");
  }
  return ctx;
}

export function useSystemMessagesOptional(): SystemMessagesContextValue | null {
  return useContext(SystemMessagesContext);
}
