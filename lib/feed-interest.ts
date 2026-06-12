import type { CarListing, ListingSource, SellerType } from "@/data/listings";

export const feedInterestStorageKey = "carindex.feedInterest.v1";
export const feedInterestAnonymousIdKey = "carindex.anonymousInterestId";

export type FeedInterestEventType =
  | "view"
  | "dwell"
  | "long_view"
  | "revisit"
  | "scroll_back"
  | "save"
  | "share"
  | "ai_open"
  | "gallery_open"
  | "description_open"
  | "offer_open"
  | "contact_open";

export type FeedInterestVehicleSnapshot = {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number;
  distance: number;
  sourceMode?: ListingSource;
  sellerType: SellerType;
  tags: string[];
};

export type FeedInterestListingSignal = {
  listingId: string;
  score: number;
  viewCount: number;
  revisitCount: number;
  longViewCount: number;
  totalDwellMs: number;
  lastViewedAt?: string;
  lastInteractionAt?: string;
  lastEventAt: string;
  eventCounts: Partial<Record<FeedInterestEventType, number>>;
  vehicle: FeedInterestVehicleSnapshot;
};

export type FeedInterestState = {
  version: 1;
  anonymousId: string;
  updatedAt: string;
  listings: Record<string, FeedInterestListingSignal>;
};

export type FeedInterestEventInput = {
  type: FeedInterestEventType;
  listingId: string;
  occurredAt: string;
  dwellMs?: number;
  metadata?: Record<string, unknown>;
  listingSnapshot: FeedInterestVehicleSnapshot;
};

const directInterestEvents = new Set<FeedInterestEventType>([
  "save",
  "share",
  "ai_open",
  "gallery_open",
  "description_open",
  "offer_open",
  "contact_open",
  "long_view"
]);

export function createFeedInterestState(anonymousId: string): FeedInterestState {
  return {
    version: 1,
    anonymousId,
    updatedAt: new Date().toISOString(),
    listings: {}
  };
}

export function normalizeFeedInterestState(
  candidate: unknown,
  anonymousId: string
): FeedInterestState {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return createFeedInterestState(anonymousId);
  }

  const state = candidate as Partial<FeedInterestState>;
  const listings =
    state.listings && typeof state.listings === "object" && !Array.isArray(state.listings)
      ? state.listings
      : {};

  return pruneFeedInterestState({
    version: 1,
    anonymousId: typeof state.anonymousId === "string" ? state.anonymousId : anonymousId,
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : new Date().toISOString(),
    listings
  });
}

export function snapshotListingForInterest(listing: CarListing): FeedInterestVehicleSnapshot {
  return {
    year: listing.year,
    make: listing.make,
    model: listing.model,
    trim: listing.trim,
    price: listing.price,
    mileage: listing.mileage,
    distance: listing.distance,
    sourceMode: listing.sourceMode,
    sellerType: listing.sellerType,
    tags: listing.tags
  };
}

export function applyFeedInterestEvent(
  state: FeedInterestState,
  event: FeedInterestEventInput
): FeedInterestState {
  const previous = state.listings[event.listingId];
  const scoreDelta = getFeedInterestEventWeight(event.type, event.dwellMs);
  const occurredAt = event.occurredAt;
  const eventCounts = {
    ...(previous?.eventCounts ?? {}),
    [event.type]: (previous?.eventCounts?.[event.type] ?? 0) + 1
  };

  const nextSignal: FeedInterestListingSignal = {
    listingId: event.listingId,
    score: Math.max(0, (previous?.score ?? 0) + scoreDelta),
    viewCount: (previous?.viewCount ?? 0) + (event.type === "view" ? 1 : 0),
    revisitCount: (previous?.revisitCount ?? 0) + (event.type === "revisit" || event.type === "scroll_back" ? 1 : 0),
    longViewCount: (previous?.longViewCount ?? 0) + (event.type === "long_view" ? 1 : 0),
    totalDwellMs: (previous?.totalDwellMs ?? 0) + (event.dwellMs ?? 0),
    lastViewedAt:
      event.type === "view" || event.type === "revisit" || event.type === "scroll_back"
        ? occurredAt
        : previous?.lastViewedAt,
    lastInteractionAt: directInterestEvents.has(event.type) ? occurredAt : previous?.lastInteractionAt,
    lastEventAt: occurredAt,
    eventCounts,
    vehicle: event.listingSnapshot
  };

  return pruneFeedInterestState({
    ...state,
    updatedAt: occurredAt,
    listings: {
      ...state.listings,
      [event.listingId]: nextSignal
    }
  });
}

