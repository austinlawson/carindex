"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function useSavedCars(userId?: string) {
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) {
      setSavedIds([]);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const client = supabase;
    const authenticatedUserId = userId;
    let cancelled = false;

    async function loadSavedCars() {
      const { data, error } = await client
        .from("saved_listings")
        .select("listing_id")
        .eq("user_id", authenticatedUserId);

      if (cancelled) return;

      if (!error) {
        setSavedIds((data ?? []).map((row) => row.listing_id));
      }
    }

    void loadSavedCars();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isSaved = useCallback(
    (id: string) => savedIds.includes(id),
    [savedIds]
  );

  const toggleSaved = useCallback(
    (id: string) => {
      if (!userId) return;

      const wasSaved = savedIds.includes(id);
      setSavedIds((current) =>
        wasSaved ? current.filter((savedId) => savedId !== id) : [...current, id]
      );

      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;

      if (wasSaved) {
        void supabase
          .from("saved_listings")
          .delete()
          .eq("user_id", userId)
          .eq("listing_id", id);
      } else {
        void supabase.from("saved_listings").upsert(
          {
            user_id: userId,
            listing_id: id
          },
          { onConflict: "user_id,listing_id" }
        );
      }
    },
    [savedIds, userId]
  );

  return {
    savedIds,
    isSaved,
    toggleSaved
  };
}
