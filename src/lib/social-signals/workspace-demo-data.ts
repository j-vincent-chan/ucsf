import type {
  AnalyticsSummary,
  CalendarPostEvent,
  Campaign,
  DashboardCounts,
  RecentActivityItem,
  Recommendation,
  ReviewQueueItem,
  WorkspaceAsset,
  WorkspaceSocialPost,
} from "./workspace-types";
import { BLUESKY_CHAR_LIMIT, X_CHAR_LIMIT } from "./workspace-types";

const iso = (daysAgo: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const isoFuture = (days: number, hour = 14) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 30, 0, 0);
  return d.toISOString();
};

export const INITIAL_DASHBOARD_COUNTS: DashboardCounts = {
  draftPosts: 6,
  needsReview: 3,
  scheduled: 5,
  published: 42,
  topPerformerLabel: "Regulatory T cells · type 1 diabetes (Bluesky)",
  topPerformerPlatform: "bluesky",
};

export const INITIAL_RECENT_ACTIVITY: RecentActivityItem[] = [
  {
    id: "a1",
    at: iso(0, 9),
    summary: "Bluesky draft saved — Schistosomiasis-associated pulmonary hypertension",
    platform: "bluesky",
  },
  {
    id: "a2",
    at: iso(0, 11),
    summary: "X post scheduled — Biospecimen Pipeline RFA reminder",
    platform: "x",
  },
  {
    id: "a3",
    at: iso(1, 15),
    summary: "Review requested — Cancer vaccine research thread",
    platform: "x",
  },
  {
    id: "a4",
    at: iso(2, 10),
    summary: "Published — ImmunoDiverse Colloquia kickoff (Bluesky)",
    platform: "bluesky",
  },
];

export const INITIAL_RECOMMENDATIONS: Recommendation[] = [
  {
    id: "r1",
    action: "Post to Bluesky first",
    reason:
      "Strong fit for a scientific audience and conversational framing around mechanism-heavy diabetes immunology.",
    platforms: ["bluesky"],
    angle: "Lead with cellular mechanism, link to UCSF context second.",
    reviewNeed: "Standard program review if quoting lab-specific claims.",
    ctaLabel: "Open composer",
  },
  {
    id: "r2",
    action: "Create X thread",
    reason: "Multiple discrete findings from the cancer vaccine signal can become a 4-post sequence without overclaiming.",
    platforms: ["x"],
    angle: "One finding per post; final post links to read more.",
    reviewNeed: "PI review — mentions ongoing trial context.",
    ctaLabel: "Draft thread",
  },
  {
    id: "r3",
    action: "Post to both platforms",
    reason: "Timely UCSF funding opportunity with clear apply CTA — different lengths per platform.",
    platforms: ["x", "bluesky"],
    angle: "X: urgency + deadline; Bluesky: eligibility detail + link.",
    reviewNeed: "Funder acknowledgement line required.",
    ctaLabel: "Generate pair",
  },
  {
    id: "r4",
    action: "Add BioRender-style illustration",
    reason: "Mechanism is visually explainable (Treg → beta cell protection narrative).",
    platforms: ["x", "bluesky"],
    angle: "Pair simplified schematic with plain-language caption.",
    reviewNeed: "Image rights / accuracy review.",
    ctaLabel: "Suggest image prompt",
  },
];

export const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: "c1",
    name: "ImmunoDiverse Colloquia",
    goal: "Drive registration among trainees and faculty.",
    audience: "scientific",
    platforms: ["bluesky", "x"],
    plannedPosts: 8,
    status: "active",
    impressionsDemo: 12400,
    engagementRateDemo: 4.2,
    upcomingCount: 2,
  },
  {
    id: "c2",
    name: "Biospecimen Pipeline RFA",
    goal: "Qualified applications before deadline.",
    audience: "scientific",
    platforms: ["x", "bluesky"],
    plannedPosts: 5,
    status: "active",
    impressionsDemo: 8200,
    engagementRateDemo: 3.1,
    upcomingCount: 1,
  },
  {
    id: "c3",
    name: "Cancer Vaccine Research Spotlight",
    goal: "Accurate visibility for therapeutic vaccine science.",
    audience: "public",
    platforms: ["x", "bluesky"],
    plannedPosts: 6,
    status: "planning",
    impressionsDemo: undefined,
    engagementRateDemo: undefined,
    upcomingCount: 0,
  },
  {
    id: "c4",
    name: "Diabetes Research Digest",
    goal: "Explain Treg strategies without hype.",
    audience: "donor_facing",
    platforms: ["bluesky"],
    plannedPosts: 4,
    status: "active",
    impressionsDemo: 5600,
    engagementRateDemo: 5.8,
    upcomingCount: 1,
  },
  {
    id: "c5",
    name: "OCR Services Awareness",
    goal: "Program update reach for internal + partner labs.",
    audience: "internal",
    platforms: ["x"],
    plannedPosts: 3,
    status: "paused",
    impressionsDemo: 2100,
    engagementRateDemo: 2.4,
    upcomingCount: 0,
  },
];

