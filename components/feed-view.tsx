"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { UIEvent } from "react";
import { ListingCard } from "@/components/listing-card";
import type { CarListing } from "@/data/listings";
import { getFeedMediaPreloadMode } from "@/lib/feed-ranking";

export function FeedView({
  listings,
  focusListingId,
  onFocusListingHandled,
  feedChromeHidden,
  onFeedChromeHiddenChange,
  currentUserId,
  isSaved,
  onToggleSaved,
  onOpenAnalysis,
  onOpenOffer,
  onOpenGallery,
  onOpenDescription,
  notificationAction,
  onNearEnd,
  isLoadingMore = false
}: {
  listings: CarListing[];
  focusListingId?: string | null;
  onFocusListingHandled?: () => void;
  feedChromeHidden: boolean;
  onFeedChromeHiddenChange: (hidden: boolean) => void;
  currentUserId?: string;
  isSaved: (id: string) => boolean;
  onToggleSaved: (id: string) => void;
  onOpenAnalysis: (listing: CarListing) => void;
  onOpenOffer: (listing: CarListing) => void;
  onOpenGallery: (listing: CarListing, initialIndex: number) => void;
  onOpenDescription: (listing: CarListing) => void;
  notificationAction?: ReactNode;
  onNearEnd?: () => void;
  isLoadingMore?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!focusListingId) return;

    const index = listings.findIndex((listing) => listing.id === focusListingId);
    const container = containerRef.current;

    if (index < 0 || !container) {
      onFocusListingHandled?.();
      return;
    }

    container.scrollTo({
      top: index * Math.max(container.clientHeight, 1),
      behavior: "auto"
    });
    setActiveIndex(index);
    onFocusListingHandled?.();
  }, [focusListingId, listings, onFocusListingHandled]);

  const handleScroll = (event: UIEvent<HTMLElement>) => {
    const container = event.currentTarget;
    const nextIndex = Math.round(container.scrollTop / Math.max(container.clientHeight, 1));
    const boundedIndex = Math.max(0, Math.min(listings.length - 1, nextIndex));

    setActiveIndex((current) => (current === boundedIndex ? current : boundedIndex));

    if (boundedIndex >= listings.length - 6) {
      onNearEnd?.();
    }
  };

  return (
    <section
      ref={containerRef}
      className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black"
      onScroll={handleScroll}
    >
      {listings.map((listing, index) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          currentUserId={currentUserId}
          isActive={index === activeIndex}
          mediaPreloadMode={getFeedMediaPreloadMode(index, activeIndex)}
          feedChromeHidden={feedChromeHidden}
          onFeedChromeHiddenChange={onFeedChromeHiddenChange}
          isSaved={isSaved(listing.id)}
          onToggleSaved={() => onToggleSaved(listing.id)}
          onOpenAnalysis={() => onOpenAnalysis(listing)}
          onOpenOffer={() => onOpenOffer(listing)}
          onOpenGallery={(initialIndex) => onOpenGallery(listing, initialIndex)}
          onOpenDescription={() => onOpenDescription(listing)}
          notificationAction={index === activeIndex ? notificationAction : undefined}
        />
      ))}
      {isLoadingMore ? (
        <div className="grid h-24 place-items-center bg-black text-xs font-black uppercase tracking-[0.14em] text-white/42">
          Loading more deals
        </div>
      ) : null}
    </section>
  );
}
