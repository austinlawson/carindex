import type { CarListing } from "@/data/listings";
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
  const typedListingRows = publicRows.slice(0, boundedLimit);
  const hasMorePublicRowsInBatch = publicRows.length > boundedLimit;
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

function isSuppressedFromPublicFeed(row: ListingRow) {
  if (row.source_mode !== "user") {
    return false;
  }

  const tags = Array.isArray(row.tags) ? row.tags : [];
  const hasSuppressedTag = tags.some((tag) =>
    /media-mismatch|media-junk|media-spam|media-unrelated|manual-review-required|manual-review-requested/i.test(tag)
  );

  return (
    hasSuppressedTag ||
    readModerationStatus(row.raw_provider_summary) === "manual_review_required" ||
    readModerationStatus(row.raw_provider_summary) === "manual_review_requested" ||
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