export const INITIAL_ASSETS: WorkspaceAsset[] = [
  {
    id: "as1",
    name: "UCSF ImmunoX wordmark (approved)",
    kind: "logo",
    usageNotes: "Clear space ≥ 0.25× height; light backgrounds only in social crops.",
    previewHint: "Logo",
  },
  {
    id: "as2",
    name: "Hashtag bank — translational immunology",
    kind: "hashtag_bank",
    campaign: "Diabetes Research Digest",
    usageNotes: "Rotate; max 3 per post.",
    body: "#Immunology #Type1Diabetes #UCSF #ClinicalResearch",
  },
  {
    id: "as3",
    name: "CTA — Apply / RFA",
    kind: "cta_snippet",
    campaign: "Biospecimen Pipeline RFA",
    usageNotes: "Pair with deadline date from signal.",
    body: "Learn eligibility and apply →",
  },
  {
    id: "as4",
    name: "Funder acknowledgement — NIH template",
    kind: "funder_ack",
    usageNotes: "Insert when grant number present in signal.",
    body: "Research supported by the National Institutes of Health.",
  },
  {
    id: "as5",
    name: "Alt text — microscopy strip",
    kind: "alt_text_snippet",
    usageNotes: "Generic microscopy hero shots.",
    body: "Microscopy image of immune cells in tissue section; labels indicate staining channels.",
  },
  {
    id: "as6",
    name: "Image prompt — Treg / beta cell narrative",
    kind: "image_prompt",
    campaign: "Diabetes Research Digest",
    usageNotes: "BioRender-inspired editorial schematic style.",
    body:
      "Clean editorial schematic: regulatory T cells interacting with pancreatic islet, muted blues and sand tones, no proprietary logos.",
  },
  {
    id: "as7",
    name: "Program boilerplate — OCR services",
    kind: "boilerplate",
    campaign: "OCR Services Awareness",
    usageNotes: "Pair with service URL from program update signal.",
    body: "OCR supports compliant imaging workflows for multicenter studies.",
  },
];

export const INITIAL_ANALYTICS: AnalyticsSummary = {
  publishedPosts: 42,
  impressions: 128000,
  likes: 4200,
  reposts: 980,
  replies: 610,
  linkClicks: 2400,
  engagementRate: 3.6,
  followerGrowth: 128,
  bestPostX:
    "UCSF-led work highlights rigorous approaches to cancer vaccine antigen design — promising direction, still early-stage science.",
  bestPostBluesky:
    "New research signal: regulatory T cells as a more precise way to dial down autoimmune activity in type 1 diabetes…",
  suggestedNextAction: "Schedule Bluesky follow-up on diabetes thread during weekday AM PT.",
  topTopics: [
    "Immune regulation",
    "Clinical translation",
    "Funding & RFAs",
    "Training / colloquia",
  ],
  topInvestigators: ["Lab networks tied to ImmunoX", "Cross-campus OCR collaborators"],
  bestContentType: "Funding opportunity + clear deadline",
  bestPlatform: "bluesky",
  bestVisualStyle: "Single schematic + short caption",
  bestAudienceFit: "Scientific (peer tone)",
  demoMetrics: true,
};

function basePost(p: Partial<WorkspaceSocialPost> & Pick<WorkspaceSocialPost, "id" | "platform" | "status" | "text">): WorkspaceSocialPost {
  const limit = p.platform === "x" ? X_CHAR_LIMIT : BLUESKY_CHAR_LIMIT;
  return {
    accountHandle: p.platform === "x" ? "@ImmunoX" : "@immunox.bsky.social",
    displayName: p.platform === "x" ? "ImmunoX" : "ImmunoX",
    sourceSignalType: "paper",
    sourceSignalTitle: "Research signal",
    hashtags: [],
    mentions: [],
    createdAt: iso(1),
    characterLimit: limit,
    reviewFlags: [],
    ...p,
  };
}

