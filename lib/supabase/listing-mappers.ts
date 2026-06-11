import type { CarListing, ListingMediaItem } from "@/data/listings";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { RawListingInput } from "@/src/lib/listingTypes";
import { normalizeListing } from "@/src/lib/normalizeListing";

type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
type ListingInsert = Database["public"]["Tables"]["listings"]["Insert"];
type MediaRow = Database["public"]["Tables"]["listing_media"]["Row"];
type MediaInsert = Database["public"]["Tables"]["listing_media"]["Insert"];

export function databaseListingToCarListing(
  row: ListingRow,
  mediaRows: MediaRow[] = []
): CarListing {
  const mediaItems = mediaRows
    .sort((left, right) => left.sort_order - right.sort_order)
    .map<ListingMediaItem>((media) => ({
      url: media.public_url,
      type: media.media_type,
      thumbnailUrl: media.thumbnail_url ?? undefined,
      label: media.label ?? undefined,
      durationSeconds: media.duration_seconds ?? undefined
    }));

  const input: RawListingInput = {
    id: row.id,
    ownerId: row.owner_id ?? undefined,
    sourceName: row.source_name ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    externalListingUrl: row.external_listing_url ?? undefined,
    providerListingId: row.provider_listing_id ?? undefined,
    sourceMode: row.source_mode,
    year: row.year,
    make: row.make,
    model: row.model,
    trim: row.trim,
    price: row.price,
    mileage: row.mileage,
    location: row.location,
    distance: row.distance,
    sellerType: row.seller_type,
    sellerName: row.seller_name ?? undefined,
    sellerPhone: row.seller_phone ?? undefined,
    sellerEmail: row.seller_email ?? undefined,
    contactUrl: row.contact_url ?? undefined,
    vin: row.vin ?? undefined,
    sellerTitleStatus: row.seller_title_status,
    vehicleCondition: row.vehicle_condition,
    knownIssueFlags: row.known_issue_flags,
    sellerDisclosureNotes: row.seller_disclosure_notes ?? undefined,
    imageUrls: mediaItems.filter((item) => item.type === "image").map((item) => item.url),
    mediaItems,
    listingTitle: row.listing_title ?? undefined,
    listingDescription: row.listing_description ?? undefined,
    dealGrade: row.deal_grade,
    feedBadge: row.feed_badge,
    aiHook: row.ai_hook,
    aiTake: row.ai_take,
    aiVoice: row.ai_voice_script
      ? {
          script: row.ai_voice_script,
          audioUrl: row.ai_voice_url ?? undefined,
          persona: row.ai_voice_persona ?? "Deal Scout",
          voice: row.ai_voice_voice ?? "coral",
          scriptModel: row.ai_voice_script_model ?? undefined,
          ttsModel: row.ai_voice_tts_model ?? undefined,
          generatedAt: row.ai_voice_generated_at ?? undefined,
          promptVersion: row.ai_voice_prompt_version ?? undefined
        }
      : readAiVoiceFromRawSummary(row.raw_provider_summary),
    fairValueRange: {
      low: row.fair_value_low,
      high: row.fair_value_high
    },
    estimatedMarketEdge: row.market_edge,
    confidence: row.confidence,
    riskLevel: row.risk_level,
    whyItMadeTheFeed: row.why_it_made_the_feed,
    redFlags: row.red_flags,
    sellerQuestions: row.seller_questions,
    suggestedFirstMessage: row.suggested_first_message,
    suggestedOffer: row.suggested_offer,
    walkawayPrice: row.walkaway_price,
    checklistItems: row.checklist_items,
    tags: row.tags,
    reelCaptions: row.reel_captions,
    rawProviderSummary: row.raw_provider_summary as Record<string, unknown> | undefined,
    importedAt: row.imported_at ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined
  };

  const listing = normalizeListing(input, row.source_mode);
  return {
    ...listing,
    ownerId: row.owner_id ?? undefined
  };
}

export function carListingToDatabaseInsert(
  listing: CarListing,
  ownerId: string,
  listingId: string
): ListingInsert {
  const insert = carListingToSnapshotDatabaseInsert(
    {
      ...listing,
      sourceMode: "user"
    },
    listingId
  );

  return {
    ...insert,
    owner_id: ownerId,
    source_mode: "user",
    source_name: listing.sourceName ?? "CarIndex.ai"
  };
}

