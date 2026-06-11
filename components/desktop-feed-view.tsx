"use client";

import type { ReactNode } from "react";
import type { UIEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  HandCoins,
  MapPin,
  MessageCircle,
  PhoneCall,
  Send,
  Sparkles
} from "lucide-react";
import { AiVoiceControl } from "@/components/ai-voice-control";
import { DealGradeBadge } from "@/components/deal-grade";
import { FeedChromeToggle } from "@/components/feed-chrome-toggle";
import { FeedVideoPreloader } from "@/components/feed-video-preloader";
import { ListingDisclosureBadges } from "@/components/listing-disclosure-badges";
import type { CarListing } from "@/data/listings";
import { useAiVoiceTake } from "@/hooks/use-ai-voice-take";
import { formatCurrency, formatMileage } from "@/lib/format";
import { getListingConfidence } from "@/lib/listing-confidence";
import {
  getContactHref,
  getLocationLabel,
  getSellerDisplayLabel
} from "@/lib/listing-display";
import { getFeedMediaPreloadMode } from "@/lib/feed-ranking";
import type { MediaPreloadMode } from "@/lib/feed-ranking";
import {
  areVideoReadinessStatesEquivalent,
  collectFeedVideoPreloadTargets,
  getListingPrimaryVideo,
  type FeedVideoReadiness
} from "@/lib/feed-video-readiness";
import { canMakeOffer } from "@/lib/offers";
import { shareListing } from "@/lib/share-listing";
import { MediaReel } from "@/src/components/MediaReel";

