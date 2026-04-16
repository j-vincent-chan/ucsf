import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import { requireProfile } from "@/lib/auth";
import { ReadmeFigure } from "./readme-figure";

export const metadata: Metadata = {
  title: "Readme",
};

function hasReadmeAsset(filename: string): boolean {
  return existsSync(path.join(process.cwd(), "public", "readme", filename));
}

function Section({
  title,
  children,
  src,
  alt,
  figureOnLeft = false,
}: {
  title: string;
  children: React.ReactNode;
  src: string;
  alt: string;
  figureOnLeft?: boolean;
}) {
  const cleanSrc = src.startsWith("/") ? src : `/readme/${src}`;
  return (
    <section className="grid gap-6 md:grid-cols-2 md:items-center md:gap-10">
      <div className={figureOnLeft ? "md:order-2" : "md:order-1"}>
        <h2 className="text-base font-semibold text-[color:var(--foreground)]">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-[color:var(--muted-foreground)]">
          {children}
        </div>
      </div>
      <div className={figureOnLeft ? "md:order-1" : "md:order-2"}>
        <ReadmeFigure src={cleanSrc} alt={alt} />
      </div>
    </section>
  );
}

export default async function ReadmePage() {
  await requireProfile();

  const heroOk = hasReadmeAsset("hero.png");

  return (
    <div className="mx-auto max-w-4xl">
      <header className="text-center md:text-left">
        <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--foreground)]">
          How to use Signal
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted-foreground)] md:mx-0">
          Real in-app screenshots live in{" "}
          <code className="rounded bg-[color:var(--muted)] px-1 py-0.5 text-xs">
            public/readme/
          </code>
          . Generate or refresh them anytime with the same UI you ship.
        </p>
        <p className="mt-2 text-xs leading-6 text-[color:var(--muted-foreground)]">
          <span className="font-medium text-[color:var(--foreground)]">Capture: </span>
          start the app (<code className="rounded bg-[color:var(--muted)] px-0.5">npm run dev</code>
          ), ensure you can sign in locally, then run{" "}
          <code className="rounded bg-[color:var(--muted)] px-1 py-0.5">
            npm run readme-screenshots
          </code>
          . Defaults use the seeded admin from{" "}
          <code className="rounded bg-[color:var(--muted)] px-0.5">npm run seed</code>{" "}
          (<code className="rounded bg-[color:var(--muted)] px-0.5">
            admin@community-signal.local
          </code>
          ). Override with{" "}
          <code className="rounded bg-[color:var(--muted)] px-0.5">
            README_SCREENSHOT_EMAIL
          </code>{" "}
          /{" "}
          <code className="rounded bg-[color:var(--muted)] px-0.5">
            README_SCREENSHOT_PASSWORD
          </code>{" "}
          if needed.
        </p>
        {!heroOk ? (
          <p className="mt-2 rounded-xl border border-[#dbc3ad] bg-[#f6eee4] px-3 py-2 text-xs text-[#6d5244]">
            No PNGs found yet—run the capture script once, then commit{" "}
            <code className="rounded bg-[#ecdac9] px-1">public/readme/*.png</code>{" "}
            so everyone sees the real UI.
          </p>
        ) : null}
      </header>

      <div className="mt-8">
        <ReadmeFigure
          priority
          src="/readme/hero.png"
          alt="Signal dashboard with sidebar and main content"
        />
        <p className="mt-2 text-center text-xs text-[color:var(--muted-foreground)] md:text-left">Dashboard (overview)</p>
      </div>

      <div className="mt-14 space-y-16">
        <Section
          title="Watchlist"
          src="watchlist.png"
          alt="Signal watchlist of investigators"
          figureOnLeft
        >
          <p>
            <span className="font-medium text-[color:var(--foreground)]">Admins:</span> who we
            track for discovery. Keep the list aligned with your community.
          </p>
        </Section>

        <Section title="Review Queue" src="review-queue.png" alt="Signal review queue with filters">
          <ul className="list-inside list-disc space-y-1.5 marker:text-[color:var(--muted-foreground)]/70">
            <li>Filters: status, source, category, investigator, dates + presets.</li>
            <li>Row links: source title, investigator Profiles, Edit, quick archive.</li>
            <li>Bulk Approve or Archive with a reason.</li>
          </ul>
        </Section>

        <Section
          title="Manual Submission"
          src="manual-submit.png"
          alt="Signal manual submission form"
          figureOnLeft
        >
          <p>Add a one-off signal when it did not import automatically.</p>
        </Section>

        <Section title="Digest" src="digest.png" alt="Signal monthly digest with format and draft tools">
          <ul className="list-inside list-disc space-y-1.5 marker:text-[color:var(--muted-foreground)]/70">
            <li>Approved items for the month; fix publish dates if needed.</li>
            <li>Format + Agent, then Draft or Regenerate (one draft per item).</li>
            <li>Open the draft for edits, length, copy, and agent chat.</li>
          </ul>
        </Section>

        <Section
          title="Item detail"
          src="item-detail.png"
          alt="Signal item detail with metadata and approve or archive"
          figureOnLeft
        >
          <ul className="list-inside list-disc space-y-1.5 marker:text-[color:var(--muted-foreground)]/70">
            <li>Edit metadata, Approve or Archive; shortcuts on the page.</li>
            <li>Approve before you expect an item in a digest month.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
