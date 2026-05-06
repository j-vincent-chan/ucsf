import type { Summary, SummaryStyle } from "@/types/database";

/** Stable id — never written to DB; marks Content studio “no row yet” state. */
export const DIGEST_STUDIO_PLACEHOLDER_SUMMARY_ID = "00000000-0000-4000-8000-0000000000ff";

export function isDigestStudioPlaceholderSummary(s: Summary): boolean {
  return s.id === DIGEST_STUDIO_PLACEHOLDER_SUMMARY_ID;
}

export function makeDigestStudioPlaceholderSummary(
  sourceItemId: string,
  style: SummaryStyle,
): Summary {
  return {
    id: DIGEST_STUDIO_PLACEHOLDER_SUMMARY_ID,
    source_item_id: sourceItemId,
    style,
    prompt_version: "digest-placeholder",
    generated_text: "",
    edited_text: null,
    final_text: null,
    model_name: null,
    created_by: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    digest_tone: null,
    target_blurb_chars: null,
    output_status: "draft",
    character_count: null,
    generated_at: null,
  };
}
