"use client";

import { Bookmark, Home } from "lucide-react";
import { ListingRowCard } from "@/components/listing-row-card";
import type { CarListing } from "@/data/listings";

export function SavedView({
  listings,
  isSaved,
  onToggleSaved,
  onOpenAnalysis,
  onOpenFeed
}: {
  listings: CarListing[];
  isSaved: (id: string) => boolean;
  onToggleSaved: (id: string) => void;
  onOpenAnalysis: (listing: CarListing) => void;
  onOpenFeed: () => void;
}) {
  return (
    <section className="no-scrollbar h-full overflow-y-auto bg-[#07080b] px-4 pb-[calc(env(safe-area-inset-bottom)+112px)] pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">Watchlist</p>
          <h1 className="text-3xl font-black">Saved</h1>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.07]">
          <Bookmark className="h-5 w-5 text-cyan-200" />
        </div>
      </header>

      {listings.length > 0 ? (
        <div className="mt-6 space-y-4">
          {listings.map((listing) => (
            <ListingRowCard
              key={listing.id}
              listing={listing}
              isSaved={isSaved(listing.id)}
              onToggleSaved={() => onToggleSaved(listing.id)}
              onOpenAnalysis={() => onOpenAnalysis(listing)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-20 rounded-[30px] border border-white/10 bg-white/[0.06] p-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white text-black">
            <Bookmark className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-2xl font-black">No saved cars yet</h2>
          <button
            type="button"
            className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-black"
            onClick={onOpenFeed}
          >
            <Home className="h-[18px] w-[18px]" />
            Feed
          </button>
        </div>
      )}
    </section>
  );
}
