/**
 * Match scripts/data/immunox-faculty-photo-urls.json to tracked_entities.slug (ImmunoX community).
 * Tries the manifest directory_slug and last-token-first variant (last hyphen segment moved to front),
 * e.g. abul-abbas ↔ abbas-abul, jose-angel-nicolas-avila ↔ avila-jose-angel-nicolas.
 * set headshot_url from the directory CDN, then download → Supabase Storage (investigator-headshots)
 * and set headshot_storage_path (clearing headshot_url), mirroring POST /api/entities/bulk-ingest-headshots.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage:
 *   npx tsx scripts/apply-immunox-directory-headshots.ts
 *   npx tsx scripts/apply-immunox-directory-headshots.ts --apply
 *   npx tsx scripts/apply-immunox-directory-headshots.ts --apply --skip-if-storage
 *   npx tsx scripts/apply-immunox-directory-headshots.ts --apply --urls-only
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";
import { downloadHeadshotImageFromUrl } from "../src/lib/investigator-headshots-ingest";
import {
  INVESTIGATOR_HEADSHOTS_BUCKET,
  investigatorHeadshotObjectPath,
} from "../src/lib/investigator-headshots";

config({ path: resolve(process.cwd(), ".env.local") });

type ManifestPerson = {
  name: string;
  photo_url: string;
  photo_url_normalized?: string;
  directory_slug?: string;
  local_file?: string;
};

type Manifest = {
  source: string;
  fetched_at?: string;
  count: number;
  people: ManifestPerson[];
};

function arg(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

/** Same rules as scripts/scrape_immunox_faculty_photos.py `directory_slug`. */
function directorySlugFromName(name: string): string {
  const base = name
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return base || "person";
}

function manifestSlug(p: ManifestPerson): string {
  return (p.directory_slug?.trim() || directorySlugFromName(p.name)).trim();
}

/** Typical "lastname-firstname" slug: move last hyphen segment to the front. */
function lastTokenFirstSlug(slug: string): string {
  const parts = slug.split("-").filter((p) => p.length > 0);
  if (parts.length < 2) return slug;
  const last = parts[parts.length - 1]!;
  const rest = parts.slice(0, -1).join("-");
  return `${last}-${rest}`;
}

/** DB slug candidates for a directory slug (direct + last-token-first when different). */
function dbSlugCandidatesForManifest(manifestSlug: string): string[] {
  const alt = lastTokenFirstSlug(manifestSlug);
  return alt === manifestSlug ? [manifestSlug] : [manifestSlug, alt];
}

