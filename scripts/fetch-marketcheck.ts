import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadScriptEnv } from "./load-script-env";
import { normalizeListing } from "../src/lib/normalizeListing";
import type { CarListing, RawListingInput } from "../src/lib/listingTypes";

loadScriptEnv("MarketCheck snapshot", ["MARKETCHECK_API_KEY"]);

type ApiCallLedgerEntry = {
  provider: string;
  monthKey: string;
  callsUsed: number;
  lastCallAt?: string;
  lastRunAt?: string;
  notes?: string;
};

type CachedListingEntry = {
  cacheKey: string;
  firstSeenAt: string;
  lastSeenAt: string;
  importedAt: string;
  sourceName?: string;
  sourceUrl?: string;
  externalListingUrl?: string;
  vin?: string;
  providerListingId?: string;
  listing: CarListing;
  imageUrls: string[];
  rawProviderSummary?: Record<string, unknown>;
};

type ListingCache = {
  updatedAt: string | null;
  listings: Record<string, CachedListingEntry>;
};

type FetchStats = {
  callsMade: number;
  primaryResults: number;
  secondaryResults: number;
  normalizedListings: number;
  dedupedListings: number;
  usableWithImages: number;
  savedSnapshotCount: number;
};

const provider = "marketcheck";
const cachePath = resolve("src/data/listingCache.json");
const ledgerPath = resolve("src/data/apiCallLedger.json");
const snapshotPath = resolve("src/data/realListings.json");
const dryRun = process.argv.includes("--dry");

const config = {
  apiKey: process.env.MARKETCHECK_API_KEY,
  baseUrl: process.env.MARKETCHECK_BASE_URL ?? "https://api.marketcheck.com/v2/search/car/active",
  zip: process.env.MARKETCHECK_ZIP ?? "36360",
  targetCount: readIntEnv("MARKETCHECK_TARGET_COUNT", 50),
  primaryRadius: readIntEnv("MARKETCHECK_PRIMARY_RADIUS", 75),
  secondaryRadius: readIntEnv("MARKETCHECK_SECONDARY_RADIUS", 150),
  rows: readIntEnv("MARKETCHECK_ROWS", 50),
  maxPrice: readOptionalIntEnv("MARKETCHECK_MAX_PRICE"),
  minPrice: readOptionalIntEnv("MARKETCHECK_MIN_PRICE"),
  make: process.env.MARKETCHECK_MAKE,
  bodyType: process.env.MARKETCHECK_BODY_TYPE,
  carType: process.env.MARKETCHECK_CAR_TYPE ?? "used",
  forceRefresh: parseBoolean(process.env.MARKETCHECK_FORCE_REFRESH, false),
  maxCallsPerRun: readIntEnv("MARKETCHECK_MAX_CALLS_PER_RUN", 3),
  monthlyCallLimit: readIntEnv("MARKETCHECK_MONTHLY_CALL_LIMIT", 500),
  monthlySafetyBuffer: readIntEnv("MARKETCHECK_MONTHLY_SAFETY_BUFFER", 50)
};

