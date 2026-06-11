"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Edit3,
  ListChecks,
  Repeat2,
  Trash2,
  X
} from "lucide-react";
import type { CarListing } from "@/data/listings";
import { formatCurrency } from "@/lib/format";
import { getListingConfidence } from "@/lib/listing-confidence";
import {
  getMediaVerificationIssue,
  hasJunkMediaSignal,
  hasMediaMismatch
} from "@/lib/media-verification";

type EditableListingUpdates = Partial<Pick<
  CarListing,
  | "year"
  | "make"
  | "model"
  | "trim"
  | "price"
  | "mileage"
  | "location"
  | "vin"
  | "listingDescription"
  | "sellerDisclosureNotes"
>>;

export function MyListingsView({
  listings,
  onBack,
  onOpenAnalysis,
  onDeleteListing,
  onUpdateListing,
  onRequestManualReview
}: {
  listings: CarListing[];
  onBack: () => void;
  onOpenAnalysis: (listing: CarListing) => void;
  onDeleteListing: (listingId: string) => Promise<void> | void;
  onUpdateListing: (listingId: string, updates: EditableListingUpdates) => Promise<CarListing> | CarListing;
  onRequestManualReview: (listingId: string) => Promise<CarListing> | CarListing;
}) {
  const [editingListing, setEditingListing] = useState<CarListing | null>(null);
  const liveCount = listings.filter((listing) => !isRejectedOrReviewListing(listing)).length;
  const reviewCount = listings.length - liveCount;

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
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">Profile</p>
            <h1 className="text-3xl font-black">My listings</h1>
            <p className="mt-2 max-w-[300px] text-sm font-semibold leading-6 text-white/48">
              Manage live posts, rejected media, and review requests from one place.
            </p>
          </div>
        </div>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.07] text-cyan-100">
          <ListChecks className="h-6 w-6" />
        </div>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <ListingStat label="Total" value={String(listings.length)} />
        <ListingStat label="Live" value={String(liveCount)} />
        <ListingStat label="Review" value={String(reviewCount)} />
      </div>

      <div className="mt-4 space-y-3">
        {listings.length > 0 ? (
          listings.map((listing) => (
            <ManagedListingCard
              key={listing.id}
              listing={listing}
              onOpenAnalysis={() => onOpenAnalysis(listing)}
              onEditListing={() => setEditingListing(listing)}
              onDeleteListing={async () => {
                if (
                  typeof window === "undefined" ||
                  window.confirm("Delete this listing? This removes it from your account and the feed.")
                ) {
                  await onDeleteListing(listing.id);
                }
              }}
              onRequestManualReview={async () => {
                const updatedListing = await onRequestManualReview(listing.id);
                onOpenAnalysis(updatedListing);
              }}
            />
          ))
        ) : (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5">
            <p className="text-sm font-bold leading-6 text-white/66">
              Your published listings will show here with status, edit, review, and delete tools.
            </p>
          </div>
        )}
      </div>

      {editingListing ? (
        <EditListingSheet
          listing={editingListing}
          onClose={() => setEditingListing(null)}
          onSave={async (updates) => {
            const updatedListing = await onUpdateListing(editingListing.id, updates);
            setEditingListing(null);
            onOpenAnalysis(updatedListing);
          }}
        />
      ) : null}
    </section>
  );
}

function ListingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/36">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function ManagedListingCard({
  listing,
  onOpenAnalysis,
  onEditListing,
  onDeleteListing,
  onRequestManualReview
}: {
  listing: CarListing;
  onOpenAnalysis: () => void;
  onEditListing: () => void;
  onDeleteListing: () => Promise<void> | void;
  onRequestManualReview: () => Promise<void> | void;
}) {
  const confidence = getListingConfidence(listing);
  const rejected = hasMediaMismatch(listing) || hasJunkMediaSignal(listing);
  const manualReviewRequested =
    listing.tags.includes("manual-review-requested") ||
    readModerationStatus(listing) === "manual_review_requested";
  const manualReviewRequired = readModerationStatus(listing) === "manual_review_required";
  const needsReview = rejected || manualReviewRequested || manualReviewRequired;
  const status = rejected
    ? manualReviewRequested
      ? "Review requested"
      : "Rejected"
    : manualReviewRequired || manualReviewRequested
      ? "Manual review"
      : "Live";
  const statusClass = needsReview
    ? manualReviewRequested || manualReviewRequired
      ? "border-sky-200/24 bg-sky-200/10 text-sky-100"
      : "border-amber-200/28 bg-amber-200/12 text-amber-100"
    : "border-emerald-200/24 bg-emerald-200/10 text-emerald-100";
  const issue = rejected
    ? getMediaVerificationIssue(listing)
    : "This listing is waiting for manual review before it can appear in the public feed.";

  return (
    <article className="rounded-[26px] border border-white/10 bg-white/[0.055] p-3.5">
      <div className="flex items-start gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/28">
          {listing.mediaItems[0]?.type === "video" ? (
            <video
              src={listing.mediaItems[0].url}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="line-clamp-1 text-base font-black text-white">
                {listing.year} {listing.make} {listing.model}
              </h2>
              <p className="mt-1 line-clamp-1 text-xs font-bold text-white/48">
                {listing.trim || "Base"} - {formatCurrency(listing.price)}
              </p>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${statusClass}`}>
              {status}
            </span>
          </div>
          <p className="mt-2 text-[11px] font-bold leading-4 text-white/46">
            {needsReview ? "Private until review is resolved." : `${confidence.shortLabel} - visible in the feed.`}
          </p>
        </div>
      </div>

      {needsReview ? (
        <div className="mt-3 rounded-2xl border border-amber-200/16 bg-amber-200/[0.075] px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-100/78">
            {rejected ? "Rejection reason" : "Review status"}
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-amber-50/82">{issue}</p>
          {rejected ? (
            <p className="mt-1 text-[11px] font-bold leading-4 text-white/48">
              Delete and repost with correct car media, or request manual review if this was wrong.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <SmallActionButton label="Feedback" onClick={onOpenAnalysis} />
        <SmallActionButton label="Edit" icon={<Edit3 className="h-3.5 w-3.5" />} onClick={onEditListing} />
        {rejected ? (
          <SmallActionButton
            label={manualReviewRequested ? "Review requested" : "Manual review"}
            disabled={manualReviewRequested}
            icon={<Repeat2 className="h-3.5 w-3.5" />}
            onClick={onRequestManualReview}
          />
        ) : (
          <SmallActionButton label={needsReview ? "In review" : "Live"} disabled icon={<Check className="h-3.5 w-3.5" />} />
        )}
        <SmallActionButton
          label="Delete"
          tone="danger"
          icon={<Trash2 className="h-3.5 w-3.5" />}
          onClick={onDeleteListing}
        />
      </div>
    </article>
  );
}

function SmallActionButton({
  label,
  icon,
  tone = "default",
  disabled,
  onClick
}: {
  label: string;
  icon?: ReactNode;
  tone?: "default" | "danger";
  disabled?: boolean;
  onClick?: () => Promise<void> | void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-2xl border px-3 text-[11px] font-black transition active:scale-[0.98] disabled:cursor-default disabled:opacity-45 ${
        tone === "danger"
          ? "border-red-200/16 bg-red-200/[0.07] text-red-100"
          : "border-white/10 bg-white/[0.055] text-white/72"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function EditListingSheet({
  listing,
  onClose,
  onSave
}: {
  listing: CarListing;
  onClose: () => void;
  onSave: (updates: EditableListingUpdates) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState({
    year: String(listing.year),
    make: listing.make,
    model: listing.model,
    trim: listing.trim,
    price: String(listing.price),
    mileage: String(listing.mileage),
    location: listing.location,
    vin: listing.vin ?? "",
    listingDescription: listing.listingDescription ?? "",
    sellerDisclosureNotes: listing.sellerDisclosureNotes ?? ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateDraft = (field: keyof typeof draft, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: field === "vin" ? value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : value
    }));
    setError(null);
  };

  const save = async () => {
    const year = readPositiveNumber(draft.year);
    const price = readPositiveNumber(draft.price);
    const mileage = readPositiveNumber(draft.mileage);

    if (!year || !price || !mileage || !draft.make.trim() || !draft.model.trim()) {
      setError("Year, make, model, price, and mileage are required.");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        year,
        make: draft.make.trim(),
        model: draft.model.trim(),
        trim: draft.trim.trim(),
        price,
        mileage,
        location: draft.location.trim(),
        vin: draft.vin.trim(),
        listingDescription: draft.listingDescription.trim(),
        sellerDisclosureNotes: draft.sellerDisclosureNotes.trim()
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save listing.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/72 px-4 py-[calc(env(safe-area-inset-top)+18px)] backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[390px] flex-col rounded-[28px] border border-white/10 bg-[#090b10] p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/80">Edit</p>
            <h2 className="mt-1 text-2xl font-black">Listing details</h2>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/70"
            onClick={onClose}
            aria-label="Close edit listing"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <EditorInput label="Year" value={draft.year} placeholder="2008" inputMode="numeric" onChange={(value) => updateDraft("year", value)} />
            <EditorInput label="Price" value={draft.price} placeholder="13000" inputMode="numeric" onChange={(value) => updateDraft("price", value)} />
            <EditorInput label="Make" value={draft.make} placeholder="Ford" onChange={(value) => updateDraft("make", value)} />
            <EditorInput label="Model" value={draft.model} placeholder="F-150" onChange={(value) => updateDraft("model", value)} />
            <EditorInput label="Trim" value={draft.trim} placeholder="Optional" onChange={(value) => updateDraft("trim", value)} />
            <EditorInput label="Mileage" value={draft.mileage} placeholder="65000" inputMode="numeric" onChange={(value) => updateDraft("mileage", value)} />
          </div>
          <EditorInput label="Location" value={draft.location} placeholder="Ozark, AL" onChange={(value) => updateDraft("location", value)} />
          <EditorInput label="VIN" value={draft.vin} placeholder="Optional" onChange={(value) => updateDraft("vin", value)} />
          <EditorTextarea label="Description" value={draft.listingDescription} placeholder="Ownership story, recent work, reason for selling..." onChange={(value) => updateDraft("listingDescription", value)} />
          <EditorTextarea label="Disclosure notes" value={draft.sellerDisclosureNotes} placeholder="Known flaws, lights, leaks, title details..." onChange={(value) => updateDraft("sellerDisclosureNotes", value)} />

          {error ? (
            <p className="rounded-2xl border border-red-200/18 bg-red-200/10 px-3 py-2 text-xs font-bold text-red-100">
              {error}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          disabled={saving}
          className="mt-4 min-h-12 rounded-full bg-white px-4 text-sm font-black text-black transition active:scale-[0.98] disabled:opacity-50"
          onClick={save}
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function EditorInput({
  label,
  value,
  placeholder,
  inputMode,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-[20px] border border-white/10 bg-black/24 p-3">
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/38">
        {label}
      </span>
      <input
        value={value}
        inputMode={inputMode}
        className="mt-2 w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-white/30"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function EditorTextarea({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-[20px] border border-white/10 bg-black/24 p-3">
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/38">
        {label}
      </span>
      <textarea
        value={value}
        rows={4}
        className="mt-2 w-full resize-none bg-transparent text-sm font-bold leading-5 text-white outline-none placeholder:text-white/30"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function isRejectedOrReviewListing(listing: CarListing) {
  return (
    hasMediaMismatch(listing) ||
    hasJunkMediaSignal(listing) ||
    readModerationStatus(listing).startsWith("manual_review")
  );
}

function readModerationStatus(listing: CarListing) {
  const moderation = listing.rawProviderSummary?.moderation;
  if (!moderation || typeof moderation !== "object" || Array.isArray(moderation)) {
    return "";
  }

  const status = (moderation as { status?: unknown }).status;
  return typeof status === "string" ? status : "";
}

function readPositiveNumber(value: string) {
  const parsed = Number(value.replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}
