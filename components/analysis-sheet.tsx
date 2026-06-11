"use client";

import {
  AlertTriangle,
  Bookmark,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  Send,
  SearchCheck,
  Target
} from "lucide-react";
import { DealGradeBadge } from "@/components/deal-grade";
import type { CarListing } from "@/data/listings";
import { getBuyerAnalysis, type BuyerAnalysisSection } from "@/lib/buyer-analysis";
import { getListingConfidence } from "@/lib/listing-confidence";
import { getContactHref, getContactLabel } from "@/lib/listing-display";
import { formatCurrency } from "@/lib/format";

export function AnalysisSheet({
  listing,
  isSaved,
  onClose,
  onToggleSaved
}: {
  listing: CarListing;
  isSaved: boolean;
  onClose: () => void;
  onToggleSaved: () => void;
}) {
  const confidenceRead = getListingConfidence(listing);
  const buyerAnalysis = getBuyerAnalysis(listing);
  const attribution = listing.sourceName ?? (listing.sourceMode === "mock" ? "Mock data" : "Imported listing");
  const contactHref = getContactHref(listing);
  const contactIsExternal = contactHref?.startsWith("http");
  const showFirstMessage = listing.sourceMode === "user" && listing.suggestedFirstMessage.trim().length > 0;
  const heroImage = listing.imageUrls[0] ?? listing.imageUrl;

  return (
    <div className="absolute inset-0 z-50 animate-fade-in">
      <button
        type="button"
        aria-label="Close analysis"
        className="absolute inset-0 bg-black/68 backdrop-blur-md"
        onClick={onClose}
      />

      <section className="absolute inset-x-0 bottom-0 flex max-h-[91dvh] flex-col overflow-hidden rounded-t-[32px] border border-white/14 bg-[#080a0e] shadow-[0_-30px_90px_rgba(0,0,0,0.72)] animate-sheet-up lg:bottom-auto lg:left-1/2 lg:right-auto lg:top-1/2 lg:w-[min(92vw,580px)] lg:max-h-[calc(100dvh-72px)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[32px] lg:shadow-[0_34px_120px_rgba(0,0,0,0.72)] lg:animate-fade-in">
        <div className="relative shrink-0 border-b border-white/10">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-55"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,8,12,0.7)_0%,rgba(6,8,12,0.92)_100%)]" />

          <div className="relative px-5 pb-5 pt-3">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/30" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2">
                  <DealGradeBadge grade={confidenceRead.grade} compact />
                  <span className="rounded-full border border-white/12 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/82 backdrop-blur-xl">
                    Buyer read
                  </span>
                </div>
                <h2 className="text-2xl font-black leading-[0.95]">
                  {listing.year} {listing.make} {listing.model}
                </h2>
                <p className="mt-1 text-sm font-bold text-white/62">{listing.trim}</p>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className={`grid h-11 w-11 place-items-center rounded-full border shadow-lg transition active:scale-95 ${
                    isSaved
                      ? "border-white bg-white text-black"
                      : "border-white/14 bg-black/34 text-white backdrop-blur-xl hover:bg-white/12"
                  }`}
                  onClick={onToggleSaved}
                  aria-label={isSaved ? "Unsave listing" : "Save listing"}
                >
                  <Bookmark className={`h-5 w-5 ${isSaved ? "fill-black" : ""}`} />
                </button>
                <button
                  type="button"
                  className="grid h-11 w-11 place-items-center rounded-full border border-white/14 bg-black/34 text-white shadow-lg backdrop-blur-xl transition hover:bg-white/12 active:scale-95"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <ChevronDown className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <BriefMetric label="Asking" value={formatCurrency(listing.price)} />
              <BriefMetric label="Readiness" value={`${confidenceRead.score}%`} />
              <BriefMetric label="Media" value={confidenceRead.mediaLabel} />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 rounded-full border border-white/10 bg-black/24 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white/50 backdrop-blur-xl">
              <span className="truncate">Source: {attribution}</span>
              {listing.lastSeenAt ? (
                <span className="shrink-0">Seen {formatShortDate(listing.lastSeenAt)}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+164px)] pt-5 lg:pb-8">
          <section className="rounded-[26px] border border-emerald-200/16 bg-emerald-300/[0.08] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
            <div className="mb-2 flex items-center gap-2 text-sm font-black text-emerald-50">
              <Target className="h-[18px] w-[18px]" />
              Buyer brief
            </div>
            <p className="text-[15px] font-bold leading-relaxed text-white/88">
              {buyerAnalysis.sections[0]?.body ?? listing.aiTake}
            </p>
          </section>

          <section className="mt-4 rounded-[26px] border border-white/10 bg-white/[0.055] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">
                  Buyer confidence
                </p>
                <p className="mt-1 text-sm font-black text-white">
                  {buyerAnalysis.headline}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">
                  Score
                </p>
                <p className="mt-1 text-lg font-black text-white">{confidenceRead.score}%</p>
              </div>
            </div>

            <div className="mt-5">
              <div className="relative h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-200 via-emerald-200 to-white"
                  style={{ width: `${confidenceRead.score}%` }}
                />
              </div>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-white/68">
                {buyerAnalysis.subhead}
              </p>
            </div>
          </section>

          <div className="mt-4 overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.045]">
            {buyerAnalysis.sections
              .slice(1)
              .filter((section) => section.id !== "risk" || section.items.length > 0)
              .map((section) => (
                <BuyerDecisionBlock key={section.id} section={section} />
              ))}
          </div>

          {contactHref ? (
            <a
              href={contactHref}
              target={contactIsExternal ? "_blank" : undefined}
              rel={contactIsExternal ? "noreferrer" : undefined}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/12 bg-white px-4 text-sm font-black text-black transition active:scale-[0.99]"
            >
              <ExternalLink className="h-[18px] w-[18px]" />
              {getContactLabel(listing)}
            </a>
          ) : null}

          {showFirstMessage ? (
            <section className="mt-4 rounded-[26px] border border-cyan-200/14 bg-cyan-200/[0.07] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-black text-cyan-50">
                <Send className="h-[18px] w-[18px]" />
                First message
              </div>
              <p className="text-sm font-semibold leading-relaxed text-white/78">
                {listing.suggestedFirstMessage}
              </p>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function BriefMetric({
  label,
  value,
  roomy = false
}: {
  label: string;
  value: string;
  roomy?: boolean;
}) {
  return (
    <div className={`rounded-[22px] border border-white/10 bg-black/30 ${roomy ? "p-3.5" : "p-3"} backdrop-blur-xl`}>
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm font-black leading-tight text-white">{value}</p>
    </div>
  );
}

function BuyerDecisionBlock({ section }: { section: BuyerAnalysisSection }) {
  const tone = getSectionTone(section);

  return (
    <section className="border-t border-white/10 p-4 first:border-t-0">
      <div className="flex items-start gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone.iconBg}`}>
          {getSectionIcon(section)}
        </div>
        <div className="min-w-0">
          <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${tone.eyebrow}`}>
            {section.eyebrow}
          </p>
          <h3 className="mt-1 text-base font-black text-white">{section.title}</h3>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-white/68">{section.body}</p>
        </div>
      </div>

      {section.items.length > 0 ? (
        <ul className="mt-3 space-y-2 pl-12">
          {section.items.map((item) => (
            <li key={item} className="flex gap-2 text-sm font-semibold leading-snug text-white/76">
              <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function getSectionIcon(section: BuyerAnalysisSection) {
  switch (section.id) {
    case "deal_context":
      return <CircleDollarSign className="h-[18px] w-[18px]" />;
    case "risk":
      return <AlertTriangle className="h-[18px] w-[18px]" />;
    case "verify":
      return <SearchCheck className="h-[18px] w-[18px]" />;
    case "next_move":
      return <Send className="h-[18px] w-[18px]" />;
    case "interesting":
    default:
      return <Target className="h-[18px] w-[18px]" />;
  }
}

function getSectionTone(section: BuyerAnalysisSection) {
  switch (section.tone) {
    case "positive":
      return {
        iconBg: "bg-emerald-200/14 text-emerald-100",
        eyebrow: "text-emerald-100/58",
        dot: "bg-emerald-200"
      };
    case "warning":
      return {
        iconBg: "bg-amber-200/14 text-amber-100",
        eyebrow: "text-amber-100/58",
        dot: "bg-amber-200"
      };
    case "action":
      return {
        iconBg: "bg-cyan-200/14 text-cyan-100",
        eyebrow: "text-cyan-100/58",
        dot: "bg-cyan-200"
      };
    default:
      return {
        iconBg: "bg-white/10 text-white/82",
        eyebrow: "text-white/42",
        dot: "bg-white/42"
      };
  }
}