export function getListingInterestSignal(
  state: FeedInterestState | null | undefined,
  listingId: string
) {
  return state?.listings[listingId];
}

export function hasMeaningfulListingInterest(signal: FeedInterestListingSignal | undefined) {
  if (!signal) return false;

  return (
    signal.score >= 10 ||
    signal.longViewCount > 0 ||
    Boolean(signal.lastInteractionAt) ||
    (signal.totalDwellMs >= 18_000 && signal.viewCount > 0)
  );
}

export function getListingSimilarityScore(
  listing: CarListing,
  state: FeedInterestState | null | undefined
) {
  if (!state) return 0;

  let score = 0;
  const make = normalizeAffinityText(listing.make);
  const model = normalizeAffinityText(listing.model);
  const trim = normalizeAffinityText(listing.trim);

  for (const signal of Object.values(state.listings)) {
    if (!hasMeaningfulListingInterest(signal)) continue;
    if (signal.listingId === listing.id) continue;

    const weight = Math.min(3, Math.max(1, signal.score / 12));
    const vehicle = signal.vehicle;
    const interestedMake = normalizeAffinityText(vehicle.make);
    const interestedModel = normalizeAffinityText(vehicle.model);
    const interestedTrim = normalizeAffinityText(vehicle.trim);

    if (make && make === interestedMake) score += 3 * weight;
    if (model && model === interestedModel) score += 6 * weight;
    if (trim && trim === interestedTrim) score += 1.5 * weight;
    if (vehicle.sellerType === listing.sellerType) score += 0.75 * weight;
    if (isWithinRatio(listing.price, vehicle.price, 0.25)) score += 1.5 * weight;
    if (isWithinRatio(listing.mileage, vehicle.mileage, 0.35)) score += 0.75 * weight;
  }

  return Math.min(40, score);
}

export function getListingFreshnessRank(
  listing: CarListing,
  state: FeedInterestState | null | undefined
) {
  const signal = getListingInterestSignal(state, listing.id);
  if (hasMeaningfulListingInterest(signal)) return 0;
  if (!signal) return 1;
  if (getListingSimilarityScore(listing, state) >= 8) return 2;
  if (signal.viewCount <= 1 && signal.totalDwellMs < 8_000) return 3;
  return 4;
}

export function getListingPersonalScore(
  listing: CarListing,
  state: FeedInterestState | null | undefined
) {
  const signal = getListingInterestSignal(state, listing.id);
  const directScore = signal ? Math.min(80, signal.score) : 0;
  const dwellScore = signal ? Math.min(20, signal.totalDwellMs / 2_000) : 0;
  const similarityScore = getListingSimilarityScore(listing, state);

  return directScore + dwellScore + similarityScore;
}

export function getReplayRankedListings(
  listings: CarListing[],
  state: FeedInterestState | null | undefined
) {
  return [...listings].sort((left, right) => {
    const leftScore = getListingPersonalScore(left, state);
    const rightScore = getListingPersonalScore(right, state);

    if (leftScore !== rightScore) return rightScore - leftScore;

    const leftDistance = getDistanceSortValue(left);
    const rightDistance = getDistanceSortValue(right);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;

    return 0;
  });
}

export function getFeedInterestEventWeight(type: FeedInterestEventType, dwellMs = 0) {
  switch (type) {
    case "save":
      return 18;
    case "contact_open":
    case "offer_open":
      return 16;
    case "share":
      return 14;
    case "gallery_open":
    case "ai_open":
      return 10;
    case "description_open":
      return 8;
    case "long_view":
      return 7;
    case "revisit":
    case "scroll_back":
      return 5;
    case "dwell":
      return Math.min(8, Math.max(0, dwellMs / 3_000));
    case "view":
    default:
      return 1;
  }
}

export function getDistanceSortValue(listing: CarListing) {
  return Number.isFinite(listing.distance) && listing.distance > 0 ? listing.distance : 10_000;
}

function pruneFeedInterestState(state: FeedInterestState) {
  const maxSignals = 500;
  const entries = Object.entries(state.listings)
    .filter(([, signal]) => Boolean(signal?.listingId))
    .sort(([, left], [, right]) => Date.parse(right.lastEventAt) - Date.parse(left.lastEventAt))
    .slice(0, maxSignals);

  return {
    ...state,
    listings: Object.fromEntries(entries)
  };
}

function normalizeAffinityText(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function isWithinRatio(value: number, target: number, ratio: number) {
  if (!value || !target || value <= 0 || target <= 0) return false;
  return Math.abs(value - target) / Math.max(value, target) <= ratio;
}
