import type { CarListing } from "@/data/listings";

const validVinPattern = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeDedupeVin(value: unknown) {
  if (!value) return undefined;
  const vin = String(value).trim().toUpperCase();
  return validVinPattern.test(vin) ? vin : undefined;
}

export function dedupeCarListingsByVin(listings: CarListing[]) {
  const byKey = new Map<string, CarListing>();

  for (const listing of listings) {
    const key = normalizeDedupeVin(listing.vin) ?? `id:${listing.id}`;
    const current = byKey.get(key);
    if (!current || scoreListingForDedupe(listing) > scoreListingForDedupe(current)) {
      byKey.set(key, listing);
    }
  }

  return [...byKey.values()];
}

function scoreListingForDedupe(listing: CarListing) {
  let score = 0;
  if (listing.sourceMode === "user") score += 10_000;
  if (listing.sourceMode === "marketcheck") score += 300;
  if (listing.sourceMode === "ebay") score += 250;
  if (listing.sourceMode === "csv") score += 100;
  if (listing.sourceMode === "mock") score -= 500;
  if (listing.price > 0) score += 40;
  if (listing.mileage > 0) score += 40;
  if (listing.sellerPhone) score += 25;
  if (listing.contactUrl || listing.externalListingUrl) score += 20;
  if (listing.vin) score += 20;
  score += Math.min(120, listing.mediaItems.length * 6);
  score += Math.min(80, listing.imageUrls.length * 4);

  const lastSeen = listing.lastSeenAt ? Date.parse(listing.lastSeenAt) : 0;
  if (Number.isFinite(lastSeen) && lastSeen > 0) {
    score += Math.min(80, lastSeen / 86_400_000_000);
  }

  return score;
}
