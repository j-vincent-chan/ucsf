/**
 * Idempotent seed for local/staging.
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 *
 * Creates two dev users (if missing) and placeholder OCR / ImmunoX content.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { tierFromMemberStatus } from "../src/lib/member-tier";
import type { Database } from "../src/types/database";

config({ path: resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient<Database>(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ADMIN_EMAIL = "admin@community-signal.local";
const EDITOR_EMAIL = "editor@community-signal.local";
const DEV_PASSWORD = "CommunitySignal!Dev123";
/** Profile login_username + bcrypt hash (requires migration + SEED_IMMUNOX_PASSWORD). */
const IMMUNOX_LOGIN = "ImmunoX@ucsf.edu";

const IDS = {
  e1: "a1000000-0000-4000-8000-000000000001",
  e2: "a1000000-0000-4000-8000-000000000002",
  e3: "a1000000-0000-4000-8000-000000000003",
  e4: "a1000000-0000-4000-8000-000000000004",
  e5: "a1000000-0000-4000-8000-000000000005",
  e6: "a1000000-0000-4000-8000-000000000006",
  e7: "a1000000-0000-4000-8000-000000000007",
  e8: "a1000000-0000-4000-8000-000000000008",
  i1: "b2000000-0000-4000-8000-000000000001",
  i2: "b2000000-0000-4000-8000-000000000002",
  i3: "b2000000-0000-4000-8000-000000000003",
  i4: "b2000000-0000-4000-8000-000000000004",
  i5: "b2000000-0000-4000-8000-000000000005",
  i6: "b2000000-0000-4000-8000-000000000006",
  i7: "b2000000-0000-4000-8000-000000000007",
  i8: "b2000000-0000-4000-8000-000000000008",
  i9: "b2000000-0000-4000-8000-000000000009",
  i10: "b2000000-0000-4000-8000-00000000000a",
  i11: "b2000000-0000-4000-8000-00000000000b",
  i12: "b2000000-0000-4000-8000-00000000000c",
  i13: "b2000000-0000-4000-8000-00000000000d",
  i14: "b2000000-0000-4000-8000-00000000000e",
  i15: "b2000000-0000-4000-8000-00000000000f",
  /** Intentional duplicate fingerprint of i3 (same title, entity, date) */
  iDup: "b2000000-0000-4000-8000-000000000099",
  b1: "d4000000-0000-4000-8000-000000000001",
  b2: "d4000000-0000-4000-8000-000000000002",
  b3: "d4000000-0000-4000-8000-000000000003",
  b4: "d4000000-0000-4000-8000-000000000004",
  b5: "d4000000-0000-4000-8000-000000000005",
  b6: "d4000000-0000-4000-8000-000000000006",
  b7: "d4000000-0000-4000-8000-000000000007",
  b8: "d4000000-0000-4000-8000-000000000008",
  b9: "d4000000-0000-4000-8000-000000000009",
  b10: "d4000000-0000-4000-8000-00000000000a",
} as const;

function jsonBlurb(
  headline: string,
  blurb: string,
  why: string,
  notes: string,
): string {
  return JSON.stringify({
    headline,
    blurb,
    why_it_matters: why,
    confidence_notes: notes,
  });
}

async function ensureUser(email: string, role: "admin" | "editor") {
  const { data: page } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = page?.users?.find((u) => u.email === email);
  if (found) {
    console.log(`User exists: ${email}`);
    return found;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: role === "admin" ? "Dev Admin" : "Dev Editor",
      role,
    },
  });
  if (error || !data.user) {
    throw new Error(`createUser ${email}: ${error?.message}`);
  }
  console.log(`Created user: ${email}`);
  return data.user;
}

