"use client";

import { useCallback, useEffect, useState } from "react";
import type { CarListing } from "@/data/listings";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ReviewDecision = "approve" | "reject";

type AdminReviewResponse = {
  isAdmin?: boolean;
  listings?: CarListing[];
  count?: number;
  error?: string;
};

type AdminReviewDecisionResponse = {
  ok?: boolean;
  listing?: CarListing;
  decision?: ReviewDecision;
  error?: string;
};

export function useAdminReviews(userId?: string) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [listings, setListings] = useState<CarListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    if (!userId) {
      setIsAdmin(false);
      setListings([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setIsAdmin(false);
        setListings([]);
        return;
      }

      const response = await fetch("/api/admin/reviews", {
        headers: {
          authorization: `Bearer ${token}`
        },
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => null)) as AdminReviewResponse | null;

      if (response.status === 403) {
        setIsAdmin(false);
        setListings([]);
        return;
      }

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not load admin review queue.");
      }

      setIsAdmin(Boolean(payload?.isAdmin));
      setListings(payload?.listings ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load admin review queue.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadReviews();

    if (!userId) return;

    const interval = window.setInterval(() => {
      void loadReviews();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [loadReviews, userId]);

  const decideReview = useCallback(
    async ({
      listingId,
      decision,
      notes
    }: {
      listingId: string;
      decision: ReviewDecision;
      notes: string;
    }) => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Sign in as an admin before reviewing listings.");
      }

      const response = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ listingId, decision, notes })
      });
      const payload = (await response.json().catch(() => null)) as AdminReviewDecisionResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save review decision.");
      }

      setListings((current) => current.filter((listing) => listing.id !== listingId));
      return payload?.listing ?? null;
    },
    []
  );

  return {
    isAdmin,
    listings,
    pendingCount: listings.length,
    loading,
    error,
    reload: loadReviews,
    decideReview
  };
}

async function getAccessToken() {
  const supabase = createSupabaseBrowserClient();
  const session = await supabase?.auth.getSession();
  return session?.data.session?.access_token ?? null;
}
