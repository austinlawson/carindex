"use client";

import { Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ListingRowCard } from "@/components/listing-row-card";
import type { CarListing } from "@/data/listings";

const loadingSteps = [
  "Scanning local listings",
  "Checking price vs market",
  "Filtering risky listings",
  "Ranking best matches"
];

export function AskAiView({
  listings,
  isSaved,
  onToggleSaved,
  onOpenAnalysis
}: {
  listings: CarListing[];
  isSaved: (id: string) => boolean;
  onToggleSaved: (id: string) => void;
  onOpenAnalysis: (listing: CarListing) => void;
}) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  const matches = useMemo(
    () =>
      listings
        .filter(
          (listing) =>
            listing.price <= 22000 &&
            (listing.tags.includes("suv") ||
              listing.tags.includes("family") ||
              listing.tags.includes("reliable"))
        )
        .slice(0, 8),
    [listings]
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(false);
    setLoadingStep(0);
    setIsLoading(true);
  };

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    if (loadingStep >= loadingSteps.length) {
      setIsLoading(false);
      setSubmitted(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      setLoadingStep((current) => current + 1);
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [isLoading, loadingStep]);

  return (
    <section className="no-scrollbar h-full overflow-y-auto bg-[#07080b] px-4 pb-[calc(env(safe-area-inset-bottom)+112px)] pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">Scout</p>
          <h1 className="text-3xl font-black">Search</h1>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.07]">
          <Sparkles className="h-5 w-5 text-cyan-200" />
        </div>
      </header>

      <form className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-3" onSubmit={onSubmit}>
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find me a reliable SUV under $22k within 150 miles. Avoid known transmission issues."
          className="min-h-32 w-full resize-none rounded-3xl border border-white/10 bg-black/28 p-4 text-base font-semibold leading-relaxed text-white outline-none placeholder:text-white/36 focus:border-cyan-200/50"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/8 text-white"
            aria-label="Adjust search filters"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
          <button
            type="submit"
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-black transition active:scale-[0.99]"
          >
            <Search className="h-[18px] w-[18px]" />
            Find Matches
          </button>
        </div>
      </form>

      {isLoading ? (
        <div className="mt-5 animate-fade-in rounded-[28px] border border-white/10 bg-white/[0.06] p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-cyan-200 text-black">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="text-base font-black text-white">AI scout is working</p>
          </div>
          <div className="space-y-2">
            {loadingSteps.map((step, index) => (
              <div
                key={step}
                className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm font-black transition ${
                  index < loadingStep
                    ? "border-emerald-200/20 bg-emerald-300/10 text-emerald-50"
                    : index === loadingStep
                      ? "border-cyan-200/30 bg-cyan-200/10 text-cyan-50"
                      : "border-white/8 bg-black/18 text-white/36"
                }`}
              >
                <span>{step}</span>
                <span>{index < loadingStep ? "Done" : index === loadingStep ? "..." : ""}</span>
              </div>
            ))}
          </div>
        </div>
      ) : submitted ? (
        <div className="mt-5 animate-fade-in">
          <div className="rounded-[28px] border border-cyan-200/18 bg-cyan-200/10 p-4">
            <p className="text-base font-black text-cyan-50">
              I reviewed 284 listings, rejected 231, and found 12 worth watching.
            </p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-cyan-50/72">
              The strongest matches are priced under budget, avoid the obvious transmission traps,
              and leave enough room for inspection or negotiation.
            </p>
          </div>

          <div className="mt-4 space-y-4">
            {matches.map((listing) => (
              <ListingRowCard
                key={listing.id}
                listing={listing}
                isSaved={isSaved(listing.id)}
                onToggleSaved={() => onToggleSaved(listing.id)}
                onOpenAnalysis={() => onOpenAnalysis(listing)}
                compact
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {["Toyota under $18k", "First car with low risk", "Truck below market", "Potential flips"].map(
            (prompt) => (
              <button
                key={prompt}
                type="button"
                className="min-h-20 rounded-3xl border border-white/10 bg-white/[0.06] p-3 text-left text-sm font-black text-white/78 transition hover:bg-white/[0.09]"
                onClick={() => setQuery(prompt)}
              >
                {prompt}
              </button>
            )
          )}
        </div>
      )}
    </section>
  );
}
