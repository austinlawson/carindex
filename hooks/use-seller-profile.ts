"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { SellerType } from "@/data/listings";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type SellerProfile = {
  displayName: string;
  sellerType: SellerType;
  location: string;
  phone: string;
  email: string;
};

export const defaultSellerProfile: SellerProfile = {
  displayName: "Austin",
  sellerType: "Private Seller",
  location: "Ozark, AL",
  phone: "",
  email: ""
};

export function useSellerProfile(user?: User | null) {
  const [profile, setProfileState] = useState<SellerProfile>(defaultSellerProfile);
  const [isRemoteProfile, setIsRemoteProfile] = useState(false);

  useEffect(() => {
    if (!user) {
      setProfileState(defaultSellerProfile);
      setIsRemoteProfile(false);
      return;
    }

    const authenticatedUser = user;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const client = supabase;

    let cancelled = false;

    async function loadProfile() {
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("id", authenticatedUser.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setIsRemoteProfile(false);
        return;
      }

      if (data) {
        setProfileState(
          normalizeProfile({
            displayName: data.display_name,
            sellerType: data.seller_type,
            location: data.location,
            phone: data.phone,
            email: data.email
          })
        );
      } else {
        const nextProfile = normalizeProfile({
          ...defaultSellerProfile,
          displayName: authenticatedUser.email?.split("@")[0] ?? defaultSellerProfile.displayName,
          email: authenticatedUser.email ?? ""
        });

        await client.from("profiles").insert({
          id: authenticatedUser.id,
          display_name: nextProfile.displayName,
          seller_type: nextProfile.sellerType,
          location: nextProfile.location,
          phone: nextProfile.phone || null,
          email: nextProfile.email || authenticatedUser.email || null
        });

        setProfileState(nextProfile);
      }

      setIsRemoteProfile(true);
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const setProfile = useCallback((updates: Partial<SellerProfile>) => {
    setProfileState((current) => {
      const nextProfile = normalizeProfile({ ...current, ...updates });

      if (user) {
        const supabase = createSupabaseBrowserClient();
        void supabase?.from("profiles").upsert({
          id: user.id,
          display_name: nextProfile.displayName,
          seller_type: nextProfile.sellerType,
          location: nextProfile.location,
          phone: nextProfile.phone || null,
          email: nextProfile.email || user.email || null
        });
      }

      return nextProfile;
    });
  }, [user]);

  return {
    profile,
    setProfile,
    isRemoteProfile
  };
}

function normalizeProfile(value: unknown): SellerProfile {
  const input = value && typeof value === "object" ? (value as Partial<SellerProfile>) : {};

  return {
    displayName: cleanString(input.displayName, defaultSellerProfile.displayName),
    sellerType: normalizeSellerType(input.sellerType),
    location: cleanString(input.location, defaultSellerProfile.location),
    phone: cleanString(input.phone, ""),
    email: cleanString(input.email, "")
  };
}

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeSellerType(value: unknown): SellerType {
  return value === "Dealer" || value === "Small Lot" || value === "Private Seller"
    ? value
    : defaultSellerProfile.sellerType;
}
