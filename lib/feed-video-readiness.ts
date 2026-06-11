import type { CarListing, ListingMediaItem } from "@/data/listings";

export type FeedVideoPreloadTarget = {
  url: string;
  durationSeconds?: number;
};

export type FeedVideoReadiness = {
  url: string;
  durationSeconds: number;
  bufferedSeconds: number;
  bufferedRatio: number;
  readyState: number;
  canPlayThrough: boolean;
  error: boolean;
  updatedAt: number;
};

const maxPreloadTargets = 4;
const videoLookaheadListings = 12;
const readyBufferedRatio = 0.92;
const warmBufferedRatio = 0.8;

export function getListingPrimaryVideo(listing: CarListing): ListingMediaItem | undefined {
  return listing.mediaItems.find((item) => item.type === "video" && Boolean(item.url));
}

export function collectFeedVideoPreloadTargets(
  listings: CarListing[],
  activeIndex: number
): FeedVideoPreloadTarget[] {
  const targets: FeedVideoPreloadTarget[] = [];
  const seenUrls = new Set<string>();
  const startIndex = Math.max(0, activeIndex);
  const endIndex = Math.min(listings.length, startIndex + videoLookaheadListings);

  for (let index = startIndex; index < endIndex; index += 1) {
    const listing = listings[index];
    if (!listing) continue;

    const video = getListingPrimaryVideo(listing);
    if (!video?.url || seenUrls.has(video.url)) continue;

    seenUrls.add(video.url);
    targets.push({
      url: video.url,
      durationSeconds: video.durationSeconds
    });

    if (targets.length >= maxPreloadTargets) {
      break;
    }
  }

  return targets;
}

export function readVideoElementReadiness(
  video: HTMLVideoElement,
  target: FeedVideoPreloadTarget,
  canPlayThrough = false,
  error = false
): FeedVideoReadiness {
  const durationSeconds =
    Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : target.durationSeconds ?? 0;
  const bufferedSeconds = getInitialBufferedSeconds(video);
  const bufferedRatio =
    durationSeconds > 0 ? Math.max(0, Math.min(1, bufferedSeconds / durationSeconds)) : 0;

  return {
    url: target.url,
    durationSeconds,
    bufferedSeconds,
    bufferedRatio,
    readyState: video.readyState,
    canPlayThrough,
    error,
    updatedAt: Date.now()
  };
}

export function isFeedVideoBasicallyReady(state: FeedVideoReadiness | undefined) {
  if (!state) return false;
  if (state.error) return true;
  if (state.canPlayThrough || state.readyState >= 4) return true;
  if (state.durationSeconds <= 0) return state.readyState >= 3;
  if (state.bufferedRatio >= readyBufferedRatio) return true;

  return state.readyState >= 3 && state.bufferedSeconds >= getReadyLeadSeconds(state.durationSeconds);
}

export function isFeedVideoWarm(state: FeedVideoReadiness | undefined) {
  if (!state) return false;
  if (isFeedVideoBasicallyReady(state)) return true;
  if (state.bufferedRatio >= warmBufferedRatio) return true;

  return state.readyState >= 3 && state.bufferedSeconds >= getWarmLeadSeconds(state.durationSeconds);
}

export function getVideoDeferralSlots(
  listing: CarListing,
  state: FeedVideoReadiness | undefined
) {
  const video = getListingPrimaryVideo(listing);
  if (!video || isFeedVideoBasicallyReady(state)) return 0;

  const durationSeconds = state?.durationSeconds || video.durationSeconds || 0;
  if (durationSeconds > 0 && durationSeconds <= 20 && state?.readyState && state.readyState >= 3) {
    return 0;
  }

  return isFeedVideoWarm(state) ? 2 : 4;
}

export function areVideoReadinessStatesEquivalent(
  left: FeedVideoReadiness | undefined,
  right: FeedVideoReadiness
) {
  if (!left) return false;

  return (
    left.readyState === right.readyState &&
    left.canPlayThrough === right.canPlayThrough &&
    left.error === right.error &&
    Math.round(left.bufferedRatio * 100) === Math.round(right.bufferedRatio * 100) &&
    Math.round(left.bufferedSeconds) === Math.round(right.bufferedSeconds)
  );
}

function getInitialBufferedSeconds(video: HTMLVideoElement) {
  const buffered = video.buffered;
  let bufferedEnd = 0;

  for (let index = 0; index < buffered.length; index += 1) {
    const start = buffered.start(index);
    const end = buffered.end(index);

    if (start <= 0.5) {
      bufferedEnd = Math.max(bufferedEnd, end);
    }
  }

  return bufferedEnd;
}

function getReadyLeadSeconds(durationSeconds: number) {
  return Math.min(30, Math.max(8, durationSeconds * 0.25));
}

function getWarmLeadSeconds(durationSeconds: number) {
  if (durationSeconds <= 0) return 10;

  return Math.min(20, Math.max(6, durationSeconds * 0.16));
}
