import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadScriptEnv } from "./load-script-env";
import {
  carListingToSnapshotDatabaseInsert,
  mediaItemToSnapshotDatabaseInsert
} from "../lib/supabase/listing-mappers";
import { normalizeListings } from "../src/lib/normalizeListing";
import type { CarListing, RawListingInput } from "../src/lib/listingTypes";
import type { Database } from "../lib/supabase/database.types";

loadScriptEnv("Supabase snapshot import", ["SUPABASE_SECRET_KEY"]);

type ImportSourceMode = Database["public"]["Tables"]["listing_imports"]["Insert"]["source_mode"];
type ImportPayload = Database["public"]["Tables"]["listing_imports"]["Insert"]["payload"];

const snapshotPath = resolve("src/data/realListings.json");
const dryRun = process.argv.includes("--dry");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log(`NEXT_PUBLIC_SUPABASE_URL detected: ${url ? "yes" : "no"}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY detected: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "yes" : "no"}`);

  if (!url || !serviceKey) {
    console.log("Supabase URL or server secret is missing. Snapshot import skipped.");
    return;
  }

  const listings = readSnapshotListings();
  if (listings.length === 0) {
    console.log("No snapshot listings found. Nothing to import.");
    return;
  }

  if (dryRun) {
    console.log(`Dry run: would upsert ${listings.length} listing(s) from ${snapshotPath}.`);
    return;
  }

  const supabase = createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  let importedListings = 0;
  let importedMedia = 0;
  let importedRecords = 0;

  for (const listing of listings) {
    const sourceListingId = listing.providerListingId ?? listing.id;
    const listingId = toDeterministicUuid(`${listing.sourceMode ?? "csv"}:${sourceListingId}`);
    const databaseListing = {
      ...listing,
      id: listingId,
      providerListingId: sourceListingId
    };

    const { error: listingError } = await supabase
      .from("listings")
      .upsert(carListingToSnapshotDatabaseInsert(databaseListing), { onConflict: "id" });

    if (listingError) {
      throw new Error(`Could not import listing ${listing.id}: ${listingError.message}`);
    }

    await supabase.from("listing_media").delete().eq("listing_id", listingId);

    const mediaRows = listing.mediaItems.map((media, index) =>
      mediaItemToSnapshotDatabaseInsert({
        listingId,
        media,
        sortOrder: index
      })
    );

    if (mediaRows.length > 0) {
      const { error: mediaError } = await supabase.from("listing_media").insert(mediaRows);

      if (mediaError) {
        throw new Error(`Could not import media for ${listing.id}: ${mediaError.message}`);
      }
    }

    const sourceMode = toImportSourceMode(listing.sourceMode);
    const importPayload = toImportPayload(
      listing.rawProviderSummary ?? {
        sourceName: listing.sourceName ?? null,
        externalListingUrl: listing.externalListingUrl ?? null,
        importedFromSnapshot: true
      }
    );
    const { error: importError } = await supabase.from("listing_imports").upsert(
      {
        source_mode: sourceMode,
        source_listing_id: sourceListingId,
        listing_id: listingId,
        payload: importPayload
      },
      { onConflict: "source_mode,source_listing_id" }
    );

    if (importError) {
      throw new Error(`Could not record import for ${listing.id}: ${importError.message}`);
    }

    importedListings += 1;
    importedMedia += mediaRows.length;
    importedRecords += 1;
  }

  console.log(
    `Imported ${importedListings} listing(s), ${importedMedia} media row(s), and ${importedRecords} import record(s).`
  );
}

function readSnapshotListings(): CarListing[] {
  const raw = JSON.parse(readFileSync(snapshotPath, "utf8")) as RawListingInput[];
  return normalizeListings(Array.isArray(raw) ? raw : [], "csv");
}

function toDeterministicUuid(value: string) {
  const bytes = Buffer.from(createHash("sha256").update(value).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join("-");
}

function toImportSourceMode(sourceMode: CarListing["sourceMode"]): ImportSourceMode {
  return sourceMode === "marketcheck" || sourceMode === "ebay" || sourceMode === "csv"
    ? sourceMode
    : "csv";
}

function toImportPayload(value: Record<string, unknown>): ImportPayload {
  return JSON.parse(JSON.stringify(value)) as ImportPayload;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
