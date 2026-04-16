"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MemberStatus, TrackedEntity } from "@/types/database";
import { slugify } from "@/lib/slug";
import { tierFromMemberStatus } from "@/lib/member-tier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";

const MEMBER_OPTIONS: { value: MemberStatus; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "associate", label: "Associate" },
  { value: "leadership_committee", label: "Leadership Committee" },
];

function coerceMemberStatus(
  raw: MemberStatus | string | null | undefined,
): MemberStatus {
  if (raw === "full_member") return "member";
  if (
    raw === "member" ||
    raw === "associate" ||
    raw === "leadership_committee"
  ) {
    return raw;
  }
  return "associate";
}

export function EntityForm({
  initial,
}: {
  initial?: TrackedEntity | null;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const [firstName, setFirstName] = useState(initial?.first_name ?? "");
  const [lastName, setLastName] = useState(initial?.last_name ?? "");
  const [memberStatus, setMemberStatus] = useState<MemberStatus>(
    coerceMemberStatus(initial?.member_status),
  );
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [institution, setInstitution] = useState(initial?.institution ?? "");
  const [pubmedUrl, setPubmedUrl] = useState(initial?.pubmed_url ?? "");
  const [labWebsite, setLabWebsite] = useState(initial?.lab_website ?? "");
  const [googleAlertQuery, setGoogleAlertQuery] = useState(
    initial?.google_alert_query ?? "",
  );
  const [nihProfileId, setNihProfileId] = useState(
    initial?.nih_profile_id ?? "",
  );
  const [active, setActive] = useState(initial?.active ?? true);
  const [loading, setLoading] = useState(false);

  function syncSlugFromNames(f: string, l: string) {
    if (!slugTouched) {
      const combined = `${l}-${f}`.trim();
      setSlug(slugify(combined || "faculty"));
    }
  }

  function onFirstChange(v: string) {
    setFirstName(v);
    syncSlugFromNames(v, lastName);
  }

  function onLastChange(v: string) {
    setLastName(v);
    syncSlugFromNames(firstName, v);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tier = tierFromMemberStatus(memberStatus);
    const fn = firstName.trim();
    const ln = lastName.trim();
    const slugVal = slug.trim() || slugify(`${ln}-${fn}`);
    if (!fn) {
      toast.error("First name is required");
      return;
    }
    if (!ln) {
      toast.error("Last name is required");
      return;
    }
    const nihRaw = nihProfileId.trim();
    if (nihRaw && !/^\d+$/.test(nihRaw)) {
      toast.error("NIH profile ID must be numeric (or leave blank)");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const payload = {
      first_name: fn,
      last_name: ln,
      member_status: memberStatus,
      slug: slugVal,
      entity_type: "faculty" as const,
      institution: institution.trim() || null,
      pubmed_url: pubmedUrl.trim() || null,
      lab_website: labWebsite.trim() || null,
      google_alert_query: googleAlertQuery.trim() || null,
      nih_profile_id: nihRaw || null,
      priority_tier: tier,
      active,
    };
    const q = isEdit
      ? supabase.from("tracked_entities").update(payload).eq("id", initial!.id)
      : supabase.from("tracked_entities").insert(payload);
    const { error } = await q;
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isEdit ? "Faculty updated" : "Faculty created");
    router.push("/entities");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="first_name">First name</Label>
          <Input
            id="first_name"
            value={firstName}
            onChange={(e) => onFirstChange(e.target.value)}
            required
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="last_name">Last name</Label>
          <Input
            id="last_name"
            value={lastName}
            onChange={(e) => onLastChange(e.target.value)}
            required
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="member_status">Member status</Label>
        <Select
          id="member_status"
          value={memberStatus}
          onChange={(e) => setMemberStatus(e.target.value as MemberStatus)}
          className="mt-1"
        >
          {MEMBER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          className="mt-1 font-mono text-sm"
        />
      </div>
      <div>
        <Label htmlFor="institution">Institution</Label>
        <Input
          id="institution"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          placeholder="e.g. UCSF; Stanford University (synonyms: ; or |)"
          className="mt-1"
        />
        <p className="mt-1 text-xs leading-5 text-[color:var(--muted-foreground)]">
          Used by Discover to match name + school/org (PubMed affiliation, trial sites).
        </p>
      </div>
      <div>
        <Label htmlFor="pubmed_url">PubMed URL</Label>
        <Input
          id="pubmed_url"
          type="url"
          value={pubmedUrl}
          onChange={(e) => setPubmedUrl(e.target.value)}
          placeholder="https://pubmed.ncbi.nlm.nih.gov/?term=…"
          className="mt-1 font-mono text-sm"
        />
        <p className="mt-1 text-xs leading-5 text-[color:var(--muted-foreground)]">
          When set, <strong>Discover</strong> uses the URL’s <code className="text-xs">term=</code> for PubMed. If
          empty, Discover uses last name + first name + institution.
        </p>
      </div>
      <div>
        <Label htmlFor="lab_website">Lab website (optional)</Label>
        <Input
          id="lab_website"
          type="url"
          value={labWebsite}
          onChange={(e) => setLabWebsite(e.target.value)}
          placeholder="https://lab.ucsf.edu/… — homepage; Discover tries common RSS paths"
          className="mt-1 font-mono text-sm"
        />
        <p className="mt-1 text-xs leading-5 text-[color:var(--muted-foreground)]">
          When set, <strong>Discover</strong> pulls the lab site RSS when available (items tagged{" "}
          <span className="font-medium">Lab website</span>) alongside Google News.
        </p>
      </div>
      <div>
        <Label htmlFor="nih_profile_id">NIH profile ID (optional)</Label>
        <Input
          id="nih_profile_id"
          inputMode="numeric"
          pattern="[0-9]*"
          value={nihProfileId}
          onChange={(e) => setNihProfileId(e.target.value.replace(/\D/g, ""))}
          placeholder="e.g. 1874447 — numeric ID from reporter.nih.gov person page"
          className="mt-1 font-mono text-sm"
        />
        <p className="mt-1 text-xs leading-5 text-[color:var(--muted-foreground)]">
          When set, <strong>Discover</strong> pulls NIH awards for this PI via the{" "}
          <a
            href="https://api.reporter.nih.gov/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            RePORTER API
          </a>{" "}
          (items tagged <span className="font-medium">Funding</span>). Leave blank if unknown.
        </p>
      </div>
      <div>
        <Label htmlFor="ga">Google Alert query</Label>
        <Input
          id="ga"
          value={googleAlertQuery}
          onChange={(e) => setGoogleAlertQuery(e.target.value)}
          placeholder='e.g. "Jane Smith" UCSF cancer — same syntax as Google News search'
          className="mt-1 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Used for <strong>Discover → Google News</strong> (RSS) media items, and as extra context for
          ClinicalTrials.gov when short enough. Leave blank to skip news RSS for this person.
        </p>
      </div>
      <div>
        <Label>Priority tier</Label>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Tier {tierFromMemberStatus(memberStatus)} — set automatically from member
          status (Leadership 1, Member 2, Associate 3).
        </p>
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active
        </label>
      </div>
      <p className="text-xs leading-5 text-[color:var(--muted-foreground)]">
        Display name is generated as “First Last”. All tracked people are faculty
        in this workspace.
      </p>
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : isEdit ? "Save changes" : "Create"}
        </Button>
      </div>
    </form>
  );
}
