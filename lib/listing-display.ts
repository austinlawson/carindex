import type { CarListing } from "@/data/listings";
import { formatCurrency, formatMileage } from "@/lib/format";
import { getListingConfidence } from "@/lib/listing-confidence";

const searchRadiusFallbacks = new Set([75, 100, 150]);

export function getSellerName(listing: CarListing) {
  return (
    listing.sellerName ??
    readRawString(listing, "dealerName") ??
    readRawString(listing, "sellerName") ??
    listing.sellerType
  );
}

export function getSellerTypeLabel(listing: CarListing) {
  switch (listing.sellerType) {
    case "Dealer":
      return "Dealer";
    case "Small Lot":
      return "Small lot";
    default:
      return "Private seller";
  }
}

export function getSellerDisplayLabel(listing: CarListing) {
  const typeLabel = getSellerTypeLabel(listing);
  const sellerName = getSellerName(listing);

  if (sellerName.toLowerCase() === typeLabel.toLowerCase()) {
    return typeLabel;
  }

  if (sellerName.toLowerCase() === listing.sellerType.toLowerCase()) {
    return typeLabel;
  }

  return `${typeLabel} - ${sellerName}`;
}

export function getLocationLabel(listing: CarListing) {
  if (!listing.distance || isLikelySearchRadiusFallback(listing)) {
    return listing.location;
  }

  return `${listing.location} - ${Math.round(listing.distance)} mi`;
}

export function getShortLocationLabel(listing: CarListing) {
  if (!listing.distance || isLikelySearchRadiusFallback(listing)) {
    return listing.location;
  }

  return `${Math.round(listing.distance)} mi`;
}

export function getContactHref(listing: CarListing) {
  if (listing.sellerPhone) {
    return `tel:${listing.sellerPhone.replace(/[^\d+]/g, "")}`;
  }

  if (listing.sellerEmail) {
    return `mailto:${listing.sellerEmail}`;
  }

  return listing.contactUrl ?? listing.externalListingUrl ?? listing.sourceUrl;
}

export function getContactLabel(listing: CarListing) {
  const contactNoun = listing.sellerType === "Dealer" ? "Dealer" : "Seller";
  if (listing.sellerPhone) return `Call ${contactNoun}`;
  if (listing.sellerEmail) return `Email ${contactNoun}`;
  if (listing.sellerType === "Dealer") return "Contact Dealer";
  if (listing.sourceMode && listing.sourceMode !== "user" && listing.sourceMode !== "mock") {
    return `Contact ${contactNoun}`;
  }
  return `Contact ${contactNoun}`;
}

export function getListingNotes(listing: CarListing) {
  const title = `${listing.year} ${listing.make} ${listing.model} ${listing.trim}`.trim();
  const sourceDescription = listing.listingDescription?.trim();

  if (sourceDescription && sourceDescription.length > 60 && sourceDescription !== title) {
    return sourceDescription;
  }

  const seller = getSellerDisplayLabel(listing);
  const photoText =
    listing.imageUrls.length === 1
      ? "1 photo"
      : `${new Intl.NumberFormat("en-US").format(listing.imageUrls.length)} photos`;
  const trimText = listing.trim ? ` ${listing.trim}` : "";
  const confidenceRead = getListingConfidence(listing);

  return `${listing.year} ${listing.make} ${listing.model}${trimText} listed by ${seller} in ${listing.location}. The snapshot shows ${formatMileage(
    listing.mileage
  )}, ${photoText}, and an asking price of ${formatCurrency(
    listing.price
  )}. The buyer read is ${confidenceRead.shortLabel.toLowerCase()}, based on media, VIN/disclosure data, seller notes, and contact readiness. Use the photo gallery to check tire wear, interior condition, trim details, and any signs that do not match the listing before reaching out.`;
}

function isLikelySearchRadiusFallback(listing: CarListing) {
  return listing.sourceMode === "marketcheck" && searchRadiusFallbacks.has(Math.round(listing.distance));
}

function readRawString(listing: CarListing, key: string) {
  const value = listing.rawProviderSummary?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
