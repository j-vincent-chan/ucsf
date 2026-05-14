/**
 * Smoke checks for AI Companion recommendation calibration.
 * Run: npm run test:ai-companion
 */
import assert from "node:assert/strict";

import { createDefaultRecommendationPreferenceProfile } from "../src/lib/social-signals/ai-companion/default-preferences";
import { generateSignalRecommendations } from "../src/lib/social-signals/ai-companion/engine";
import {
  buildInvestigatorSocialDirectory,
  investigatorHonorAffinity,
} from "../src/lib/social-signals/ai-companion/investigator-directory";
import { computeHybridScoringExplanation } from "../src/lib/social-signals/ai-companion/hybrid-companion-scoring";
import { extractSignalFeatures } from "../src/lib/social-signals/ai-companion/signal-features";
import type { SocialPost } from "../src/lib/social-signals/types";

function basePost(overrides: Partial<SocialPost> & Pick<SocialPost, "id" | "text">): SocialPost {
  return {
    platform: "bluesky",
    authorName: "Lab Account",
    authorHandle: "lab.bsky.social",
    url: "https://bsky.app/profile/lab/post/abc",
    postedAt: new Date().toISOString(),
    ...overrides,
  };
}

const profile = createDefaultRecommendationPreferenceProfile();

function recTypesFor(output: ReturnType<typeof generateSignalRecommendations>, signalId: string): string[] {
  return output.recommendations.filter((r) => r.signalIds.includes(signalId)).map((r) => r.type);
}

// 1. Routine clinical research — no Review Needed
{
  const id = "scenario-1-routine";
  const out = generateSignalRecommendations(
    [
      basePost({
        id,
        text: "We enrolled 120 patients; median overall survival improved vs standard of care in our phase II cohort.",
      }),
    ],
    { preferenceProfile: profile },
  );
  assert.ok(!recTypesFor(out, id).includes("Review Needed"), "routine clinical should not trigger Review Needed");
}

// 2. Cure-style claim — Review Needed
{
  const id = "scenario-2-cure";
  const out = generateSignalRecommendations(
    [
      basePost({
        id,
        text: "Our compound cures cancer based on early phase I mouse data — share widely.",
      }),
    ],
    { preferenceProfile: profile },
  );
  assert.ok(recTypesFor(out, id).includes("Review Needed"), "unsupported cure-style claim should trigger Review Needed");
}

// 3. Inflammatory / contested framing — Review Needed
{
  const id = "scenario-3-inflammatory";
  const out = generateSignalRecommendations(
    [
      basePost({
        id,
        text: "This NIH policy is a disgrace and a textbook cover-up.",
      }),
    ],
    { preferenceProfile: profile },
  );
  assert.ok(recTypesFor(out, id).includes("Review Needed"), "inflammatory language should trigger Review Needed");
}

// 4. Trainee award — Respond or Amplify, not Review Needed
{
  const id = "scenario-4-award";
  const out = generateSignalRecommendations(
    [
      basePost({
        id,
        text: "Huge congratulations to our trainee Sam Chen on the ACS doctoral trainee research award!",
      }),
    ],
    { preferenceProfile: profile },
  );
  const types = recTypesFor(out, id);
  assert.ok(!types.includes("Review Needed"), "trainee award should not trigger Review Needed");
  assert.ok(
    types.some((t) => t === "Respond" || t === "Amplify" || t === "Amplify & Respond"),
    "trainee award should suggest Respond, Amplify, or a merged card",
  );
}

// 5. Conference deadline — not Review Needed (milestone respond is ok)
{
  const id = "scenario-5-deadline";
  const out = generateSignalRecommendations(
    [
      basePost({
        id,
        text: "Reminder: abstract deadline March 15 for #ASHG2026 — submit your poster abstract!",
      }),
    ],
    { preferenceProfile: profile },
  );
  assert.ok(!recTypesFor(out, id).includes("Review Needed"), "conference deadline should not trigger Review Needed");
}

// 6. Publication + therapeutic implications — Amplify path, no Review Needed unless overstated
{
  const id = "scenario-6-publication";
  const out = generateSignalRecommendations(
    [
      basePost({
        id,
        text: "Our latest work https://doi.org/10.1038/s41586-020-0000-0 discusses therapeutic implications for patients with NSCLC.",
      }),
    ],
    { preferenceProfile: profile },
  );
  const types = recTypesFor(out, id);
  assert.ok(!types.includes("Review Needed"), "balanced publication + therapeutic language should not trigger Review Needed");
  assert.ok(
    types.includes("Amplify") || types.includes("Amplify & Respond"),
    "publication post should suggest Amplify (or merged amplify+respond)",
  );
}

