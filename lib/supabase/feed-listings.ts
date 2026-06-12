import type { CarListing } from "@/data/listings";
import { normalizeDedupeVin } from "@/lib/listing-dedupe";
import { hasJunkMediaSignal, hasMediaMismatch } from "@/lib/media-verification";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { databaseListingToCarListing } from "@/lib/supabase/listing-mappers";

type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
type MediaRow = Database["public"]["Tables"]["listing_media"]["Row"];

const defaultFeedLimit = 36;
const maxFeedLimit = 60;

export type BackendFeedPage = {
  listings: CarListing[];
  nextCursor: string | null;
};

export async function getBackendFeedListings(limit = defaultFeedLimit): Promise<CarListing[]> {
  const page = await getBackendFeedPage({ limit });
  return page.listings;
}

export async function getBackendFeedPage({
  limit = defaultFeedLimit,
  cursor
}: {
  limit?: number;
  cursor?: string | null;
} = {}): Promise<BackendFeedPage> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return { listings: [], nextCursor: null };
  }

  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), maxFeedLimit));
  const fetchLimit = Math.min(maxFeedLimit * 3, Math.max(boundedLimit * 3, boundedLimit + 1));
  let query = supabase
    .from("listings")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(fetchLimit + 1);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: listingRows, error } = await query;

  if (error || !listingRows?.length) {
    return { listings: [], nextCursor: null };
  }

  const rowsWithLookahead = listingRows as ListingRow[];
  const fetchedRows = rowsWithLookahead.slice(0, fetchLimit);
  const publicRows = fetchedRows.filter((row) => !isSuppressedFromPublicFeed(row));
  const dedupedPublicRows = dedupeListingRowsByVin(publicRows);
  const typedListingRows = dedupedPublicRows.slice(0, boundedLimit);
  const hasMorePublicRowsInBatch = dedupedPublicRows.length > boundedLimit;
  const hasMoreRawRows = rowsWithLookahead.length > fetchLimit;
  const nextCursor =
    hasMorePublicRowsInBatch
      ? typedListingRows.at(-1)?.created_at ?? null
      : hasMoreRawRows
        ? fetchedRows.at(-1)?.created_at ?? null
        : null;
  const listingIds = typedListingRows.map((row) => row.id);
  const { data: mediaRows } =
    listingIds.length > 0
      ? await supabase
          .from("listing_media")
          .select("*")
          .in("listing_id", listingIds)
          .order("sort_order", { ascending: true })
      : { data: [] };

  const mediaByListing = new Map<string, MediaRow[]>();
  for (const media of (mediaRows ?? []) as MediaRow[]) {
    const current = mediaByListing.get(media.listing_id) ?? [];
    current.push(media);
    mediaByListing.set(media.listing_id, current);
  }

  return {
    listings: typedListingRows.map((row) =>
      databaseListingToCarListing(row, mediaByListing.get(row.id) ?? [])
    ),
    nextCursor
  };
}

function dedupeListingRowsByVin(rows: ListingRow[]) {
  const byKey = new Map<string, ListingRow>();

  for (const row of rows) {
    const key = normalizeDedupeVin(row.vin) ?? `id:${row.id}`;
    const current = byKey.get(key);
    if (!current || scoreListingRowForDedupe(row) > scoreListingRowForDedupe(current)) {
      byKey.set(key, row);
    }
  }

  return [...byKey.values()];
}

function scoreListingRowForDedupe(row: ListingRow) {
  let score = 0;
  if (row.source_mode === "user") score += 10_000;
  if (row.source_mode === "marketcheck") score += 300;
  if (row.source_mode === "ebay") score += 250;
  if (row.source_mode === "csv") score += 100;
  if (row.source_mode === "mock") score -= 500;
  if (row.price > 0) score += 40;
  if (row.mileage > 0) score += 40;
  if (row.seller_phone) score += 25;
  if (row.contact_url || row.external_listing_url) score += 20;
  if (normalizeDedupeVin(row.vin)) score += 20;
  score += Math.min(80, Math.max(0, row.confidence));

  const lastSeen = row.last_seen_at ? Date.parse(row.last_seen_at) : 0;
  if (Number.isFinite(lastSeen) && lastSeen > 0) {
    score += Math.min(80, lastSeen / 86_400_000_000);
  }

  return score;
}

function isSuppressedFromPublicFeed(row: ListingRow) {
  if (row.source_mode !== "user") {
    return false;
  }

  const tags = Array.isArray(row.tags) ? row.tags : [];
  const hasSuppressedTag = tags.some((tag) =>
    /media-mismatch|media-junk|media-spam|media-unrelated|manual-review-required|manual-review-requested|manual-review-rejected/i.test(tag)
  );

  return (
    hasSuppressedTag ||
    readModerationStatus(row.raw_provider_summary) === "manual_review_required" ||
    readModerationStatus(row.raw_provider_summary) === "manual_review_requested" ||
    readModerationStatus(row.raw_provider_summary) === "manual_review_rejected" ||
    hasMediaMismatch(row.raw_provider_summary) ||
    hasJunkMediaSignal(row.raw_provider_summary)
  );
}

function readModerationStatus(rawProviderSummary: unknown) {
  if (!rawProviderSummary || typeof rawProviderSummary !== "object" || Array.isArray(rawProviderSummary)) {
    return "";
  }

  const moderation = (rawProviderSummary as { moderation?: unknown }).moderation;
  if (!moderation || typeof moderation !== "object" || Array.isArray(moderation)) {
    return "";
  }

  const status = (moderation as { status?: unknown }).status;
  return typeof status === "string" ? status : "";
}
