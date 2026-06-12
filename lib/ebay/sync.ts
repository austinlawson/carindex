import { createHash } from "node:crypto";
import {
  carListingToSnapshotDatabaseInsert,
  mediaItemToSnapshotDatabaseInsert
} from "@/lib/supabase/listing-mappers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { normalizeListing } from "@/src/lib/normalizeListing";
import type { CarListing, RawListingInput } from "@/src/lib/listingTypes";

const provider = "ebay";
const defaultTokenUrl = "https://api.ebay.com/identity/v1/oauth2/token";
const defaultSearchUrl = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const defaultItemUrl = "https://api.ebay.com/buy/browse/v1/item";
const defaultScope = "https://api.ebay.com/oauth/api_scope";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
type ProviderSyncRunInsert = Database["public"]["Tables"]["provider_sync_runs"]["Insert"];

type EbaySyncConfig = {
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl: string;
  searchUrl: string;
  itemUrl: string;
  scope: string;
  marketplaceId: string;
  categoryId: string;
  query?: string;
  sort: string;
  limit: number;
  offset: number;
  maxPagesPerSync: number;
  localPickupMaxPagesPerSync: number;
  itemDetailMaxPerSync: number;
  itemDetailConcurrency: number;
  staleVerificationMaxPerSync: number;
  buyingOptions: string[];
  itemLocationCountry?: string;
  localDistanceOnly: boolean;
  localPickupOnly: boolean;
  pickupZip: string;
  pickupRadius: number;
  maxMediaPerListing: number;
  staleGraceHours: number;
  archiveMinSeenListings: number;
  dailyCallLimit: number;
  dailySafetyBuffer: number;
};

type EbayRow = Record<string, unknown>;

type NormalizedEbayListing = {
  listing: CarListing;
  rawRow: EbayRow;
  sourceListingId: string;
};

type EbaySearchPassStats = {
  name: string;
  sort: string;
  localPickupOnly: boolean;
  maxPagesPerSync: number;
  callsUsed: number;
  rowsFetched: number;
};

type EbaySearchPlan = {
  name: string;
  config: EbaySyncConfig;
};

type EbayDetailResult = {
  rows: EbayRow[];
  callsUsed: number;
  detailsFetched: number;
  detailsFailed: number;
  detailsSkipped: number;
};

export type EbaySyncResult = {
  ok: boolean;
  dryRun: boolean;
  message: string;
  startedAt: string;
  finishedAt: string;
  callsUsed: number;
  dailyCallsUsedBeforeRun: number;
  dailyUsableCallLimit: number;
  rowsFetched: number;
  uniqueRowsFetched: number;
  itemDetailsFetched: number;
  itemDetailsFailed: number;
  itemDetailsSkipped: number;
  staleListingsVerified: number;
  listingsOutsideRadius: number;
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
  searchPasses: EbaySearchPassStats[];
  config: {
    marketplaceId: string;
    categoryId: string;
    query?: string;
    sort: string;
    limit: number;
    maxPagesPerSync: number;
    localPickupMaxPagesPerSync: number;
    itemDetailMaxPerSync: number;
    itemDetailConcurrency: number;
    staleVerificationMaxPerSync: number;
    itemLocationCountry?: string;
    localDistanceOnly: boolean;
    localPickupOnly: boolean;
    pickupZip: string;
    pickupRadius: number;
    maxMediaPerListing: number;
    staleGraceHours: number;
  };
};

