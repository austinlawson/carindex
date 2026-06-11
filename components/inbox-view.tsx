"use client";

import { ArrowLeft, Check, HandCoins, Repeat2, X } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { OfferRecord } from "@/lib/offers";
import { getOfferStatusLabel } from "@/lib/offers";

export function InboxView({
  offers,
  onBack,
  onAcceptOffer,
  onDeclineOffer,
  onCounterOffer
}: {
  offers: OfferRecord[];
  onBack: () => void;
  onAcceptOffer: (id: string) => void;
  onDeclineOffer: (id: string) => void;
  onCounterOffer: (id: string) => void;
}) {
  return (
    <section className="no-scrollbar h-full overflow-y-auto bg-[#07080b] px-4 pb-[calc(env(safe-area-inset-bottom)+112px)] pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 transition hover:bg-white/[0.1] hover:text-white active:scale-95"
            onClick={onBack}
            aria-label="Back to profile"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/70">
              Profile
            </p>
            <h1 className="text-3xl font-black">Inbox</h1>
            <p className="mt-2 max-w-[300px] text-sm font-semibold leading-6 text-white/48">
              Offers and buyer activity for private seller listings.
            </p>
          </div>
        </div>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-emerald-200/14 bg-emerald-200/[0.08] text-emerald-100">
          <HandCoins className="h-6 w-6" />
        </div>
      </header>

      <div className="mt-5 rounded-[26px] border border-white/10 bg-white/[0.055] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">
              Active offers
            </p>
            <p className="mt-1 text-2xl font-black text-white">{offers.length}</p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/24 px-3 py-1.5 text-xs font-black text-white/54">
            Private sellers
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {offers.length > 0 ? (
          offers.map((offer) => (
            <OfferInboxCard
              key={offer.id}
              offer={offer}
              onAcceptOffer={() => onAcceptOffer(offer.id)}
              onDeclineOffer={() => onDeclineOffer(offer.id)}
              onCounterOffer={() => onCounterOffer(offer.id)}
            />
          ))
        ) : (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-5">
            <p className="text-sm font-bold leading-6 text-white/66">
              No offers yet. When buyers make offers on your private seller listings, they will
              show up here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function OfferInboxCard({
  offer,
  onAcceptOffer,
  onDeclineOffer,
  onCounterOffer
}: {
  offer: OfferRecord;
  onAcceptOffer: () => void;
  onDeclineOffer: () => void;
  onCounterOffer: () => void;
}) {
  const isActionable = offer.status === "sent";

  return (
    <article className="rounded-[26px] border border-white/10 bg-white/[0.055] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-1 text-base font-black text-white">{offer.listingTitle}</p>
          <p className="mt-1 text-xs font-bold text-white/46">{offer.paymentType} offer</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-black/24 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white/68">
          {getOfferStatusLabel(offer.status)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <OfferFact label="Offer" value={formatCurrency(offer.offerAmount)} />
        <OfferFact
          label={offer.counterAmount ? "Counter" : "Asking"}
          value={formatCurrency(offer.counterAmount ?? offer.askingPrice)}
        />
      </div>

      {offer.message ? (
        <p className="mt-3 line-clamp-3 text-xs font-semibold leading-relaxed text-white/58">
          {offer.message}
        </p>
      ) : null}

      {offer.sellerNote ? (
        <p className="mt-3 rounded-2xl border border-white/8 bg-black/24 px-3 py-2 text-xs font-bold leading-relaxed text-white/66">
          {offer.sellerNote}
        </p>
      ) : null}

      {isActionable ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <OfferActionButton label="Accept" icon={<Check className="h-4 w-4" />} onClick={onAcceptOffer} />
          <OfferActionButton label="Counter" icon={<Repeat2 className="h-4 w-4" />} onClick={onCounterOffer} />
          <OfferActionButton label="Decline" icon={<X className="h-4 w-4" />} onClick={onDeclineOffer} muted />
        </div>
      ) : null}
    </article>
  );
}

function OfferFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/24 p-2.5">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/34">{label}</p>
      <p className="mt-1 text-sm font-black text-white/82">{value}</p>
    </div>
  );
}

function OfferActionButton({
  label,
  icon,
  muted = false,
  onClick
}: {
  label: string;
  icon: React.ReactNode;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-2xl border px-2 text-[11px] font-black transition active:scale-[0.98] ${
        muted
          ? "border-white/10 bg-black/26 text-white/58"
          : "border-white bg-white text-black"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
