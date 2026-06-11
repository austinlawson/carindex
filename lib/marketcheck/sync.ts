import { createHash } from "node:crypto";
import {
  carListingToSnapshotDatabaseInsert,
  mediaItemToSnapshotDatabaseInsert
} from "@/lib/supabase/listing-mappers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { normalizeListing } from "@/src/lib/normalizeListing";
import type { CarListing, RawListingInput } from "@/src/lib/listingTypes";

const provider = "marketcheck";
const defaultBaseUrl = "https://api.marketcheck.com/v2/search/car/active";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
type ProviderSyncRunInsert = Database["public"]["Tables"]["provider_sync_runs"]["Insert"];

type MarketCheckSyncConfig = {
  apiKey?: string;
  baseUrl: string;
  zip: string;
  radius: number;
  rows: number;
  carType: string;
  make?: string;
  bodyType?: string;
  minPrice?: number;
  maxPrice?: number;
  maxMediaPerListing: number;
  staleGraceHours: number;
  archiveMinSeenListings: number;
  monthlyCallLimit: number;
  monthlySafetyBuffer: number;
};

type MarketCheckRow = Record<string, unknown>;

type NormalizedMarketCheckListing = {
  listing: CarListing;
  rawRow: MarketCheckRow;
  sourceListingId: string;
};

export type MarketCheckSyncResult = {
  ok: boolean;
  dryRun: boolean;
  message: string;
  startedAt: string;
  finishedAt: string;
  callsUsed: number;
  monthlyCallsUsedBeforeRun: number;
  monthlyUsableCallLimit: number;
  rowsFetched: number;
  listingsNormalized: number;
  listingsSkipped: number;
  listingsUpserted: number;
  listingsCreated: number;
  listingsReactivated: number;
  mediaRowsInserted: number;
  importRowsUpserted: number;
  listingsArchived: number;
  archiveSkippedReason?: string;
  warnings: string[];
  config: {
    zip: string;
    radius: number;
    rows: number;
    carType: string;
    maxMediaPerListing: number;
    staleGraceHours: number;
  };
};