async function main() {
  const now = new Date();
  const nowIso = now.toISOString();
  const monthKey = nowIso.slice(0, 7);
  const cache = readJson<ListingCache>(cachePath, { updatedAt: null, listings: {} });
  const ledger = readJson<ApiCallLedgerEntry[]>(ledgerPath, []);
  const ledgerEntry = getLedgerEntry(ledger, monthKey);
  const stats: FetchStats = {
    callsMade: 0,
    primaryResults: 0,
    secondaryResults: 0,
    normalizedListings: 0,
    dedupedListings: 0,
    usableWithImages: 0,
    savedSnapshotCount: 0
  };

  ledgerEntry.lastRunAt = nowIso;
  saveJson(ledgerPath, ledger);

  const cachedSnapshot = selectActiveSnapshot(cache, config.targetCount);
  if (!config.forceRefresh && !dryRun && cachedSnapshot.length >= config.targetCount) {
    saveJson(snapshotPath, cachedSnapshot);
    stats.dedupedListings = Object.keys(cache.listings).length;
    stats.usableWithImages = countUsableWithImages(Object.values(cache.listings).map((entry) => entry.listing));
    stats.savedSnapshotCount = cachedSnapshot.length;
    printSummary(stats, ledgerEntry, "Using existing cache; no API calls made.");
    return;
  }

  if (dryRun) {
    const budget = getBudgetStatus(ledgerEntry, 0);
    printDryRun(budget, cache);
    return;
  }

  if (!config.apiKey) {
    console.log("MARKETCHECK_API_KEY is not set. Skipping MarketCheck snapshot fetch.");
    return;
  }

  const canMakePrimary = ensureCallBudget(ledgerEntry, stats.callsMade);
  if (!canMakePrimary.ok) {
    printSummary(stats, ledgerEntry, canMakePrimary.reason);
    return;
  }

  const primaryRows = await fetchInventory(config.primaryRadius, stats, ledger, ledgerEntry);
  stats.primaryResults = primaryRows.length;
  const primaryListings = primaryRows.map((row) => normalizeMarketCheckListing(row, config.primaryRadius, nowIso));
  mergeListingsIntoCache(cache, primaryListings, primaryRows, nowIso);

  const primaryUsable = primaryListings.filter(isUsableListing).length;
  const activeAfterPrimary = selectActiveSnapshot(cache, config.targetCount);

  if (primaryUsable < config.targetCount && activeAfterPrimary.length < config.targetCount) {
    const canMakeSecondary = ensureCallBudget(ledgerEntry, stats.callsMade);
    if (canMakeSecondary.ok) {
      const secondaryRows = await fetchInventory(config.secondaryRadius, stats, ledger, ledgerEntry);
      stats.secondaryResults = secondaryRows.length;
      const secondaryListings = secondaryRows.map((row) =>
        normalizeMarketCheckListing(row, config.secondaryRadius, nowIso)
      );
      mergeListingsIntoCache(cache, secondaryListings, secondaryRows, nowIso);
    } else {
      console.warn(canMakeSecondary.reason);
    }
  }

  cache.updatedAt = nowIso;
  const activeSnapshot = selectActiveSnapshot(cache, config.targetCount);
  stats.normalizedListings = stats.primaryResults + stats.secondaryResults;
  stats.dedupedListings = Object.keys(cache.listings).length;
  stats.usableWithImages = countUsableWithImages(Object.values(cache.listings).map((entry) => entry.listing));
  stats.savedSnapshotCount = activeSnapshot.length;

  saveJson(cachePath, cache);
  saveJson(snapshotPath, activeSnapshot);
  saveJson(ledgerPath, ledger);
  printSummary(stats, ledgerEntry);
}

