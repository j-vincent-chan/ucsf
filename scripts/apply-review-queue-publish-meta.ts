/**
 * Prints the SQL to add publish metadata columns (run in Supabase → SQL Editor).
 * Usage: npx tsx scripts/apply-review-queue-publish-meta.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260527140000_social_review_queue_publish_meta.sql"),
  "utf8",
);

console.log("Paste into Supabase Dashboard → SQL Editor → Run:\n");
console.log(sql);
