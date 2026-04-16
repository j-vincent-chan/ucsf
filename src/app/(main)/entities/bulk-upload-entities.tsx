"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ENTITY_CSV_TEMPLATE,
  parseEntityCsv,
  type EntityCsvError,
} from "@/lib/entity-csv";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const BATCH = 40;

function looksLikeMissingFacultyColumns(message: string): boolean {
  return (
    /first_name/i.test(message) &&
    (/schema cache/i.test(message) ||
      /could not find/i.test(message) ||
      /column/i.test(message))
  );
}

export function BulkUploadEntities() {
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

    const text = await file.text();
    const { rows, errors } = parseEntityCsv(text);
    setParseErrors(errors);

    if (errors.length > 0) {
      toast.error(`CSV has ${errors.length} problem(s). Fix and try again.`);
      return;
    }
    if (rows.length === 0) {
      toast.error("No data rows found");
      return;
    }

    setSchemaHint(null);
    setUploading(true);
    const supabase = createClient();
    let inserted = 0;
    let stopped = false;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map((r) => ({
        first_name: r.first_name,
        last_name: r.last_name,
        member_status: r.member_status,
        slug: r.slug,
        entity_type: "faculty" as const,
        institution: r.institution,
        pubmed_url: r.pubmed_url,
        lab_website: r.lab_website,
        google_alert_query: r.google_alert_query,
        nih_profile_id: r.nih_profile_id,
        priority_tier: r.priority_tier,
        active: r.active,
      }));

      const { error } = await supabase.from("tracked_entities").upsert(batch, {
        onConflict: "slug",
      });

      if (error) {
        if (looksLikeMissingFacultyColumns(error.message)) {
          setSchemaHint(
            "Your Supabase database is missing faculty columns on tracked_entities. " +
              "In the Supabase dashboard open SQL Editor, paste the full contents of " +
              "supabase/apply_faculty_schema.sql from this project, run it once, wait a few seconds, then upload again.",
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
      inserted += batch.length;
    }

    setUploading(false);
    if (!stopped) {
      toast.success(`Imported ${inserted} row(s) (upsert by slug)`);
      setParseErrors([]);
      setSchemaHint(null);
      router.refresh();
    }
  }

  return (
    <Card>
      <CardTitle>Bulk upload (CSV)</CardTitle>
      <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
        Required columns: <code className="text-xs">Last Name</code>,{" "}
        <code className="text-xs">First Name</code>, and member status (header{" "}
        <code className="text-xs">Member status</code> or{" "}
        <code className="text-xs">Associate/Full Member</code>). Values:{" "}
        <code className="text-xs">Member</code>, <code className="text-xs">Associate</code>, or{" "}
        <code className="text-xs">Leadership Committee</code> (legacy{" "}
        <code className="text-xs">Full Member</code> is treated as Member). Optional:{" "}
        <code className="text-xs">slug</code> (auto from last-first if empty),{" "}
        <code className="text-xs">institution</code> (for discovery disambiguation; synonyms separated by{" "}
        <code className="text-xs">;</code> or <code className="text-xs">|</code>),{" "}
        <code className="text-xs">pubmed_url</code> (or <code className="text-xs">PubMed URL</code>),{" "}
        <code className="text-xs">lab_website</code> (or <code className="text-xs">Lab website</code>; lab RSS on Discover),{" "}
        <code className="text-xs">google_alert_query</code> (Google News RSS on Discover),{" "}
        <code className="text-xs">nih_profile_id</code> (NIH profile ID → Discover funding),{" "}
        <code className="text-xs">active</code>. Priority tier is set from member status (Leadership
        1, Member 2, Associate 3).
        Rows upsert by <code className="text-xs">slug</code>; display name is synced in the database.
        <span className="mt-3 block text-[#8f644f]">
          <strong>First-time Supabase:</strong> run{" "}
          <code className="text-xs">supabase/apply_faculty_schema.sql</code> in the SQL Editor if
          upload fails with a missing <code className="text-xs">first_name</code> column error.
        </span>
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
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
          {uploading ? "Uploading…" : "Choose CSV file"}
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
