import { carListings } from "@/data/listings";
import realListings from "@/src/data/realListings.json";
import { normalizeListings } from "@/src/lib/normalizeListing";
import type { CarListing, RawListingInput } from "@/src/lib/listingTypes";

const importedListings = normalizeListings(realListings as RawListingInput[], "csv");

export const appListings: CarListing[] =
  importedListings.length > 0 ? importedListings : carListings;