export async function syncMarketCheckInventory(options: { dryRun?: boolean } = {}) {
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();
  const config = readMarketCheckSyncConfig();
  const warnings: string[] = [];
  const supabase = createSupabaseAdminClient();

  const baseResult = {
    dryRun: Boolean(options.dryRun),
    startedAt: startedAtIso,
    callsUsed: 0,
    monthlyCallsUsedBeforeRun: 0,
    monthlyUsableCallLimit: getMonthlyUsableCallLimit(config),
    rowsFetched: 0,
    listingsNormalized: 0,
    listingsSkipped: 0,
    listingsUpserted: 0,
    listingsCreated: 0,
    listingsReactivated: 0,
    mediaRowsInserted: 0,
    importRowsUpserted: 0,
    listingsArchived: 0,
    warnings,
    config: {
      zip: config.zip,
      radius: config.radius,
      rows: config.rows,
      carType: config.carType,
      maxMediaPerListing: config.maxMediaPerListing,
      staleGraceHours: config.staleGraceHours
    }
  };

  if (!supabase) {
    return finishResult({
      ...baseResult,
      ok: false,
      message: "Supabase service credentials are not configured."
    });
  }

  const monthKey = startedAtIso.slice(0, 7);
  const monthlyUsage = await getMonthlyCallsUsed(supabase, monthKey);
  baseResult.monthlyCallsUsedBeforeRun = monthlyUsage.callsUsed;
  warnings.push(...monthlyUsage.warnings);

  if (options.dryRun) {
    return finishResult({
      ...baseResult,
      ok: true,
      message: "Dry run only. No MarketCheck call or database mutation was made."
    });
  }

  if (!config.apiKey) {
    return finishResult({
      ...baseResult,
      ok: false,
      message: "MARKETCHECK_API_KEY is not configured."
    });
  }

  if (monthlyUsage.callsUsed >= getMonthlyUsableCallLimit(config)) {
    return finishResult({
      ...baseResult,
      ok: false,
      message: "MarketCheck monthly safety limit reached. No request was made."
    });
  }

  let callsAttempted = 0;

  try {
    callsAttempted = 1;
    const payload = await fetchMarketCheckPayload(config);
    const rawRows = extractListings(payload);
    const nowIso = new Date().toISOString();
    const normalized = normalizeMarketCheckRows(rawRows, config, nowIso);
    const existingRows = await fetchExistingListingRows(
      supabase,
      normalized.map((item) => item.listing.id)
    );
    const prepared = normalized.map((item) => ({
      ...item,
      listing: {
        ...item.listing,
        importedAt: existingRows.get(item.listing.id)?.imported_at ?? item.listing.importedAt
      }
    }));
    const writeStats = await writeMarketCheckListings(supabase, prepared);
    const archiveStats = await archiveStaleMarketCheckListings({
      supabase,
      seenListingIds: new Set(prepared.map((item) => item.listing.id)),
      fetchedListingCount: prepared.length,
      config,
      now: new Date()
    });

    const result = finishResult({
      ...baseResult,
      ok: true,
      message: "MarketCheck sync completed.",
      callsUsed: 1,
      rowsFetched: rawRows.length,
      listingsNormalized: prepared.length,
      listingsSkipped: Math.max(0, rawRows.length - prepared.length),
      listingsUpserted: writeStats.listingsUpserted,
      listingsCreated: prepared.filter((item) => !existingRows.has(item.listing.id)).length,
      listingsReactivated: prepared.filter((item) => {
        const existing = existingRows.get(item.listing.id);
        return existing ? existing.status !== "active" : false;
      }).length,
      mediaRowsInserted: writeStats.mediaRowsInserted,
      importRowsUpserted: writeStats.importRowsUpserted,
      listingsArchived: archiveStats.archived,
      archiveSkippedReason: archiveStats.skippedReason
    });

    await recordSyncRun(supabase, {
      provider,
      status: "completed",
      month_key: monthKey,
      started_at: startedAtIso,
      finished_at: result.finishedAt,
      calls_used: result.callsUsed,
      rows_fetched: result.rowsFetched,
      listings_upserted: result.listingsUpserted,
      listings_archived: result.listingsArchived,
      listings_reactivated: result.listingsReactivated,
      notes: toJson({
        zip: config.zip,
        radius: config.radius,
        rows: config.rows,
        archiveSkippedReason: result.archiveSkippedReason,
        warnings
      })
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "MarketCheck sync failed.";
    const result = finishResult({
      ...baseResult,
      ok: false,
      message,
      callsUsed: callsAttempted
    });

    await recordSyncRun(supabase, {
      provider,
      status: "failed",
      month_key: monthKey,
      started_at: startedAtIso,
      finished_at: result.finishedAt,
      calls_used: result.callsUsed,
      error: message,
      notes: toJson({
        zip: config.zip,
        radius: config.radius,
        rows: config.rows,
        warnings
      })
    });

    return result;
  }
}

function finishResult(
  result: Omit<MarketCheckSyncResult, "finishedAt">
): MarketCheckSyncResult {
  return {
    ...result,
    finishedAt: new Date().toISOString()
  };
}

function readMarketCheckSyncConfig(): MarketCheckSyncConfig {
  const radius = clamp(readIntEnv("MARKETCHECK_PRIMARY_RADIUS", 100), 1, 100);
  const rows = clamp(readIntEnv("MARKETCHECK_ROWS", 500), 1, 500);

  return {
    apiKey: process.env.MARKETCHECK_API_KEY,
    baseUrl: process.env.MARKETCHECK_BASE_URL ?? defaultBaseUrl,
    zip: process.env.MARKETCHECK_ZIP ?? "36360",
    radius,
    rows,
    carType: process.env.MARKETCHECK_CAR_TYPE ?? "used",
    make: cleanOptional(process.env.MARKETCHECK_MAKE),
    bodyType: cleanOptional(process.env.MARKETCHECK_BODY_TYPE),
    minPrice: readOptionalIntEnv("MARKETCHECK_MIN_PRICE"),
    maxPrice: readOptionalIntEnv("MARKETCHECK_MAX_PRICE"),
    maxMediaPerListing: clamp(readIntEnv("MARKETCHECK_MAX_MEDIA_PER_LISTING", 24), 1, 60),
    staleGraceHours: clamp(readIntEnv("MARKETCHECK_STALE_GRACE_HOURS", 72), 1, 720),
    archiveMinSeenListings: clamp(readIntEnv("MARKETCHECK_ARCHIVE_MIN_SEEN_LISTINGS", 10), 0, 500),
    monthlyCallLimit: readIntEnv("MARKETCHECK_MONTHLY_CALL_LIMIT", 500),
    monthlySafetyBuffer: readIntEnv("MARKETCHECK_MONTHLY_SAFETY_BUFFER", 50)
  };
}

async function fetchMarketCheckPayload(config: MarketCheckSyncConfig) {
  const url = buildMarketCheckUrl(config);
  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`MarketCheck request failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function buildMarketCheckUrl(config: MarketCheckSyncConfig) {
  const url = new URL(config.baseUrl);
  url.searchParams.set("api_key", config.apiKey ?? "");
  url.searchParams.set("zip", config.zip);
  url.searchParams.set("radius", String(config.radius));
  url.searchParams.set("rows", String(config.rows));
  url.searchParams.set("start", "0");
  url.searchParams.set("car_type", config.carType);

  if (config.make) url.searchParams.set("make", config.make);
  if (config.bodyType) url.searchParams.set("body_type", config.bodyType);
  if (config.minPrice || config.maxPrice) {
    url.searchParams.set("price_range", `${config.minPrice ?? 0}-${config.maxPrice ?? 999999}`);
  }

  return url;
}

function normalizeMarketCheckRows(
  rows: MarketCheckRow[],
  config: MarketCheckSyncConfig,
  nowIso: string
) {
  const byListingId = new Map<string, NormalizedMarketCheckListing>();

  for (const row of rows) {
    const listing = normalizeMarketCheckListing(row, config, nowIso);
    if (!isUsableMarketCheckListing(listing)) {
      continue;
    }

    const sourceListingId = listing.providerListingId ?? listing.id;
    const listingId = toDeterministicUuid(`${provider}:${sourceListingId}`);
    const normalized = {
      listing: {
        ...listing,
        id: listingId,
        providerListingId: sourceListingId
      },
      rawRow: row,
      sourceListingId
    };
    const existing = byListingId.get(listingId);
    if (!existing || scoreMarketCheckListing(normalized.listing) > scoreMarketCheckListing(existing.listing)) {
      byListingId.set(listingId, normalized);
    }
  }

  return [...byListingId.values()];
}

function normalizeMarketCheckListing(
  row: MarketCheckRow,
  config: MarketCheckSyncConfig,
  nowIso: string
) {
  const build = getObject(row, "build");
  const dealer = getObject(row, "dealer");
  const media = getObject(row, "media");
  const sellerName = getString(dealer, "name") ?? getString(row, "dealer_name") ?? "MarketCheck";
  const sellerPhone =
    getString(dealer, "phone") ??
    getString(dealer, "phone_number") ??
    getString(row, "dealer_phone") ??
    getString(row, "seller_phone");
  const sellerEmail =
    getString(dealer, "email") ?? getString(row, "dealer_email") ?? getString(row, "seller_email");
  const city = getString(dealer, "city") ?? getString(row, "city");
  const state = getString(dealer, "state") ?? getString(row, "state");
  const location = [city, state].filter(Boolean).join(", ") || getString(row, "location") || "Local market";
  const price = getNumber(row, "price") ?? getNumber(row, "list_price") ?? 0;
  const mileage = getNumber(row, "miles") ?? getNumber(row, "mileage") ?? 0;
  const year = getNumber(build, "year") ?? getNumber(row, "year") ?? 0;
  const make = getString(build, "make") ?? getString(row, "make") ?? "";
  const model = getString(build, "model") ?? getString(row, "model") ?? "";
  const trim = getString(build, "trim") ?? getString(row, "trim") ?? "";
  const providerListingId = getString(row, "id") ?? getString(row, "listing_id");
  const url = getString(row, "vdp_url") ?? getString(row, "source_url") ?? getString(row, "url");
  const rawImageUrls = extractImageUrls(row, media);
  const imageUrls = rawImageUrls.slice(0, config.maxMediaPerListing);
  const rawProviderSummary = summarizeRawProviderRow(row, {
    imageCount: rawImageUrls.length,
    syncedAt: nowIso,
    syncZip: config.zip,
    syncRadius: config.radius
  });

  const input: RawListingInput = {
    id: providerListingId ? `marketcheck-${providerListingId}` : undefined,
    providerListingId,
    sourceName: "MarketCheck",
    sourceUrl: url,
    externalListingUrl: url,
    importedAt: nowIso,
    lastSeenAt: nowIso,
    year,
    make,
    model,
    trim,
    price,
    mileage,
    location,
    distance: getMarketCheckDistance(row, dealer) ?? config.radius,
    sellerType: "Dealer",
    sellerName,
    sellerPhone,
    sellerEmail,
    contactUrl: url,
    vin: getString(row, "vin"),
    imageUrls,
    listingTitle: [year, make, model, trim].filter(Boolean).join(" "),
    listingDescription: getString(row, "heading") ?? getString(row, "title"),
    aiHook: buildAiHook(make, model, price, mileage, imageUrls.length),
    whyItMadeTheFeed:
      "Authorized inventory snapshot with enough core fields to compare price, mileage, location, photos, and seller details.",
    redFlags: buildRedFlags(year, mileage),
    sellerQuestions: [
      "Confirm out-the-door price",
      "Verify title and accident history",
      "Ask whether any required add-ons affect the listed price"
    ],
    suggestedOffer: price > 0 ? Math.max(0, Math.round(price * 0.96)) : 0,
    walkawayPrice: price > 0 ? Math.round(price * 1.02) : 0,
    checklistItems: [
      "Confirm out-the-door price",
      "Check tire and brake life",
      "Scan for codes",
      "Verify VIN and title status"
    ],
    tags: buildMarketCheckTags(make, model, price, mileage, year),
    sourceMode: "marketcheck",
    rawProviderSummary
  };

  return normalizeListing(input, "marketcheck");
}

async function fetchExistingListingRows(supabase: SupabaseAdmin, listingIds: string[]) {
  const rows = new Map<string, Pick<ListingRow, "id" | "status" | "imported_at">>();
  for (const chunk of chunkArray([...new Set(listingIds)], 500)) {
    const { data, error } = await supabase
      .from("listings")
      .select("id,status,imported_at")
      .in("id", chunk);

    if (error) {
      throw new Error(`Could not read existing MarketCheck listings: ${error.message}`);
    }

    for (const row of data ?? []) {
      rows.set(row.id, row);
    }
  }

  return rows;
}

async function writeMarketCheckListings(
  supabase: SupabaseAdmin,
  listings: NormalizedMarketCheckListing[]
) {
  if (listings.length === 0) {
    return {
      listingsUpserted: 0,
      mediaRowsInserted: 0,
      importRowsUpserted: 0
    };
  }

  const listingRows = listings.map((item) =>
    carListingToSnapshotDatabaseInsert(item.listing, item.listing.id)
  );

  for (const chunk of chunkArray(listingRows, 100)) {
    const { error } = await supabase.from("listings").upsert(chunk, { onConflict: "id" });
    if (error) {
      throw new Error(`Could not upsert MarketCheck listings: ${error.message}`);
    }
  }

  const listingIds = listings.map((item) => item.listing.id);
  for (const chunk of chunkArray(listingIds, 100)) {
    const { error } = await supabase.from("listing_media").delete().in("listing_id", chunk);
    if (error) {
      throw new Error(`Could not refresh MarketCheck media rows: ${error.message}`);
    }
  }

  const mediaRows = listings.flatMap((item) =>
    item.listing.mediaItems
      .filter((media) => media.url && !media.url.startsWith("/cars/"))
      .slice(0, 60)
      .map((media, index) =>
        mediaItemToSnapshotDatabaseInsert({
          listingId: item.listing.id,
          media,
          sortOrder: index
        })
      )
  );

  for (const chunk of chunkArray(mediaRows, 500)) {
    const { error } = await supabase.from("listing_media").insert(chunk);
    if (error) {
      throw new Error(`Could not insert MarketCheck media rows: ${error.message}`);
    }
  }

  const importRows = listings.map((item) => ({
    source_mode: "marketcheck" as const,
    source_listing_id: item.sourceListingId,
    listing_id: item.listing.id,
    payload: toJson(item.listing.rawProviderSummary ?? summarizeRawProviderRow(item.rawRow))
  }));

  for (const chunk of chunkArray(importRows, 200)) {
    const { error } = await supabase
      .from("listing_imports")
      .upsert(chunk, { onConflict: "source_mode,source_listing_id" });

    if (error) {
      throw new Error(`Could not record MarketCheck import rows: ${error.message}`);
    }
  }

  return {
    listingsUpserted: listingRows.length,
    mediaRowsInserted: mediaRows.length,
    importRowsUpserted: importRows.length
  };
}

async function archiveStaleMarketCheckListings({
  supabase,
  seenListingIds,
  fetchedListingCount,
  config,
  now
}: {
  supabase: SupabaseAdmin;
  seenListingIds: Set<string>;
  fetchedListingCount: number;
  config: MarketCheckSyncConfig;
  now: Date;
}) {
  const hasNarrowFilter = Boolean(config.make || config.bodyType || config.minPrice || config.maxPrice);
  if (hasNarrowFilter) {
    return {
      archived: 0,
      skippedReason: "Archiving skipped because this sync uses a narrowed MarketCheck filter."
    };
  }

  if (fetchedListingCount < config.archiveMinSeenListings) {
    return {
      archived: 0,
      skippedReason: `Archiving skipped because only ${fetchedListingCount} usable listing(s) were seen.`
    };
  }

  const cutoffIso = new Date(now.getTime() - config.staleGraceHours * 60 * 60 * 1000).toISOString();
  const staleRows = await fetchStaleMarketCheckRows(supabase, cutoffIso);
  const archiveIds = staleRows
    .filter((row) => !seenListingIds.has(row.id))
    .map((row) => row.id);

  let archived = 0;
  for (const chunk of chunkArray(archiveIds, 100)) {
    const { data, error } = await supabase
      .from("listings")
      .update({ status: "archived" })
      .in("id", chunk)
      .select("id");

    if (error) {
      throw new Error(`Could not archive stale MarketCheck listings: ${error.message}`);
    }

    archived += data?.length ?? 0;
  }

  return { archived };
}

async function fetchStaleMarketCheckRows(supabase: SupabaseAdmin, cutoffIso: string) {
  const rows = new Map<string, Pick<ListingRow, "id" | "last_seen_at">>();
  const nullResult = await supabase
    .from("listings")
    .select("id,last_seen_at")
    .eq("source_mode", "marketcheck")
    .eq("status", "active")
    .is("last_seen_at", null)
    .limit(1000);

  if (nullResult.error) {
    throw new Error(`Could not read stale MarketCheck listings: ${nullResult.error.message}`);
  }

  for (const row of nullResult.data ?? []) rows.set(row.id, row);

  const oldResult = await supabase
    .from("listings")
    .select("id,last_seen_at")
    .eq("source_mode", "marketcheck")
    .eq("status", "active")
    .lt("last_seen_at", cutoffIso)
    .limit(1000);

  if (oldResult.error) {
    throw new Error(`Could not read stale MarketCheck listings: ${oldResult.error.message}`);
  }

  for (const row of oldResult.data ?? []) rows.set(row.id, row);
  return [...rows.values()];
}

async function getMonthlyCallsUsed(supabase: SupabaseAdmin, monthKey: string) {
  const warnings: string[] = [];
  const { data, error } = await supabase
    .from("provider_sync_runs")
    .select("calls_used")
    .eq("provider", provider)
    .eq("month_key", monthKey);

  if (error) {
    warnings.push(`Sync-run ledger unavailable: ${error.message}`);
    return { callsUsed: 0, warnings };
  }

  return {
    callsUsed: (data ?? []).reduce((sum, row) => sum + (row.calls_used ?? 0), 0),
    warnings
  };
}

async function recordSyncRun(supabase: SupabaseAdmin, row: ProviderSyncRunInsert) {
  const { error } = await supabase.from("provider_sync_runs").insert(row);
  if (error) {
    console.error(`Could not record MarketCheck sync run: ${error.message}`);
  }
}

function getMonthlyUsableCallLimit(config: MarketCheckSyncConfig) {
  return Math.max(0, config.monthlyCallLimit - config.monthlySafetyBuffer);
}

function isUsableMarketCheckListing(listing: CarListing) {
  return Boolean(
    listing.year >= 1900 &&
      listing.make &&
      listing.make !== "Unknown" &&
      listing.model &&
      listing.model !== "Vehicle" &&
      listing.price > 0 &&
      listing.location &&
      listing.mediaItems.some((media) => media.url && !media.url.startsWith("/cars/"))
  );
}

function scoreMarketCheckListing(listing: CarListing) {
  let score = 0;
  score += Math.min(40, listing.mediaItems.length * 2);
  if (listing.vin) score += 20;
  if (listing.mileage > 0) score += 10;
  if (listing.price > 0) score += 10;
  if (listing.sellerName) score += 8;
  if (listing.contactUrl) score += 8;
  return score;
}

function extractListings(payload: Record<string, unknown>) {
  const candidates = [
    payload.listings,
    payload.results,
    payload.data,
    getObject(payload, "response")?.listings
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }

  return [];
}

function extractImageUrls(row: MarketCheckRow, media: Record<string, unknown> | undefined) {
  const candidates = [
    media?.photo_links,
    media?.photos,
    row.photo_links,
    row.photos,
    row.image_urls,
    row.images,
    row.thumbnail
  ];

  const urls = candidates.flatMap((candidate) => {
    if (Array.isArray(candidate)) {
      return candidate.map(String);
    }

    if (typeof candidate === "string") {
      return candidate.split(/[|,;]/);
    }

    return [];
  });

  return [...new Set(urls.map((url) => url.trim()).filter((url) => /^https?:\/\//.test(url)))];
}

function getMarketCheckDistance(row: MarketCheckRow, dealer?: Record<string, unknown>) {
  return (
    getNumber(row, "distance") ??
    getNumber(row, "dist") ??
    getNumber(row, "distance_miles") ??
    getNumber(row, "miles_from_origin") ??
    getNumber(row, "radius_distance") ??
    getNumber(dealer, "distance")
  );
}

function buildAiHook(make: string, model: string, price: number, mileage: number, imageCount: number) {
  const title = [make, model].filter(Boolean).join(" ") || "This listing";
  if (price > 0 && mileage > 0 && imageCount > 0) {
    return `${title} with real photos and core data. Worth a scout pass before it disappears.`;
  }
  return `${title} has enough signal to watch, but the missing details matter.`;
}

function buildRedFlags(year: number, mileage: number) {
  const flags = ["Confirm out-the-door price", "Verify title and accident history"];
  const currentYear = new Date().getFullYear();
  if (mileage > 120000) flags.push("Higher mileage means service records matter");
  if (year > 0 && currentYear - year > 10) flags.push("Age-related rubber, suspension, and leak checks");
  return flags;
}

function buildMarketCheckTags(make: string, model: string, price: number, mileage: number, year: number) {
  const tags = ["marketcheck", "authorized-api"];
  const text = `${make} ${model}`.toLowerCase();
  if (/truck|f-150|silverado|ram|tacoma|frontier|sierra/.test(text)) tags.push("truck");
  if (/rav4|cr-v|cx-5|explorer|telluride|4runner|tahoe|pilot|highlander|suburban/.test(text)) tags.push("suv");
  if (/toyota|lexus|honda|acura|mazda/.test(text)) tags.push("reliable-watch");
  if (price > 0 && price < 20000) tags.push("budget");
  if (mileage > 0 && mileage < 80000) tags.push("lower-mileage");
  if (year > 0 && new Date().getFullYear() - year < 7) tags.push("newer-used");
  return tags;
}

function summarizeRawProviderRow(
  row: MarketCheckRow | undefined,
  sync?: {
    imageCount?: number;
    syncedAt?: string;
    syncZip?: string;
    syncRadius?: number;
  }
) {
  if (!row) return undefined;
  const build = getObject(row, "build");
  const dealer = getObject(row, "dealer");
  return {
    provider,
    id: getString(row, "id") ?? getString(row, "listing_id"),
    vin: getString(row, "vin"),
    price: getNumber(row, "price") ?? getNumber(row, "list_price"),
    miles: getNumber(row, "miles") ?? getNumber(row, "mileage"),
    year: getNumber(build, "year") ?? getNumber(row, "year"),
    make: getString(build, "make") ?? getString(row, "make"),
    model: getString(build, "model") ?? getString(row, "model"),
    trim: getString(build, "trim") ?? getString(row, "trim"),
    dealerName: getString(dealer, "name") ?? getString(row, "dealer_name"),
    dealerPhone:
      getString(dealer, "phone") ??
      getString(dealer, "phone_number") ??
      getString(row, "dealer_phone") ??
      getString(row, "seller_phone"),
    dealerEmail:
      getString(dealer, "email") ?? getString(row, "dealer_email") ?? getString(row, "seller_email"),
    dealerCity: getString(dealer, "city") ?? getString(row, "city"),
    dealerState: getString(dealer, "state") ?? getString(row, "state"),
    distance: getMarketCheckDistance(row, dealer),
    mediaImageCount: sync?.imageCount,
    sync: sync
      ? {
          syncedAt: sync.syncedAt,
          zip: sync.syncZip,
          radius: sync.syncRadius
        }
      : undefined
  };
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

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function readIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function readOptionalIntEnv(name: string) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanOptional(value: unknown) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function getObject(source: Record<string, unknown> | undefined, key: string) {
  const value = source?.[key];
  return isRecord(value) ? value : undefined;
}

function getString(source: Record<string, unknown> | undefined, key: string) {
  const value = source?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

function getNumber(source: Record<string, unknown> | undefined, key: string) {
  const value = source?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
