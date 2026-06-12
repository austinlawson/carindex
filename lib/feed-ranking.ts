import type { CarListing } from "@/data/listings";
import { hasJunkMediaSignal, hasMediaMismatch, hasVerifiedVehicleMedia } from "@/lib/media-verification";
import {
  getDistanceSortValue,
  getListingFreshnessRank,
  getListingPersonalScore,
  type FeedInterestState
} from "@/lib/feed-interest";

const longVideoFallbackSeconds = 95;

export type MediaPreloadMode = "none" | "metadata" | "auto";

export function rankFeedListings(
  listings: CarListing[],
  options: { interestState?: FeedInterestState | null } = {}
) {
  return listings
    .map((listing, index) => ({
      listing,
      index,
      sourceRank: getSourceRank(listing),
      trustRank: getTrustRank(listing),
      freshnessRank: getListingFreshnessRank(listing, options.interestState),
      distanceRank: getDistanceSortValue(listing),
      personalScore: getListingPersonalScore(listing, options.interestState),
      mediaRank: getMediaRank(listing),
      qualityScore: getQualityScore(listing)
    }))
    .sort((left, right) => {
      if (left.sourceRank !== right.sourceRank) {
        return left.sourceRank - right.sourceRank;
      }

      if (left.trustRank !== right.trustRank) {
        return left.trustRank - right.trustRank;
      }

      if (left.freshnessRank !== right.freshnessRank) {
        return left.freshnessRank - right.freshnessRank;
      }

      if (left.distanceRank !== right.distanceRank) {
        return left.distanceRank - right.distanceRank;
      }

      if (left.personalScore !== right.personalScore) {
        return right.personalScore - left.personalScore;
      }

      if (left.mediaRank !== right.mediaRank) {
        return left.mediaRank - right.mediaRank;
      }

      if (left.qualityScore !== right.qualityScore) {
        return right.qualityScore - left.qualityScore;
      }

      return left.index - right.index;
    })
    .map(({ listing }) => listing);
}

export function getFeedMediaPreloadMode(
  index: number,
  activeIndex: number,
  options: { hasVideo?: boolean } = {}
): MediaPreloadMode {
  const distanceFromActive = index - activeIndex;
  const autoAheadDistance = options.hasVideo ? 8 : 3;
  const metadataAheadDistance = options.hasVideo ? 12 : 5;

  if (distanceFromActive === 0) {
    return "auto";
  }

  if (distanceFromActive > 0 && distanceFromActive <= autoAheadDistance) {
    return "auto";
  }

  if (distanceFromActive > autoAheadDistance && distanceFromActive <= metadataAheadDistance) {
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
      : 5;
  }

  return getVideoDurationRank(Math.max(...videoDurations));
}

function getVideoDurationRank(durationSeconds: number) {
  if (durationSeconds <= 20) return 0;
  if (durationSeconds <= 45) return 1;
  if (durationSeconds <= 90) return 2;
  return 3;
}

function getQualityScore(listing: CarListing) {
  let score = listing.confidence;
  score += getDealGradeScore(listing.dealGrade);
  score += Math.min(18, listing.mediaItems.length * 2);
  score += Math.min(12, listing.imageUrls.length);
  if (listing.price > 0) score += 8;
  if (listing.mileage > 0) score += 8;
  if (listing.contactUrl || listing.externalListingUrl || listing.sourceUrl) score += 5;
  if (listing.lastSeenAt) score += 5;
  return score;
}

function getDealGradeScore(grade: CarListing["dealGrade"]) {
  switch (grade) {
    case "A":
      return 24;
    case "A-":
      return 20;
    case "B+":
      return 16;
    case "B":
      return 12;
    case "C":
      return 4;
    case "Pass":
      return -20;
    default:
      return 0;
  }
}
