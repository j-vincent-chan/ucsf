import type { ItemCategory, SourceType } from "@/types/database";

export type DiscoveryCandidate = {
  tracked_entity_id: string;
  title: string;
  source_url: string | null;
  source_domain: string | null;
  published_at: string | null;
  raw_summary: string | null;
  source_type: SourceType;
  category: ItemCategory;
  /** NIH RePORTER `ProjectNum` — used to collapse subprojects/cores onto one overall grant row */
  nih_project_num?: string;
};