async function ensureImmunoxProfileLogin(plainPassword: string) {
  const { data: page } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let u =
    page?.users?.find((x) => x.email?.toLowerCase() === IMMUNOX_LOGIN.toLowerCase()) ??
    null;
  if (!u) {
    const { data, error } = await admin.auth.admin.createUser({
      email: IMMUNOX_LOGIN,
      password: plainPassword,
      email_confirm: true,
      user_metadata: { full_name: "ImmunoX", role: "admin" },
    });
    if (error || !data.user) {
      throw new Error(`createUser ${IMMUNOX_LOGIN}: ${error?.message}`);
    }
    u = data.user;
    console.log(`Created user: ${IMMUNOX_LOGIN}`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(u.id, { password: plainPassword });
    if (error) {
      throw new Error(`updateUser ${IMMUNOX_LOGIN}: ${error.message}`);
    }
    console.log(`User exists: ${IMMUNOX_LOGIN} (auth password synced)`);
  }
  const { error: rpcErr } = await admin.rpc("admin_set_profile_login", {
    p_user_id: u.id,
    p_username: IMMUNOX_LOGIN,
    p_plain_password: plainPassword,
  });
  if (rpcErr) {
    throw new Error(`admin_set_profile_login: ${rpcErr.message}`);
  }
  console.log(`Profile credentials stored for ${IMMUNOX_LOGIN}`);
}

async function main() {
  const { data: immunoxCommunity, error: commErr } = await admin
    .from("communities")
    .select("id")
    .eq("slug", "immunox")
    .maybeSingle();
  if (commErr || !immunoxCommunity) {
    throw new Error(
      "ImmunoX community row missing — apply Supabase migrations (communities) before seeding.",
    );
  }
  const COMMUNITY_ID = immunoxCommunity.id;

  const adminUser = await ensureUser(ADMIN_EMAIL, "admin");
  const editorUser = await ensureUser(EDITOR_EMAIL, "editor");
  const immunoxPw = process.env.SEED_IMMUNOX_PASSWORD?.trim();
  if (immunoxPw) {
    await ensureImmunoxProfileLogin(immunoxPw);
  } else {
    console.log(
      `Skipping ${IMMUNOX_LOGIN} profile login (set SEED_IMMUNOX_PASSWORD in .env.local)`,
    );
  }
  const actor = adminUser.id;

  const entities = [
    {
      id: IDS.e1,
      community_id: COMMUNITY_ID,
      first_name: "Maya",
      last_name: "Chen",
      member_status: "member" as const,
      slug: "maya-chen-lab",
      entity_type: "faculty" as const,
      institution: "Stanford University",
      pubmed_url: null,
      google_alert_query: '"Maya Chen" immunotherapy Stanford',
      priority_tier: tierFromMemberStatus("member"),
      active: true,
    },
    {
      id: IDS.e2,
      community_id: COMMUNITY_ID,
      first_name: "Jordan",
      last_name: "Okonkwo",
      member_status: "associate" as const,
      slug: "jordan-okonkwo",
      entity_type: "faculty" as const,
      institution: "UCSF",
      pubmed_url: null,
      google_alert_query: "",
      priority_tier: tierFromMemberStatus("associate"),
      active: true,
    },
    {
      id: IDS.e3,
      community_id: COMMUNITY_ID,
      first_name: "Alex",
      last_name: "Kim",
      member_status: "associate" as const,
      slug: "ocr-science-forum",
      entity_type: "faculty" as const,
      institution: "UCSF",
      pubmed_url: null,
      google_alert_query: "OCR forum immunotherapy",
      priority_tier: tierFromMemberStatus("associate"),
      active: true,
    },
    {
      id: IDS.e4,
      community_id: COMMUNITY_ID,
      first_name: "Riley",
      last_name: "Ng",
      member_status: "leadership_committee" as const,
      slug: "immunox-data-cooperative",
      entity_type: "faculty" as const,
      institution: "Stanford University",
      pubmed_url: null,
      google_alert_query: "",
      priority_tier: tierFromMemberStatus("leadership_committee"),
      active: true,
    },
    {
      id: IDS.e5,
      community_id: COMMUNITY_ID,
      first_name: "Elena",
      last_name: "Vasquez",
      member_status: "member" as const,
      slug: "elena-vasquez",
      entity_type: "faculty" as const,
      institution: "UCSF",
      pubmed_url: null,
      google_alert_query: "",
      priority_tier: tierFromMemberStatus("member"),
      active: true,
    },
    {
      id: IDS.e6,
      community_id: COMMUNITY_ID,
      first_name: "Taylor",
      last_name: "Brooks",
      member_status: "associate" as const,
      slug: "microbiome-immune-wg",
      entity_type: "faculty" as const,
      institution: "UCSF",
      pubmed_url: null,
      google_alert_query: "",
      priority_tier: tierFromMemberStatus("associate"),
      active: true,
    },
    {
      id: IDS.e7,
      community_id: COMMUNITY_ID,
      first_name: "Jamie",
      last_name: "Wu",
      member_status: "member" as const,
      slug: "single-cell-core",
      entity_type: "faculty" as const,
      institution: "Stanford University",
      pubmed_url: null,
      google_alert_query: "",
      priority_tier: tierFromMemberStatus("member"),
      active: true,
    },
    {
      id: IDS.e8,
      community_id: COMMUNITY_ID,
      first_name: "Samir",
      last_name: "Patel",
      member_status: "associate" as const,
      slug: "samir-patel-lab",
      entity_type: "faculty" as const,
      institution: "UCSF",
      pubmed_url: null,
      google_alert_query: "",
      priority_tier: tierFromMemberStatus("associate"),
      active: false,
    },
  ];

  const { error: entErr } = await admin.from("tracked_entities").upsert(entities, {
    onConflict: "id",
  });
  if (entErr) throw entErr;

  const items = [
    {
      id: IDS.i1,
      tracked_entity_id: IDS.e1,
      source_type: "pubmed" as const,
      title: "Spatial maps resolve tertiary lymphoid structures post-anti–PD-1",
      source_url: "https://pubmed.ncbi.nlm.nih.gov/placeholder1",
      source_domain: "pubmed.ncbi.nlm.nih.gov",
      published_at: "2025-11-12T00:00:00.000Z",
      raw_summary: "TLS density linked to durable response in an exploratory cohort.",
      raw_text: "Methods: multiplex imaging on 42 ImmunoX biobank samples…",
      status: "new" as const,
      category: "paper" as const,
    },
    {
      id: IDS.i2,
      tracked_entity_id: IDS.e2,
      source_type: "web" as const,
      title: "Phase 1b bispecific shows manageable CRS in relapsed lymphoma",
      source_url: "https://news.example/clinicaltrial-io-204",
      source_domain: "news.example",
      published_at: "2025-10-02T00:00:00.000Z",
      raw_summary: "Early signals of efficacy at second dose level.",
      raw_text: null,
      status: "reviewed" as const,
      category: "media" as const,
    },
    {
      id: IDS.i3,
      tracked_entity_id: IDS.e3,
      source_type: "manual" as const,
      title: "OCR Forum — November lightning talks announced",
      source_url: null,
      source_domain: null,
      published_at: "2025-10-15T00:00:00.000Z",
      raw_summary: "Five-minute talks on computational IO and patient-derived models.",
      raw_text: null,
      status: "new" as const,
      category: "event" as const,
    },
    {
      id: IDS.iDup,
      tracked_entity_id: IDS.e3,
      source_type: "manual" as const,
      title: "OCR Forum — November lightning talks announced",
      source_url: null,
      source_domain: null,
      published_at: "2025-10-15T00:00:00.000Z",
      raw_summary: "Duplicate submission for duplicate detection demo.",
      raw_text: null,
      status: "new" as const,
      category: "event" as const,
      duplicate_of: IDS.i3,
    },
    {
      id: IDS.i4,
      tracked_entity_id: IDS.e4,
      source_type: "web" as const,
      title: "ImmunoX Cooperative releases cohort harmonization playbook v2",
      source_url: "https://internal.example/immunox/playbook-v2",
      source_domain: "internal.example",
      published_at: "2025-09-20T00:00:00.000Z",
      raw_summary: "Field guide for batch correction and metadata standards.",
      raw_text: null,
      status: "approved" as const,
      category: "community_update" as const,
    },
    {
      id: IDS.i5,
      tracked_entity_id: IDS.e5,
      source_type: "pubmed" as const,
      title: "Abscopal responses correlate with activated CD8 niches",
      source_url: "https://pubmed.ncbi.nlm.nih.gov/placeholder2",
      source_domain: "pubmed.ncbi.nlm.nih.gov",
      published_at: "2025-08-30T00:00:00.000Z",
      raw_summary: "Preclinical radiotherapy plus STING agonist model.",
      raw_text: null,
      status: "reviewed" as const,
      category: "paper" as const,
    },
    {
      id: IDS.i6,
      tracked_entity_id: IDS.e1,
      source_type: "web" as const,
      title: "Maya Chen named OCR translational investigator of the year",
      source_url: "https://award.example/maya-chen-ocr",
      source_domain: "award.example",
      published_at: "2025-12-01T00:00:00.000Z",
      raw_summary: "Recognized for bridging spatial biology to trial design.",
      raw_text: null,
      status: "approved" as const,
      category: "award" as const,
    },
    {
      id: IDS.i7,
      tracked_entity_id: IDS.e6,
      source_type: "manual" as const,
      title: "Microbiome WG call for pilot proposals",
      source_url: null,
      source_domain: null,
      published_at: "2025-11-01T00:00:00.000Z",
      raw_summary: "Small grants for fecal metagenomics + immune panels.",
      raw_text: null,
      status: "new" as const,
      category: "funding" as const,
    },
    {
      id: IDS.i8,
      tracked_entity_id: IDS.e7,
      source_type: "web" as const,
      title: "Single-cell core downtime: Dec 22–24",
      source_url: "https://core.example/notices",
      source_domain: "core.example",
      published_at: "2025-11-18T00:00:00.000Z",
      raw_summary: "Holiday maintenance window.",
      raw_text: null,
      status: "archived" as const,
      category: "other" as const,
    },
    {
      id: IDS.i9,
      tracked_entity_id: IDS.e2,
      source_type: "manual" as const,
      title: "Community note: patient advocacy listening session",
      source_url: null,
      source_domain: null,
      published_at: "2025-10-05T00:00:00.000Z",
      raw_summary: "OCR-hosted session on trial communications.",
      raw_text: null,
      status: "reviewed" as const,
      category: "community_update" as const,
    },
    {
      id: IDS.i10,
      tracked_entity_id: IDS.e4,
      source_type: "web" as const,
      title: "Public ImmunoX seminar: equitable access to IO trials",
      source_url: "https://seminars.example/io-equity",
      source_domain: "seminars.example",
      published_at: "2026-01-10T00:00:00.000Z",
      raw_summary: "Panel with community oncologists and trialists.",
      raw_text: null,
      status: "new" as const,
      category: "event" as const,
    },
    {
      id: IDS.i11,
      tracked_entity_id: IDS.e5,
      source_type: "pubmed" as const,
      title: "Hypofractionation plus PD-L1 blockade: updated safety readout",
      source_url: "https://pubmed.ncbi.nlm.nih.gov/placeholder3",
      source_domain: "pubmed.ncbi.nlm.nih.gov",
      published_at: "2025-07-21T00:00:00.000Z",
      raw_summary: "No new grade 4 events in combination arm.",
      raw_text: null,
      status: "approved" as const,
      category: "paper" as const,
    },
    {
      id: IDS.i12,
      tracked_entity_id: IDS.e8,
      source_type: "manual" as const,
      title: "Patel lab pilot closes accrual for neoadjuvant IO cohort",
      source_url: null,
      source_domain: null,
      published_at: "2025-09-01T00:00:00.000Z",
      raw_summary: "inactive entity example — lab marked inactive in directory",
      raw_text: null,
      status: "reviewed" as const,
      category: "other" as const,
    },
    {
      id: IDS.i13,
      tracked_entity_id: IDS.e1,
      source_type: "web" as const,
      title: "ImmunoX collaboration highlighted in campus research digest",
      source_url: "https://campus.example/research-digest/io",
      source_domain: "campus.example",
      published_at: "2025-06-11T00:00:00.000Z",
      raw_summary: "Feature on cross-disciplinary tissue atlas effort.",
      raw_text: null,
      status: "archived" as const,
      category: "media" as const,
    },
    {
      id: IDS.i14,
      tracked_entity_id: null,
      source_type: "manual" as const,
      title: "Unassigned item: external symposium abstract on NK engagers",
      source_url: null,
      source_domain: null,
      published_at: null,
      raw_summary: "No tracked entity; manual catch-all.",
      raw_text: null,
      status: "new" as const,
      category: "other" as const,
    },
    {
      id: IDS.i15,
      tracked_entity_id: IDS.e3,
      source_type: "web" as const,
      title: "Registration open: OCR winter methods bootcamp",
      source_url: "https://ocr.example/bootcamp",
      source_domain: "ocr.example",
      published_at: "2026-02-01T00:00:00.000Z",
      raw_summary: "Hands-on cytometry and single-cell basics.",
      raw_text: null,
      status: "approved" as const,
      category: "event" as const,
    },
  ].map((row) => ({
    ...row,
    community_id: COMMUNITY_ID,
    submitted_by: actor,
  }));

  const { error: itemErr } = await admin.from("source_items").upsert(items, {
    onConflict: "id",
  });
  if (itemErr) throw itemErr;

  const summaries = [
    {
      id: IDS.b1,
      source_item_id: IDS.i1,
      style: "newsletter" as const,
      prompt_version: "v1",
      generated_text: jsonBlurb(
        "TLS mapping after PD-1",
        "A Chen lab–linked imaging study maps how tertiary lymphoid structures reorganize after anti–PD-1, tying local B-cell niches to durable responses in an exploratory ImmunoX cohort.",
        "Explains mechanistic leads OCR teams can validate in parallel tissue programs.",
        "Based on provided summary only.",
      ),
      created_by: actor,
    },
    {
      id: IDS.b2,
      source_item_id: IDS.i1,
      style: "concise" as const,
      prompt_version: "v1",
      generated_text: jsonBlurb(
        "TLS and PD-1",
        "Spatial profiling ties TLS changes to better outcomes post–PD-1 in a small exploratory set.",
        "Supports hypothesis generation for OCR translational samples.",
        "Short form; limited detail in source.",
      ),
      edited_text: null,
      final_text: null,
      created_by: editorUser.id,
    },
    {
      id: IDS.b3,
      source_item_id: IDS.i4,
      style: "donor" as const,
      prompt_version: "v1",
      generated_text: jsonBlurb(
        "Harmonizing immune data",
        "The ImmunoX Data Cooperative shared a practical harmonization guide so multi-cohort immune monitoring stays reproducible—reducing friction for teams translating findings into trials.",
        "Keeps donor-backed infrastructure legible across campuses.",
        "Placeholder institutional story.",
      ),
      created_by: actor,
    },
    {
      id: IDS.b4,
      source_item_id: IDS.i6,
      style: "social" as const,
      prompt_version: "v1",
      generated_text: jsonBlurb(
        "Chen recognized",
        "Maya Chen honored for translating spatial IO maps into trial-ready hypotheses — proud OCR/ImmunoX moment.",
        "Humanizes bench-to-clinic bridge.",
        "Character limits approximated in blurb field.",
      ),
      final_text:
        "Honored: Maya Chen’s work connecting spatial biology to IO trials — a win for our OCR/ImmunoX community.",
      created_by: actor,
    },
    {
      id: IDS.b5,
      source_item_id: IDS.i11,
      style: "newsletter" as const,
      prompt_version: "v1",
      generated_text: jsonBlurb(
        "Radiotherapy + PD-L1 safety",
        "Updated combination data suggest continued tolerability for hypofractionated radiation with PD-L1 blockade, relevant to Vasquez’s clinical translation thread.",
        "Helps OCR clinicians calibrate expectations for IO–RT protocols.",
        "Based on summary lines only.",
      ),
      created_by: editorUser.id,
    },
    {
      id: IDS.b6,
      source_item_id: IDS.i15,
      style: "newsletter" as const,
      prompt_version: "v1",
      generated_text: jsonBlurb(
        "Winter bootcamp",
        "OCR opens registration for a winter methods bootcamp focused on cytometry and single-cell fundamentals—timed to onboard new immuno-oncology fellows.",
        "Supports community pipeline strength.",
        "From short web summary.",
      ),
      created_by: actor,
    },
    {
      id: IDS.b7,
      source_item_id: IDS.i2,
      style: "concise" as const,
      prompt_version: "v1",
      generated_text: jsonBlurb(
        "Bispecific early data",
        "Early dose-escalation results for a bispecific in relapsed lymphoma show manageable CRS signals.",
        "Relevant to Okonkwo trial leadership.",
        "Press-style source; light detail.",
      ),
      created_by: actor,
    },
    {
      id: IDS.b8,
      source_item_id: IDS.i5,
      style: "newsletter" as const,
      prompt_version: "v1",
      generated_text: jsonBlurb(
        "Abscopal niches",
        "Preclinical work links abscopal responses to activated CD8 neighborhoods, echoing themes in radiation–immune combination science tracked by OCR.",
        "Bridges lab models to ongoing translational debates.",
        "Preclinical; not clinical advice.",
      ),
      created_by: editorUser.id,
    },
    {
      id: IDS.b9,
      source_item_id: IDS.i4,
      style: "social" as const,
      prompt_version: "v1",
      generated_text: jsonBlurb(
        "Playbook v2",
        "ImmunoX Data Cooperative drops harmonization playbook v2 — fewer batch surprises, cleaner cohort stories.",
        " Signals mature shared infrastructure.",
        "Institutional comms tone.",
      ),
      created_by: actor,
    },
    {
      id: IDS.b10,
      source_item_id: IDS.i6,
      style: "donor" as const,
      prompt_version: "v1",
      generated_text: jsonBlurb(
        "Investigator award",
        "Support for translational investigators helps OCR turn complex spatial datasets into therapies patients can access. Chen’s recognition underscores that pipeline.",
        "Connects philanthropy to measurable translation paths.",
        "Award coverage; no private figures cited.",
      ),
      created_by: editorUser.id,
    },
  ];

  const { error: summaryErr } = await admin.from("summaries").upsert(summaries, { onConflict: "id" });
  if (summaryErr) throw summaryErr;

  console.log("\nSeed complete.");
  console.log(`Admin login:    ${ADMIN_EMAIL} / ${DEV_PASSWORD}`);
  console.log(`Editor login:   ${EDITOR_EMAIL} / ${DEV_PASSWORD}`);
  if (immunoxPw) {
    console.log(
      `ImmunoX login:  ${IMMUNOX_LOGIN} (profile + auth; password from SEED_IMMUNOX_PASSWORD)`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
