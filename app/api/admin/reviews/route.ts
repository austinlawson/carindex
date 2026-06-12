import { NextResponse } from "next/server";
import type { CarListing } from "@/data/listings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { databaseListingToCarListing } from "@/lib/supabase/listing-mappers";

export const dynamic = "force-dynamic";

type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
type ListingUpdate = Database["public"]["Tables"]["listings"]["Update"];
type MediaRow = Database["public"]["Tables"]["listing_media"]["Row"];
type ReviewDecision = "approve" | "reject";

const reviewTagPattern =
  /manual-review-required|manual-review-requested|manual-review-rejected|media-mismatch|media-junk|media-spam|media-unrelated|resubmission-no-vision/i;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.supabase
    .from("listings")
    .select("*")
    .eq("source_mode", "user")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: `Could not load review queue: ${error.message}` },
      { status: 500 }
    );
  }

  const pendingRows = ((data ?? []) as ListingRow[]).filter(isPendingReviewRow);
  const listings = await rowsToListings(auth.supabase, pendingRows);

  return NextResponse.json({
    isAdmin: true,
    listings,
    count: listings.length
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const payload = await request.json().catch(() => null);
  const listingId = readString(payload?.listingId);
  const decision = readString(payload?.decision) as ReviewDecision;
  const notes = readString(payload?.notes);

  if (!listingId || (decision !== "approve" && decision !== "reject")) {
    return NextResponse.json(
      { error: "A listing id and approve/reject decision are required." },
      { status: 400 }
    );
  }

  const { data: row, error: loadError } = await auth.supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json(
      { error: `Could not load listing: ${loadError.message}` },
      { status: 500 }
    );
  }

  if (!row) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const listingRow = row as ListingRow;
  const rawProviderSummary = buildReviewedRawSummary(
    listingRow.raw_provider_summary,
    decision,
    auth.user.id,
    notes
  );
  const tags =
    decision === "approve"
      ? removeReviewTags(listingRow.tags)
      : uniqueStrings([
          ...removeReviewTags(listingRow.tags),
          "manual-review-rejected"
        ]);

  const update: ListingUpdate = {
    tags,
    raw_provider_summary: rawProviderSummary as Json
  };

  const { data: updatedRow, error: updateError } = await auth.supabase
    .from("listings")
    .update(update)
    .eq("id", listingId)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: `Could not update review decision: ${updateError.message}` },
      { status: 500 }
    );
  }

  const [listing] = await rowsToListings(auth.supabase, [updatedRow as ListingRow]);

  return NextResponse.json({
    ok: true,
    listing,
    decision
  });
}

async function requireAdmin(request: Request) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase service role is not configured." },
      { status: 503 }
    );
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json({ error: "Invalid auth token." }, { status: 401 });
  }

  const { data: adminRow, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) {
    return NextResponse.json(
      { error: `Could not verify admin access: ${adminError.message}` },
      { status: 500 }
    );
  }

  if (!adminRow) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  return { supabase, user };
}

async function rowsToListings(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  rows: ListingRow[]
): Promise<CarListing[]> {
  const listingIds = rows.map((row) => row.id);
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

  return rows.map((row) => databaseListingToCarListing(row, mediaByListing.get(row.id) ?? []));
}

function isPendingReviewRow(row: ListingRow) {
  const status = readModerationStatus(row.raw_provider_summary);
  if (/manual_review_required|manual_review_requested/i.test(status)) return true;

  return row.tags.some((tag) => /manual-review-required|manual-review-requested/i.test(tag));
}

function buildReviewedRawSummary(
  rawProviderSummary: unknown,
  decision: ReviewDecision,
  reviewerId: string,
  notes: string
) {
  const raw = readRawObject(rawProviderSummary);
  const previousModeration = readRawObject(raw.moderation);

  return {
    ...raw,
    moderation: {
      ...previousModeration,
      previousStatus: readString(previousModeration.status) || null,
      status: decision === "approve" ? "manual_review_approved" : "manual_review_rejected",
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewerId,
      reviewerNotes: notes || null
    }
  };
}

function removeReviewTags(tags: string[]) {
  return uniqueStrings(tags.filter((tag) => !reviewTagPattern.test(tag)));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function readRawObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readModerationStatus(rawProviderSummary: unknown) {
  const moderation = readRawObject(readRawObject(rawProviderSummary).moderation);
  return readString(moderation.status);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;

  return authorization.slice("bearer ".length).trim();
}
