"use client";

import { useEffect, useRef, useState } from "react";
import type { CarListing, ListingAiVoice } from "@/data/listings";
import { isCurrentAiVoice } from "@/lib/ai-voice";

type AiVoiceResponse = {
  aiVoice?: ListingAiVoice;
};

export function useAiVoiceTake(
  listing: CarListing,
  {
    isActive,
    shouldPrepare = isActive
  }: {
    isActive: boolean;
    shouldPrepare?: boolean;
  }
) {
  const currentListingAiVoice = isCurrentAiVoice(listing.aiVoice) ? listing.aiVoice : undefined;
  const [aiVoice, setAiVoice] = useState<ListingAiVoice | undefined>(currentListingAiVoice);
  const [isLoading, setIsLoading] = useState(false);
  const requestedListingIdsRef = useRef(new Set<string>());
  const isImageOnly = !listing.mediaItems.some((item) => item.type === "video");

  useEffect(() => {
    setAiVoice(currentListingAiVoice);
  }, [currentListingAiVoice, listing.id]);

  useEffect(() => {
    if (!shouldPrepare || !isImageOnly || aiVoice || requestedListingIdsRef.current.has(listing.id)) {
      return;
    }

    let cancelled = false;
    requestedListingIdsRef.current.add(listing.id);
    setIsLoading(true);

    async function generateAiVoiceTake() {
      try {
        const response = await fetch("/api/listings/ai-voice", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ listing }),
          cache: "no-store"
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as AiVoiceResponse;

        if (!cancelled && payload.aiVoice) {
          setAiVoice(payload.aiVoice);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void generateAiVoiceTake();

    return () => {
      cancelled = true;
    };
  }, [aiVoice, isImageOnly, listing, shouldPrepare]);

  return {
    aiVoice,
    isAiVoiceLoading: isLoading,
    isAiVoiceEligible: isImageOnly
  };
}