export const INITIAL_WORKSPACE_POSTS: WorkspaceSocialPost[] = [
  basePost({
    id: "w1",
    platform: "x",
    status: "needs_review",
    sourceSignalType: "paper",
    sourceSignalTitle: "Regulatory T cells in type 1 diabetes",
    text: "UCSF researchers are exploring regulatory T cells as a targeted way to calm the autoimmune response in type 1 diabetes — aiming to preserve immune function while protecting insulin-producing cells.",
    hashtags: ["#Type1Diabetes", "#Immunology", "#UCSF"],
    mentions: [],
    linkPreview: {
      title: "UCSF Diabetes Center — research overview",
      url: "https://example.edu/diabetes-research",
      description: "Translational programs spanning immune tolerance and beta-cell protection.",
    },
    altTextStatus: "suggested",
    altText: "Diagram-style representation of immune regulation near pancreatic islets.",
    threadCount: 1,
    reviewFlags: ["needs_pi_review"],
    characterLimit: X_CHAR_LIMIT,
  }),
  basePost({
    id: "w2",
    platform: "bluesky",
    status: "draft",
    sourceSignalType: "paper",
    sourceSignalTitle: "Regulatory T cells in type 1 diabetes",
    text: "New research signal: regulatory T cells are being developed as a more precise way to suppress autoimmune activity in type 1 diabetes, with the long-term goal of preserving beta cells without broad immune suppression.",
    hashtags: ["Immunology", "T1D"],
    linkPreview: {
      title: "Companion brief — immune tolerance",
      url: "https://example.edu/t1d-tregs",
      description: "Plain-language summary for scientific readers.",
    },
    altTextStatus: "ok",
    altText: "Illustration summarizing Treg modulation concept.",
    characterLimit: BLUESKY_CHAR_LIMIT,
  }),
  basePost({
    id: "w3",
    platform: "x",
    status: "scheduled",
    sourceSignalType: "funding_opportunity",
    sourceSignalTitle: "Biospecimen Pipeline RFA",
    text: "Reminder: the Biospecimen Pipeline RFA is open — strong fit for multicenter studies improving sample quality and traceability. Check eligibility and key dates before you apply.",
    hashtags: ["#ResearchFunding", "#UCSF"],
    scheduledAt: isoFuture(2, 9),
    linkPreview: {
      title: "Biospecimen Pipeline — funding hub",
      url: "https://example.edu/biospecimen-rfa",
      description: "Deadlines, templates, and contact points.",
    },
    altTextStatus: "missing",
    characterLimit: X_CHAR_LIMIT,
    campaignId: "c2",
  }),
  basePost({
    id: "w4",
    platform: "bluesky",
    status: "published",
    sourceSignalType: "event",
    sourceSignalTitle: "ImmunoDiverse Colloquia — spring kickoff",
    text: "ImmunoDiverse Colloquia kicks off this spring — sessions foreground trainees and cross-disciplinary immune science. Registration is open; share with your lab slack.",
    hashtags: ["ImmunoDiverse", "UCSF"],
    publishedAt: iso(3, 16),
    engagement: { likes: 214, reposts: 48, replies: 17 },
    characterLimit: BLUESKY_CHAR_LIMIT,
  }),
  basePost({
    id: "w5",
    platform: "x",
    status: "draft",
    sourceSignalType: "news",
    sourceSignalTitle: "Schistosomiasis-associated pulmonary hypertension",
    text: "Important signal from global health research: schistosomiasis-associated pulmonary hypertension remains underdiagnosed — new cohort insights underscore early screening in endemic settings.",
    hashtags: ["#GlobalHealth", "#PulmonaryHypertension"],
    characterLimit: X_CHAR_LIMIT,
  }),
  basePost({
    id: "w6",
    platform: "bluesky",
    status: "needs_image",
    sourceSignalType: "program_update",
    sourceSignalTitle: "OCR services workflow update",
    text: "Program update: OCR services refined onboarding steps for imaging cores — reduces rework for multicenter trials. Details in the internal handbook + office hours Thursday.",
    altTextStatus: "missing",
    characterLimit: BLUESKY_CHAR_LIMIT,
    reviewFlags: ["needs_program_comms_review"],
  }),
  basePost({
    id: "w7",
    platform: "x",
    status: "changes_requested",
    sourceSignalType: "award",
    sourceSignalTitle: "New high-impact UCSF publication",
    text: "Congratulations to the team behind a new high-impact UCSF publication — rigorous work advancing how we model immune responses in tissue microenvironments.",
    hashtags: ["#UCSF"],
    reviewFlags: ["needs_alt_text", "embargo_sensitive"],
    characterLimit: X_CHAR_LIMIT,
  }),
  basePost({
    id: "w8",
    platform: "bluesky",
    status: "approved",
    sourceSignalType: "funding_opportunity",
    sourceSignalTitle: "UCSF research funding opportunity",
    text: "Funding signal: UCSF opportunity aimed at early-career investigators bridging computation and wet-lab immunology — short LOI window; read criteria carefully before applying.",
    hashtags: ["Funding", "UCSF"],
    characterLimit: BLUESKY_CHAR_LIMIT,
  }),
];

