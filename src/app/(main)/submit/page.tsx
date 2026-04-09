"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ItemCategory, SourceType } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function SubmitPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([]);
  const [entityId, setEntityId] = useState("");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("manual");
  const [category, setCategory] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    function loadEntities() {
      void supabase
        .from("tracked_entities")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true })
        .then(({ data }) => setEntities(data ?? []));
    }
    loadEntities();
    const onFocus = () => loadEntities();
    const onVisible = () => {
      if (document.visibilityState === "visible") loadEntities();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let domain: string | null = null;
    if (sourceUrl.trim()) {
      try {
        domain = new URL(sourceUrl.trim()).hostname;
      } catch {
        domain = null;
      }
    }
    const { data, error } = await supabase
      .from("source_items")
      .insert({
        tracked_entity_id: entityId || null,
        source_type: sourceType,
        title: title.trim(),
        source_url: sourceUrl.trim() || null,
        source_domain: domain,
        raw_text: rawText.trim() || null,
        raw_summary: summary.trim() || null,
        submitted_by: user?.id ?? null,
        status: "new",
        category: (category || null) as ItemCategory | null,
      })
      .select("id")
      .single();
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Submitted");
    router.push(`/items/${data.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-sm text-neutral-500">
          <Link href="/items" className="hover:underline">
            ← Review Queue
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Manual submission</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Creates a new source item with status “new”
        </p>
      </div>

      <Card>
        <CardTitle>Story</CardTitle>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="entity">Investigator (optional)</Label>
            <Select
              id="entity"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="mt-1"
            >
              <option value="">None</option>
              {entities.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="url">URL (optional)</Label>
            <Input id="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="stype">Source type</Label>
            <Select
              id="stype"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className="mt-1"
            >
              <option value="manual">Manual</option>
              <option value="web">Web</option>
              <option value="lab_website">Lab website</option>
              <option value="reporter">RePORTER</option>
              <option value="pubmed">PubMed</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="cat">Category</Label>
            <Select id="cat" value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1">
              <option value="">—</option>
              <option value="paper">Paper</option>
              <option value="award">Award</option>
              <option value="event">Event</option>
              <option value="media">Media</option>
              <option value="funding">Funding</option>
              <option value="community_update">Community update</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="sum">Summary / notes</Label>
            <Textarea id="sum" value={summary} onChange={(e) => setSummary(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="raw">Raw text (optional)</Label>
            <Textarea id="raw" value={rawText} onChange={(e) => setRawText(e.target.value)} className="mt-1" />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Submitting…" : "Submit"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