async function fetchInventory(
  radius: number,
  stats: FetchStats,
  ledger: ApiCallLedgerEntry[],
  ledgerEntry: ApiCallLedgerEntry
) {
  const rows: Record<string, unknown>[] = [];
  let start = 0;

  while (rows.length < config.targetCount) {
    const canCall = ensureCallBudget(ledgerEntry, stats.callsMade);
    if (!canCall.ok) {
      if (rows.length === 0) console.warn(canCall.reason);
      break;
    }

    const url = buildMarketCheckUrl(radius, start);
    const response = await fetch(url, {
      headers: {
        accept: "application/json"
      }
    });

    stats.callsMade += 1;
    ledgerEntry.callsUsed += 1;
    ledgerEntry.lastCallAt = new Date().toISOString();
    ledgerEntry.notes = `Last request radius=${radius}, rows=${config.rows}, start=${start}, zip=${config.zip}`;
    saveJson(ledgerPath, ledger);

    if (!response.ok) {
      const body = await response.text();
      console.warn(`MarketCheck request failed (${response.status}) for radius ${radius}: ${body}`);
      break;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const pageRows = extractListings(payload);
    const totalFound = getMarketCheckTotalFound(payload);

    if (pageRows.length === 0) {
      break;
    }

    rows.push(...pageRows);
    start += pageRows.length;

    if (totalFound !== undefined && start >= totalFound) {
      break;
    }
  }

  return rows;
}

function buildMarketCheckUrl(radius: number, start: number) {
  const url = new URL(config.baseUrl);
  url.searchParams.set("api_key", config.apiKey ?? "");
  url.searchParams.set("zip", config.zip);
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("rows", String(config.rows));
  url.searchParams.set("start", String(start));
  url.searchParams.set("car_type", config.carType);

  if (config.make) url.searchParams.set("make", config.make);
  if (config.bodyType) url.searchParams.set("body_type", config.bodyType);
  if (config.minPrice || config.maxPrice) {
    url.searchParams.set("price_range", `${config.minPrice ?? 0}-${config.maxPrice ?? 999999}`);
  }

  return url;
}

function normalizeMarketCheckListing(row: Record<string, unknown>, radius: number, nowIso: string) {
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
  const imageUrls = extractImageUrls(row, media);
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
    distance: getMarketCheckDistance(row, dealer) ?? radius,
    sellerType: "Dealer",
    sellerName,
    sellerPhone,
    sellerEmail,
    contactUrl: url,
    vin: getString(row, "vin"),
    imageUrls,
    listingTitle: [year, make, model, trim].filter(Boolean).join(" "),
    listingDescription: getString(row, "heading") ?? getString(row, "title"),
    aiHook: buildAiHook(make, model, price, mileage),
    whyItMadeTheFeed:
      "Authorized inventory snapshot with enough core fields to compare price, mileage, location, photos, and seller details.",
    redFlags: buildRedFlags(year, mileage),
    sellerQuestions: [
      "Can you confirm this vehicle is still available at the listed price?",
      "Are there any dealer add-ons or required packages?",
      "Can you send a buyer's order and confirm the title status?"
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
    rawProviderSummary: summarizeRawProviderRow(row)
  };

  return normalizeListing(input, "marketcheck");
}

function getMarketCheckDistance(row: Record<string, unknown>, dealer?: Record<string, unknown>) {
  return (
    getNumber(row, "distance") ??
    getNumber(row, "dist") ??
    getNumber(row, "distance_miles") ??
    getNumber(row, "miles_from_origin") ??
    getNumber(row, "radius_distance") ??
    getNumber(dealer, "distance")
  );
}

function mergeListingsIntoCache(
  cache: ListingCache,
  listings: CarListing[],
  rawRows: Record<string, unknown>[],
  nowIso: string
) {
  listings.forEach((listing, index) => {
    const cacheKey = getCacheKey(listing);
    const existing = cache.listings[cacheKey];
    if (!existing) {
      cache.listings[cacheKey] = {
        cacheKey,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        importedAt: listing.importedAt ?? nowIso,
        sourceName: listing.sourceName,
        sourceUrl: listing.sourceUrl,
        externalListingUrl: listing.externalListingUrl,
        vin: listing.vin,
        providerListingId: listing.providerListingId,
        listing,
        imageUrls: listing.imageUrls,
        rawProviderSummary: summarizeRawProviderRow(rawRows[index])
      };
      return;
    }

    const improvedImages =
      listing.imageUrls.length > existing.listing.imageUrls.length
        ? listing.imageUrls
        : existing.listing.imageUrls;

    existing.lastSeenAt = nowIso;
    existing.sourceUrl = listing.sourceUrl ?? existing.sourceUrl;
    existing.externalListingUrl = listing.externalListingUrl ?? existing.externalListingUrl;
    existing.vin = listing.vin ?? existing.vin;
    existing.providerListingId = listing.providerListingId ?? existing.providerListingId;
    existing.imageUrls = improvedImages;
    existing.rawProviderSummary = summarizeRawProviderRow(rawRows[index]);
    existing.listing = {
      ...existing.listing,
      ...listing,
      firstSeenAt: undefined,
      imageUrl: improvedImages[0] ?? listing.imageUrl,
      imageUrls: improvedImages,
      importedAt: existing.importedAt,
      lastSeenAt: nowIso
    } as CarListing;
  });
}

function selectActiveSnapshot(cache: ListingCache, targetCount: number) {
  const listings = Object.values(cache.listings)
    .map((entry) => entry.listing)
    .filter(isUsableForSnapshot)
    .sort((a, b) => scoreListing(b) - scoreListing(a));

  const withImages = listings.filter((listing) => hasRealImage(listing));
  const withoutImages = listings.filter((listing) => !hasRealImage(listing));
  return [...withImages, ...withoutImages].slice(0, targetCount);
}

function isUsableForSnapshot(listing: CarListing) {
  return Boolean(
    listing.year &&
      listing.make &&
      listing.model &&
      listing.price &&
      (listing.mileage || listing.mileage === 0) &&
      listing.location
  );
}

function isUsableListing(listing: CarListing) {
  return isUsableForSnapshot(listing) && hasRealImage(listing);
}

function hasRealImage(listing: CarListing) {
  return listing.imageUrls.some((url) => url && !url.startsWith("/cars/"));
}

function countUsableWithImages(listings: CarListing[]) {
  return listings.filter(isUsableListing).length;
}

function scoreListing(listing: CarListing) {
  const currentYear = new Date().getFullYear();
  const age = listing.year > 0 ? Math.max(1, currentYear - listing.year) : 8;
  const milesPerYear = listing.mileage > 0 ? listing.mileage / age : 16000;
  let score = 0;
  if (listing.imageUrls.length > 1) score += 30;
  if (hasRealImage(listing)) score += 20;
  if (listing.vin) score += 14;
  if (listing.mileage > 0) score += 12;
  if (listing.price > 0) score += 12;
  if (listing.location) score += 10;
  if (milesPerYear < 14000) score += 10;
  if (listing.distance > 0) score += Math.max(0, 18 - listing.distance / 8);
  if (listing.dealGrade === "A") score += 14;
  if (listing.dealGrade === "A-") score += 11;
  if (listing.dealGrade === "B+") score += 8;
  if (listing.riskLevel === "Low") score += 10;
  if (listing.tags.some((tag) => ["truck", "suv", "reliable-watch", "low-risk"].includes(tag))) score += 8;
  return score;
}

function getCacheKey(listing: CarListing) {
  if (listing.vin) return `vin:${listing.vin.toUpperCase()}`;
  if (listing.providerListingId) return `provider:${provider}:${listing.providerListingId}`;
  const sourceUrl = listing.externalListingUrl ?? listing.sourceUrl;
  if (sourceUrl) return `url:${sourceUrl}`;
  const fallback = [
    listing.year,
    listing.make,
    listing.model,
    listing.trim,
    listing.price,
    listing.mileage,
    listing.location,
    listing.sourceName
  ].join("|");
  return `hash:${createHash("sha1").update(fallback).digest("hex")}`;
}

function ensureCallBudget(entry: ApiCallLedgerEntry, callsThisRun: number) {
  const monthlyAllowed = config.monthlyCallLimit - config.monthlySafetyBuffer;
  if (entry.callsUsed >= monthlyAllowed) {
    return {
      ok: false,
      reason: `MarketCheck monthly safety limit reached: ${entry.callsUsed}/${monthlyAllowed} usable calls. No request made.`
    };
  }

  if (callsThisRun >= config.maxCallsPerRun) {
    return {
      ok: false,
      reason: `MarketCheck per-run call limit reached: ${callsThisRun}/${config.maxCallsPerRun}. No request made.`
    };
  }

  return { ok: true, reason: "" };
}

function getBudgetStatus(entry: ApiCallLedgerEntry, callsThisRun: number) {
  const monthlyAllowed = config.monthlyCallLimit - config.monthlySafetyBuffer;
  return {
    monthlyAllowed,
    remaining: Math.max(0, monthlyAllowed - entry.callsUsed),
    perRunRemaining: Math.max(0, config.maxCallsPerRun - callsThisRun),
    canCall: entry.callsUsed < monthlyAllowed && callsThisRun < config.maxCallsPerRun
  };
}

function getLedgerEntry(ledger: ApiCallLedgerEntry[], monthKey: string) {
  let entry = ledger.find((item) => item.provider === provider && item.monthKey === monthKey);
  if (!entry) {
    entry = {
      provider,
      monthKey,
      callsUsed: 0,
      notes: "Local testing call guard."
    };
    ledger.push(entry);
  }
  return entry;
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

function getMarketCheckTotalFound(payload: Record<string, unknown>) {
  const response = getObject(payload, "response");
  return (
    getNumber(payload, "num_found") ??
    getNumber(payload, "numFound") ??
    getNumber(payload, "total") ??
    getNumber(payload, "total_count") ??
    getNumber(payload, "totalCount") ??
    getNumber(response, "num_found") ??
    getNumber(response, "numFound") ??
    getNumber(response, "total") ??
    getNumber(response, "total_count") ??
    getNumber(response, "totalCount")
  );
}

function extractImageUrls(row: Record<string, unknown>, media: Record<string, unknown> | undefined) {
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

function buildAiHook(make: string, model: string, price: number, mileage: number) {
  const title = [make, model].filter(Boolean).join(" ") || "This listing";
  if (price > 0 && mileage > 0) {
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

function summarizeRawProviderRow(row: Record<string, unknown> | undefined) {
  if (!row) return undefined;
  const build = getObject(row, "build");
  const dealer = getObject(row, "dealer");
  return {
    id: getString(row, "id") ?? getString(row, "listing_id"),
    vin: getString(row, "vin"),
    price: getNumber(row, "price") ?? getNumber(row, "list_price"),
    miles: getNumber(row, "miles") ?? getNumber(row, "mileage"),
    year: getNumber(build, "year") ?? getNumber(row, "year"),
    make: getString(build, "make") ?? getString(row, "make"),
    model: getString(build, "model") ?? getString(row, "model"),
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
    distance: getMarketCheckDistance(row, dealer)
  };
}

function printDryRun(
  budget: { monthlyAllowed: number; remaining: number; perRunRemaining: number; canCall: boolean },
  cache: ListingCache
) {
  console.log("MarketCheck dry run. No API requests will be made.");
  console.log(`Target listings: ${config.targetCount}`);
  console.log(`Primary radius: ${config.primaryRadius} miles`);
  console.log(`Secondary radius: ${config.secondaryRadius} miles if needed`);
  console.log(`ZIP: ${config.zip}`);
  console.log(`Rows per call: ${config.rows}`);
  console.log(`Cached listings: ${Object.keys(cache.listings).length}`);
  console.log(`Monthly calls remaining before safety buffer: ${budget.remaining}/${budget.monthlyAllowed}`);
  console.log(`Per-run calls remaining: ${budget.perRunRemaining}/${config.maxCallsPerRun}`);
  console.log(`Budget allows fetch: ${budget.canCall ? "yes" : "no"}`);
}

function printSummary(stats: FetchStats, ledgerEntry: ApiCallLedgerEntry, note?: string) {
  if (note) console.log(note);
  console.log("MarketCheck snapshot summary");
  console.log(`API calls made this run: ${stats.callsMade}`);
  console.log(`Total calls used this month: ${ledgerEntry.callsUsed}`);
  console.log(`Primary radius results: ${stats.primaryResults}`);
  console.log(`Secondary radius results: ${stats.secondaryResults}`);
  console.log(`Normalized listings: ${stats.normalizedListings}`);
  console.log(`Deduped cached listings: ${stats.dedupedListings}`);
  console.log(`Usable listings with images: ${stats.usableWithImages}`);
  console.log(`Saved active snapshot count: ${stats.savedSnapshotCount}`);
}

function readIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function readOptionalIntEnv(name: string) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function saveJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