export function carListingToSnapshotDatabaseInsert(
  listing: CarListing,
  listingId = listing.id
): ListingInsert {
  const sourceMode =
    listing.sourceMode && listing.sourceMode !== "user" ? listing.sourceMode : "csv";

  return {
    id: listingId,
    owner_id: listing.ownerId ?? null,
    source_mode: sourceMode,
    source_name: listing.sourceName ?? null,
    source_url: listing.sourceUrl ?? null,
    external_listing_url: listing.externalListingUrl ?? null,
    provider_listing_id: listing.providerListingId ?? null,
    status: "active",
    year: listing.year,
    make: listing.make,
    model: listing.model,
    trim: listing.trim,
    price: listing.price,
    mileage: listing.mileage,
    location: listing.location,
    distance: listing.distance,
    seller_type: listing.sellerType,
    seller_name: listing.sellerName ?? null,
    seller_phone: listing.sellerPhone ?? null,
    seller_email: listing.sellerEmail ?? null,
    contact_url: listing.contactUrl ?? null,
    vin: listing.vin ?? null,
    seller_title_status: listing.sellerTitleStatus,
    vehicle_condition: listing.vehicleCondition,
    known_issue_flags: listing.knownIssueFlags,
    seller_disclosure_notes: listing.sellerDisclosureNotes ?? null,
    listing_title: listing.listingTitle ?? `${listing.year} ${listing.make} ${listing.model}`.trim(),
    listing_description: listing.listingDescription ?? null,
    deal_grade: listing.dealGrade,
    feed_badge: listing.feedBadge,
    ai_hook: listing.aiHook,
    ai_take: listing.aiTake,
    ...(listing.aiVoice
      ? {
          ai_voice_script: listing.aiVoice.script,
          ai_voice_url: listing.aiVoice.audioUrl ?? null,
          ai_voice_persona: listing.aiVoice.persona,
          ai_voice_voice: listing.aiVoice.voice,
          ai_voice_script_model: listing.aiVoice.scriptModel ?? null,
          ai_voice_tts_model: listing.aiVoice.ttsModel ?? null,
          ai_voice_prompt_version: listing.aiVoice.promptVersion ?? null,
          ai_voice_generated_at: listing.aiVoice.generatedAt ?? null
        }
      : {}),
    fair_value_low: listing.fairValueRange.low,
    fair_value_high: listing.fairValueRange.high,
    market_edge: listing.marketEdge,
    confidence: listing.confidence,
    risk_level: listing.riskLevel,
    why_it_made_the_feed: listing.whyItMadeTheFeed,
    red_flags: listing.redFlags,
    seller_questions: listing.sellerQuestions,
    suggested_first_message: listing.suggestedFirstMessage,
    suggested_offer: listing.suggestedOffer,
    walkaway_price: listing.walkawayPrice,
    checklist_items: listing.checklistItems,
    tags: listing.tags,
    reel_captions: listing.reelCaptions,
    raw_provider_summary: toJson(listing.rawProviderSummary),
    imported_at: listing.importedAt ?? null,
    last_seen_at: listing.lastSeenAt ?? null
  };
}

export function mediaItemToDatabaseInsert({
  listingId,
  ownerId,
  media,
  storagePath,
  sortOrder
}: {
  listingId: string;
  ownerId: string;
  media: ListingMediaItem;
  storagePath: string | null;
  sortOrder: number;
}): MediaInsert {
  return mediaItemToSnapshotDatabaseInsert({
    listingId,
    ownerId,
    media,
    storagePath,
    sortOrder
  });
}

export function mediaItemToSnapshotDatabaseInsert({
  listingId,
  ownerId = null,
  media,
  storagePath = null,
  sortOrder
}: {
  listingId: string;
  ownerId?: string | null;
  media: ListingMediaItem;
  storagePath?: string | null;
  sortOrder: number;
}): MediaInsert {
  return {
    listing_id: listingId,
    owner_id: ownerId,
    media_type: media.type,
    storage_path: storagePath,
    public_url: media.url,
    thumbnail_url: media.thumbnailUrl ?? null,
    sort_order: sortOrder,
    label: media.label ?? null,
    duration_seconds: media.durationSeconds ?? null
  };
}

function toJson(value: Record<string, unknown> | undefined): Json | null {
  if (!value) return null;
  return JSON.parse(JSON.stringify(value)) as Json;
}

function readAiVoiceFromRawSummary(rawSummary: Json | null) {
  if (!rawSummary || typeof rawSummary !== "object" || Array.isArray(rawSummary)) return undefined;

  const aiVoice = (rawSummary as { aiVoice?: unknown }).aiVoice;
  if (!aiVoice || typeof aiVoice !== "object" || Array.isArray(aiVoice)) return undefined;

  const candidate = aiVoice as {
    script?: unknown;
    audioUrl?: unknown;
    persona?: unknown;
    voice?: unknown;
    scriptModel?: unknown;
    ttsModel?: unknown;
    generatedAt?: unknown;
    promptVersion?: unknown;
  };

  if (typeof candidate.script !== "string" || !candidate.script.trim()) return undefined;

  return {
    script: candidate.script,
    audioUrl: typeof candidate.audioUrl === "string" ? candidate.audioUrl : undefined,
    persona: typeof candidate.persona === "string" ? candidate.persona : "Deal Scout",
    voice: typeof candidate.voice === "string" ? candidate.voice : "coral",
    scriptModel: typeof candidate.scriptModel === "string" ? candidate.scriptModel : undefined,
    ttsModel: typeof candidate.ttsModel === "string" ? candidate.ttsModel : undefined,
    generatedAt: typeof candidate.generatedAt === "string" ? candidate.generatedAt : undefined,
    promptVersion: typeof candidate.promptVersion === "string" ? candidate.promptVersion : undefined
  };
}