export async function syncEbayInventory(options: { dryRun?: boolean } = {}) {
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();
  const config = readEbaySyncConfig();
  const warnings: string[] = [];
  const supabase = createSupabaseAdminClient();

  const baseResult = {
    dryRun: Boolean(options.dryRun),
    startedAt: startedAtIso,
    callsUsed: 0,
    dailyCallsUsedBeforeRun: 0,
    dailyUsableCallLimit: getDailyUsableCallLimit(config),
    rowsFetched: 0,
    uniqueRowsFetched: 0,
    itemDetailsFetched: 0,
    itemDetailsFailed: 0,
    itemDetailsSkipped: 0,
    staleListingsVerified: 0,
    listingsOutsideRadius: 0,
    listingsNormalized: 0,
    listingsSkipped: 0,
    listingsUpserted: 0,
    listingsCreated: 0,
    listingsReactivated: 0,
    mediaRowsInserted: 0,
    importRowsUpserted: 0,
    listingsArchived: 0,
    warnings,
    searchPasses: [],
    config: {
      marketplaceId: config.marketplaceId,
      categoryId: config.categoryId,
      query: config.query,
      sort: config.sort,
      limit: config.limit,
      maxPagesPerSync: config.maxPagesPerSync,
      localPickupMaxPagesPerSync: config.localPickupMaxPagesPerSync,
      itemDetailMaxPerSync: config.itemDetailMaxPerSync,
      itemDetailConcurrency: config.itemDetailConcurrency,
      staleVerificationMaxPerSync: config.staleVerificationMaxPerSync,
      itemLocationCountry: config.itemLocationCountry,
      localDistanceOnly: config.localDistanceOnly,
      localPickupOnly: config.localPickupOnly,
      pickupZip: config.pickupZip,
      pickupRadius: config.pickupRadius,
      maxMediaPerListing: config.maxMediaPerListing,
      staleGraceHours: config.staleGraceHours
    }
  };

  if (options.dryRun) {
    return finishResult({
      ...baseResult,
      ok: true,
      message: "Dry run only. No eBay call or database mutation was made."
    });
  }

  if (!hasEbayCredentials(config)) {
    return finishResult({
      ...baseResult,
      ok: true,
      message:
        "eBay sync skipped because EBAY_CLIENT_ID/EBAY_CLIENT_SECRET or EBAY_ACCESS_TOKEN is not configured."
    });
  }

  if (!supabase) {
    return finishResult({
      ...baseResult,
      ok: false,
      message: "Supabase service credentials are not configured."
    });
  }

  const dayKey = startedAtIso.slice(0, 10);
  const dailyUsage = await getDailyCallsUsed(supabase, dayKey);
  baseResult.dailyCallsUsedBeforeRun = dailyUsage.callsUsed;
  warnings.push(...dailyUsage.warnings);

  if (dailyUsage.callsUsed >= getDailyUsableCallLimit(config)) {
    return finishResult({
      ...baseResult,
      ok: false,
      message: "eBay daily safety limit reached. No request was made."
    });
  }

  let callsAttempted = 0;

  try {
    const token = config.accessToken ?? (await fetchEbayAccessToken(config));
    if (!config.accessToken) callsAttempted += 1;

    const searchResult = await fetchEbaySearchPayloads(config, token);
    callsAttempted += searchResult.callsUsed;

    const localRowsResult = filterEbayRowsForConfiguredLocalRadius(searchResult.rows, config);
    const detailBudget = Math.max(
      0,
      getDailyUsableCallLimit(config) - dailyUsage.callsUsed - callsAttempted
    );
    const detailResult = await fetchEbayItemDetailsForRows({
      rows: localRowsResult.rows,
      config,
      accessToken: token,
      maxCalls: detailBudget
    });
    callsAttempted += detailResult.callsUsed;

    const rawRows = detailResult.rows;
    const nowIso = new Date().toISOString();
    const normalizedResult = normalizeEbayRows(rawRows, config, nowIso);
    const normalized = normalizedResult.listings;
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
    const writeStats = await writeEbayListings(supabase, prepared);
    const archiveStats = await archiveStaleEbayListings({
      supabase,
      seenListingIds: new Set(prepared.map((item) => item.listing.id)),
      fetchedListingCount: prepared.length,
      config,
      now: new Date(),
      accessToken: token,
      maxVerificationCalls: Math.max(
        0,
        getDailyUsableCallLimit(config) - dailyUsage.callsUsed - callsAttempted
      )
    });
    callsAttempted += archiveStats.callsUsed;

    const result = finishResult({
      ...baseResult,
      ok: true,
      message: "eBay sync completed.",
      callsUsed: callsAttempted,
      rowsFetched: searchResult.rowsFetched,
      uniqueRowsFetched: searchResult.rows.length,
      itemDetailsFetched: detailResult.detailsFetched,
      itemDetailsFailed: detailResult.detailsFailed,
      itemDetailsSkipped: detailResult.detailsSkipped,
      listingsOutsideRadius: localRowsResult.outsideRadius + normalizedResult.outsideRadius,
      listingsNormalized: prepared.length,
      listingsSkipped: Math.max(0, searchResult.rows.length - prepared.length),
      listingsUpserted: writeStats.listingsUpserted,
      listingsCreated: prepared.filter((item) => !existingRows.has(item.listing.id)).length,
      listingsReactivated: prepared.filter((item) => {
        const existing = existingRows.get(item.listing.id);
        return existing ? existing.status !== "active" : false;
      }).length,
      mediaRowsInserted: writeStats.mediaRowsInserted,
      importRowsUpserted: writeStats.importRowsUpserted,
      staleListingsVerified: archiveStats.verified,
      listingsArchived: archiveStats.archived,
      archiveSkippedReason: archiveStats.skippedReason,
      searchPasses: searchResult.searchPasses
    });

    await recordSyncRun(supabase, {
      provider,
      status: "completed",
      month_key: dayKey,
      started_at: startedAtIso,
      finished_at: result.finishedAt,
      calls_used: result.callsUsed,
      rows_fetched: result.rowsFetched,
      listings_upserted: result.listingsUpserted,
      listings_archived: result.listingsArchived,
      listings_reactivated: result.listingsReactivated,
      notes: toJson({
        marketplaceId: config.marketplaceId,
        categoryId: config.categoryId,
        query: config.query,
        sort: config.sort,
        limit: config.limit,
        maxPagesPerSync: config.maxPagesPerSync,
        localPickupMaxPagesPerSync: config.localPickupMaxPagesPerSync,
        itemDetailMaxPerSync: config.itemDetailMaxPerSync,
        itemDetailConcurrency: config.itemDetailConcurrency,
        staleVerificationMaxPerSync: config.staleVerificationMaxPerSync,
        itemLocationCountry: config.itemLocationCountry,
        localDistanceOnly: config.localDistanceOnly,
        searchPasses: result.searchPasses,
        itemDetailsFetched: result.itemDetailsFetched,
        itemDetailsFailed: result.itemDetailsFailed,
        itemDetailsSkipped: result.itemDetailsSkipped,
        staleListingsVerified: result.staleListingsVerified,
        archiveSkippedReason: result.archiveSkippedReason,
        warnings
      })
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "eBay sync failed.";
    const result = finishResult({
      ...baseResult,
      ok: false,
      message,
      callsUsed: callsAttempted
    });

    await recordSyncRun(supabase, {
      provider,
      status: "failed",
      month_key: dayKey,
      started_at: startedAtIso,
      finished_at: result.finishedAt,
      calls_used: result.callsUsed,
      error: message,
      notes: toJson({
        marketplaceId: config.marketplaceId,
        categoryId: config.categoryId,
        query: config.query,
        sort: config.sort,
        limit: config.limit,
        maxPagesPerSync: config.maxPagesPerSync,
        localPickupMaxPagesPerSync: config.localPickupMaxPagesPerSync,
        itemDetailMaxPerSync: config.itemDetailMaxPerSync,
        itemDetailConcurrency: config.itemDetailConcurrency,
        staleVerificationMaxPerSync: config.staleVerificationMaxPerSync,
        itemLocationCountry: config.itemLocationCountry,
        localDistanceOnly: config.localDistanceOnly,
        warnings
      })
    });

    return result;
  }
}

function finishResult(result: Omit<EbaySyncResult, "finishedAt">): EbaySyncResult {
  return {
    ...result,
    finishedAt: new Date().toISOString()
  };
}

function readEbaySyncConfig(): EbaySyncConfig {
  const limit = clamp(readPositiveIntEnv("EBAY_ROWS", 200), 1, 200);
  const marketCheckRadius = clamp(readPositiveIntEnv("MARKETCHECK_PRIMARY_RADIUS", 100), 1, 100);
  const pickupRadius = clamp(readPositiveIntEnv("EBAY_PICKUP_RADIUS", marketCheckRadius), 1, 500);

  return {
    accessToken: cleanOptional(process.env.EBAY_ACCESS_TOKEN),
    clientId: cleanOptional(process.env.EBAY_CLIENT_ID),
    clientSecret: cleanOptional(process.env.EBAY_CLIENT_SECRET),
    tokenUrl: process.env.EBAY_TOKEN_URL ?? defaultTokenUrl,
    searchUrl: process.env.EBAY_BROWSE_SEARCH_URL ?? defaultSearchUrl,
    scope: process.env.EBAY_OAUTH_SCOPE ?? defaultScope,
    itemUrl: process.env.EBAY_ITEM_URL ?? defaultItemUrl,
    marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US",
    categoryId: process.env.EBAY_CATEGORY_ID ?? "6001",
    query: cleanOptional(process.env.EBAY_QUERY),
    sort: process.env.EBAY_SORT ?? "newlyListed",
    limit,
    offset: normalizeEbayOffset(readIntEnv("EBAY_OFFSET", 0), limit),
    maxPagesPerSync: clamp(readPositiveIntEnv("EBAY_MAX_PAGES_PER_SYNC", 10), 1, 10),
    localPickupMaxPagesPerSync: clamp(
      readPositiveIntEnv("EBAY_LOCAL_PICKUP_MAX_PAGES_PER_SYNC", 2),
      1,
      10
    ),
    buyingOptions: normalizeBuyingOptions(
      readListEnv("EBAY_BUYING_OPTIONS", [
        "FIXED_PRICE",
        "AUCTION",
        "BEST_OFFER",
        "CLASSIFIED_AD"
      ])
    ),
    itemLocationCountry: cleanOptional(process.env.EBAY_ITEM_LOCATION_COUNTRY ?? "US"),
    localDistanceOnly: parseBoolean(process.env.EBAY_LOCAL_DISTANCE_ONLY, true),
    localPickupOnly: parseBoolean(process.env.EBAY_LOCAL_PICKUP_ONLY, false),
    pickupZip: process.env.EBAY_PICKUP_ZIP ?? process.env.MARKETCHECK_ZIP ?? "36360",
    pickupRadius,
    maxMediaPerListing: clamp(readIntEnv("EBAY_MAX_MEDIA_PER_LISTING", 12), 1, 60),
    staleGraceHours: clamp(readIntEnv("EBAY_STALE_GRACE_HOURS", 72), 1, 720),
    archiveMinSeenListings: clamp(readIntEnv("EBAY_ARCHIVE_MIN_SEEN_LISTINGS", 5), 0, 200),
    itemDetailMaxPerSync: clamp(readPositiveIntEnv("EBAY_ITEM_DETAIL_MAX_PER_SYNC", 300), 0, 1000),
    itemDetailConcurrency: clamp(readPositiveIntEnv("EBAY_ITEM_DETAIL_CONCURRENCY", 6), 1, 10),
    staleVerificationMaxPerSync: clamp(
      readPositiveIntEnv("EBAY_STALE_VERIFY_MAX_PER_SYNC", 50),
      0,
      1000
    ),
    dailyCallLimit: readPositiveIntEnv(
      "EBAY_DAILY_CALL_LIMIT",
      readPositiveIntEnv("EBAY_MONTHLY_CALL_LIMIT", 5000)
    ),
    dailySafetyBuffer: readPositiveIntEnv(
      "EBAY_DAILY_SAFETY_BUFFER",
      readPositiveIntEnv("EBAY_MONTHLY_SAFETY_BUFFER", 500)
    )
  };
}

function hasEbayCredentials(config: EbaySyncConfig) {
  return Boolean(config.accessToken || (config.clientId && config.clientSecret));
}

async function fetchEbayAccessToken(config: EbaySyncConfig) {
  if (!config.clientId || !config.clientSecret) {
    throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are required to mint an eBay access token.");
  }

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: config.scope
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`
    },
    body
  });

  if (!response.ok) {
    throw new Error(`eBay token request failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const token = getString(payload, "access_token");
  if (!token) {
    throw new Error("eBay token response did not include an access_token.");
  }

  return token;
}

async function fetchEbaySearchPayloads(config: EbaySyncConfig, accessToken: string) {
  const rowsById = new Map<string, EbayRow>();
  const searchPasses: EbaySearchPassStats[] = [];
  let rowsFetched = 0;
  let callsUsed = 0;

  for (const plan of buildEbaySearchPlans(config)) {
    const passResult = await fetchEbaySearchPass(plan.config, accessToken);
    rowsFetched += passResult.rows.length;
    callsUsed += passResult.callsUsed;
    searchPasses.push({
      name: plan.name,
      sort: plan.config.sort,
      localPickupOnly: plan.config.localPickupOnly,
      maxPagesPerSync: plan.config.maxPagesPerSync,
      callsUsed: passResult.callsUsed,
      rowsFetched: passResult.rows.length
    });

    for (const row of passResult.rows) {
      const rowId = getEbayRowId(row) ?? `row:${rowsById.size}`;
      if (!rowsById.has(rowId)) {
        rowsById.set(rowId, row);
      }
    }
  }

  return { rows: [...rowsById.values()], rowsFetched, callsUsed, searchPasses };
}

async function fetchEbaySearchPass(config: EbaySyncConfig, accessToken: string) {
  const rows: EbayRow[] = [];
  let callsUsed = 0;

  for (let page = 0; page < config.maxPagesPerSync; page += 1) {
    const offset = config.offset + page * config.limit;
    if (offset > 9999) break;

    const payload = await fetchEbaySearchPayload(config, accessToken, offset);
    callsUsed += 1;

    const pageRows = extractItemSummaries(payload);
    rows.push(...pageRows);

    if (pageRows.length < config.limit) break;
  }

  return { rows, callsUsed };
}

function buildEbaySearchPlans(config: EbaySyncConfig): EbaySearchPlan[] {
  if (!config.localDistanceOnly || config.localPickupOnly) {
    return [{ name: "configured", config }];
  }

  return [
    {
      name: "local-pickup-distance",
      config: {
        ...config,
        sort: "distance",
        offset: 0,
        maxPagesPerSync: config.localPickupMaxPagesPerSync,
        itemLocationCountry: undefined,
        localPickupOnly: true
      }
    },
    {
      name: "fresh-local-distance",
      config
    }
  ];
}

async function fetchEbaySearchPayload(config: EbaySyncConfig, accessToken: string, offset: number) {
  const url = buildEbaySearchUrl(config, offset);
  const response = await fetch(url, {
    headers: buildEbayHeaders(config, accessToken)
  });

  if (!response.ok) {
    throw new Error(`eBay search request failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function buildEbaySearchUrl(config: EbaySyncConfig, offset = config.offset) {
  const url = new URL(config.searchUrl);
  if (config.query) url.searchParams.set("q", config.query);
  url.searchParams.set("category_ids", config.categoryId);
  url.searchParams.set("fieldgroups", "EXTENDED");
  url.searchParams.set("sort", config.sort);
  url.searchParams.set("limit", String(config.limit));
  url.searchParams.set("offset", String(offset));

  const filters: string[] = [];
  if (config.buyingOptions.length > 0) {
    filters.push(`buyingOptions:{${config.buyingOptions.join("|")}}`);
  }
  if (config.localPickupOnly) {
    filters.push("deliveryOptions:{SELLER_ARRANGED_LOCAL_PICKUP}");
    filters.push("pickupCountry:US");
    filters.push(`pickupPostalCode:${config.pickupZip}`);
    filters.push(`pickupRadius:${config.pickupRadius}`);
    filters.push("pickupRadiusUnit:mi");
  } else if (config.itemLocationCountry) {
    filters.push(`itemLocationCountry:${config.itemLocationCountry}`);
  }
  if (filters.length > 0) {
    url.searchParams.set("filter", filters.join(","));
  }

  return url;
}

function filterEbayRowsForConfiguredLocalRadius(rows: EbayRow[], config: EbaySyncConfig) {
  const localRows: EbayRow[] = [];
  let outsideRadius = 0;

  for (const row of rows) {
    if (isWithinConfiguredLocalRadius(row, config)) {
      localRows.push(row);
    } else {
      outsideRadius += 1;
    }
  }

  return { rows: localRows, outsideRadius };
}

async function fetchEbayItemDetailsForRows({
  rows,
  config,
  accessToken,
  maxCalls
}: {
  rows: EbayRow[];
  config: EbaySyncConfig;
  accessToken: string;
  maxCalls: number;
}): Promise<EbayDetailResult> {
  const detailLimit = Math.max(0, Math.min(rows.length, config.itemDetailMaxPerSync, maxCalls));
  const rowsForDetail = rows.slice(0, detailLimit);
  const skippedRows = rows.slice(detailLimit);
  const detailResults = await mapWithConcurrency(rowsForDetail, config.itemDetailConcurrency, async (row) => {
    const detail = await fetchEbayItemDetail(row, config, accessToken);
    if (detail) {
      return {
        row: mergeEbaySummaryAndDetail(row, detail),
        fetched: true
      };
    }

    return {
      row,
      fetched: false
    };
  });

  return {
    rows: [...detailResults.map((result) => result.row), ...skippedRows],
    callsUsed: detailLimit,
    detailsFetched: detailResults.filter((result) => result.fetched).length,
    detailsFailed: detailResults.filter((result) => !result.fetched).length,
    detailsSkipped: Math.max(0, rows.length - detailLimit)
  };
}

async function fetchEbayItemDetail(row: EbayRow, config: EbaySyncConfig, accessToken: string) {
  const detailUrl = getString(row, "itemHref") ?? buildEbayItemUrl(config, getEbayRowId(row));
  if (!detailUrl) return undefined;

  const response = await fetch(detailUrl, {
    headers: buildEbayHeaders(config, accessToken)
  });

  if (response.status === 404) return undefined;

  if (!response.ok) {
    throw new Error(`eBay item detail request failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as EbayRow;
}

async function fetchEbayItemDetailForListingRow(
  row: Pick<ListingRow, "provider_listing_id" | "external_listing_url">,
  config: EbaySyncConfig,
  accessToken: string
) {
  const detailUrl = buildEbayItemUrl(config, row.provider_listing_id ?? undefined);
  if (!detailUrl) return undefined;

  const response = await fetch(detailUrl, {
    headers: buildEbayHeaders(config, accessToken)
  });

  if (response.status === 404 || response.status === 410) return undefined;

  if (!response.ok) {
    throw new Error(`eBay stale item verification failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as EbayRow;
}

function isEndedEbayItem(row: EbayRow, now: Date) {
  const endDate = getString(row, "itemEndDate");
  if (!endDate) return false;

  const parsed = Date.parse(endDate);
  return Number.isFinite(parsed) && parsed <= now.getTime();
}

function mergeEbaySummaryAndDetail(summary: EbayRow, detail: EbayRow) {
  return {
    ...summary,
    ...detail,
    itemId: getString(summary, "itemId") ?? getString(detail, "itemId"),
    legacyItemId: getString(summary, "legacyItemId") ?? getString(detail, "legacyItemId"),
    itemHref: getString(summary, "itemHref") ?? getString(detail, "itemHref"),
    itemLocation: getObject(summary, "itemLocation") ?? getObject(detail, "itemLocation"),
    distanceFromPickupLocation:
      getObject(summary, "distanceFromPickupLocation") ??
      getObject(detail, "distanceFromPickupLocation"),
    buyingOptions:
      readStringArray(summary.buyingOptions).length > 0 ? summary.buyingOptions : detail.buyingOptions,
    image: getObject(summary, "image") ?? getObject(detail, "image"),
    additionalImages:
      Array.isArray(summary.additionalImages) && summary.additionalImages.length > 0
        ? summary.additionalImages
        : detail.additionalImages,
    thumbnailImages:
      Array.isArray(summary.thumbnailImages) && summary.thumbnailImages.length > 0
        ? summary.thumbnailImages
        : detail.thumbnailImages
  };
}

function buildEbayItemUrl(config: EbaySyncConfig, itemId: string | undefined) {
  if (!itemId) return undefined;
  return `${config.itemUrl.replace(/\/$/, "")}/${encodeURIComponent(itemId)}`;
}

function buildEbayHeaders(config: EbaySyncConfig, accessToken: string) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "X-EBAY-C-MARKETPLACE-ID": config.marketplaceId,
    "X-EBAY-C-ENDUSERCTX": `contextualLocation=country%3DUS%2Czip%3D${encodeURIComponent(config.pickupZip)}`
  };
}

function normalizeEbayRows(rows: EbayRow[], config: EbaySyncConfig, nowIso: string) {
  const byListingId = new Map<string, NormalizedEbayListing>();
  let outsideRadius = 0;

  for (const row of rows) {
    if (!isWithinConfiguredLocalRadius(row, config)) {
      outsideRadius += 1;
      continue;
    }

    const listing = normalizeEbayListing(row, config, nowIso);
    if (!isUsableEbayListing(listing)) {
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
    if (!existing || scoreEbayListing(normalized.listing) > scoreEbayListing(existing.listing)) {
      byListingId.set(listingId, normalized);
    }
  }

  return {
    listings: [...byListingId.values()],
    outsideRadius
  };
}

function normalizeEbayListing(row: EbayRow, config: EbaySyncConfig, nowIso: string) {
  const title = getString(row, "title") ?? "";
  const shortDescription = getString(row, "shortDescription") ?? "";
  const parsed = parseVehicleTitle(title, shortDescription);
  const itemLocation = getObject(row, "itemLocation");
  const seller = getObject(row, "seller");
  const providerListingId = getString(row, "itemId") ?? getString(row, "legacyItemId");
  const url = getString(row, "itemAffiliateWebUrl") ?? getString(row, "itemWebUrl");
  const price = getMoneyValue(getObject(row, "price")) ?? getMoneyValue(getObject(row, "currentBidPrice")) ?? 0;
  const year = getAspectNumber(row, "Year") ?? parsed.year;
  const make = getAspectValue(row, "Make") ?? parsed.make;
  const model = getAspectValue(row, "Model") ?? parsed.model;
  const trim = getAspectValue(row, "Trim") ?? getAspectValue(row, "Submodel") ?? parsed.trim;
  const mileage =
    getAspectNumber(row, "Mileage") ??
    getAspectNumber(row, "Odometer") ??
    getAspectNumber(row, "Miles") ??
    parseMileage(`${title} ${shortDescription}`) ??
    0;
  const vin = getAspectValue(row, "VIN (Vehicle Identification Number)") ?? getAspectValue(row, "VIN");
  const city = getString(itemLocation, "city");
  const state = getString(itemLocation, "stateOrProvince");
  const location =
    [city, state].filter(Boolean).join(", ") ||
    getString(itemLocation, "postalCode") ||
    "eBay Motors";
  const imageUrls = extractImageUrls(row).slice(0, config.maxMediaPerListing);
  const buyingOptions = readStringArray(row.buyingOptions);
  const condition = getString(row, "condition");
  const rawProviderSummary = summarizeRawProviderRow(row, {
    imageCount: imageUrls.length,
    syncedAt: nowIso,
    categoryId: config.categoryId,
    sort: config.sort,
    query: config.query
  });

  const input: RawListingInput = {
    id: providerListingId ? `ebay-${providerListingId}` : undefined,
    providerListingId,
    sourceName: "eBay Motors",
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
    distance: getDistance(row),
    sellerType: inferSellerType(seller),
    sellerName: getString(seller, "username") ?? "eBay seller",
    contactUrl: url,
    vin,
    listingTitle: title,
    listingDescription: shortDescription || title,
    imageUrls,
    aiHook: buildAiHook(make, model, price, mileage, buyingOptions, condition),
    whyItMadeTheFeed:
      "Authorized eBay Motors listing with price, seller, source URL, and media that can add auction and private-party variety to the feed.",
    redFlags: buildRedFlags(year, mileage, buyingOptions, condition),
    sellerQuestions: [
      "Confirm the vehicle is still available and the listing terms have not changed.",
      "Verify title, VIN, mileage, and pickup or shipping logistics before bidding or buying.",
      "Ask for a current walkaround or proof shot if the eBay media is thin."
    ],
    suggestedOffer: price > 0 ? Math.max(0, Math.round(price * 0.94)) : 0,
    walkawayPrice: price > 0 ? Math.round(price * 1.02) : 0,
    checklistItems: [
      "Read the full eBay description",
      "Check seller feedback",
      "Confirm title and pickup terms",
      "Verify VIN and mileage before payment"
    ],
    tags: buildEbayTags(make, model, price, mileage, year, buyingOptions, condition),
    sourceMode: "ebay",
    rawProviderSummary
  };

  return normalizeListing(input, "ebay");
}

async function fetchExistingListingRows(supabase: SupabaseAdmin, listingIds: string[]) {
  const rows = new Map<string, Pick<ListingRow, "id" | "status" | "imported_at">>();
  for (const chunk of chunkArray([...new Set(listingIds)], 500)) {
    const { data, error } = await supabase
      .from("listings")
      .select("id,status,imported_at")
      .in("id", chunk);

    if (error) {
      throw new Error(`Could not read existing eBay listings: ${error.message}`);
    }

    for (const row of data ?? []) {
      rows.set(row.id, row);
    }
  }

  return rows;
}

async function writeEbayListings(supabase: SupabaseAdmin, listings: NormalizedEbayListing[]) {
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
      throw new Error(`Could not upsert eBay listings: ${error.message}`);
    }
  }

  const listingIds = listings.map((item) => item.listing.id);
  for (const chunk of chunkArray(listingIds, 100)) {
    const { error } = await supabase.from("listing_media").delete().in("listing_id", chunk);
    if (error) {
      throw new Error(`Could not refresh eBay media rows: ${error.message}`);
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
      throw new Error(`Could not insert eBay media rows: ${error.message}`);
    }
  }

  const importRows = listings.map((item) => ({
    source_mode: "ebay" as const,
    source_listing_id: item.sourceListingId,
    listing_id: item.listing.id,
    payload: toJson(item.listing.rawProviderSummary ?? summarizeRawProviderRow(item.rawRow))
  }));

  for (const chunk of chunkArray(importRows, 200)) {
    const { error } = await supabase
      .from("listing_imports")
      .upsert(chunk, { onConflict: "source_mode,source_listing_id" });

    if (error) {
      throw new Error(`Could not record eBay import rows: ${error.message}`);
    }
  }

  return {
    listingsUpserted: listingRows.length,
    mediaRowsInserted: mediaRows.length,
    importRowsUpserted: importRows.length
  };
}

async function archiveStaleEbayListings({
  supabase,
  seenListingIds,
  fetchedListingCount,
  config,
  now,
  accessToken,
  maxVerificationCalls
}: {
  supabase: SupabaseAdmin;
  seenListingIds: Set<string>;
  fetchedListingCount: number;
  config: EbaySyncConfig;
  now: Date;
  accessToken: string;
  maxVerificationCalls: number;
}) {
  if (config.query) {
    return {
      archived: 0,
      verified: 0,
      callsUsed: 0,
      skippedReason: "Archiving skipped because this eBay sync uses a narrowed keyword query."
    };
  }

  if (fetchedListingCount < config.archiveMinSeenListings) {
    return {
      archived: 0,
      verified: 0,
      callsUsed: 0,
      skippedReason: `Archiving skipped because only ${fetchedListingCount} usable eBay listing(s) were seen.`
    };
  }

  const cutoffIso = new Date(now.getTime() - config.staleGraceHours * 60 * 60 * 1000).toISOString();
  const staleRows = await fetchStaleEbayRows(supabase, cutoffIso);
  const unseenRows = staleRows.filter((row) => !seenListingIds.has(row.id));
  const verificationLimit = Math.max(
    0,
    Math.min(unseenRows.length, config.staleVerificationMaxPerSync, maxVerificationCalls)
  );
  const rowsToVerify = unseenRows.slice(0, verificationLimit);
  const verificationResults = await mapWithConcurrency(rowsToVerify, config.itemDetailConcurrency, async (row) => {
    const detail = await fetchEbayItemDetailForListingRow(row, config, accessToken);
    if (!detail || isEndedEbayItem(detail, now)) {
      return { id: row.id, archive: true };
    }

    return { id: row.id, archive: false };
  });
  const archiveIds = verificationResults
    .filter((result) => result.archive)
    .map((result) => result.id);
  const keepIds = verificationResults
    .filter((result) => !result.archive)
    .map((result) => result.id);

  let archived = 0;
  for (const chunk of chunkArray(archiveIds, 100)) {
    const { data, error } = await supabase
      .from("listings")
      .update({ status: "archived" })
      .in("id", chunk)
      .select("id");

    if (error) {
      throw new Error(`Could not archive stale eBay listings: ${error.message}`);
    }

    archived += data?.length ?? 0;
  }

  for (const chunk of chunkArray(keepIds, 100)) {
    const { error } = await supabase
      .from("listings")
      .update({ last_seen_at: now.toISOString() })
      .in("id", chunk);

    if (error) {
      throw new Error(`Could not refresh verified eBay listings: ${error.message}`);
    }
  }

  return {
    archived,
    verified: rowsToVerify.length,
    callsUsed: rowsToVerify.length,
    skippedReason:
      unseenRows.length > rowsToVerify.length
        ? `Stale verification capped at ${rowsToVerify.length}/${unseenRows.length} unseen eBay listing(s).`
        : undefined
  };
}

async function fetchStaleEbayRows(supabase: SupabaseAdmin, cutoffIso: string) {
  const rows = new Map<
    string,
    Pick<ListingRow, "id" | "last_seen_at" | "provider_listing_id" | "external_listing_url">
  >();
  const nullResult = await supabase
    .from("listings")
    .select("id,last_seen_at,provider_listing_id,external_listing_url")
    .eq("source_mode", "ebay")
    .eq("status", "active")
    .is("last_seen_at", null)
    .limit(1000);

  if (nullResult.error) {
    throw new Error(`Could not read stale eBay listings: ${nullResult.error.message}`);
  }

  for (const row of nullResult.data ?? []) rows.set(row.id, row);

  const oldResult = await supabase
    .from("listings")
    .select("id,last_seen_at,provider_listing_id,external_listing_url")
    .eq("source_mode", "ebay")
    .eq("status", "active")
    .lt("last_seen_at", cutoffIso)
    .limit(1000);

  if (oldResult.error) {
    throw new Error(`Could not read stale eBay listings: ${oldResult.error.message}`);
  }

  for (const row of oldResult.data ?? []) rows.set(row.id, row);
  return [...rows.values()];
}

async function getDailyCallsUsed(supabase: SupabaseAdmin, dayKey: string) {
  const warnings: string[] = [];
  const { data, error } = await supabase
    .from("provider_sync_runs")
    .select("calls_used")
    .eq("provider", provider)
    .eq("month_key", dayKey);

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
    console.error(`Could not record eBay sync run: ${error.message}`);
  }
}

function getDailyUsableCallLimit(config: EbaySyncConfig) {
  return Math.max(0, config.dailyCallLimit - config.dailySafetyBuffer);
}

function isUsableEbayListing(listing: CarListing) {
  return Boolean(
    listing.year >= 1900 &&
      listing.make &&
      listing.make !== "Unknown" &&
      listing.model &&
      listing.model !== "Vehicle" &&
      listing.price > 0 &&
      listing.mileage > 0 &&
      listing.location &&
      listing.contactUrl &&
      listing.mediaItems.some((media) => media.url && !media.url.startsWith("/cars/"))
  );
}

function isWithinConfiguredLocalRadius(row: EbayRow, config: EbaySyncConfig) {
  if (!config.localDistanceOnly) return true;
  const distance = getDistance(row);
  return distance !== undefined && distance <= config.pickupRadius;
}

function scoreEbayListing(listing: CarListing) {
  let score = 0;
  score += Math.min(30, listing.mediaItems.length * 3);
  if (listing.mileage > 0) score += 14;
  if (listing.price > 0) score += 12;
  if (listing.contactUrl) score += 12;
  if (listing.sellerName) score += 10;
  if (listing.tags.includes("auction")) score += 6;
  if (listing.tags.includes("local-pickup")) score += 6;
  return score;
}

function extractItemSummaries(payload: Record<string, unknown>) {
  return Array.isArray(payload.itemSummaries) ? payload.itemSummaries.filter(isRecord) : [];
}

function getEbayRowId(row: EbayRow) {
  return getString(row, "itemId") ?? getString(row, "legacyItemId") ?? getString(row, "itemWebUrl");
}

function extractImageUrls(row: EbayRow) {
  const urls = [
    getString(getObject(row, "image"), "imageUrl"),
    ...readImageArray(row.additionalImages),
    ...readImageArray(row.thumbnailImages)
  ];

  return [...new Set(urls.map((url) => url?.trim()).filter((url): url is string => Boolean(url && /^https?:\/\//.test(url))))];
}

function parseVehicleTitle(title: string, shortDescription: string) {
  const combined = `${title} ${shortDescription}`;
  const year = parseYear(combined);
  const tokens = tokenizeTitle(title || shortDescription);
  const yearIndex = tokens.findIndex((token) => String(year) === token);
  const makeIndex = findMakeIndex(tokens, yearIndex >= 0 ? yearIndex + 1 : 0);
  const make = makeIndex >= 0 ? canonicalMake(tokens[makeIndex]) : "";
  const afterMake = makeIndex >= 0 ? tokens.slice(makeIndex + 1) : [];
  const modelTokens = afterMake.filter((token) => !isTitleStopToken(token)).slice(0, 3);
  const model = cleanModel(modelTokens[0] ?? "");
  const trim = modelTokens.slice(1).map(cleanModel).filter(Boolean).join(" ");

  return {
    year,
    make,
    model,
    trim
  };
}

function parseYear(value: string) {
  const currentYear = new Date().getFullYear();
  const matches = value.match(/\b(19[0-9]{2}|20[0-9]{2})\b/g) ?? [];
  for (const match of matches) {
    const year = Number(match);
    if (year >= 1900 && year <= currentYear + 1) {
      return year;
    }
  }
  return 0;
}

function parseMileage(value: string) {
  const match = value.match(/\b([0-9][0-9,]{1,8})\s*(?:mi|miles|mile|mileage|k\s*miles)\b/i);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return undefined;
  return /\bk\s*miles\b/i.test(match[0]) ? parsed * 1000 : parsed;
}

function tokenizeTitle(value: string) {
  return value
    .replace(/[()[\]{}]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9-]+$/gi, ""))
    .filter(Boolean);
}

const knownMakes = new Map(
  [
    "acura",
    "alfa",
    "audi",
    "bmw",
    "buick",
    "cadillac",
    "chevrolet",
    "chevy",
    "chrysler",
    "dodge",
    "fiat",
    "ford",
    "genesis",
    "gmc",
    "honda",
    "hyundai",
    "infiniti",
    "jaguar",
    "jeep",
    "kia",
    "land",
    "lexus",
    "lincoln",
    "mazda",
    "mercedes",
    "mercedes-benz",
    "mini",
    "mitsubishi",
    "nissan",
    "pontiac",
    "porsche",
    "ram",
    "rivian",
    "saturn",
    "scion",
    "subaru",
    "tesla",
    "toyota",
    "volkswagen",
    "vw",
    "volvo"
  ].map((make) => [make, make])
);

function findMakeIndex(tokens: string[], startIndex: number) {
  for (let index = Math.max(0, startIndex); index < tokens.length; index += 1) {
    const token = tokens[index].toLowerCase();
    if (knownMakes.has(token)) return index;
  }

  for (let index = 0; index < Math.max(0, startIndex); index += 1) {
    const token = tokens[index].toLowerCase();
    if (knownMakes.has(token)) return index;
  }

  return -1;
}

function canonicalMake(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "chevy") return "Chevrolet";
  if (normalized === "vw") return "Volkswagen";
  if (normalized === "mercedes") return "Mercedes-Benz";
  if (normalized === "land") return "Land Rover";
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

function cleanModel(value: string) {
  return value.replace(/[^a-z0-9-]/gi, "").trim();
}

function isTitleStopToken(value: string) {
  return /^(for|sale|no|reserve|clean|title|used|new|runs|drives|manual|automatic|auto|truck|car|sedan|coupe|convertible|wagon|suv|van|pickup)$/i.test(value);
}

function inferSellerType(seller: Record<string, unknown> | undefined) {
  const accountType = getString(seller, "sellerAccountType")?.toUpperCase();
  if (accountType === "BUSINESS") return "Dealer";
  return "Private Seller";
}

function getAspectNumber(row: EbayRow, name: string) {
  const value = getAspectValue(row, name);
  if (!value) return undefined;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getAspectValue(row: EbayRow, name: string) {
  const aspects = row.localizedAspects;
  if (!Array.isArray(aspects)) return undefined;
  const match = aspects.find((aspect) => {
    if (!isRecord(aspect)) return false;
    return getString(aspect, "name")?.toLowerCase() === name.toLowerCase();
  });
  return isRecord(match) ? getString(match, "value") : undefined;
}

function getMoneyValue(value: Record<string, unknown> | undefined) {
  const parsed = getNumber(value, "value");
  return parsed && parsed > 0 ? Math.round(parsed) : undefined;
}

function getDistance(row: EbayRow) {
  const distance = getObject(row, "distanceFromPickupLocation");
  return getNumber(distance, "value");
}

function buildAiHook(
  make: string,
  model: string,
  price: number,
  mileage: number,
  buyingOptions: string[],
  condition?: string
) {
  const title = [make, model].filter(Boolean).join(" ") || "This eBay listing";
  const format = buyingOptions.includes("AUCTION") ? "auction" : "listing";
  const conditionText = condition ? `${condition.toLowerCase()} ` : "";
  if (price > 0 && mileage > 0) {
    return `${title} is a ${conditionText}eBay ${format} with enough detail to scout, but the source listing controls the final terms.`;
  }
  return `${title} adds eBay variety to the feed, but mileage and title details need a source-page check.`;
}

function buildRedFlags(year: number, mileage: number, buyingOptions: string[], condition?: string) {
  const flags: string[] = [];
  const currentYear = new Date().getFullYear();
  if (buyingOptions.includes("AUCTION")) flags.push("Auction price can move before the listing ends.");
  if (mileage === 0) flags.push("Mileage is not visible in the eBay summary.");
  if (mileage > 150000) flags.push("Higher mileage means service records matter.");
  if (year > 0 && currentYear - year > 20) flags.push("Older vehicle means rust, leaks, and parts availability matter.");
  if (condition && /salvage|parts|not working|for parts/i.test(condition)) {
    flags.push(`eBay condition is listed as ${condition}.`);
  }
  return flags;
}

function buildEbayTags(
  make: string,
  model: string,
  price: number,
  mileage: number,
  year: number,
  buyingOptions: string[],
  condition?: string
) {
  const tags = ["ebay", "authorized-api"];
  const text = `${make} ${model}`.toLowerCase();
  if (buyingOptions.includes("AUCTION")) tags.push("auction");
  if (buyingOptions.includes("BEST_OFFER")) tags.push("best-offer");
  if (price > 0 && price < 16000) tags.push("budget");
  if (mileage > 0 && mileage < 80000) tags.push("lower-mileage");
  if (/truck|f-150|silverado|ram|tacoma|frontier|sierra/.test(text)) tags.push("truck");
  if (/bronco|corvette|mustang|camaro|challenger|charger|miata|911|wrangler/.test(text)) {
    tags.push("enthusiast");
  }
  if (year > 0 && new Date().getFullYear() - year > 20) tags.push("older-vehicle");
  if (condition && /salvage|parts|not working|for parts/i.test(condition)) tags.push("project");
  return tags;
}

function summarizeRawProviderRow(
  row: EbayRow | undefined,
  sync?: {
    imageCount?: number;
    syncedAt?: string;
    categoryId?: string;
    sort?: string;
    query?: string;
  }
) {
  if (!row) return undefined;
  const itemLocation = getObject(row, "itemLocation");
  const seller = getObject(row, "seller");
  const price = getObject(row, "price");
  const currentBidPrice = getObject(row, "currentBidPrice");
  return {
    provider,
    itemId: getString(row, "itemId"),
    legacyItemId: getString(row, "legacyItemId"),
    title: getString(row, "title"),
    shortDescription: getString(row, "shortDescription"),
    condition: getString(row, "condition"),
    price: getMoneyValue(price),
    currentBidPrice: getMoneyValue(currentBidPrice),
    buyingOptions: readStringArray(row.buyingOptions),
    itemWebUrl: getString(row, "itemWebUrl"),
    itemAffiliateWebUrl: getString(row, "itemAffiliateWebUrl"),
    itemCreationDate: getString(row, "itemCreationDate") ?? getString(row, "itemOriginDate"),
    itemEndDate: getString(row, "itemEndDate"),
    mileage: getAspectNumber(row, "Mileage"),
    vin: getAspectValue(row, "VIN (Vehicle Identification Number)") ?? getAspectValue(row, "VIN"),
    sellerName: getString(seller, "username"),
    sellerFeedbackPercentage: getString(seller, "feedbackPercentage"),
    sellerFeedbackScore: getNumber(seller, "feedbackScore"),
    city: getString(itemLocation, "city"),
    state: getString(itemLocation, "stateOrProvince"),
    postalCode: getString(itemLocation, "postalCode"),
    country: getString(itemLocation, "country"),
    mediaImageCount: sync?.imageCount,
    sync: sync
      ? {
          syncedAt: sync.syncedAt,
          categoryId: sync.categoryId,
          sort: sync.sort,
          query: sync.query
        }
      : undefined
  };
}

function readImageArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((image) => getString(image, "imageUrl"))
    .filter((url): url is string => Boolean(url));
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function readIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

function readPositiveIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function readListEnv(name: string, fallback: string[]) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const items = raw
    .split(/[|,;]/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function normalizeBuyingOptions(options: string[]) {
  const normalized = [...new Set(options.map((option) => option.trim().toUpperCase()).filter(Boolean))];
  if (
    parseBoolean(process.env.EBAY_INCLUDE_CLASSIFIED_ADS, true) &&
    !normalized.includes("CLASSIFIED_AD")
  ) {
    normalized.push("CLASSIFIED_AD");
  }
  return normalized;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeEbayOffset(value: number, limit: number) {
  const offset = clamp(value, 0, 9999);
  return offset - (offset % limit);
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
