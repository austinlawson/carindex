"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { UIEvent } from "react";
import { FeedVideoPreloader } from "@/components/feed-video-preloader";
import { ListingCard } from "@/components/listing-card";
import type { CarListing } from "@/data/listings";
import { getFeedMediaPreloadMode } from "@/lib/feed-ranking";
import {
  areVideoReadinessStatesEquivalent,
  collectFeedVideoPreloadTargets,
  getListingPrimaryVideo,
  getVideoDeferralSlots,
  type FeedVideoReadiness
} from "@/lib/feed-video-readiness";

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
  const [orderedListings, setOrderedListings] = useState(listings);
  const [videoReadinessByUrl, setVideoReadinessByUrl] = useState<
    Record<string, FeedVideoReadiness>
  >({});
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setOrderedListings((current) => reconcileOrderedListings(current, listings));
  }, [listings]);

  useEffect(() => {
    setActiveIndex((current) => Math.max(0, Math.min(orderedListings.length - 1, current)));
  }, [orderedListings.length]);

  const preloadTargets = useMemo(
    () => collectFeedVideoPreloadTargets(orderedListings, activeIndex),
    [activeIndex, orderedListings]
  );

  const updateVideoReadiness = useCallback((url: string, state: FeedVideoReadiness) => {
    setVideoReadinessByUrl((current) => {
      if (areVideoReadinessStatesEquivalent(current[url], state)) {
        return current;
      }

      return {
        ...current,
        [url]: state
      };
    });
  }, []);

  useEffect(() => {
    if (!focusListingId) return;

    const index = orderedListings.findIndex((listing) => listing.id === focusListingId);
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
  }, [focusListingId, orderedListings, onFocusListingHandled]);

  const handleScroll = (event: UIEvent<HTMLElement>) => {
    const container = event.currentTarget;
    const nextIndex = Math.round(container.scrollTop / Math.max(container.clientHeight, 1));
    const boundedIndex = Math.max(0, Math.min(orderedListings.length - 1, nextIndex));
    const deferredListings = deferUnreadyVideoAtIndex({
      listings: orderedListings,
      index: boundedIndex,
      activeIndex,
      videoReadinessByUrl
    });

    if (deferredListings) {
      setOrderedListings(deferredListings);
      setActiveIndex(Math.max(0, Math.min(deferredListings.length - 1, boundedIndex)));
      if (boundedIndex >= orderedListings.length - 6) {
        onNearEnd?.();
      }
      return;
    }

    setActiveIndex((current) => (current === boundedIndex ? current : boundedIndex));

    if (boundedIndex >= orderedListings.length - 6) {
      onNearEnd?.();
    }
  };

  return (
    <section
      ref={containerRef}
      className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black"
      onScroll={handleScroll}
    >
      <FeedVideoPreloader
        targets={preloadTargets}
        onReadinessChange={updateVideoReadiness}
      />
      {orderedListings.map((listing, index) => {
        const primaryVideo = getListingPrimaryVideo(listing);

        return (
          <ListingCard
            key={listing.id}
            listing={listing}
            currentUserId={currentUserId}
            isActive={index === activeIndex}
            mediaPreloadMode={getFeedMediaPreloadMode(index, activeIndex, {
              hasVideo: Boolean(primaryVideo)
            })}
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
        );
      })}
      {isLoadingMore ? (
        <div className="grid h-24 place-items-center bg-black text-xs font-black uppercase tracking-[0.14em] text-white/42">
          Loading more deals
        </div>
      ) : null}
    </section>
  );
}

function reconcileOrderedListings(current: CarListing[], next: CarListing[]) {
  const nextById = new Map(next.map((listing) => [listing.id, listing]));
  const reconciled = current
    .map((listing) => nextById.get(listing.id))
    .filter((listing): listing is CarListing => Boolean(listing));
  const reconciledIds = new Set(reconciled.map((listing) => listing.id));
  const additions = next.filter((listing) => !reconciledIds.has(listing.id));

  return [...reconciled, ...additions];
}

function deferUnreadyVideoAtIndex({
  listings,
  index,
  activeIndex,
  videoReadinessByUrl
}: {
  listings: CarListing[];
  index: number;
  activeIndex: number;
  videoReadinessByUrl: Record<string, FeedVideoReadiness>;
}) {
  if (index <= activeIndex || index >= listings.length - 1) {
    return null;
  }

  const listing = listings[index];
  if (!listing) return null;

  const video = getListingPrimaryVideo(listing);
  if (!video?.url) return null;

  const deferralSlots = getVideoDeferralSlots(listing, videoReadinessByUrl[video.url]);
  if (deferralSlots <= 0) return null;

  const nextListings = [...listings];
  const [deferredListing] = nextListings.splice(index, 1);
  if (!deferredListing) return null;

  const insertionIndex = Math.min(nextListings.length, index + deferralSlots);
  nextListings.splice(insertionIndex, 0, deferredListing);

  return nextListings;
}
