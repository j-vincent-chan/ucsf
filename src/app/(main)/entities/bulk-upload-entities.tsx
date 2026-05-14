"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ENTITY_CSV_TEMPLATE,
  parseEntityCsv,
  parseEntityXlsx,
  type EntityCsvError,
  type EntityCsvRowResult,
} from "@/lib/entity-csv";
import type { EmbeddedHeadshotBytes } from "@/lib/entity-xlsx-embedded-images";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const BATCH = 40;

function looksLikeMissingFacultyColumns(message: string): boolean {
  const schemaHint =
    /schema cache/i.test(message) ||
    /could not find/i.test(message) ||
    /does not exist/i.test(message) ||
    /column/i.test(message);
  if (!schemaHint) return false;
  return /first_name/i.test(message) || /headshot_url/i.test(message) || /headshot_storage_path/i.test(message);
}

export function BulkUploadEntities({ communityId }: { communityId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parseErrors, setParseErrors] = useState<EntityCsvError[]>([]);
  const [schemaHint, setSchemaHint] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function downloadTemplate() {
    const blob = new Blob([ENTITY_CSV_TEMPLATE], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "entities-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const lower = file.name.toLowerCase();
    const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls");
    let rows: EntityCsvRowResult[];
    let errors: EntityCsvError[];
    let embeddedHeadshotsByDataIndex: Map<number, EmbeddedHeadshotBytes> | undefined;
    let embeddedHeadshotExtractionWarning: string | undefined;
    if (isExcel) {
      const parsed = await parseEntityXlsx(await file.arrayBuffer());
      rows = parsed.rows;
      errors = parsed.errors;
      embeddedHeadshotsByDataIndex = parsed.embeddedHeadshotsByDataIndex;
      embeddedHeadshotExtractionWarning = parsed.embeddedHeadshotExtractionWarning;
    } else {
      const parsed = parseEntityCsv(await file.text());
      rows = parsed.rows;
      errors = parsed.errors;
    }
    setParseErrors(errors);

    if (errors.length > 0) {
      toast.error(`File has ${errors.length} problem(s). Fix and try again.`);
      return;
    }
    if (embeddedHeadshotExtractionWarning) {
      toast.warning(embeddedHeadshotExtractionWarning);
    }
    if (rows.length === 0) {
      toast.error("No data rows found");
      return;
    }

    setSchemaHint(null);
    setUploading(true);
    const cid = communityId.trim();
    if (!cid) {
      toast.error("Could not determine your community. Refresh and try again.");
      setUploading(false);
      return;
    }
    const supabase = createClient();
    let inserted = 0;
    let stopped = false;
    /** Slug → entity id from upsert responses (avoids N+1 selects that can fail under RLS timing). */
    const entityIdBySlug = new Map<string, string>();

    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map((r) => ({
          community_id: cid,
          first_name: r.first_name,
          middle_initial: r.middle_initial,
          last_name: r.last_name,
          member_status: r.member_status,
          slug: r.slug,
          entity_type: "faculty" as const,
          institution: r.institution,
          pubmed_url: r.pubmed_url,
          lab_website: r.lab_website,
          google_alert_query: r.google_alert_query,
          nih_profile_id: r.nih_profile_id,
          ...(r.x_handle !== undefined ? { x_handle: r.x_handle } : {}),
          ...(r.bluesky_handle !== undefined ? { bluesky_handle: r.bluesky_handle } : {}),
          ...(r.x_lab_handle !== undefined ? { x_lab_handle: r.x_lab_handle } : {}),
          ...(r.bluesky_lab_handle !== undefined
            ? { bluesky_lab_handle: r.bluesky_lab_handle }
            : {}),
          ...(r.headshot_url !== undefined ? { headshot_url: r.headshot_url } : {}),
          priority_tier: r.priority_tier,
          active: r.active,
        }));

        const { data: upsertedRows, error } = await supabase
          .from("tracked_entities")
          .upsert(batch, { onConflict: "community_id,slug" })
          .select("id, slug");

        if (error) {
          if (looksLikeMissingFacultyColumns(error.message)) {
            setSchemaHint(
              "Your Supabase database is missing columns or storage policies for People headshots. " +
                "Apply pending supabase/migrations (tracked_entities headshot columns and investigator-headshots bucket), " +
                "and if needed run supabase/apply_faculty_schema.sql in the SQL Editor, then try again.",
            );
          }
          toast.error(
            looksLikeMissingFacultyColumns(error.message)
              ? "Database schema out of date — see fix below."
              : error.message,
          );
          stopped = true;
          break;
        }
        for (const row of upsertedRows ?? []) {
          if (row.slug && row.id) entityIdBySlug.set(row.slug, row.id);
        }
        inserted += batch.length;
      }

      if (!stopped) {
        const slugsWithHeadshotUrl = [
          ...new Set(rows.filter((r) => r.headshot_url?.trim()).map((r) => r.slug)),
        ];
        let headshotSaved = 0;
        let headshotFailed = 0;
        const INGEST_CHUNK = 40;
        for (let j = 0; j < slugsWithHeadshotUrl.length; j += INGEST_CHUNK) {
          const chunk = slugsWithHeadshotUrl.slice(j, j + INGEST_CHUNK);
          try {
            const res = await fetch("/api/entities/bulk-ingest-headshots", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({ slugs: chunk }),
            });
            const data = (await res.json()) as {
              error?: string;
              results?: { slug: string; ok: boolean; skipped?: boolean; error?: string }[];
            };
            if (!res.ok) {
              headshotFailed += chunk.length;
              continue;
            }
            for (const r of data.results ?? []) {
              if (r.ok && !r.skipped) headshotSaved += 1;
              else if (!r.ok) headshotFailed += 1;
            }
          } catch {
            headshotFailed += chunk.length;
          }
        }

        let embeddedSaved = 0;
        let embeddedFailed = 0;
        let embeddedFirstError: string | null = null;
        if (embeddedHeadshotsByDataIndex && embeddedHeadshotsByDataIndex.size > 0) {
          for (const r of rows) {
            if (r.sourceDataRowIndex === undefined) continue;
            const pic = embeddedHeadshotsByDataIndex.get(r.sourceDataRowIndex);
            if (!pic) continue;
            const entId = entityIdBySlug.get(r.slug);
            if (!entId) {
              embeddedFailed += 1;
              embeddedFirstError ??= `No entity id returned for slug "${r.slug}" after save.`;
              continue;
            }
            const fd = new FormData();
            fd.set("entityId", entId);
            fd.set("contentType", pic.mime);
            fd.set("file", new Blob([pic.buffer], { type: pic.mime }));
            const res = await fetch("/api/entities/investigator-headshot-upload", {
              method: "POST",
              body: fd,
              credentials: "same-origin",
            });
            let errMsg: string | null = null;
            try {
              const payload = (await res.json()) as { error?: string };
              errMsg = typeof payload.error === "string" ? payload.error : null;
            } catch {
              errMsg = null;
            }
            if (!res.ok) {
              embeddedFailed += 1;
              embeddedFirstError ??= errMsg ?? `Upload failed (HTTP ${res.status})`;
              continue;
            }
            embeddedSaved += 1;
          }
        }

        let msg = `Imported ${inserted} row(s)`;
        const bits: string[] = [];
        if (headshotSaved > 0) bits.push(`${headshotSaved} URL headshot(s) copied to Storage`);
        if (headshotFailed > 0) bits.push(`${headshotFailed} URL headshot(s) failed`);
        if (embeddedSaved > 0) bits.push(`${embeddedSaved} embedded photo(s) saved to Storage`);
        if (embeddedFailed > 0) bits.push(`${embeddedFailed} embedded photo(s) failed`);
        if (embeddedFirstError) bits.push(embeddedFirstError);
        if (bits.length > 0) {
          msg += ` (${bits.join("; ")})`;
        }
        const partialHeadshotFailure = headshotFailed > 0 || embeddedFailed > 0;
        if (partialHeadshotFailure) {
          toast.warning(msg);
        } else {
          toast.success(msg);
        }
        setParseErrors([]);
        setSchemaHint(null);
        router.refresh();
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardTitle>Bulk upload (CSV or Excel)</CardTitle>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={onFile}
          disabled={uploading}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Choose CSV or Excel file"}
        </Button>
        <button
          type="button"
          onClick={downloadTemplate}
          className="text-sm text-[color:var(--muted-foreground)] underline underline-offset-4"
        >
          Download template
        </button>
      </div>
      {schemaHint && (
        <p className="mt-3 rounded-[1rem] border border-[#dbc3ad] bg-[#f6eee4] p-3 text-sm text-[#6d5244]">
          {schemaHint}
        </p>
      )}
      {parseErrors.length > 0 && (
        <ul className="mt-3 max-h-40 overflow-auto rounded-[1rem] border border-[#e3b8b0] bg-[#f9ece9] p-3 text-sm text-[#8b4d47]">
          {parseErrors.map((err, i) => (
            <li key={i}>
              {err.row > 0 ? `Row ${err.row}: ` : ""}
              {err.message}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
