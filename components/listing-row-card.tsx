"use client";

import { Bookmark, MapPin, Sparkles } from "lucide-react";
import { DealGradeBadge } from "@/components/deal-grade";
import type { CarListing } from "@/data/listings";
import { getListingConfidence } from "@/lib/listing-confidence";
import { getSellerTypeLabel, getShortLocationLabel } from "@/lib/listing-display";
import { formatCurrency, formatMileage } from "@/lib/format";

export function ListingRowCard({
  listing,
  isSaved,
  onToggleSaved,
  onOpenAnalysis,
  compact = false
}: {
  listing: CarListing;
  isSaved: boolean;
  onToggleSaved: () => void;
  onOpenAnalysis: () => void;
  compact?: boolean;
}) {
  const heroImage = listing.imageUrls[0] ?? listing.imageUrl;
  const confidenceRead = getListingConfidence(listing);

  return (
    <article className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.06] shadow-xl shadow-black/20">
      <button
        type="button"
        className="group relative block h-40 w-full overflow-hidden text-left"
        onClick={onOpenAnalysis}
      >
        <div
          className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-105"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/18 to-black/20" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <DealGradeBadge grade={confidenceRead.grade} compact />
          <span className="rounded-full border border-white/14 bg-black/42 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.13em] text-white backdrop-blur-xl">
            {listing.feedBadge}
          </span>
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-xl font-black leading-tight">
            {listing.year} {listing.make} {listing.model}
          </p>
          <p className="mt-1 text-xs font-bold text-white/68">{listing.trim}</p>
        </div>
      </button>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
          <p className="text-xl font-black">{formatCurrency(listing.price)}</p>
            <p className="text-xs font-bold text-white/56">
              {formatMileage(listing.mileage)} - {getSellerTypeLabel(listing)}
            </p>
          </div>
          <button
            type="button"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition ${
              isSaved
                ? "border-white bg-white text-black"
                : "border-white/12 bg-white/8 text-white hover:bg-white/12"
            }`}
            onClick={onToggleSaved}
            aria-label={isSaved ? "Unsave listing" : "Save listing"}
          >
            <Bookmark className={`h-5 w-5 ${isSaved ? "fill-black" : ""}`} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-extrabold text-white/72">
            <MapPin className="h-3.5 w-3.5" />
            {getShortLocationLabel(listing)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-extrabold text-white/72">
            <Sparkles className="h-3.5 w-3.5" />
            {confidenceRead.shortLabel}
          </span>
        </div>

        <p
          className={`mt-3 font-semibold leading-snug text-white/74 ${
            compact ? "line-clamp-2 text-sm" : "text-sm"
          }`}
        >
          {listing.aiHook}
        </p>
      </div>
    </article>
  );
}
