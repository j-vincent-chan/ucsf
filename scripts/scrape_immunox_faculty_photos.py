#!/usr/bin/env python3
"""
Fetch ImmunoX faculty directory portrait URLs from the public Webflow page
by walking CMS pagination (?b064e479_page=N, ?99f1f994_page=N).

Usage:
  python3 scripts/scrape_immunox_faculty_photos.py \\
    --output scripts/data/immunox-faculty-photo-urls.json

  python3 scripts/scrape_immunox_faculty_photos.py \\
    --output scripts/data/immunox-faculty-photo-urls.json \\
    --download scripts/data/immunox-faculty-photos

Then match to tracked_entities.slug (ImmunoX tenant) and push into Storage:

  npx tsx scripts/apply-immunox-directory-headshots.ts
  npx tsx scripts/apply-immunox-directory-headshots.ts --apply
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

BASE = "https://immunox.ucsf.edu/community/immunox-faculty-directory"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
CMS_KEYS = ("b064e479", "99f1f994")
MAX_PAGE = 12


def fetch(url: str) -> str:
    r = subprocess.run(
        ["curl", "-sL", "--max-time", "45", "-A", UA, url],
        capture_output=True,
        text=True,
    )
    return r.stdout or ""


def normalize_photo_url(u: str) -> str:
    return re.sub(r"-p-\d+(?=\.(png|jpg|jpeg|webp|gif|JPG))", "", u, flags=re.I)


def is_likely_headshot(u: str) -> bool:
    d = unquote(unquote(u)).lower()
    if "screenshot" in d or "logo" in d or "favicon" in d:
        return False
    return True


def directory_slug(name: str) -> str:
    """Stable slug aligned with Webflow-style names (matches apply script / local filenames)."""
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", name).strip("-").lower() or "person"


def parse_person_cards(html: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    blocks = re.findall(
        r'<div class="person-card">(.{0,12000}?)</div>\s*</a>',
        html,
        re.DOTALL,
    )
    for b in blocks:
        mimg = re.search(
            r'<img[^>]+class="image-person"[^>]+src="([^"]+)"',
            b,
        )
        if not mimg:
            mimg = re.search(
                r'<img[^>]+src="(https://cdn\.prod\.website-files\.com/682e61fe5ac0cb77b6705789/[^"]+)"',
                b,
            )
        if not mimg:
            continue
        mname = re.search(
            r'<div class="text-person">.*?<div class="text-weight-medium">([^<]+)</div>',
            b,
            re.DOTALL,
        )
        name = mname.group(1).strip() if mname else ""
        rows.append({"name": name, "photo_url": mimg.group(1)})
    return rows


def slug_filename(name: str, ext: str, used: set[str]) -> str:
    base = re.sub(r"[^a-zA-Z0-9._-]+", "-", name).strip("-").lower() or "photo"
    candidate = f"{base}{ext}"
    n = 2
    while candidate in used:
        candidate = f"{base}-{n}{ext}"
        n += 1
    used.add(candidate)
    return candidate


def download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ["curl", "-sfL", "--max-time", "60", "-A", UA, "-o", str(dest), url],
    )
    if r.returncode != 0:
        raise RuntimeError(f"curl failed for {url}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--output",
        "-o",
        type=Path,
        default=Path("scripts/data/immunox-faculty-photo-urls.json"),
    )
    ap.add_argument(
        "--download",
        "-d",
        type=Path,
        help="Directory to save image files (optional)",
    )
    args = ap.parse_args()

    seen: set[str] = set()
    seen_slugs: set[str] = set()
    merged: list[dict[str, str]] = []

    def alloc_directory_slug(name: str) -> str:
        base = directory_slug(name)
        cand = base
        n = 2
        while cand in seen_slugs:
            cand = f"{base}-{n}"
            n += 1
        seen_slugs.add(cand)
        return cand

    for key in CMS_KEYS:
        for page in range(1, MAX_PAGE + 1):
            url = BASE if page == 1 else f"{BASE}?{key}_page={page}"
            html = fetch(url)
            for row in parse_person_cards(html):
                nu = normalize_photo_url(row["photo_url"])
                if not is_likely_headshot(nu):
                    continue
                if nu in seen:
                    continue
                seen.add(nu)
                merged.append(
                    {
                        "name": row["name"],
                        "directory_slug": alloc_directory_slug(row["name"] or "person"),
                        "photo_url": row["photo_url"],
                        "photo_url_normalized": nu,
                    },
                )
            time.sleep(0.15)

    merged.sort(key=lambda r: r["name"].lower())

    payload = {
        "source": BASE,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "count": len(merged),
        "people": merged,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {len(merged)} rows to {args.output}", file=sys.stderr)

    if args.download:
        used_names: set[str] = set()
        for i, row in enumerate(merged):
            u = row["photo_url"]
            path = urlparse(u).path
            m = re.search(r"\.([a-zA-Z0-9]+)$", path)
            ext = f".{m.group(1)}" if m else ""
            fn = slug_filename(row.get("directory_slug") or row["name"] or f"person-{i}", ext, used_names)
            dest = args.download / fn
            try:
                download_file(u, dest)
                row["local_file"] = os.path.relpath(dest, Path.cwd())
            except Exception as e:
                row["download_error"] = str(e)
            time.sleep(0.08)
        args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"Downloaded under {args.download}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