export const INITIAL_CALENDAR_EVENTS: CalendarPostEvent[] = [
  {
    id: "cal1",
    platform: "x",
    summary: "Biospecimen RFA reminder",
    status: "scheduled",
    scheduledAt: isoFuture(2, 9),
    campaignId: "c2",
    sourceSignalTitle: "Biospecimen Pipeline RFA",
  },
  {
    id: "cal2",
    platform: "bluesky",
    summary: "Diabetes Treg thread (pt 1)",
    status: "scheduled",
    scheduledAt: isoFuture(1, 8),
    campaignId: "c4",
    sourceSignalTitle: "Regulatory T cells in type 1 diabetes",
  },
  {
    id: "cal3",
    platform: "bluesky",
    summary: "Colloquia registration nudge",
    status: "scheduled",
    scheduledAt: isoFuture(4, 11),
    campaignId: "c1",
    sourceSignalTitle: "ImmunoDiverse Colloquia",
  },
  {
    id: "cal4",
    platform: "x",
    summary: "Cancer vaccine spotlight",
    status: "draft",
    scheduledAt: isoFuture(6, 15),
    campaignId: "c3",
    sourceSignalTitle: "Cancer vaccine research",
  },
];

export const INITIAL_REVIEW_QUEUE: ReviewQueueItem[] = [
  {
    id: "rq1",
    post: INITIAL_WORKSPACE_POSTS[0]!,
    assignedReviewer: "M. Chen",
    reviewStatus: "needs_review",
    dueDate: isoFuture(1, 17),
    version: 2,
    flags: ["needs_pi_review", "mentions_unpublished_data"],
    comments: [
      {
        id: "cm1",
        author: "M. Chen",
        initials: "MC",
        body: "Can we soften the opening clause until the preprint is live?",
        at: iso(0, 14),
      },
    ],
  },
  {
    id: "rq2",
    post: INITIAL_WORKSPACE_POSTS[6]!,
    assignedReviewer: "A. Ruiz",
    reviewStatus: "changes_requested",
    dueDate: isoFuture(3, 12),
    version: 1,
    flags: ["needs_alt_text", "embargo_sensitive"],
    comments: [
      {
        id: "cm2",
        author: "A. Ruiz",
        initials: "AR",
        body: "Hold until comms clears embargo date — add alt text before approval.",
        at: iso(1, 11),
      },
    ],
  },
  {
    id: "rq3",
    post: INITIAL_WORKSPACE_POSTS[5]!,
    reviewStatus: "needs_review",
    version: 1,
    flags: ["needs_program_comms_review"],
    comments: [],
  },
];

export const DEMO_SIGNAL_OPTIONS = [
  { id: "sig1", label: "Paper — Regulatory T cells & type 1 diabetes" },
  { id: "sig2", label: "News — Schistosomiasis-associated pulmonary hypertension" },
  { id: "sig3", label: "Funding — Biospecimen Pipeline RFA" },
  { id: "sig4", label: "Event — ImmunoDiverse Colloquia" },
  { id: "sig5", label: "Program update — OCR services" },
  { id: "sig6", label: "Award — High-impact UCSF publication" },
  { id: "sig7", label: "Funding — UCSF investigator bridge award" },
] as const;
