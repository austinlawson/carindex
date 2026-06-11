import { createClient } from "@supabase/supabase-js";
import { currentAiVoicePromptVersion } from "../lib/ai-voice";
import type { Database, Json } from "../lib/supabase/database.types";
import { loadScriptEnv } from "./load-script-env";

loadScriptEnv("AI voice cleanup", ["SUPABASE_SECRET_KEY"]);

const dryRun = process.argv.includes("--dry");
const pageSize = 1000;

type ListingSummaryRow = Pick<
  Database["public"]["Tables"]["listings"]["Row"],
  "id" | "raw_provider_summary"
>;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_LISTING_MEDIA_BUCKET || "listing-media";

  if (!url || !serviceKey) {
    console.log("Supabase URL or server secret is missing. AI voice cleanup skipped.");
    return;
  }

  const supabase = createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const currentAudioPaths = new Set<string>();
  let staleRows = 0;
  let updatedRows = 0;
  let scannedRows = 0;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("listings")
      .select("id, raw_provider_summary")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Could not read listings: ${error.message}`);
    }

    const rows = (data ?? []) as ListingSummaryRow[];
    if (rows.length === 0) break;

    scannedRows += rows.length;

    for (const row of rows) {
      const summary = getSummaryObject(row.raw_provider_summary);
      const aiVoice = getAiVoice(summary);

      if (!aiVoice) continue;

      if (aiVoice.promptVersion === currentAiVoicePromptVersion) {
        const path = getStoragePathFromPublicUrl(aiVoice.audioUrl, bucket);
        if (path) currentAudioPaths.add(path);
        continue;
      }

      staleRows += 1;

      if (dryRun) continue;

      const nextSummary = { ...summary };
      delete nextSummary.aiVoice;

      const replacementSummary =
        Object.keys(nextSummary).length > 0 ? (nextSummary as Json) : null;

      const { error: updateError } = await supabase
        .from("listings")
        .update({ raw_provider_summary: replacementSummary })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(`Could not clear stale AI voice data for ${row.id}: ${updateError.message}`);
      }

      updatedRows += 1;
    }

    if (rows.length < pageSize) break;
  }

  const storedAudioPaths = await listStoragePaths(supabase, bucket, "ai-voice");
  const orphanedAudioPaths = storedAudioPaths.filter((path) => !currentAudioPaths.has(path));

  if (!dryRun && orphanedAudioPaths.length > 0) {
    for (let index = 0; index < orphanedAudioPaths.length; index += 100) {
      const batch = orphanedAudioPaths.slice(index, index + 100);
      const { error } = await supabase.storage.from(bucket).remove(batch);

      if (error) {
        throw new Error(`Could not delete AI voice audio files: ${error.message}`);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        promptVersionKept: currentAiVoicePromptVersion,
        scannedRows,
        staleRows,
        updatedRows,
        currentAudioFilesKept: currentAudioPaths.size,
        storedAudioFilesFound: storedAudioPaths.length,
        orphanedAudioFilesDeleted: dryRun ? 0 : orphanedAudioPaths.length,
        orphanedAudioFilesWouldDelete: dryRun ? orphanedAudioPaths.length : 0
      },
      null,
      2
    )
  );
}

function getSummaryObject(rawSummary: Json | null) {
  if (!rawSummary || typeof rawSummary !== "object" || Array.isArray(rawSummary)) {
    return {};
  }

  return rawSummary as Record<string, unknown>;
}

function getAiVoice(summary: Record<string, unknown>) {
  const aiVoice = summary.aiVoice;

  if (!aiVoice || typeof aiVoice !== "object" || Array.isArray(aiVoice)) {
    return null;
  }

  return aiVoice as {
    audioUrl?: unknown;
    promptVersion?: unknown;
  };
}

function getStoragePathFromPublicUrl(value: unknown, bucket: string) {
  if (typeof value !== "string" || !value) return null;

  try {
    const url = new URL(value);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

async function listStoragePaths(
  supabase: ReturnType<typeof createClient<Database>>,
  bucket: string,
  prefix: string
) {
  const paths: string[] = [];
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });

  if (error) {
    throw new Error(`Could not list storage path ${prefix}: ${error.message}`);
  }

  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;
    const isFile = Boolean(item.metadata?.size);

    if (isFile) {
      paths.push(path);
      continue;
    }

    paths.push(...(await listStoragePaths(supabase, bucket, path)));
  }

  return paths;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
