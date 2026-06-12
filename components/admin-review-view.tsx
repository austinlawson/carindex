"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  ShieldCheck,
  XCircle
} from "lucide-react";
import type { CarListing } from "@/data/listings";
import { formatCurrency, formatMileage } from "@/lib/format";
import { getSellerDisplayLabel } from "@/lib/listing-display";

export function AdminReviewView({
  listings,
  loading,
  error,
  onBack,
  onReload,
  onApprove,
  onReject
}: {
  listings: CarListing[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onReload: () => void;
  onApprove: (listingId: string, notes: string) => Promise<void> | void;
  onReject: (listingId: string, notes: string) => Promise<void> | void;
}) {
  return (
    <section className="no-scrollbar h-full overflow-y-auto bg-[#07080b] px-4 pb-[calc(env(safe-area-inset-bottom)+112px)] pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/72 transition active:scale-95"
          onClick={onBack}
          aria-label="Back to profile"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
            Admin
          </p>
          <h1 className="text-3xl font-black">Manual review</h1>
        </div>
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-white/70 transition active:scale-95"
          onClick={onReload}
        >
          Refresh
        </button>
      </header>

      {error ? (
        <p className="mt-4 rounded-2xl border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-xs font-bold leading-relaxed text-amber-50/86">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-8 grid place-items-center rounded-[28px] border border-white/10 bg-white/[0.045] p-8 text-white/58">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm font-black">Loading review queue</p>
        </div>
      ) : listings.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.045] p-6 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-cyan-200" />
          <h2 className="mt-3 text-xl font-black">No pending reviews</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-white/54">
            New seller uploads that need manual review will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {listings.map((listing) => (
            <AdminReviewCard
              key={listing.id}
              listing={listing}
              onApprove={onApprove}
              onReject={onReject}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AdminReviewCard({
  listing,
  onApprove,
  onReject
}: {
  listing: CarListing;
  onApprove: (listingId: string, notes: string) => Promise<void> | void;
  onReject: (listingId: string, notes: string) => Promise<void> | void;
}) {
  const [notes, setNotes] = useState("");
  const [busyDecision, setBusyDecision] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const media = listing.mediaItems[0];
  const mediaUrl = media?.url ?? listing.imageUrl;
  const moderationNotes = readModerationNotes(listing);

  const decide = async (decision: "approve" | "reject") => {
    setBusyDecision(decision);
    setError(null);

    try {
      if (decision === "approve") {
        await onApprove(listing.id, notes);
      } else {
        await onReject(listing.id, notes);
      }
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Could not save review.");
    } finally {
      setBusyDecision(null);
    }
  };

  return (
    <article className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.055]">
      <div className="relative aspect-[4/3] bg-black">
        {media?.type === "video" ? (
          <video src={mediaUrl} controls playsInline preload="metadata" className="h-full w-full object-contain" />
        ) : (
          <img src={mediaUrl} alt="" className="h-full w-full object-contain" />
        )}
        <span className="absolute left-3 top-3 rounded-full border border-white/14 bg-black/54 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/78 backdrop-blur-xl">
          {media?.type === "video" ? "Video" : "Photo"}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-black leading-tight">
              {listing.year} {listing.make} {listing.model}
            </h2>
            <p className="mt-1 line-clamp-1 text-sm font-bold text-white/54">{listing.trim}</p>
            <p className="mt-1 line-clamp-1 text-xs font-black uppercase tracking-[0.1em] text-white/36">
              {getSellerDisplayLabel(listing)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-black">{formatCurrency(listing.price)}</p>
            <p className="mt-1 text-xs font-black text-white/54">{formatMileage(listing.mileage)}</p>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-amber-200/16 bg-amber-200/9 p-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-amber-100/86">
            <AlertTriangle className="h-4 w-4" />
            Review context
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-white/66">
            {moderationNotes || "This listing was sent to manual review because the seller has a prior media hold or requested review."}
          </p>
        </div>

        <label className="mt-3 block">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/42">
            Reviewer notes
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Explain the approval or what the seller needs to fix."
            className="mt-2 min-h-20 w-full resize-none rounded-2xl border border-white/10 bg-black/24 p-3 text-sm font-semibold leading-relaxed text-white outline-none placeholder:text-white/30"
          />
        </label>

        {error ? (
          <p className="mt-3 rounded-2xl border border-amber-200/18 bg-amber-200/10 px-3 py-2 text-xs font-bold leading-relaxed text-amber-50/86">
            {error}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={Boolean(busyDecision)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-red-200/18 bg-red-200/10 px-4 text-sm font-black text-red-50 transition disabled:opacity-50 active:scale-[0.98]"
            onClick={() => void decide("reject")}
          >
            {busyDecision === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject
          </button>
          <button
            type="button"
            disabled={Boolean(busyDecision)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-black text-black transition disabled:opacity-50 active:scale-[0.98]"
            onClick={() => void decide("approve")}
          >
            {busyDecision === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Approve
          </button>
        </div>
      </div>
    </article>
  );
}

function readModerationNotes(listing: CarListing) {
  const moderation = listing.rawProviderSummary?.moderation;
  if (!moderation || typeof moderation !== "object" || Array.isArray(moderation)) {
    return "";
  }

  const notes = (moderation as { notes?: unknown; reviewerNotes?: unknown }).notes;
  if (typeof notes === "string" && notes.trim()) return notes.trim();

  const reviewerNotes = (moderation as { reviewerNotes?: unknown }).reviewerNotes;
  return typeof reviewerNotes === "string" ? reviewerNotes.trim() : "";
}
