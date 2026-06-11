import type { CarListing } from "@/data/listings";
import { hasJunkMediaSignal, hasMediaMismatch, hasVerifiedVehicleMedia } from "@/lib/media-verification";

const longVideoFallbackSeconds = 95;

export type MediaPreloadMode = "none" | "metadata" | "auto";

export function rankFeedListings(listings: CarListing[]) {
  return listings
    .map((listing, index) => ({
      listing,
      index,
      sourceRank: getSourceRank(listing),
      trustRank: getTrustRank(listing),
      mediaRank: getMediaRank(listing)
    }))
    .sort((left, right) => {
      if (left.sourceRank !== right.sourceRank) {
        return left.sourceRank - right.sourceRank;
      }

      if (left.trustRank !== right.trustRank) {
        return left.trustRank - right.trustRank;
      }

      if (left.mediaRank !== right.mediaRank) {
        return left.mediaRank - right.mediaRank;
      }

      return left.index - right.index;
    })
    .map(({ listing }) => listing);
}

export function getFeedMediaPreloadMode(index: number, activeIndex: number): MediaPreloadMode {
  const distanceFromActive = index - activeIndex;

  if (distanceFromActive === 0) {
    return "auto";
  }

  if (distanceFromActive > 0 && distanceFromActive <= 3) {
    return "auto";
  }

  if (distanceFromActive > 3 && distanceFromActive <= 5) {
    return "metadata";
  }

  if (distanceFromActive < 0 && distanceFromActive >= -1) {
    return "metadata";
  }

  return "none";
}

function isOrganicListing(listing: CarListing) {
  return (
    listing.sourceMode === "user" ||
    listing.tags.includes("user-upload") ||
    /seller upload/i.test(listing.sourceName ?? "")
  );
}

function getSourceRank(listing: CarListing) {
  if (hasMediaMismatch(listing) || hasJunkMediaSignal(listing)) return 3;
  return isOrganicListing(listing) ? 0 : 1;
}

function getTrustRank(listing: CarListing) {
  if (hasMediaMismatch(listing) || hasJunkMediaSignal(listing)) return 9;
  if (isOrganicListing(listing) && hasVerifiedVehicleMedia(listing)) return 0;
  if (isOrganicListing(listing)) return 2;
  return 3;
}

function getMediaRank(listing: CarListing) {
  const videoDurations = listing.mediaItems
    .filter((item) => item.type === "video")
    .map((item) => item.durationSeconds)
    .filter((duration): duration is number => typeof duration === "number" && Number.isFinite(duration) && duration > 0);

  if (videoDurations.length === 0) {
    return listing.mediaItems.some((item) => item.type === "video")
      ? getVideoDurationRank(longVideoFallbackSeconds)
      : 0;
  }

  return getVideoDurationRank(Math.max(...videoDurations));
}

function getVideoDurationRank(durationSeconds: number) {
  if (durationSeconds <= 20) return 1;
  if (durationSeconds <= 45) return 2;
  if (durationSeconds <= 90) return 3;
  return 4;
}
