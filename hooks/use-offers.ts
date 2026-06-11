"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { formatCurrency } from "@/lib/format";
import type { OfferPaymentType, OfferRecord, OfferStatus } from "@/lib/offers";

type OfferRow = Database["public"]["Tables"]["offers"]["Row"];
type ListingSummaryRow = Pick<
  Database["public"]["Tables"]["listings"]["Row"],
  "id" | "year" | "make" | "model" | "seller_name" | "seller_type"
>;

export type CreateOfferInput = {
  listingId: string;
  listingTitle: string;
  sellerLabel: string;
  askingPrice: number;
  offerAmount: number;
  paymentType: OfferPaymentType;
  message: string;
};

export function useOffers(userId?: string) {
  const [offers, setOffers] = useState<OfferRecord[]>([]);

  useEffect(() => {
    if (!userId) {
      setOffers([]);
      return;
    }

    const authenticatedUserId = userId;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setOffers([]);
      return;
    }
    const client = supabase;

    let cancelled = false;

    async function loadOffers() {
      const { data: offerRows, error } = await client
        .from("offers")
        .select("*")
        .or(`buyer_id.eq.${authenticatedUserId},seller_id.eq.${authenticatedUserId}`)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setOffers([]);
        return;
      }

      const typedOfferRows = (offerRows ?? []) as OfferRow[];
      const listingIds = Array.from(new Set(typedOfferRows.map((offer) => offer.listing_id)));
      const { data: listingRows } =
        listingIds.length > 0
          ? await client
              .from("listings")
              .select("id, year, make, model, seller_name, seller_type")
              .in("id", listingIds)
          : { data: [] };

      if (cancelled) return;

      const typedListingRows = (listingRows ?? []) as ListingSummaryRow[];
      const listingsById = new Map(typedListingRows.map((listing) => [listing.id, listing]));
      setOffers(
        typedOfferRows.map((offer) => {
          const listing = listingsById.get(offer.listing_id);
          return {
            id: offer.id,
            listingId: offer.listing_id,
            listingTitle: listing
              ? `${listing.year} ${listing.make} ${listing.model}`.trim()
              : "Vehicle listing",
            sellerLabel: listing?.seller_name ?? listing?.seller_type ?? "Seller",
            askingPrice: offer.asking_price,
            offerAmount: offer.offer_amount,
            paymentType: offer.payment_type,
            message: offer.message,
            status: offer.status,
            counterAmount: offer.counter_amount ?? undefined,
            sellerNote: getSellerNote(offer.status, offer.counter_amount ?? undefined),
            createdAt: offer.created_at,
            updatedAt: offer.updated_at
          } satisfies OfferRecord;
        })
      );
    }

    void loadOffers();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const createOffer = useCallback(
    async (input: CreateOfferInput) => {
      const supabase = createSupabaseBrowserClient();

      if (!userId || !supabase) {
        throw new Error("Sign in before making an offer.");
      }

      const { data, error } = await supabase
        .from("offers")
        .insert({
          listing_id: input.listingId,
          buyer_id: userId,
          asking_price: input.askingPrice,
          offer_amount: input.offerAmount,
          payment_type: input.paymentType,
          message: input.message,
          status: "sent",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      await supabase.from("offer_events").insert({
        offer_id: data.id,
        actor_id: userId,
        event_type: "sent",
        amount: input.offerAmount,
        note: input.message
      });

      const offer = {
        id: data.id,
        ...input,
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      } satisfies OfferRecord;

      setOffers((current) => [offer, ...current.filter((item) => item.id !== offer.id)]);
      return offer;
    },
    [userId]
  );

  const acceptOffer = useCallback(
    async (id: string) => {
      await updateOfferStatus({ userId, id, status: "accepted", setOffers });
    },
    [userId]
  );

  const declineOffer = useCallback(
    async (id: string) => {
      await updateOfferStatus({ userId, id, status: "declined", setOffers });
    },
    [userId]
  );

  const counterOffer = useCallback(
    async (id: string) => {
      const offer = offers.find((item) => item.id === id);
      if (!offer) return;

      const gap = Math.max(0, offer.askingPrice - offer.offerAmount);
      const counterAmount = Math.min(
        offer.askingPrice,
        offer.offerAmount + Math.max(500, Math.round(gap * 0.55))
      );

      await updateOfferStatus({
        userId,
        id,
        status: "countered",
        counterAmount,
        setOffers
      });
    },
    [offers, userId]
  );

  const acceptCounterOffer = useCallback(
    async (id: string) => {
      await updateOfferStatus({ userId, id, status: "counter-accepted", setOffers });
    },
    [userId]
  );

  return {
    offers,
    createOffer,
    acceptOffer,
    declineOffer,
    counterOffer,
    acceptCounterOffer
  };
}

async function updateOfferStatus({
  userId,
  id,
  status,
  counterAmount,
  setOffers
}: {
  userId?: string;
  id: string;
  status: OfferStatus;
  counterAmount?: number;
  setOffers: Dispatch<SetStateAction<OfferRecord[]>>;
}) {
  const supabase = createSupabaseBrowserClient();
  const updatedAt = new Date().toISOString();

  if (!userId || !supabase) {
    throw new Error("Sign in before managing offers.");
  }

  await supabase
    .from("offers")
    .update({
      status,
      counter_amount: counterAmount ?? null
    })
    .eq("id", id);

  await supabase.from("offer_events").insert({
    offer_id: id,
    actor_id: userId,
    event_type: status,
    amount: counterAmount ?? null,
    note: getSellerNote(status, counterAmount)
  });

  setOffers((current) =>
    current.map((offer) =>
      offer.id === id
        ? {
            ...offer,
            counterAmount: counterAmount ?? offer.counterAmount,
            status,
            sellerNote: getSellerNote(status, counterAmount ?? offer.counterAmount),
            updatedAt
          }
        : offer
    )
  );
}

function getSellerNote(status: OfferStatus, counterAmount?: number) {
  switch (status) {
    case "accepted":
      return "Seller accepted the offer.";
    case "declined":
      return "Seller declined the offer.";
    case "countered":
      return counterAmount ? `Seller countered at ${formatCurrency(counterAmount)}.` : "Seller countered.";
    case "counter-accepted":
      return "Buyer accepted the counter offer.";
    default:
      return undefined;
  }
}