export function DesktopFeedView({
  navigation,
  listings,
  focusListingId,
  onFocusListingHandled,
  searchQuery = "",
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
  navigation: ReactNode;
  listings: CarListing[];
  focusListingId?: string | null;
  onFocusListingHandled?: () => void;
  searchQuery?: string;
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
  const [, setVideoReadinessByUrl] = useState<
    Record<string, FeedVideoReadiness>
  >({});
  const postRefs = useRef<Array<HTMLElement | null>>([]);
  const preloadTargets = useMemo(
    () => collectFeedVideoPreloadTargets(listings, activeIndex),
    [activeIndex, listings]
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
    setActiveIndex(0);
    postRefs.current = [];
  }, [listings]);

  useEffect(() => {
    if (!focusListingId) return;

    const index = listings.findIndex((listing) => listing.id === focusListingId);

    if (index < 0) {
      onFocusListingHandled?.();
      return;
    }

    postRefs.current[index]?.scrollIntoView({ block: "start", behavior: "auto" });
    setActiveIndex(index);
    onFocusListingHandled?.();
  }, [focusListingId, listings, onFocusListingHandled]);

  const handleScroll = (event: UIEvent<HTMLElement>) => {
    const container = event.currentTarget;
    const containerTop = container.getBoundingClientRect().top;
    let nextIndex = activeIndex;
    let closestDistance = Number.POSITIVE_INFINITY;

    postRefs.current.forEach((post, index) => {
      if (!post) return;

      const distance = Math.abs(post.getBoundingClientRect().top - containerTop - 16);

      if (distance < closestDistance) {
        closestDistance = distance;
        nextIndex = index;
      }
    });

    setActiveIndex((current) => (current === nextIndex ? current : nextIndex));

    if (container.scrollHeight - container.scrollTop - container.clientHeight < container.clientHeight * 1.6) {
      onNearEnd?.();
    }
  };

  if (!listings.length) {
    const hasSearch = Boolean(searchQuery.trim());

    return (
      <section className="grid h-full place-items-center px-6 py-6">
        <div className="max-w-md rounded-[32px] border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_24px_90px_rgba(0,0,0,0.35)]">
          <Sparkles className="mx-auto h-8 w-8 text-cyan-200" />
          <h2 className="mt-4 text-2xl font-black">
            {hasSearch ? "No matches found" : "No listings yet"}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-white/56">
            {hasSearch
              ? "Try a make, model, location, price, or seller type from the loaded feed."
              : "Add a seller video or import a snapshot to start the CarIndex.ai feed."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative h-full overflow-hidden px-6">
      <FeedVideoPreloader
        targets={preloadTargets}
        onReadinessChange={updateVideoReadiness}
      />
      {!feedChromeHidden ? (
        <div className="absolute left-[max(1.5rem,calc(50%_-_360px))] top-1/2 z-30 h-[min(560px,calc(100dvh-150px))] -translate-y-1/2">
          {navigation}
        </div>
      ) : null}
      <div
        className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth"
        onScroll={handleScroll}
      >
        <div className="h-full">
          {listings.map((listing, index) => (
            <DesktopFeedPost
              key={listing.id}
              refCallback={(node) => {
                postRefs.current[index] = node;
              }}
              listing={listing}
              currentUserId={currentUserId}
              isActive={index === activeIndex}
              mediaPreloadMode={getFeedMediaPreloadMode(index, activeIndex, {
                hasVideo: Boolean(getListingPrimaryVideo(listing))
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
              onFocus={() => setActiveIndex(index)}
            />
          ))}
          {isLoadingMore ? (
            <div className="py-6 text-center text-xs font-black uppercase tracking-[0.14em] text-white/32">
              Loading more deals
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DesktopFeedPost({
  listing,
  currentUserId,
  isActive,
  mediaPreloadMode,
  feedChromeHidden,
  onFeedChromeHiddenChange,
  isSaved,
  refCallback,
  onToggleSaved,
  onOpenAnalysis,
  onOpenOffer,
  onOpenGallery,
  onOpenDescription,
  notificationAction,
  onFocus
}: {
  listing: CarListing;
  currentUserId?: string;
  isActive: boolean;
  mediaPreloadMode: MediaPreloadMode;
  feedChromeHidden: boolean;
  onFeedChromeHiddenChange: (hidden: boolean) => void;
  isSaved: boolean;
  refCallback: (node: HTMLElement | null) => void;
  onToggleSaved: () => void;
  onOpenAnalysis: () => void;
  onOpenOffer: () => void;
  onOpenGallery: (initialIndex: number) => void;
  onOpenDescription: () => void;
  notificationAction?: ReactNode;
  onFocus: () => void;
}) {
  const isSellerReel =
    listing.sourceMode === "user" ||
    listing.tags.includes("user-upload") ||
    listing.mediaItems.some((item) => item.type === "video");
  const contactHref = getContactHref(listing);
  const contactIsExternal = contactHref?.startsWith("http");
  const offerEnabled = canMakeOffer(listing, currentUserId);
  const shouldPrepareAiVoice = isActive || mediaPreloadMode === "auto";
  const { aiVoice, isAiVoiceEligible, isAiVoiceLoading } = useAiVoiceTake(listing, {
    isActive,
    shouldPrepare: shouldPrepareAiVoice
  });
  const confidenceRead = getListingConfidence(listing);
  const cardHeightClassName = feedChromeHidden
    ? "h-[clamp(620px,calc(100dvh-56px),900px)]"
    : "h-[clamp(560px,calc(100dvh-230px),800px)]";

  return (
    <article
      ref={refCallback}
      className={`desktop-feed-post flex h-full min-h-full snap-start snap-always items-center justify-center transition duration-300 ${
        isActive ? "desktop-feed-post-active" : ""
      }`}
      onMouseEnter={onFocus}
      onFocus={onFocus}
    >
      <div className="relative w-[min(58vw,450px)] max-w-[450px]">
        <div
          className={`desktop-feed-card ${feedChromeHidden ? "feed-chrome-hidden" : ""} relative ${cardHeightClassName} w-full overflow-hidden rounded-[24px] bg-black shadow-[0_30px_90px_rgba(0,0,0,0.55)] ${
            isSellerReel ? "desktop-seller-feed-card" : ""
          }`}
        >
          <MediaReel
            mediaItems={listing.mediaItems}
            imageUrls={listing.imageUrls}
            captions={listing.reelCaptions}
            isActive={isActive}
            preloadMode={mediaPreloadMode}
            chromeHidden={feedChromeHidden}
            onOpenGallery={onOpenGallery}
            layout={isSellerReel ? "seller" : "market"}
          />

          <FeedChromeToggle
            hidden={feedChromeHidden}
            onChange={onFeedChromeHiddenChange}
            className="absolute bottom-5 right-5 z-40"
          />
          {isAiVoiceEligible ? (
            <AiVoiceControl
              aiVoice={aiVoice}
              isActive={isActive}
              isLoading={isAiVoiceLoading}
              shouldPreload={shouldPrepareAiVoice}
              className={`absolute right-4 z-30 ${
                feedChromeHidden ? "top-11" : "top-28"
              }`}
            />
          ) : null}

          {!feedChromeHidden ? (
            <div className="pointer-events-none absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-3">
              <span className="inline-flex max-w-[58%] items-center gap-2 rounded-full bg-black/42 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/86 shadow-lg backdrop-blur-2xl">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-200" />
                <span className="truncate">{listing.feedBadge}</span>
              </span>
              <DealGradeBadge grade={confidenceRead.grade} label />
            </div>
          ) : null}

          {!feedChromeHidden ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.48)_30%,rgba(0,0,0,0.94)_100%)] px-5 pb-5 pt-14">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <DesktopOverlayPill icon={<MapPin className="h-3.5 w-3.5" />}>
                  {getLocationLabel(listing)}
                </DesktopOverlayPill>
                <DesktopOverlayPill icon={<Sparkles className="h-3.5 w-3.5" />}>
                  {confidenceRead.shortLabel}
                </DesktopOverlayPill>
              </div>
              <ListingDisclosureBadges listing={listing} max={3} compact className="mb-2" />
              <h2 className="max-w-[330px] text-[30px] font-black leading-[0.96] text-white">
                {listing.year} {listing.make} {listing.model}
              </h2>
              <p className="mt-1 line-clamp-1 text-sm font-semibold text-white/54">
                {listing.trim}
              </p>
              <div className="mt-3 flex items-end gap-2.5">
                <p className="text-[30px] font-black leading-none text-white">
                  {formatCurrency(listing.price)}
                </p>
                <span className="rounded-full bg-white/12 px-2.5 py-1 text-xs font-black text-white/72 backdrop-blur-xl">
                  {formatMileage(listing.mileage)}
                </span>
              </div>
            </div>
          ) : null}

          {feedChromeHidden ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.16)_24%,rgba(0,0,0,0.74)_100%)] px-5 pb-5 pt-20">
              <div className="max-w-[calc(100%-4.25rem)]">
                <h2 className="line-clamp-1 text-[20px] font-black leading-tight text-white drop-shadow">
                  {listing.year} {listing.make} {listing.model}
                </h2>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <span className="text-[24px] font-black leading-none text-white drop-shadow">
                    {formatCurrency(listing.price)}
                  </span>
                  <span className="rounded-full bg-black/36 px-2.5 py-1 text-xs font-black text-white/72 backdrop-blur-xl">
                    {formatMileage(listing.mileage)}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {!feedChromeHidden ? (
          <DesktopAiTeaser
            listing={listing}
            onOpenAnalysis={onOpenAnalysis}
          />
        ) : null}

        {!feedChromeHidden ? (
          <div className="absolute left-[calc(100%+18px)] top-1/2 flex w-14 -translate-y-1/2 flex-col items-center gap-3">
            <DesktopReelAction
              label={isSaved ? "Saved" : "Save"}
              active={isSaved}
              icon={<Bookmark className={`h-5 w-5 ${isSaved ? "fill-black" : ""}`} />}
              onClick={onToggleSaved}
            />
            <DesktopReelAction
              label="Share"
              icon={<Send className="h-5 w-5" />}
              onClick={() => void shareListing(listing)}
            />
            {offerEnabled ? (
              <DesktopReelAction
                label="Offer"
                icon={<HandCoins className="h-5 w-5" />}
                onClick={onOpenOffer}
              />
            ) : contactHref ? (
              <DesktopReelActionLink
                label="Contact"
                href={contactHref}
                external={contactIsExternal}
                icon={<PhoneCall className="h-5 w-5" />}
              />
            ) : (
              <DesktopReelAction
                label="Contact"
                icon={<MessageCircle className="h-5 w-5" />}
                onClick={onOpenAnalysis}
              />
            )}
            <DesktopReelAction
              label="AI"
              icon={<Sparkles className="h-5 w-5" />}
              onClick={onOpenAnalysis}
            />
            {notificationAction}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DesktopAiTeaser({
  listing,
  onOpenAnalysis
}: {
  listing: CarListing;
  onOpenAnalysis: () => void;
}) {
  const confidenceRead = getListingConfidence(listing);

  return (
    <button
      type="button"
      className="mt-3 block w-full rounded-[22px] bg-white/[0.055] p-3 text-left shadow-[0_18px_56px_rgba(0,0,0,0.24)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-white/[0.075] active:scale-[0.99]"
      onClick={onOpenAnalysis}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/56">
            AI analysis
          </p>
          <p className="mt-1 line-clamp-1 text-sm font-bold leading-5 text-white/78">
            {listing.aiTake}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-black">
          View
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <CompactScoutStat label="Read" value={`${confidenceRead.score}%`} />
        <CompactScoutStat label="Media" value={confidenceRead.mediaLabel} />
        <CompactScoutStat label="Pricing" value={confidenceRead.pricingLabel} />
      </div>
    </button>
  );
}

function DesktopInsightPanel({
  listing,
  currentUserId,
  isSaved,
  onToggleSaved,
  onOpenAnalysis,
  onOpenOffer,
  onOpenDescription
}: {
  listing: CarListing;
  currentUserId?: string;
  isSaved: boolean;
  onToggleSaved: () => void;
  onOpenAnalysis: () => void;
  onOpenOffer: () => void;
  onOpenDescription: () => void;
}) {
  const contactHref = getContactHref(listing);
  const contactIsExternal = contactHref?.startsWith("http");
  const offerEnabled = canMakeOffer(listing, currentUserId);
  const confidenceRead = getListingConfidence(listing);

  return (
    <aside className="flex min-h-0 flex-col self-center rounded-[30px] bg-white/[0.045] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/54">
            AI scout
          </p>
          <h2 className="mt-2 text-xl font-black leading-tight text-white">
            {listing.year} {listing.make} {listing.model}
          </h2>
          <p className="mt-1 line-clamp-1 text-sm font-semibold text-white/50">
            {getSellerDisplayLabel(listing)}
          </p>
        </div>
        <DealGradeBadge grade={confidenceRead.grade} compact />
      </div>

      <div className="mt-4 rounded-[24px] bg-black/24 p-4">
        <p className="text-[14px] font-bold leading-6 text-white/84">{listing.aiTake}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <CompactScoutStat label="Read" value={`${confidenceRead.score}%`} />
        <CompactScoutStat label="Media" value={confidenceRead.mediaLabel} />
        <CompactScoutStat label="Pricing" value={confidenceRead.pricingLabel} />
        <CompactScoutStat label="Seller" value={getSellerDisplayLabel(listing)} />
      </div>

      <button
        type="button"
        className="mt-4 rounded-full bg-white px-4 py-3 text-sm font-black text-black shadow-[0_14px_34px_rgba(255,255,255,0.1)] transition hover:bg-cyan-100 active:scale-[0.98]"
        onClick={onOpenAnalysis}
      >
        View AI Analysis
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-full bg-white/[0.06] px-3 py-2.5 text-xs font-black text-white/68 transition hover:bg-white/[0.1] hover:text-white active:scale-[0.98]"
          onClick={onOpenDescription}
        >
          Seller notes
        </button>
        {offerEnabled ? (
          <button
            type="button"
            className="rounded-full bg-white/[0.06] px-3 py-2.5 text-xs font-black text-white/68 transition hover:bg-white/[0.1] hover:text-white active:scale-[0.98]"
            onClick={onOpenOffer}
          >
            Make offer
          </button>
        ) : contactHref ? (
          <a
            href={contactHref}
            target={contactIsExternal ? "_blank" : undefined}
            rel={contactIsExternal ? "noreferrer" : undefined}
            className="rounded-full bg-white/[0.06] px-3 py-2.5 text-center text-xs font-black text-white/68 transition hover:bg-white/[0.1] hover:text-white active:scale-[0.98]"
          >
            Contact
          </a>
        ) : (
          <button
            type="button"
            className="rounded-full bg-white/[0.06] px-3 py-2.5 text-xs font-black text-white/68 transition hover:bg-white/[0.1] hover:text-white active:scale-[0.98]"
            onClick={onOpenAnalysis}
          >
            Contact
          </button>
        )}
      </div>

      {listing.redFlags[0] ? (
        <p className="mt-4 text-xs font-semibold leading-5 text-white/42">
          Watch: {listing.redFlags[0]}
        </p>
      ) : null}
    </aside>
  );
}

function DesktopOverlayPill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-full bg-black/36 px-2.5 text-[11px] font-black text-white/84 shadow-lg backdrop-blur-2xl">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function CompactScoutStat({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-black/20 px-3 py-2.5">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/30">{label}</p>
      <p className="mt-1 line-clamp-1 text-xs font-black text-white/84">{value}</p>
    </div>
  );
}

function DesktopReelAction({
  label,
  icon,
  active = false,
  onClick
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`group grid h-12 w-12 place-items-center rounded-full shadow-[0_14px_34px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition hover:-translate-y-0.5 active:scale-95 ${
        active
          ? "bg-white text-black"
          : "bg-white/10 text-white hover:bg-white/18"
      }`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

function DesktopReelActionLink({
  label,
  icon,
  href,
  external = false
}: {
  label: string;
  icon: ReactNode;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="group grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white shadow-[0_14px_34px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-white/18 active:scale-95"
      aria-label={label}
      title={label}
    >
      {icon}
    </a>
  );
}
