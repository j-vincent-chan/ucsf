import type { PostStatus } from "@/lib/social-signals/workspace-types";

export type SchedulerPublishUiKind = "draft" | "scheduled" | "due" | "published" | "failed";

export type SchedulerPublishUi = {
  kind: SchedulerPublishUiKind;
  label: string;
  detail?: string;
};

export function schedulerPublishUi(post: {
  status: PostStatus;
  scheduled_at: string | null;
  published_at?: string | null;
  publish_error?: string | null;
}): SchedulerPublishUi {
  if (post.status === "published") {
    const when = post.published_at ?? post.scheduled_at;
    const detail = when
      ? new Date(when).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : undefined;
    return { kind: "published", label: "Published", detail };
  }
  if (post.status === "needs_review" && post.scheduled_at) {
    return {
      kind: "failed",
      label: "Publish failed",
      detail: post.publish_error?.trim() || "Open the post to fix and reschedule.",
    };
  }
  if (!post.scheduled_at) {
    return { kind: "draft", label: "Draft" };
  }
  const at = Date.parse(post.scheduled_at);
  const timeLabel = new Date(post.scheduled_at).toLocaleTimeString(undefined, { timeStyle: "short" });
  if (post.status === "scheduled" && Number.isFinite(at) && at <= Date.now()) {
    return { kind: "due", label: "Past due", detail: `Scheduled ${timeLabel} — publishing when connected` };
  }
  if (post.status === "scheduled") {
    return { kind: "scheduled", label: "Scheduled", detail: timeLabel };
  }
  return { kind: "draft", label: "Draft" };
}
