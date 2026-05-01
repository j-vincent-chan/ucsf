/**
 * One-shot discovery backfill (long windows + high maxPerSource).
 * Run locally so serverless timeouts do not apply.
 *
 * Usage:
 *   npx tsx scripts/discovery-backfill.ts --days=2920 --max-per-source=400
 *   npx tsx scripts/discovery-backfill.ts --community=<uuid> --days=2920
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin";
import { runDiscovery } from "../src/lib/discovery/run-discovery";

config({ path: resolve(process.cwd(), ".env.local") });

function arg(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

async function main() {
  const daysRaw = arg("--days") ?? "2920";
  const maxRaw = arg("--max-per-source") ?? "400";
  const communityId = arg("--community");

  const daysBack = Number.parseInt(daysRaw, 10);
  const maxPerSource = Number.parseInt(maxRaw, 10);

  if (!Number.isFinite(daysBack) || daysBack < 14 || daysBack > 3100) {
    console.error("Invalid --days (use 14–3100; e.g. 2920 ≈ 8 years)");
    process.exit(1);
  }
  if (!Number.isFinite(maxPerSource) || maxPerSource < 1 || maxPerSource > 500) {
    console.error("Invalid --max-per-source (use 1–500)");
    process.exit(1);
  }

  const supabase = createAdminClient();

  if (communityId) {
    console.log(`Backfill: single community ${communityId}, daysBack=${daysBack}, maxPerSource=${maxPerSource}`);
    const result = await runDiscovery(supabase, {
      communityId,
      daysBack,
      maxPerSource,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const { data: communities, error } = await supabase
    .from("communities")
    .select("id, slug, name")
    .order("slug", { ascending: true });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  for (const c of communities ?? []) {
    console.log(`\n--- ${c.slug} (${c.name}) ---`);
    const result = await runDiscovery(supabase, {
      communityId: c.id,
      daysBack,
      maxPerSource,
    });
    console.log(
      `inserted=${result.inserted} skipped=${result.skippedDuplicates} linked=${result.linkedInvestigators} faculty=${result.facultyProcessed}`,
    );
    if (result.errors.length) {
      console.warn("errors:", result.errors.slice(0, 5));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
