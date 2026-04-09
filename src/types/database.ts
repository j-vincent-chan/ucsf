export type EntityType = "faculty" | "lab" | "center" | "community";
/** Tracked faculty membership (CSV / UI: Member, Associate, Leadership Committee) */
export type MemberStatus = "member" | "associate" | "leadership_committee";
export type SourceType = "pubmed" | "web" | "manual" | "lab_website" | "reporter";
export type ItemStatus = "new" | "reviewed" | "approved" | "archived";

/** Stored on source_items when status is archived (see ARCHIVE_REASON_OPTIONS). */
export type ItemArchiveReason =
  | "not_accurate"
  | "not_relevant"
  | "duplicate"
  | "wrong_investigator"
  | "outdated"
  | "spam_or_noise"
  | "other";
export type ItemCategory =
  | "paper"
  | "award"
  | "event"
  | "media"
  | "funding"
  | "community_update"
  | "other";
export type SummaryStyle =
  | "newsletter"
  | "donor"
  | "social"
  | "concise"
  | "linkedin"
  | "bluesky_x"
  | "instagram";
export type ProfileRole = "admin" | "editor";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: ProfileRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: ProfileRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          role?: ProfileRole;
          updated_at?: string;
        };
        Relationships: [];
      };
      tracked_entities: {
        Row: {
          id: string;
          name: string;
          slug: string;
          entity_type: EntityType;
          first_name: string;
          last_name: string;
          member_status: MemberStatus;
          institution: string | null;
          pubmed_url: string | null;
          lab_website: string | null;
          google_alert_query: string | null;
          nih_profile_id: string | null;
          priority_tier: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          slug: string;
          entity_type?: EntityType;
          first_name?: string;
          last_name?: string;
          member_status?: MemberStatus;
          institution?: string | null;
          pubmed_url?: string | null;
          lab_website?: string | null;
          google_alert_query?: string | null;
          nih_profile_id?: string | null;
          priority_tier?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          entity_type?: EntityType;
          first_name?: string;
          last_name?: string;
          member_status?: MemberStatus;
          institution?: string | null;
          pubmed_url?: string | null;
          lab_website?: string | null;
          google_alert_query?: string | null;
          nih_profile_id?: string | null;
          priority_tier?: number;
          active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      source_items: {
        Row: {
          id: string;
          tracked_entity_id: string | null;
          source_type: SourceType;
          title: string;
          source_url: string | null;
          source_domain: string | null;
          published_at: string | null;
          found_at: string;
          raw_text: string | null;
          raw_summary: string | null;
          submitted_by: string | null;
          duplicate_key: string | null;
          duplicate_of: string | null;
          status: ItemStatus;
          category: ItemCategory | null;
          archive_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tracked_entity_id?: string | null;
          source_type: SourceType;
          title: string;
          source_url?: string | null;
          source_domain?: string | null;
          published_at?: string | null;
          found_at?: string;
          raw_text?: string | null;
          raw_summary?: string | null;
          submitted_by?: string | null;
          duplicate_key?: string | null;
          duplicate_of?: string | null;
          status?: ItemStatus;
          category?: ItemCategory | null;
          archive_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          tracked_entity_id?: string | null;
          source_type?: SourceType;
          title?: string;
          source_url?: string | null;
          source_domain?: string | null;
          published_at?: string | null;
          raw_text?: string | null;
          raw_summary?: string | null;
          submitted_by?: string | null;
          duplicate_of?: string | null;
          status?: ItemStatus;
          category?: ItemCategory | null;
          archive_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      summaries: {
        Row: {
          id: string;
          source_item_id: string;
          style: SummaryStyle;
          prompt_version: string;
          generated_text: string;
          edited_text: string | null;
          final_text: string | null;
          model_name: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_item_id: string;
          style: SummaryStyle;
          prompt_version?: string;
          generated_text: string;
          edited_text?: string | null;
          final_text?: string | null;
          model_name?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          style?: SummaryStyle;
          prompt_version?: string;
          generated_text?: string;
          edited_text?: string | null;
          final_text?: string | null;
          model_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      compute_duplicate_key: {
        Args: {
          p_title: string;
          p_entity: string | null;
          p_published: string | null;
        };
        Returns: string;
      };
    };
    Enums: {
      entity_type: EntityType;
      source_type: SourceType;
      item_status: ItemStatus;
      item_category: ItemCategory;
      summary_style: SummaryStyle;
      profile_role: ProfileRole;
    };
  };
}

export type Tables = Database["public"]["Tables"];
export type TrackedEntity = Tables["tracked_entities"]["Row"];
export type SourceItem = Tables["source_items"]["Row"];
export type Summary = Tables["summaries"]["Row"];
export type Profile = Tables["profiles"]["Row"];
