import type { CarListing } from "@/data/listings";

export type OfferPaymentType = "Cash" | "Financing" | "Trade";

export type OfferStatus = "sent" | "accepted" | "declined" | "countered" | "counter-accepted";

export type OfferRecord = {
  id: string;
  listingId: string;
  listingTitle: string;
  sellerLabel: string;
  askingPrice: number;
  offerAmount: number;
  paymentType: OfferPaymentType;
  message: string;
  status: OfferStatus;
  counterAmount?: number;
  sellerNote?: string;
  createdAt: string;
  updatedAt: string;
};

export function canMakeOffer(listing: CarListing, currentUserId?: string) {
  return (
    listing.sourceMode === "user" &&
    listing.sellerType === "Private Seller" &&
    (!currentUserId || listing.ownerId !== currentUserId)
  );
}

export function getOfferStatusLabel(status: OfferStatus) {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "countered":
      return "Countered";
    case "counter-accepted":
      return "Counter accepted";
    default:
      return "Sent";
  }
}

export function getLatestOfferForListing(offers: OfferRecord[], listingId: string) {
  return offers.find((offer) => offer.listingId === listingId) ?? null;
}