async function ingestOne(
  admin: ReturnType<typeof createAdminClient>,
  communityId: string,
  entityId: string,
  url: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { buffer, contentType } = await downloadHeadshotImageFromUrl(url);
    const path = investigatorHeadshotObjectPath(communityId, entityId);
    const nodeBuf = Buffer.from(buffer);
    const { error: upErr } = await admin.storage
      .from(INVESTIGATOR_HEADSHOTS_BUCKET)
      .upload(path, nodeBuf, { upsert: true, contentType });
    if (upErr) {
      return { ok: false, error: upErr.message };
    }
    const { error: dbErr } = await admin
      .from("tracked_entities")
      .update({ headshot_storage_path: path, headshot_url: null })
      .eq("id", entityId);
    if (dbErr) {
      return { ok: false, error: dbErr.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ingest failed";
    return { ok: false, error: msg };
  }
}

async function main() {
  const manifestPath = arg("--manifest") ?? "scripts/data/immunox-faculty-photo-urls.json";
  const communitySlug = arg("--community") ?? "immunox";
  const apply = hasFlag("--apply");
  const skipIfStorage = hasFlag("--skip-if-storage");
  const urlsOnly = hasFlag("--urls-only");

  let manifest: Manifest;
  try {
    const raw = readFileSync(resolve(process.cwd(), manifestPath), "utf-8");
    manifest = JSON.parse(raw) as Manifest;
  } catch (e) {
    console.error(`Cannot read manifest ${manifestPath}:`, e);
    process.exit(1);
  }

  if (!Array.isArray(manifest.people) || manifest.people.length === 0) {
    console.error("Manifest has no people[]");
    process.exit(1);
  }

  const admin = createAdminClient();

  const { data: community, error: cErr } = await admin
    .from("communities")
    .select("id, slug, name")
    .eq("slug", communitySlug)
    .maybeSingle();

  if (cErr || !community) {
    console.error(cErr?.message ?? `Community not found: ${communitySlug}`);
    process.exit(1);
  }

  const communityId = community.id;
  const byManifestSlug = new Map<string, ManifestPerson>();
  const dupSlugs: string[] = [];
  for (const p of manifest.people) {
    const s = manifestSlug(p);
    if (byManifestSlug.has(s)) {
      dupSlugs.push(s);
    }
    byManifestSlug.set(s, p);
  }

  const slugs = [...byManifestSlug.keys()];
  const querySlugs = [...new Set(slugs.flatMap((s) => dbSlugCandidatesForManifest(s)))];
  const { data: entities, error: eErr } = await admin
    .from("tracked_entities")
    .select("id, slug, name, headshot_url, headshot_storage_path")
    .eq("community_id", communityId)
    .in("slug", querySlugs);

  if (eErr) {
    console.error(eErr.message);
    process.exit(1);
  }

  const byDbSlug = new Map((entities ?? []).map((e) => [e.slug, e]));

  const noEntity: string[] = [];
  const skippedStorage: string[] = [];
  const urlUpdates: {
    id: string;
    manifestDirectorySlug: string;
    entitySlug: string;
    url: string;
  }[] = [];
  let matchedViaLastTokenFirst = 0;

  for (const s of slugs) {
    const person = byManifestSlug.get(s)!;
    let ent = byDbSlug.get(s);
    let entitySlug = s;
    if (!ent) {
      const alt = lastTokenFirstSlug(s);
      if (alt !== s) {
        ent = byDbSlug.get(alt);
        if (ent) {
          entitySlug = alt;
          matchedViaLastTokenFirst += 1;
        }
      }
    }
    if (!ent) {
      noEntity.push(s);
      continue;
    }
    if (skipIfStorage && (ent.headshot_storage_path?.trim() ?? "")) {
      skippedStorage.push(s);
      continue;
    }
    const url = person.photo_url.trim();
    if (!url) continue;
    urlUpdates.push({ id: ent.id, manifestDirectorySlug: s, entitySlug, url });
  }

  console.log(
    JSON.stringify(
      {
        community: community.slug,
        manifestPeople: manifest.people.length,
        uniqueManifestSlugs: slugs.length,
        duplicateManifestSlugs: dupSlugs,
        matchedEntities: urlUpdates.length,
        matchedViaLastTokenFirstSlug: matchedViaLastTokenFirst,
        noMatchingEntityForSlug: noEntity.sort(),
        skippedExistingStorage: skippedStorage.sort(),
        apply,
        urlsOnly,
        skipIfStorage,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.error("\nDry run only. Re-run with --apply to update headshot_url and ingest to Storage.");
    process.exit(0);
  }

  for (const u of urlUpdates) {
    const { error } = await admin.from("tracked_entities").update({ headshot_url: u.url }).eq("id", u.id);
    if (error) {
      console.error(`Failed headshot_url for ${u.entitySlug} (manifest ${u.manifestDirectorySlug}):`, error.message);
      process.exit(1);
    }
  }
  console.error(`Set headshot_url on ${urlUpdates.length} rows.`);

  if (urlsOnly) {
    console.error("--urls-only: skipping Storage upload. Use bulk-ingest-headshots from the app or re-run without this flag.");
    process.exit(0);
  }

  const ingestResults: { entitySlug: string; manifestDirectorySlug: string; ok: boolean; error?: string }[] = [];
  for (const u of urlUpdates) {
    const r = await ingestOne(admin, communityId, u.id, u.url);
    ingestResults.push({
      entitySlug: u.entitySlug,
      manifestDirectorySlug: u.manifestDirectorySlug,
      ok: r.ok,
      ...(!r.ok ? { error: r.error } : {}),
    });
    await new Promise((res) => setTimeout(res, 120));
  }

  const failed = ingestResults.filter((x) => !x.ok);
  console.log(JSON.stringify({ ingested: ingestResults.length, failed }, null, 2));
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