// 7. Fellowship opportunity from roster handle — not HIGH honor signal (vs receiving an award)
{
  const roster = buildInvestigatorSocialDirectory([
    { x_handle: "CardioOncology", bluesky_handle: null, last_name: null },
  ]);
  const post = basePost({
    id: "scenario-7-fellowship-opp",
    platform: "x",
    authorHandle: "CardioOncology",
    text: "Excited to announce this special fellowship in #CardioImmunology at UCSF!",
  });
  assert.equal(
    investigatorHonorAffinity(post, roster),
    false,
    "fellowship opportunity announcement should not count as investigator honor HIGH",
  );
}

// 8. Received honor from roster handle — investigator honor HIGH
{
  const roster = buildInvestigatorSocialDirectory([
    { x_handle: "CardioOncology", bluesky_handle: null, last_name: null },
  ]);
  const post = basePost({
    id: "scenario-8-award-received",
    platform: "x",
    authorHandle: "CardioOncology",
    text: "Honored to receive the Excellence in Science Award from @AHAScience — grateful for this recognition.",
  });
  assert.equal(investigatorHonorAffinity(post, roster), true, "received award copy should count as investigator honor HIGH");
}

// 8b. Third-party institutional honor — honoree surname must not falsely match a different roster last name
{
  const roster = buildInvestigatorSocialDirectory([
    { x_handle: null, bluesky_handle: null, last_name: "Long" },
  ]);
  const post = basePost({
    id: "scenario-8b-honoree-name-collision",
    authorHandle: "ucberkeleyofficial.bsky.social",
    text: "Charles Long has been awarded the 2026 University Medal—the highest honor given to a graduating senior at UC Berkeley.",
  });
  assert.equal(
    investigatorHonorAffinity(post, roster),
    false,
    "bare last-name overlap in honoree name must not imply roster honor tie",
  );
}

// 8c. Investigator reposts a paper-style thread with fellowship / milestone words — not roster honor tie
{
  const roster = buildInvestigatorSocialDirectory([
    { x_handle: "katetest", bluesky_handle: null, last_name: null },
  ]);
  const post = basePost({
    id: "scenario-8c-repost-paper-fellowship",
    platform: "x",
    authorHandle: "LukeGilbertSF",
    text: "I am delighted to present our work on mTORC1 and ferroptosis. This grew from a postdoctoral fellowship project — read the preprint at https://biorxiv.org/foo",
    repostedBy: { displayName: "K Test", handle: "@katetest" },
  });
  assert.equal(
    investigatorHonorAffinity(post, roster),
    false,
    "reposted literature thread must not count as honor solely because a roster member reposted and copy mentions fellowship",
  );
}

// 8d. Investigator reposts clear receipt-style honor from a third-party author — still counts
{
  const roster = buildInvestigatorSocialDirectory([
    { x_handle: "katetest", bluesky_handle: null, last_name: null },
  ]);
  const post = basePost({
    id: "scenario-8d-repost-external-honor-receipt",
    platform: "x",
    authorHandle: "NobelPrize",
    text: "Honored to receive the 2026 Science Medal for our CRISPR work.",
    repostedBy: { displayName: "K Test", handle: "@katetest" },
  });
  assert.equal(investigatorHonorAffinity(post, roster), true, "reposted honor with receipt language should count");
}

// 9. Investigator reposts third-party news / institutional feature — HIGH Amplify (not only publication DOI)
{
  const roster = buildInvestigatorSocialDirectory([
    { x_handle: "katetest", bluesky_handle: null, last_name: null },
  ]);
  const id = "scenario-9-news-repost";
  const out = generateSignalRecommendations(
    [
      basePost({
        id,
        platform: "x",
        authorHandle: "@websedge_med",
        text: "Breaking silos in neuroscience, the Center for Neurovascular Brain Immunology at @GladstoneInst & @UCSF is decoding the brain–vascular–immune interface—advancing new therapies for neurodegeneration https://t.co/x",
        repostedBy: { displayName: "K Test", handle: "@katetest" },
      }),
    ],
    {
      preferenceProfile: profile,
      feedTab: "lists",
      investigatorDirectory: roster,
      watchlistLinkVerified: { [id]: true },
    },
  );
  const amplify = out.recommendations.find(
    (r) => r.signalIds.includes(id) && (r.type === "Amplify" || r.type === "Amplify & Respond"),
  );
  assert.ok(amplify, "investigator repost of institutional news should emit Amplify");
  assert.equal(amplify?.priority, "high", "news/feature repost by roster should be HIGH priority");
}

