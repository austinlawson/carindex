"use client";

import { useState, type ReactNode } from "react";
import {
  Bookmark,
  HandCoins,
  MapPin,
  PhoneCall,
  Send,
  Sparkles
} from "lucide-react";
import { AiVoiceControl } from "@/components/ai-voice-control";
import { DealGradeBadge } from "@/components/deal-grade";
import { FeedChromeToggle } from "@/components/feed-chrome-toggle";
import { ListingDisclosureBadges } from "@/components/listing-disclosure-badges";
import { ShareListingSheet } from "@/components/share-listing-sheet";
import type { CarListing } from "@/data/listings";
import { useAiVoiceTake } from "@/hooks/use-ai-voice-take";
import {
  getContactHref,
  getListingNotes,
  getLocationLabel,
  getSellerDisplayLabel
} from "@/lib/listing-display";
import { getListingConfidence } from "@/lib/listing-confidence";
import { formatCurrency, formatMileage } from "@/lib/format";
import { canMakeOffer } from "@/lib/offers";
import { MediaReel } from "@/src/components/MediaReel";
import type { MediaPreloadMode } from "@/lib/feed-ranking";

export function ListingCard({
  listing,
  currentUserId,
  isActive,
  mediaPreloadMode = "metadata",
  feedChromeHidden,
  onFeedChromeHiddenChange,
  isSaved,
  onToggleSaved,
  onOpenAnalysis,
  onOpenOffer,
  onOpenGallery,
  onOpenDescription,
  notificationAction
}: {
  listing: CarListing;
  currentUserId?: string;
  isActive: boolean;
  mediaPreloadMode?: MediaPreloadMode;
  feedChromeHidden: boolean;
  onFeedChromeHiddenChange: (hidden: boolean) => void;
  isSaved: boolean;
  onToggleSaved: () => void;
  onOpenAnalysis: () => void;
  onOpenOffer: () => void;
  onOpenGallery: (initialIndex: number) => void;
  onOpenDescription: () => void;
  notificationAction?: ReactNode;
}) {
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const shouldPrepareAiVoice = isActive || mediaPreloadMode === "auto";
  const { aiVoice, isAiVoiceEligible, isAiVoiceLoading } = useAiVoiceTake(listing, {
    isActive,
    shouldPrepare: shouldPrepareAiVoice
  });
  const contactHref = getContactHref(listing);
  const contactIsExternal = contactHref?.startsWith("http");
  const sellerLabel = getSellerDisplayLabel(listing);
  const listingNotes = getListingNotes(listing);
  const confidenceRead = getListingConfidence(listing);
  const isSellerReel =
    listing.sourceMode === "user" ||
    listing.tags.includes("user-upload") ||
    listing.mediaItems.some((item) => item.type === "video");
  const offerEnabled = canMakeOffer(listing, currentUserId);
  const chromeToggleClassName = feedChromeHidden
    ? "absolute bottom-[calc(28px+env(safe-area-inset-bottom))] right-4 z-40"
    : "absolute bottom-[calc(96px+env(safe-area-inset-bottom))] right-4 z-40";

  return (
    <article
      className={`relative h-full min-h-full snap-start snap-always overflow-hidden bg-neutral-950 ${
        isSellerReel ? "seller-reel-card" : ""
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
        className={chromeToggleClassName}
      />
      {isAiVoiceEligible ? (
        <AiVoiceControl
          aiVoice={aiVoice}
          isActive={isActive}
          isLoading={isAiVoiceLoading}
          shouldPreload={shouldPrepareAiVoice}
          className={`absolute right-4 z-30 ${
            feedChromeHidden
              ? "top-[calc(env(safe-area-inset-top)+44px)]"
              : "top-[calc(env(safe-area-inset-top)+112px)]"
          }`}
        />
      ) : null}

      {!feedChromeHidden ? (
        <>
          <div className="pointer-events-none absolute bottom-[26%] left-0 h-px w-full bg-gradient-to-r from-transparent via-white/24 to-transparent" />

          <div className="feed-top-badge absolute left-4 top-[calc(env(safe-area-inset-top)+24px)] z-10 max-w-[calc(100%-118px)]">
            <span className="feed-badge-pill inline-flex max-w-full items-center gap-2 rounded-full border border-white/16 bg-black/46 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-200" />
              <span className="truncate">{listing.feedBadge}</span>
            </span>
          </div>

          <div className="feed-grade absolute right-4 top-[calc(env(safe-area-inset-top)+24px)] z-20">
            <DealGradeBadge grade={confidenceRead.grade} label />
          </div>
        </>
      ) : null}

      {!feedChromeHidden ? (
        <div className="feed-side-actions absolute right-3 top-[44%] z-30 flex -translate-y-1/2 flex-col items-center gap-3">
          <ReelAction
            label="Save"
            active={isSaved}
            onClick={onToggleSaved}
            icon={<Bookmark className={`h-5 w-5 ${isSaved ? "fill-black" : ""}`} />}
          />
          <ReelAction
            label="Share"
            onClick={() => setShareSheetOpen(true)}
            icon={<Send className="h-5 w-5" />}
          />
          {offerEnabled ? (
            <ReelAction
              label="Offer"
              onClick={onOpenOffer}
              icon={<HandCoins className="h-5 w-5" />}
            />
          ) : contactHref ? (
            <ReelActionLink
              label="Contact"
              href={contactHref}
              external={contactIsExternal}
              icon={<PhoneCall className="h-5 w-5" />}
            />
          ) : (
            <ReelAction
              label="Contact"
              onClick={onOpenAnalysis}
              icon={<PhoneCall className="h-5 w-5" />}
            />
          )}
          <ReelAction
            label="AI"
            onClick={onOpenAnalysis}
            icon={<Sparkles className="h-5 w-5" />}
          />
          {notificationAction}
        </div>
      ) : null}

      {!feedChromeHidden ? (
        <div
          className="feed-card-bottom absolute bottom-[calc(104px+env(safe-area-inset-bottom))] left-4 z-20"
          style={{ width: "calc(min(100vw, 390px) - 32px)" }}
        >
        <div className="feed-info-row mb-2.5 flex flex-wrap items-center gap-2 pr-16">
          <InfoPill icon={<MapPin className="h-3.5 w-3.5" />}>
            {getLocationLabel(listing)}
          </InfoPill>
          {!isSellerReel ? (
            <InfoPill icon={<Sparkles className="h-3.5 w-3.5" />}>
              {confidenceRead.shortLabel}
            </InfoPill>
          ) : null}
        </div>

        <div className="mb-2 pr-16">
          <ListingDisclosureBadges listing={listing} max={2} compact />
        </div>

        <h2 className="feed-title max-w-[285px] text-[28px] font-black leading-[0.94] tracking-normal">
          {listing.year} {listing.make} {listing.model}
        </h2>
        <p className="feed-trim mt-1 line-clamp-1 max-w-[270px] text-sm font-bold text-white/58">
          {listing.trim}
        </p>
        <p className="feed-seller mt-1 line-clamp-1 max-w-[270px] text-xs font-black uppercase tracking-[0.12em] text-white/44">
          {sellerLabel}
        </p>

        <div className="feed-price-row mt-2.5 flex items-center gap-2.5">
          <p className="feed-price text-[29px] font-black leading-none text-white drop-shadow">
            {formatCurrency(listing.price)}
          </p>
          <span className="feed-mileage rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-xs font-black text-white/64 backdrop-blur-xl">
            {formatMileage(listing.mileage)}
          </span>
        </div>

        {isSellerReel ? (
          <button
            type="button"
            className="seller-note-line mt-2 flex max-w-full items-baseline gap-1.5 text-left transition active:scale-[0.99]"
            onClick={onOpenDescription}
            aria-label="Read seller description"
          >
            <span className="line-clamp-1 min-w-0 text-[12px] font-semibold leading-snug text-white/58 drop-shadow">
              {listingNotes}
            </span>
            <span className="shrink-0 text-[11px] font-black text-white/84 drop-shadow">
              ...more
            </span>
          </button>
        ) : (
          <div className="feed-notes mt-3 max-w-[302px]">
            <div className="feed-notes-header mb-1 flex items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">
                Listing notes
              </span>
              <button
                type="button"
                className="rounded-full border border-white/10 bg-black/24 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-white/56 backdrop-blur-xl transition hover:text-white active:scale-95"
                onClick={onOpenDescription}
              >
                Read
              </button>
            </div>
            <button
              type="button"
              className="block text-left"
              onClick={onOpenDescription}
            >
              <p className="feed-notes-copy line-clamp-2 text-[13px] font-semibold leading-snug text-white/68 drop-shadow">
                {listingNotes}
              </p>
            </button>
          </div>
        )}
        </div>
      ) : null}

      {feedChromeHidden ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[24%] bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.18)_24%,rgba(0,0,0,0.74)_100%)]" />
          <div className="pointer-events-none absolute bottom-[calc(28px+env(safe-area-inset-bottom))] left-4 right-16 z-30">
            <h2 className="line-clamp-1 text-[18px] font-black leading-tight text-white drop-shadow">
              {listing.year} {listing.make} {listing.model}
            </h2>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[22px] font-black leading-none text-white drop-shadow">
                {formatCurrency(listing.price)}
              </span>
              <span className="rounded-full bg-black/36 px-2 py-0.5 text-[11px] font-black text-white/72 backdrop-blur-xl">
                {formatMileage(listing.mileage)}
              </span>
            </div>
          </div>
        </>
      ) : null}
      {shareSheetOpen ? (
        <ShareListingSheet
          listing={listing}
          onClose={() => setShareSheetOpen(false)}
        />
      ) : null}
    </article>
  );
}

function ReelAction({
  icon,
  label,
  active = false,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`feed-action-button group flex w-16 flex-col items-center gap-1 text-[8.5px] font-black uppercase tracking-[0.03em] transition ${
        active ? "text-black" : "text-white"
      }`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span
        className={`feed-action-icon grid h-12 w-12 place-items-center rounded-full border shadow-[0_14px_34px_rgba(0,0,0,0.42)] backdrop-blur-2xl transition group-active:scale-90 ${
          active
            ? "border-white bg-white"
            : "border-white/18 bg-black/48 text-white group-hover:bg-white/18"
        }`}
      >
        {icon}
      </span>
      <span
        className={`max-w-full truncate rounded-full px-1 py-0.5 ${
          active ? "bg-white" : "bg-black/30 text-white/86 backdrop-blur-xl"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function ReelActionLink({
  icon,
  label,
  href,
  external = false
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="feed-action-button group flex w-16 flex-col items-center gap-1 text-[8.5px] font-black uppercase tracking-[0.03em] text-white transition"
      aria-label={label}
    >
      <span className="feed-action-icon grid h-12 w-12 place-items-center rounded-full border border-white/18 bg-black/48 text-white shadow-[0_14px_34px_rgba(0,0,0,0.42)] backdrop-blur-2xl transition group-active:scale-90 group-hover:bg-white/18">
        {icon}
      </span>
      <span className="max-w-full truncate rounded-full bg-black/30 px-1 py-0.5 text-white/86 backdrop-blur-xl">
        {label}
      </span>
    </a>
  );
}

function InfoPill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="feed-info-pill inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-full border border-white/14 bg-black/36 px-2.5 text-[11px] font-black text-white/88 shadow-lg backdrop-blur-2xl">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
