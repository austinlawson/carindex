"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CarListing } from "@/data/listings";
import {
  applyFeedInterestEvent,
  createFeedInterestState,
  feedInterestAnonymousIdKey,
  feedInterestStorageKey,
  normalizeFeedInterestState,
  snapshotListingForInterest,
  type FeedInterestEventInput,
  type FeedInterestEventType,
  type FeedInterestState
} from "@/lib/feed-interest";

type ActiveListingSession = {
  listing: CarListing;
  startedAt: number;
};

type QueuedInterestEvent = FeedInterestEventInput & {
  metadata?: Record<string, unknown>;
};

const longViewMs = 8_000;
const minimumDwellMs = 1_200;
const networkFlushDelayMs = 2_500;
const maxBatchSize = 25;

export function useFeedInterest(userId?: string) {
  const [rankingInterestState, setRankingInterestState] = useState<FeedInterestState | null>(null);
  const stateRef = useRef<FeedInterestState | null>(null);
  const activeRef = useRef<ActiveListingSession | null>(null);
  const pendingEventsRef = useRef<QueuedInterestEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const userIdRef = useRef(userId);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    const anonymousId = readOrCreateAnonymousId();
    const loadedState = readStoredInterestState(anonymousId);
    stateRef.current = loadedState;
    setRankingInterestState(loadedState);

    const handlePageHide = () => {
      flushActiveListingDwell();
      persistInterestState(stateRef.current);
      flushInterestEvents({ keepalive: true });
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      handlePageHide();
      window.removeEventListener("pagehide", handlePageHide);
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  const enqueueNetworkEvent = useCallback((event: QueuedInterestEvent) => {
    pendingEventsRef.current = [...pendingEventsRef.current, event].slice(-100);

    if (pendingEventsRef.current.length >= maxBatchSize) {
      void flushInterestEvents();
      return;
    }

    if (flushTimerRef.current === null) {
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        void flushInterestEvents();
      }, networkFlushDelayMs);
    }
  }, []);

  const trackListingEvent = useCallback(
    (
      listing: CarListing,
      type: FeedInterestEventType,
      options: { dwellMs?: number; metadata?: Record<string, unknown> } = {}
    ) => {
      const currentState = stateRef.current ?? createFeedInterestState(readOrCreateAnonymousId());
      const event: QueuedInterestEvent = {
        type,
        listingId: listing.id,
        occurredAt: new Date().toISOString(),
        dwellMs: options.dwellMs,
        metadata: options.metadata,
        listingSnapshot: snapshotListingForInterest(listing)
      };

      const nextState = applyFeedInterestEvent(currentState, event);
      stateRef.current = nextState;
      persistInterestState(nextState);
      enqueueNetworkEvent(event);
    },
    [enqueueNetworkEvent]
  );

  const flushActiveListingDwell = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;

    const dwellMs = Date.now() - active.startedAt;
    if (dwellMs >= minimumDwellMs) {
      trackListingEvent(active.listing, "dwell", { dwellMs });
    }
    if (dwellMs >= longViewMs) {
      trackListingEvent(active.listing, "long_view", { dwellMs });
    }
  }, [trackListingEvent]);

  const markActiveListing = useCallback(
    (listing: CarListing) => {
      const active = activeRef.current;
      if (active?.listing.id === listing.id) return;

      flushActiveListingDwell();

      const currentState = stateRef.current;
      const previousSignal = currentState?.listings[listing.id];
      const isBacktrack = Boolean(
        previousSignal?.lastViewedAt &&
          active &&
          previousSignal.listingId !== active.listing.id
      );

      activeRef.current = {
        listing,
        startedAt: Date.now()
      };

      trackListingEvent(listing, previousSignal ? (isBacktrack ? "scroll_back" : "revisit") : "view");
    },
    [flushActiveListingDwell, trackListingEvent]
  );

  const value = useMemo(
    () => ({
      rankingInterestState,
      markActiveListing,
      trackListingEvent,
      flushActiveListingDwell
    }),
    [flushActiveListingDwell, markActiveListing, rankingInterestState, trackListingEvent]
  );

  return value;

  async function flushInterestEvents(options: { keepalive?: boolean } = {}) {
    const events = pendingEventsRef.current.splice(0, maxBatchSize);
    if (events.length === 0) return;

    const state = stateRef.current;
    const anonymousId = state?.anonymousId ?? readOrCreateAnonymousId();
    const headers: Record<string, string> = {
      "content-type": "application/json"
    };

    if (!options.keepalive && userIdRef.current) {
      const supabase = createSupabaseBrowserClient();
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (token) {
        headers.authorization = `Bearer ${token}`;
      }
    }

    try {
      await fetch("/api/listings/interest", {
        method: "POST",
        headers,
        body: JSON.stringify({ anonymousId, events }),
        keepalive: Boolean(options.keepalive)
      });
    } catch {
      // Local state is the source of truth for UX; server analytics can miss a batch.
    }
  }
}

function readStoredInterestState(anonymousId: string) {
  try {
    const raw = window.localStorage.getItem(feedInterestStorageKey);
    return normalizeFeedInterestState(raw ? JSON.parse(raw) : null, anonymousId);
  } catch {
    return createFeedInterestState(anonymousId);
  }
}

function persistInterestState(state: FeedInterestState | null) {
  if (!state) return;

  try {
    window.localStorage.setItem(feedInterestStorageKey, JSON.stringify(state));
  } catch {
    // Ignore quota/storage errors; tracking should never block browsing.
  }
}

function readOrCreateAnonymousId() {
  const existing = window.localStorage.getItem(feedInterestAnonymousIdKey);
  if (existing) return existing;

  const next =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(feedInterestAnonymousIdKey, next);
  return next;
}
