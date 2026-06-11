"use client";

import { ChevronDown, CircleDollarSign, Gauge, MapPin, UserRound } from "lucide-react";
import type { CarListing } from "@/data/listings";
import { getListingNotes, getLocationLabel, getSellerDisplayLabel } from "@/lib/listing-display";
import { formatCurrency, formatMileage } from "@/lib/format";

export function DescriptionSheet({
  listing,
  onClose
}: {
  listing: CarListing;
  onClose: () => void;
}) {
  const notes = getListingNotes(listing);
  const hasSourceDescription =
    Boolean(listing.listingDescription) &&
    listing.listingDescription !== listing.listingTitle &&
    listing.listingDescription !== `${listing.year} ${listing.make} ${listing.model} ${listing.trim}`.trim();

  return (
    <div className="absolute inset-0 z-50 animate-fade-in">
      <button
        type="button"
        aria-label="Close listing notes"
        className="absolute inset-0 bg-black/62 backdrop-blur-sm"
        onClick={onClose}
      />

      <section className="absolute inset-x-0 bottom-0 max-h-[78%] overflow-hidden rounded-t-[30px] border border-white/12 bg-[#080a0e] shadow-[0_-24px_80px_rgba(0,0,0,0.7)] animate-sheet-up">
        <div className="border-b border-white/10 px-5 pb-4 pt-3">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/24" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
                Listing notes
              </p>
              <h2 className="mt-1 text-2xl font-black leading-none">
                {listing.year} {listing.make} {listing.model}
              </h2>
              <p className="mt-1 line-clamp-1 text-sm font-bold text-white/52">{listing.trim}</p>
            </div>
            <button
              type="button"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/12 bg-white/10 text-white transition active:scale-95"
              aria-label="Close"
              onClick={onClose}
            >
              <ChevronDown className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="no-scrollbar max-h-[calc(78dvh-118px)] overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-5">
          <div className="grid grid-cols-2 gap-2">
            <Fact icon={<CircleDollarSign className="h-4 w-4" />} label="Asking" value={formatCurrency(listing.price)} />
            <Fact icon={<Gauge className="h-4 w-4" />} label="Mileage" value={formatMileage(listing.mileage)} />
            <Fact icon={<MapPin className="h-4 w-4" />} label="Location" value={getLocationLabel(listing)} />
            <Fact icon={<UserRound className="h-4 w-4" />} label="Seller" value={getSellerDisplayLabel(listing)} />
          </div>

          <section className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.055] p-4">
            <p className="text-sm font-semibold leading-7 text-white/76">{notes}</p>
          </section>

          {!hasSourceDescription ? (
            <p className="mt-3 text-xs font-semibold leading-relaxed text-white/38">
              This provider snapshot did not include a long seller-written description, so these notes
              summarize the available listing fields for prototype testing.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Fact({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/28 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/38">
        {icon}
        {label}
      </p>
      <p className="mt-1 line-clamp-2 text-sm font-black leading-tight text-white/80">{value}</p>
    </div>
  );
}
