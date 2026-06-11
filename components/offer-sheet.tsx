"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, ChevronDown, Clock3, HandCoins, MessageCircle, Repeat2, ShieldCheck } from "lucide-react";
import type { CarListing } from "@/data/listings";
import { formatCurrency } from "@/lib/format";
import { getSellerDisplayLabel } from "@/lib/listing-display";
import type { OfferPaymentType, OfferRecord } from "@/lib/offers";
import { getOfferStatusLabel } from "@/lib/offers";
import type { CreateOfferInput } from "@/hooks/use-offers";

const paymentTypes = ["Cash", "Financing", "Trade"] satisfies OfferPaymentType[];

export function OfferSheet({
  listing,
  latestOffer,
  onClose,
  onCreateOffer,
  onAcceptCounter
}: {
  listing: CarListing;
  latestOffer: OfferRecord | null;
  onClose: () => void;
  onCreateOffer: (input: CreateOfferInput) => OfferRecord | Promise<OfferRecord>;
  onAcceptCounter: (id: string) => void | Promise<void>;
}) {
  const [amount, setAmount] = useState(String(getDefaultOffer(listing)));
  const [paymentType, setPaymentType] = useState<OfferPaymentType>("Cash");
  const [message, setMessage] = useState(
    `Hi, I am interested in your ${listing.year} ${listing.make} ${listing.model}. Is the title clean, and are you open to a quick inspection?`
  );
  const [sentOfferId, setSentOfferId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const parsedAmount = parseAmount(amount);
  const offerIsValid = parsedAmount > 0;
  const sellerLabel = getSellerDisplayLabel(listing);
  const title = `${listing.year} ${listing.make} ${listing.model}`.trim();
  const activeOffer = sentOfferId
    ? latestOffer?.id === sentOfferId
      ? latestOffer
      : null
    : latestOffer;
  const quickAmounts = useMemo(
    () =>
      Array.from(
        new Set([
          Math.max(500, Math.round(listing.price * 0.94)),
          Math.round(listing.price * 0.96),
          listing.price
        ])
      ).filter((value) => value > 0),
    [listing.price]
  );

  const submitOffer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!offerIsValid) return;

    setIsSubmitting(true);
    try {
      const offer = await onCreateOffer({
        listingId: listing.id,
        listingTitle: title,
        sellerLabel,
        askingPrice: listing.price,
        offerAmount: parsedAmount,
        paymentType,
        message: message.trim()
      });

      setSentOfferId(offer.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 animate-fade-in">
      <button
        type="button"
        aria-label="Close offer sheet"
        className="absolute inset-0 bg-black/68 backdrop-blur-md"
        onClick={onClose}
      />

      <section className="absolute inset-x-0 bottom-0 max-h-[91%] overflow-hidden rounded-t-[32px] border border-white/14 bg-[#080a0e] shadow-[0_-30px_90px_rgba(0,0,0,0.72)] animate-sheet-up">
        <div className="border-b border-white/10 px-5 pb-4 pt-3">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/28" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200/18 bg-emerald-200/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-50">
                <HandCoins className="h-3.5 w-3.5" />
                Private offer
              </div>
              <h2 className="text-2xl font-black leading-none">Make an offer</h2>
              <p className="mt-1 line-clamp-1 text-sm font-bold text-white/54">
                {title} - asking {formatCurrency(listing.price)}
              </p>
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

        <div className="no-scrollbar max-h-[calc(91dvh-122px)] overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-5">
          {activeOffer ? (
            <section className="mb-4 rounded-[26px] border border-cyan-200/14 bg-cyan-200/[0.075] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-cyan-50/64">
                    Latest offer
                  </p>
                  <p className="mt-1 text-2xl font-black text-white">
                    {formatCurrency(activeOffer.counterAmount ?? activeOffer.offerAmount)}
                  </p>
                </div>
                <span className="rounded-full border border-white/12 bg-black/28 px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-white/76">
                  {getOfferStatusLabel(activeOffer.status)}
                </span>
              </div>

              <p className="mt-3 text-sm font-semibold leading-relaxed text-white/64">
                {activeOffer.sellerNote ??
                  "Offer sent locally for prototype testing. No money is collected here."}
              </p>

              {activeOffer.status === "countered" && activeOffer.counterAmount ? (
                <button
                  type="button"
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-black text-black transition active:scale-[0.99]"
                  onClick={() => onAcceptCounter(activeOffer.id)}
                >
                  <Check className="h-[18px] w-[18px]" />
                  Accept counter
                </button>
              ) : null}
            </section>
          ) : null}

          <form onSubmit={submitOffer}>
            <section className="rounded-[26px] border border-white/10 bg-white/[0.055] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">
                    Offer amount
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white/58">
                    Private sellers can accept, decline, or counter.
                  </p>
                </div>
                <p className="shrink-0 text-right text-[11px] font-black uppercase tracking-[0.12em] text-white/42">
                  No deposit
                </p>
              </div>

              <label className="mt-4 block rounded-[24px] border border-white/10 bg-black/28 p-3">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/38">
                  Your offer
                </span>
                <input
                  value={amount}
                  inputMode="numeric"
                  className="mt-2 w-full bg-transparent text-3xl font-black text-white outline-none placeholder:text-white/26"
                  placeholder="$18,500"
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {quickAmounts.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="min-h-10 rounded-2xl border border-white/10 bg-black/24 px-2 text-xs font-black text-white/72 transition active:scale-[0.98]"
                    onClick={() => setAmount(String(value))}
                  >
                    {formatCurrency(value)}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {paymentTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`min-h-11 rounded-2xl border px-2 text-[11px] font-black transition active:scale-[0.98] ${
                      paymentType === type
                        ? "border-white bg-white text-black"
                        : "border-white/10 bg-black/24 text-white/58"
                    }`}
                    onClick={() => setPaymentType(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <label className="mt-4 block rounded-[24px] border border-white/10 bg-black/28 p-3">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/38">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Message
                </span>
                <textarea
                  value={message}
                  className="mt-2 min-h-24 w-full resize-none bg-transparent text-sm font-semibold leading-relaxed text-white outline-none placeholder:text-white/26"
                  placeholder="Add timing, inspection, title, or pickup details."
                  onChange={(event) => setMessage(event.target.value)}
                />
              </label>

              <button
                type="submit"
                disabled={!offerIsValid || isSubmitting}
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-black text-black transition disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.99]"
              >
                <HandCoins className="h-[18px] w-[18px]" />
                {isSubmitting ? "Sending..." : "Send offer"}
              </button>
            </section>
          </form>

          <section className="mt-4 rounded-[26px] border border-white/10 bg-white/[0.055] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-white">
              <Repeat2 className="h-[18px] w-[18px] text-cyan-200" />
              Seller response flow
            </div>
            <div className="space-y-2">
              <FlowLine icon={<Clock3 className="h-4 w-4" />} text="Offer is treated as active for 24 hours in this prototype." />
              <FlowLine icon={<Check className="h-4 w-4" />} text="Seller can accept, decline, or send a simple counter from Profile." />
              <FlowLine icon={<ShieldCheck className="h-4 w-4" />} text="No deposit or payment is collected until payments are intentionally added." />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function FlowLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex gap-2 rounded-2xl border border-white/8 bg-black/20 p-2.5 text-sm font-semibold leading-snug text-white/68">
      <span className="mt-0.5 shrink-0 text-emerald-200">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function getDefaultOffer(listing: CarListing) {
  return Math.round(listing.price * 0.96);
}

function parseAmount(value: string) {
  const parsed = Number(value.replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}
