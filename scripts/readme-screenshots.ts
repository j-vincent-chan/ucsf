/**
 * Capture PNG screenshots for the in-app Readme (public/readme/).
 *
 * Prerequisites:
 *   1. `npm run dev` (or set README_SCREENSHOT_BASE_URL to a running instance).
 *   2. Valid editor/admin credentials (defaults match scripts/seed.ts dev admin).
 *
 * Usage:
 *   npx playwright install chromium   # first time only
 *   npm run readme-screenshots
 *
 * Optional env (.env.local or shell):
 *   README_SCREENSHOT_BASE_URL  default http://127.0.0.1:3000
 *   README_SCREENSHOT_EMAIL     default admin@community-signal.local
 *   README_SCREENSHOT_PASSWORD  default CommunitySignal!Dev123 (same as seed)
 *   README_ITEM_DETAIL_ID       fallback item UUID if queue has no Edit links
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { config } from "dotenv";
import { currentYearMonth } from "../src/lib/digest-month";

config({ path: path.resolve(process.cwd(), ".env.local") });

const baseUrl = (process.env.README_SCREENSHOT_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const email =
  process.env.README_SCREENSHOT_EMAIL?.trim() || "admin@community-signal.local";
const password =
  process.env.README_SCREENSHOT_PASSWORD || "CommunitySignal!Dev123";
/** First source_item id from scripts/seed.ts (i1) — override if your DB differs. */
const itemDetailId =
  process.env.README_ITEM_DETAIL_ID ?? "b2000000-0000-4000-8000-000000000001";

const outDir = path.join(process.cwd(), "public", "readme");
mkdirSync(outDir, { recursive: true });

async function login(page: Page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 90_000 }),
    page.getByRole("button", { name: /^sign in$/i }).click(),
  ]);
}

async function shot(page: Page, name: string, url: string) {
  await page.goto(`${baseUrl}${url}`, { waitUntil: "networkidle" });
  await page.locator("main").waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  await page.screenshot({
    path: path.join(outDir, name),
    fullPage: false,
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });

  try {
    await login(page);
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
    await page.locator("main").waitFor({ state: "visible" }).catch(() => {});
    await page.screenshot({
      path: path.join(outDir, "hero.png"),
      fullPage: false,
    });

    await shot(page, "watchlist.png", "/entities");
    await shot(page, "review-queue.png", "/items");
    await shot(page, "manual-submit.png", "/submit");

    const digestYm = currentYearMonth();
    await shot(page, "digest.png", `/digest/${digestYm}`);

    await page.goto(`${baseUrl}/items`, { waitUntil: "networkidle" });
    const editLink = page.getByRole("link", { name: "Edit" }).first();
    const detailPath =
      (await editLink.count()) > 0
        ? ((await editLink.getAttribute("href")) ?? `/items/${itemDetailId}`)
        : `/items/${itemDetailId}`;
    await shot(page, "item-detail.png", detailPath);

    console.log(`Wrote PNGs to ${outDir}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