// 10. Investigator reposts a third-party publication — not HIGH program publication signal on Investigators tab
{
  const roster = buildInvestigatorSocialDirectory([
    { x_handle: "simone_minnie", bluesky_handle: null, last_name: null },
  ]);
  const id = "scenario-10-external-paper-repost";
  const out = generateSignalRecommendations(
    [
      basePost({
        id,
        platform: "x",
        authorHandle: "aaronmring",
        text: "Autoantibodies and neuropsychiatric disease https://doi.org/10.1016/j.cell.2024.01.001",
        repostedBy: { displayName: "Simone Minnie", handle: "@simone_minnie" },
      }),
    ],
    { preferenceProfile: profile, feedTab: "lists", investigatorDirectory: roster },
  );
  assert.ok(
    !out.recommendations.some(
      (r) => r.signalIds.includes(id) && (r.type === "Amplify" || r.type === "Amplify & Respond"),
    ),
    "reposted external-author publication should not emit Amplify when poster is not on roster",
  );
}

// 11. People roster present + publication URL but link not verified to roster — not program publication amplify
{
  const roster = buildInvestigatorSocialDirectory([
    { x_handle: "lab_pi", bluesky_handle: null, last_name: null },
  ]);
  const id = "scenario-11-pub-unverified-roster";
  const out = generateSignalRecommendations(
    [
      basePost({
        id,
        platform: "x",
        authorHandle: "external_author",
        text: "Methods advance https://doi.org/10.1038/s41586-020-0000-0",
      }),
    ],
    { preferenceProfile: profile, investigatorDirectory: roster },
  );
  assert.ok(
    !out.recommendations.some(
      (r) =>
        r.signalIds.includes(id) &&
        (r.type === "Amplify" || r.type === "Amplify & Respond") &&
        r.title === "Publication signal",
    ),
    "DOI post from non-roster author should not be publication amplify until link verification matches People roster",
  );
}

// Hybrid rubric: watched PI + verified DOI → High Value tier
{
  const dir = buildInvestigatorSocialDirectory([
    { x_handle: "pi_user", bluesky_handle: null, last_name: "Smith" },
  ]);
  const post = basePost({
    id: "hybrid-pi-paper",
    platform: "x",
    authorHandle: "pi_user",
    text: "Thrilled to share our Cell paper https://doi.org/10.1016/j.cell.2024.01.001 — corresponding author: Smith.",
  });
  const ex = computeHybridScoringExplanation({
    post,
    features: extractSignalFeatures(post),
    investigatorDirectory: dir,
    watchlistLinkVerified: { "hybrid-pi-paper": true },
    now: new Date(),
    preferenceProfile: profile,
  });
  assert.ok(
    ex.category === "High Value: Amplify" || ex.category === "High Value: Needs Review",
    "PI-authored verified major paper should score in a High Value category",
  );
}

// Hybrid rubric: investigator reposts unrelated paper → not High Value
{
  const dir = buildInvestigatorSocialDirectory([
    { x_handle: "simone_minnie", bluesky_handle: null, last_name: null },
  ]);
  const post = basePost({
    id: "hybrid-repost-external",
    platform: "x",
    authorHandle: "aaronmring",
    text: "Autoantibodies and neuropsychiatric disease https://doi.org/10.1016/j.cell.2024.01.001",
    repostedBy: { displayName: "Simone Minnie", handle: "@simone_minnie" },
  });
  const ex = computeHybridScoringExplanation({
    post,
    features: extractSignalFeatures(post),
    investigatorDirectory: dir,
    watchlistLinkVerified: {},
    now: new Date(),
    preferenceProfile: profile,
  });
  assert.ok(
    ex.category === "Low Value" || ex.category === "Medium Value: Monitor",
    "Investigator repost of unrelated paper should not reach High Value",
  );
  assert.ok(
    ex.topReasons.some((r) => r.includes("reposted")) || ex.topReasons.some((r) => r.includes("Repost")),
    "Explanation should surface repost-only / verification gap",
  );
}

// Hybrid: literature + URL + non-roster author — verification still pending must not imply tier-40 tie
{
  const dir = buildInvestigatorSocialDirectory([
    { x_handle: "simone_minnie", bluesky_handle: null, last_name: "Smith" },
  ]);
  const post = basePost({
    id: "hybrid-repost-verify-pending",
    platform: "x",
    authorHandle: "LukeGilbertSF",
    text: "I am delighted to present our work 10.1016/j.cell.2024.01.001 on mTORC1 and ferroptosis.",
    repostedBy: { displayName: "Simone Minnie", handle: "@simone_minnie" },
  });
  const ex = computeHybridScoringExplanation({
    post,
    features: extractSignalFeatures(post),
    investigatorDirectory: dir,
    watchlistLinkVerified: undefined,
    now: new Date(),
    preferenceProfile: profile,
  });
  assert.ok(
    ex.deterministicScore.communityRelevance < 40,
    "Until link verification returns true, external literature must not max community relevance",
  );
}

