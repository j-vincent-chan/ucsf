"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export function DeleteFacultyButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    const label = name.trim() || "this faculty";
    if (
      !confirm(
        `Delete ${label} from the database? This cannot be undone. Source items will stay but lose this link.`,
      )
    ) {
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("tracked_entities").delete().eq("id", id);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Faculty removed");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={loading}
      title="Delete faculty"
      className="inline-flex items-center justify-center rounded-lg p-1.5 text-[color:var(--muted-foreground)] transition-colors hover:bg-[#f4dfd9] hover:text-[#8f4d45] disabled:opacity-50"
      aria-label={`Delete ${name}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        <line x1="10" x2="10" y1="11" y2="17" />
        <line x1="14" x2="14" y1="11" y2="17" />
      </svg>
    </button>
  );
}
