/**
 * Writing tone for digest / social-style summaries (Signal Digest card + generate-blurb).
 */
export const DIGEST_SUMMARY_TONE_OPTIONS = [
  { id: "professional", label: "Professional" },
  { id: "warm", label: "Warm" },
  { id: "strategic", label: "Strategic" },
  { id: "witty", label: "Witty" },
  { id: "thought_leadership", label: "Perspective" },
  { id: "technical", label: "Technical" },
] as const;

export type DigestSummaryTone = (typeof DIGEST_SUMMARY_TONE_OPTIONS)[number]["id"];

/** Default matches "Professional" in the UI. */
export const DEFAULT_DIGEST_SUMMARY_TONE: DigestSummaryTone = "professional";

/**
 * Appended to the generate-blurb system prompt so the model applies the selected style.
 */
export function digestSummaryTonePromptBlock(tone: DigestSummaryTone): string {
  switch (tone) {
    case "professional":
      return `WRITING TONE — Professional:
Polished, credible, and appropriate for official program communications and professional audiences. Lead with the finding, publication, or study design when it helps. Use measured language and precise verbs. Vary sentence length. Do not use hype, exclamation points, or generic marketing phrases.`;
    case "warm":
      return `WRITING TONE — Warm / Community-oriented:
Genuinely inviting and people-centered: celebrate the team, collaborators, and community impact. You may use an energetic open when it fits the science. Use concrete, human phrasing—NOT saccharine labels, NOT meta-phrases about "heartwarming" or "warm conditions," and NOT a single decorative adjective stuck on the original first sentence. Rewrite the whole paragraph so it sounds like it was written for people who care about the work, not a template.`;
    case "strategic":
      return `WRITING TONE — Strategic / Executive:
High-level and outcome-oriented. Lead with the problem, gap, or stake in the field, then the approach and what it enables (platform value, translational path, or actionable insight). Favor clarity about *why this matters now* and *what changes* because of the work. Do NOT open with self-referential "strategic" commentary (e.g. "Under strategic leadership," "Strategically," "From a strategy perspective")—show strategy through structure and emphasis, not labels. Rebalance the whole piece toward impact and consequences, rephrasing most sentences.`;
    case "witty":
      return `WRITING TONE — Witty:
Smart, memorable, and lightly playful while staying accurate. Prefer a surprising angle or crisp rhythm over jokes that distract from the science. Avoid snark, memes, or hype. Rewrite substantively—wit should run through word choice and pacing, not just a quirky first clause.`;
    case "thought_leadership":
      return `WRITING TONE — Perspective:
Position the work in a bigger picture: trends in the field, unmet needs, or how the method changes what others can ask next. Sound reflective and authoritative, not promotional. Connect to implications beyond this one paper. Rework most of the wording; do not only prepend a sentence about "the landscape."`;
    case "technical":
      return `WRITING TONE — Technical:
Mechanism- and methods-forward: cell types, pathways, models, readouts, and constraints where relevant. Prefer precision over slogan. Researchers should feel the paper's logic. Reorganize for clarity of experiment and result; avoid dumbing down with vague summary adjectives.`;
    default: {
      const _x: never = tone;
      return _x;
    }
  }
}

/**
 * Extra rules for "Apply tone & length" so the model does full rewrites, not prefix tweaks.
 */
export function digestSummaryToneAdjustExtraRules(): string {
  return `FULL REWRITE (not a light edit):
- Change vocabulary, sentence length, rhythm, and emphasis throughout. At least half the sentences should be meaningfully rephrased—not the same skeleton with synonyms in one slot.
- Do NOT satisfy the tone by only prepending or tacking on an opening phrase to the first sentence. Forbidden patterns include: "Under strategic leadership," "Under heartwarming conditions," "In a warm/collaborative spirit," "Strategically speaking," "From a leadership perspective," or similar meta-openers that leave the rest of the text unchanged.
- You may reorder clauses and ideas for clarity and tone. Keep every factual claim, name, number, and technical relationship accurate; do not invent results.
- Output only the rewritten paragraph(s), no preamble or explanation.`;
}