// Hybrid: server checked linked paper HTML and found no People roster authors — no max community tie
{
  const dir = buildInvestigatorSocialDirectory([
    { x_handle: "simone_minnie", bluesky_handle: null, last_name: "Smith" },
  ]);
  const post = basePost({
    id: "hybrid-repost-link-checked-no-roster",
    platform: "x",
    authorHandle: "LukeGilbertSF",
    text: "I am delighted to present our work https://doi.org/10.1016/j.cell.2024.01.001 on mTORC1 and ferroptosis.",
    repostedBy: { displayName: "Simone Minnie", handle: "@simone_minnie" },
  });
  const ex = computeHybridScoringExplanation({
    post,
    features: extractSignalFeatures(post),
    investigatorDirectory: dir,
    watchlistLinkVerified: { "hybrid-repost-link-checked-no-roster": false },
    now: new Date(),
    preferenceProfile: profile,
  });
  assert.ok(
    ex.deterministicScore.communityRelevance < 40,
    "Explicit failed link verification must not yield max community relevance for non-roster author",
  );
}

// Risk worse than −15 cannot be High Value: Amplify
{
  const post = basePost({
    id: "hybrid-risk",
    text: "This NIH policy is a disgrace and a textbook cover-up. Also our trial cures cancer in weeks.",
  });
  const ex = computeHybridScoringExplanation({
    post,
    features: extractSignalFeatures(post),
    now: new Date(),
    preferenceProfile: profile,
  });
  assert.ok(ex.deterministicScore.riskPenalty <= -10);
  assert.notEqual(ex.category, "High Value: Amplify", "Severe risk content must not be High Value: Amplify");
}

// Duplicate / processed lowers timeliness (score 0 when flagged)
{
  const post = basePost({
    id: "hybrid-dup",
    text: "Reminder https://doi.org/10.1038/s41586-020-0000-0",
  });
  const ex = computeHybridScoringExplanation({
    post,
    features: extractSignalFeatures(post),
    now: new Date(),
    preferenceProfile: profile,
    hints: { isDuplicate: true },
  });
  assert.equal(ex.deterministicScore.timelinessNovelty, 0, "duplicate hint should zero timeliness");
}

// Bounded learning: repeated “not useful” on archetype lowers modifier
{
  const prof = createDefaultRecommendationPreferenceProfile({
    learnedFeedback: {
      ...createDefaultRecommendationPreferenceProfile().learnedFeedback,
      archetypeNotUsefulCounts: { publication: 5 },
    },
  });
  const post = basePost({
    id: "hybrid-learn",
    text: "Our latest work https://doi.org/10.1038/s41586-020-0000-0 on NSCLC biology.",
  });
  const ex = computeHybridScoringExplanation({
    post,
    features: extractSignalFeatures(post),
    now: new Date(),
    preferenceProfile: prof,
  });
  assert.ok(ex.communityLearningModifier < 0, "repeated not-useful on publication archetype should apply negative learning");
}

// Roster author + publication link without People verification → not tier-40 community relevance
{
  const dir = buildInvestigatorSocialDirectory([
    { x_handle: "simone_minnie", bluesky_handle: null, last_name: "Minnie" },
  ]);
  const post = basePost({
    id: "hybrid-roster-author-external-pub",
    platform: "x",
    authorHandle: "simone_minnie",
    text: "There is so much nuance in this paper https://doi.org/10.1016/j.cell.2024.01.001 that is not immediately clear.",
  });
  const ex = computeHybridScoringExplanation({
    post,
    features: extractSignalFeatures(post),
    investigatorDirectory: dir,
    watchlistLinkVerified: {},
    now: new Date(),
    preferenceProfile: profile,
  });
  assert.ok(
    ex.deterministicScore.communityRelevance <= 10,
    "Roster investigator posting about a linked paper without roster verification should not get 40 community relevance",
  );
}

// Same rule when the post discusses a paper in prose ("this paper") without a URL that triggers looksLikePublication
{
  const dir = buildInvestigatorSocialDirectory([
    { x_handle: "simone_minnie", bluesky_handle: null, last_name: "Minnie" },
  ]);
  const post = basePost({
    id: "hybrid-roster-this-paper-prose",
    platform: "x",
    authorHandle: "simone_minnie",
    text: "There is so much nuance in this paper about slamf6 that is not immediately clear to readers.",
  });
  const ex = computeHybridScoringExplanation({
    post,
    features: extractSignalFeatures(post),
    investigatorDirectory: dir,
    watchlistLinkVerified: {},
    now: new Date(),
    preferenceProfile: profile,
  });
  assert.ok(
    ex.deterministicScore.communityRelevance <= 10,
    "Roster investigator 'this paper' commentary without verification should not get 40 community relevance",
  );
}

console.log("ai-companion-scenarios: all checks passed.");
