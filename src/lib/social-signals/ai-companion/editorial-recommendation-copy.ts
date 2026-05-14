import type { SocialFeedTab, SocialPost } from "@/lib/social-signals/types";

/** Job / faculty-search posts often surface on Investigators lists; avoid “milestone” framing. */
function looksLikeRecruitmentOrJobShare(text: string): boolean {
  const t = text.toLowerCase();
  if (
    /\b(faculty search|faculty position|faculty hire|open[- ]rank|tenure[- ]?track|assistant professor|associate professor|professor position)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/\b(we'?re hiring|we are hiring|now hiring|hiring alert|job post(?:ing)?|open position|openings? at)\b/.test(t)) return true;
  if (/\b(postdoc|post-doctoral|phd student|graduate student|lab manager|staff scientist|research assistant)\b.*\b(wanted|opening|search|hire)\b/i.test(t))
    return true;
  if (/\b(join (?:our|the) (?:lab|team|department|program)|come be my colleague|apply (?:today|here|now)|careers\.|jobs\.|recruit\.|aprecruit\.)\b/i.test(t))
    return true;
  if (/\bjpf\d+\b/i.test(t)) return true;
  if (/\bucsf\b/i.test(t) && /\b(search|hire|hiring|recruit|faculty|position|opening|posting)\b/i.test(t)) return true;
  return false;
}

function formatAt(handle: string): string {
  const h = handle.trim().replace(/^@+/, "");
  return h ? `@${h}` : "this account";
}

/** Primary name for editorial copy (given name + family when available). */
export function editorialAuthorLine(post: SocialPost): string {
  const n = post.authorName?.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    return parts.slice(0, 4).join(" ");
  }
  return formatAt(post.authorHandle);
}

function boosterLine(post: SocialPost): string | null {
  const rb = post.repostedBy;
  if (!rb) return null;
  const dn = rb.displayName?.trim();
  const at = formatAt(rb.handle);
  if (dn) return `${dn} (${at})`;
  return at;
}

/** Short, human repost context without “configured lists” jargon. */
function repostEditorialTail(post: SocialPost, feedTab: SocialFeedTab | undefined): string {
  const b = boosterLine(post);
  if (!b) return "";
  if (feedTab === "lists") return `You’re seeing it after ${b} surfaced it in your Investigators view.`;
  if (feedTab === "mentions") return `You’re seeing it after ${b} brought it into mentions.`;
  return `You’re seeing it after a boost from ${b}.`;
}

export function buildAmplifyEditorial(input: {
  post: SocialPost;
  feedTab: SocialFeedTab | undefined;
  pubForAmplify: boolean;
  honorInvestigatorHigh: boolean;
  investigatorNewsForAmplify: boolean;
  unusuallyHigh: boolean;
}): { whyItMatters: string; nextStepEditorial: string } {
  const { post, feedTab, pubForAmplify, honorInvestigatorHigh, investigatorNewsForAmplify, unusuallyHigh } = input;
  const who = editorialAuthorLine(post);
  const text = post.text || "";
  const lower = text.toLowerCase();
  const tail = repostEditorialTail(post, feedTab);

  if (pubForAmplify) {
    const core = `${who} is sharing research that reads like a paper or preprint worth a second look.`;
    const why = tail ? `${core} ${tail}`.trim() : core;
    return {
      whyItMatters: why,
      nextStepEditorial: "Skim the claim and link, then feature, digest, or pass.",
    };
  }

  if (honorInvestigatorHigh) {
    let core = "";
    if (/\bucsf\b/i.test(text)) {
      core = `${who} is celebrating UCSF-linked recognition here. That is often a strong moment for warm, professional amplification.`;
    } else if (/\b(award|honored|honoured|honor|prize|medal|byers|fellowship)\b/i.test(lower)) {
      core = `${who} is marking an award or honor in this post; that usually lands well as a congratulatory signal when the tone matches yours.`;
    } else {
      core = `${who} is spotlighting recognition or a milestone. If it fits your voice, it can carry cleanly to social or a short newsletter line.`;
    }
    const why = tail ? `${core} ${tail}`.trim() : core;
    return {
      whyItMatters: why,
      nextStepEditorial: "Verify the post, match your voice, then post a short congrats for social or newsletter.",
    };
  }

  if (investigatorNewsForAmplify) {
    const core = post.repostedBy
      ? "Someone you follow surfaced external coverage that’s worth a quick editorial read before you signal-boost it."
      : "Coverage here is relevant to people you track. Worth a quick read before you decide to lift it up.";
    const why = tail ? `${core} ${tail}`.trim() : core;
    return {
      whyItMatters: why,
      nextStepEditorial: "Open the link, add one line in your voice, then post or queue if it still fits.",
    };
  }

  if (unusuallyHigh) {
    const slice =
      feedTab === "following"
        ? "your Following slice"
        : feedTab === "mentions"
          ? "mentions"
          : feedTab === "lists"
            ? "Investigators"
            : "this feed slice";
    const core = `Engagement on this post is outpacing typical items in ${slice}. Pause to see if the substance matches what you usually amplify.`;
    const why = tail ? `${core} ${tail}`.trim() : core;
    return {
      whyItMatters: why,
      nextStepEditorial: "If it holds up, add one framing line and share; otherwise skip.",
    };
  }

  const core =
    feedTab === "following"
      ? "This post is picking up attention alongside funding, event, or news-style hooks among accounts you follow."
      : "This post is picking up more attention than usual in this window.";
  const why = tail ? `${core} ${tail}`.trim() : core;
  return {
    whyItMatters: why,
    nextStepEditorial: "Read once for substance, then pass or share with one sharp comment.",
  };
}

export function buildRespondEditorial(input: {
  post: SocialPost;
  feedTab: SocialFeedTab | undefined;
  honorInvestigatorHigh: boolean;
  investigatorNewsForAmplify: boolean;
}): { whyItMatters: string; nextStepEditorial: string } {
  const { post, feedTab, honorInvestigatorHigh, investigatorNewsForAmplify } = input;
  const who = editorialAuthorLine(post);
  const tail = repostEditorialTail(post, feedTab);
  const text = post.text || "";

  if (looksLikeRecruitmentOrJobShare(text)) {
    const core = `${who} is surfacing a faculty or staff search / open role—recruiting content, not a personal milestone or community celebration.`;
    const why = tail ? `${core} ${tail}`.trim() : core;
    return {
      whyItMatters: why,
      nextStepEditorial: "If you reply, add one concrete angle (who it fits or why the role matters); otherwise pass or share with the right network.",
    };
  }

  if (honorInvestigatorHigh && feedTab === "following") {
    const core = `${who} is sharing recognition; a sincere reply can reinforce the moment while the thread is still fresh.`;
    return {
      whyItMatters: tail ? `${core} ${tail}`.trim() : core,
      nextStepEditorial: "Draft a tight congrats, reply while the thread is hot, then wider-share only if it still feels right.",
    };
  }

  if (investigatorNewsForAmplify && feedTab === "following") {
    const core = "Someone you follow reshared notable coverage; a timely reply can ride the visibility without over-posting.";
    return {
      whyItMatters: tail ? `${core} ${tail}`.trim() : core,
      nextStepEditorial: "Read the link, reply with one concrete note, then stop unless there’s follow-up.",
    };
  }

  if (investigatorNewsForAmplify && (feedTab === "lists" || feedTab === "mentions")) {
    const core = "Someone you track amplified external coverage that’s worth acknowledging in a light touch.";
    const why = tail ? `${core} ${tail}`.trim() : core;
    return {
      whyItMatters: why,
      nextStepEditorial: "Reply with what landed for you in one or two sentences, then move on.",
    };
  }

  if (feedTab === "following") {
    return {
      whyItMatters:
        "This reads like a milestone-style hook (award, deadline, funding, or outreach) from someone you follow. Replies build relationships without chasing routine chatter.",
      nextStepEditorial: "If it fits, one or two sentences; otherwise bookmark for later.",
    };
  }

  if (feedTab === "lists" || feedTab === "mentions") {
    const where = feedTab === "mentions" ? "mentions" : "Investigators feed";
    const core = `There’s a timely thread or update in your ${where} where a short reply can add real signal.`;
    const why = tail ? `${core} ${tail}`.trim() : core;
    return {
      whyItMatters: why,
      nextStepEditorial: "Reply soon with something specific. Skip generic praise.",
    };
  }

  return {
    whyItMatters: "The language here suggests a community milestone worth a brief, good-faith reply if you have something real to add.",
    nextStepEditorial: "Keep it short and specific, or leave it.",
  };
}

export function mergeAmplifyRespondEditorial(amp: {
  whyItMatters: string;
  nextStepEditorial: string;
}): { whyItMatters: string; nextStepEditorial: string } {
  return {
    whyItMatters: `${amp.whyItMatters} If you engage, a quick reply pairs naturally with anything you later share more broadly.`
      .replace(/\s+/g, " ")
      .trim(),
    nextStepEditorial: "Verify quickly, reply in-thread, prep one share line for social or newsletter.",
  };
}
