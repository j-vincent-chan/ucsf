"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MemberStatus, TrackedEntity } from "@/types/database";
import { slugify } from "@/lib/slug";
import { tierFromMemberStatus } from "@/lib/member-tier";
import {
  INVESTIGATOR_HEADSHOTS_BUCKET,
  investigatorHeadshotObjectPath,
} from "@/lib/investigator-headshots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";

const HEADSHOT_MAX_BYTES = 5 * 1024 * 1024;
const HEADSHOT_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

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
  communityId,
}: {
  initial?: TrackedEntity | null;
  communityId: string;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const [firstName, setFirstName] = useState(initial?.first_name ?? "");
  const [middleInitial, setMiddleInitial] = useState(initial?.middle_initial ?? "");
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
  const [xHandle, setXHandle] = useState(initial?.x_handle ?? "");
  const [blueskyHandle, setBlueskyHandle] = useState(initial?.bluesky_handle ?? "");
  const [xLabHandle, setXLabHandle] = useState(initial?.x_lab_handle ?? "");
  const [blueskyLabHandle, setBlueskyLabHandle] = useState(
    initial?.bluesky_lab_handle ?? "",
  );
  const [headshotUrl, setHeadshotUrl] = useState(initial?.headshot_url ?? "");
  const [headshotFile, setHeadshotFile] = useState<File | null>(null);
  const [removeHeadshot, setRemoveHeadshot] = useState(false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [loading, setLoading] = useState(false);

  const stagedObjectUrl = useMemo(() => {
    if (!headshotFile) return null;
    return URL.createObjectURL(headshotFile);
  }, [headshotFile]);

  useEffect(() => {
    return () => {
      if (stagedObjectUrl) URL.revokeObjectURL(stagedObjectUrl);
    };
  }, [stagedObjectUrl]);

  const staticPreviewUrl = useMemo(() => {
    const supabase = createClient();
    const path = initial?.headshot_storage_path?.trim();
    if (path) {
      return supabase.storage.from(INVESTIGATOR_HEADSHOTS_BUCKET).getPublicUrl(path).data.publicUrl;
    }
    const u = headshotUrl.trim();
    if (u && /^https?:\/\//i.test(u)) return u;
    return null;
  }, [initial?.headshot_storage_path, headshotUrl]);

  const avatarPreviewSrc = removeHeadshot ? null : (stagedObjectUrl ?? staticPreviewUrl);

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

  function onHeadshotFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!HEADSHOT_MIMES.has(f.type)) {
      toast.error("Use JPEG, PNG, GIF, or WebP for the headshot");
      return;
    }
    if (f.size > HEADSHOT_MAX_BYTES) {
      toast.error("Headshot must be 5 MB or smaller");
      return;
    }
    setHeadshotFile(f);
    setRemoveHeadshot(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tier = tierFromMemberStatus(memberStatus);
    const fn = firstName.trim();
    const mi = middleInitial.trim().slice(0, 1).toUpperCase();
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
    const headshotRaw = headshotUrl.trim();
    if (headshotRaw && !/^https?:\/\//i.test(headshotRaw)) {
      toast.error("Headshot URL must start with http:// or https:// (or leave blank)");
      return;
    }
    if (headshotFile) {
      if (!HEADSHOT_MIMES.has(headshotFile.type)) {
        toast.error("Use JPEG, PNG, GIF, or WebP for the headshot");
        return;
      }
      if (headshotFile.size > HEADSHOT_MAX_BYTES) {
        toast.error("Headshot must be 5 MB or smaller");
        return;
      }
    }

    setLoading(true);
    const supabase = createClient();
    const stripSocial = (s: string) => s.replace(/^@+/u, "").trim();
    const baseFields = {
      first_name: fn,
      middle_initial: mi,
      last_name: ln,
      member_status: memberStatus,
      slug: slugVal,
      entity_type: "faculty" as const,
      institution: institution.trim() || null,
      pubmed_url: pubmedUrl.trim() || null,
      lab_website: labWebsite.trim() || null,
      google_alert_query: googleAlertQuery.trim() || null,
      nih_profile_id: nihRaw || null,
      x_handle: stripSocial(xHandle) || null,
      bluesky_handle: stripSocial(blueskyHandle) || null,
      x_lab_handle: stripSocial(xLabHandle) || null,
      bluesky_lab_handle: stripSocial(blueskyLabHandle) || null,
      priority_tier: tier,
      active,
    };

    try {
      if (isEdit) {
        const id = initial!.id;
        let nextPath: string | null = initial?.headshot_storage_path?.trim() || null;
        const urlTrim = headshotRaw;
        let nextUrl: string | null = urlTrim || null;

        if (removeHeadshot) {
          if (nextPath) {
            await supabase.storage.from(INVESTIGATOR_HEADSHOTS_BUCKET).remove([nextPath]);
          }
          nextPath = null;
          nextUrl = null;
        } else if (headshotFile) {
          const objectPath = investigatorHeadshotObjectPath(communityId, id);
          const { error: upErr } = await supabase.storage
            .from(INVESTIGATOR_HEADSHOTS_BUCKET)
            .upload(objectPath, headshotFile, {
              upsert: true,
              contentType: headshotFile.type,
            });
          if (upErr) {
            toast.error(upErr.message);
            return;
          }
          nextPath = objectPath;
          nextUrl = null;
        } else if (urlTrim && nextPath) {
          await supabase.storage.from(INVESTIGATOR_HEADSHOTS_BUCKET).remove([nextPath]);
          nextPath = null;
        }

        const { error } = await supabase
          .from("tracked_entities")
          .update({
            ...baseFields,
            headshot_storage_path: nextPath,
            headshot_url: nextUrl,
          })
          .eq("id", id);
        if (error) {
          toast.error(error.message);
          return;
        }
      } else {
        const { data: created, error: insErr } = await supabase
          .from("tracked_entities")
          .insert({
            ...baseFields,
            headshot_url: headshotFile ? null : headshotRaw || null,
            headshot_storage_path: null,
          })
          .select("id")
          .single();
        if (insErr || !created?.id) {
          toast.error(insErr?.message ?? "Could not create faculty");
          return;
        }
        if (headshotFile) {
          const objectPath = investigatorHeadshotObjectPath(communityId, created.id);
          const { error: upErr } = await supabase.storage
            .from(INVESTIGATOR_HEADSHOTS_BUCKET)
            .upload(objectPath, headshotFile, {
              upsert: true,
              contentType: headshotFile.type,
            });
          if (upErr) {
            toast.error(upErr.message);
            return;
          }
          const { error: upDb } = await supabase
            .from("tracked_entities")
            .update({ headshot_storage_path: objectPath, headshot_url: null })
            .eq("id", created.id);
          if (upDb) {
            toast.error(upDb.message);
            return;
          }
        }
      }

      toast.success(isEdit ? "Faculty updated" : "Faculty created");
      router.push("/entities");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
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
          <Label htmlFor="middle_initial">Middle initial</Label>
          <Input
            id="middle_initial"
            value={middleInitial}
            onChange={(e) =>
              setMiddleInitial(e.target.value.replace(/[^a-z]/gi, "").slice(0, 1).toUpperCase())
            }
            maxLength={1}
            className="mt-1"
            placeholder="M"
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="x_handle">X (Twitter) handle</Label>
          <Input
            id="x_handle"
            value={xHandle}
            onChange={(e) => setXHandle(e.target.value)}
            placeholder="username — no @"
            className="mt-1 font-mono text-sm"
            autoComplete="off"
          />
          <p className="mt-1 text-xs leading-5 text-[color:var(--muted-foreground)]">
            Used when publishing or scheduling posts to X so @-mentions notify the right account.
          </p>
        </div>
        <div>
          <Label htmlFor="bluesky_handle">Bluesky handle</Label>
          <Input
            id="bluesky_handle"
            value={blueskyHandle}
            onChange={(e) => setBlueskyHandle(e.target.value)}
            placeholder="name.bsky.social — no @"
            className="mt-1 font-mono text-sm"
            autoComplete="off"
          />
          <p className="mt-1 text-xs leading-5 text-[color:var(--muted-foreground)]">
            Used for Digest @-mentions and Bluesky publish notifications (stored without @).
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="x_lab_handle">X — lab / program handle</Label>
          <Input
            id="x_lab_handle"
            value={xLabHandle}
            onChange={(e) => setXLabHandle(e.target.value)}
            placeholder="lab account — no @"
            className="mt-1 font-mono text-sm"
            autoComplete="off"
          />
          <p className="mt-1 text-xs leading-5 text-[color:var(--muted-foreground)]">
            Optional separate account for the lab or program (stored without @).
          </p>
        </div>
        <div>
          <Label htmlFor="bluesky_lab_handle">Bluesky — lab / program handle</Label>
          <Input
            id="bluesky_lab_handle"
            value={blueskyLabHandle}
            onChange={(e) => setBlueskyLabHandle(e.target.value)}
            placeholder="lab.bsky.social — no @"
            className="mt-1 font-mono text-sm"
            autoComplete="off"
          />
          <p className="mt-1 text-xs leading-5 text-[color:var(--muted-foreground)]">
            Optional lab or program Bluesky (stored without @).
          </p>
        </div>
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
        <Label>Headshot</Label>
        <div className="mt-2 flex flex-wrap items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--muted)] text-lg font-semibold text-[color:var(--muted-foreground)] ring-1 ring-[color:var(--border)]">
            {avatarPreviewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob preview or arbitrary external URL
              <img
                src={avatarPreviewSrc}
                alt=""
                width={56}
                height={56}
                className="h-full w-full object-cover"
              />
            ) : (
              <span aria-hidden>{(firstName.trim().slice(0, 1) || lastName.trim().slice(0, 1) || "?").toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="headshot_file"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="text-sm text-[color:var(--foreground)] file:mr-2 file:rounded-lg file:border-0 file:bg-[color:var(--muted)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
                onChange={onHeadshotFileChange}
              />
              {(initial?.headshot_storage_path || initial?.headshot_url || headshotFile || headshotUrl) ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
                  <input
                    type="checkbox"
                    checked={removeHeadshot}
                    onChange={(e) => {
                      setRemoveHeadshot(e.target.checked);
                      if (e.target.checked) setHeadshotFile(null);
                    }}
                  />
                  Remove photo
                </label>
              ) : null}
            </div>
            <div>
              <Label htmlFor="headshot_url" className="text-xs font-normal text-[color:var(--muted-foreground)]">
                Or paste an image URL (optional)
              </Label>
              <Input
                id="headshot_url"
                type="url"
                value={headshotUrl}
                onChange={(e) => {
                  setHeadshotUrl(e.target.value);
                  if (e.target.value.trim()) setRemoveHeadshot(false);
                }}
                placeholder="https://… — bulk import; replaced by upload if you add a file"
                className="mt-1 font-mono text-sm"
              />
            </div>
            <p className="text-xs leading-5 text-[color:var(--muted-foreground)]">
              File uploads are stored in Supabase Storage (bucket <span className="font-mono text-[0.7rem]">investigator-headshots</span>).
              The People list prefers a stored image over a pasted URL.
            </p>
          </div>
        </div>
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
          {loading ? "Saving…" : isEdit ? "Save all changes" : "Create"}
        </Button>
      </div>
    </form>
  );
}
