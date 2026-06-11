"use client";

import { Bell, ChevronRight, ShieldCheck, Truck } from "lucide-react";
import type { CarListing } from "@/data/listings";
import { formatCurrency } from "@/lib/format";

const alerts = [
  {
    title: "New high-confidence truck",
    detail: "Frontier SV landed with enough proof to deserve a closer look.",
    listingId: "frontier-2018",
    tone: "cyan"
  },
  {
    title: "Watchlist truck updated",
    detail: "Silverado has enough media and detail to be worth comparing.",
    listingId: "silverado-2018",
    tone: "emerald"
  },
  {
    title: "Clean Toyota nearby",
    detail: "A 4Runner popped up with the kind of proof buyers tend to inspect twice.",
    listingId: "4runner-2006",
    tone: "amber"
  },
  {
    title: "Strong utility read",
    detail: "Tahoe LT 4WD has enough practical appeal to justify a closer read.",
    listingId: "tahoe-2011",
    tone: "violet"
  },
  {
    title: "Dealer listing with better proof",
    detail: "Bronco Sport has enough listing depth to make the shortlist.",
    listingId: "bronco-sport-2021",
    tone: "sky"
  }
];

export function AlertsView({
  listings,
  onOpenAnalysis
}: {
  listings: CarListing[];
  onOpenAnalysis: (listing: CarListing) => void;
}) {
  return (
    <section className="no-scrollbar h-full overflow-y-auto bg-[#07080b] px-4 pb-[calc(env(safe-area-inset-bottom)+112px)] pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">Signals</p>
          <h1 className="text-3xl font-black">Alerts</h1>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.07]">
          <Bell className="h-5 w-5 text-cyan-200" />
        </div>
      </header>

      <div className="mt-6 space-y-3">
        {alerts.map((alert, index) => {
          const listing = listings.find((item) => item.id === alert.listingId);
          if (!listing) {
            return null;
          }

          return (
            <button
              key={alert.title}
              type="button"
              className="group w-full overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.06] text-left shadow-xl shadow-black/20 transition hover:bg-white/[0.09]"
              onClick={() => onOpenAnalysis(listing)}
            >
              <div className="flex gap-3 p-4">
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${toneClass(alert.tone)}`}>
                  {index === 0 ? <Truck className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-black leading-tight text-white">{alert.title}</h2>
                    <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-white/36 transition group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-sm font-semibold leading-snug text-white/62">{alert.detail}</p>
                  <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-white/42">
                    {listing.year} {listing.make} {listing.model} · {formatCurrency(listing.price)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function toneClass(tone: string) {
  switch (tone) {
    case "emerald":
      return "bg-emerald-300 text-black";
    case "amber":
      return "bg-amber-300 text-black";
    case "violet":
      return "bg-violet-300 text-black";
    case "sky":
      return "bg-sky-300 text-black";
    default:
      return "bg-cyan-300 text-black";
  }
}
