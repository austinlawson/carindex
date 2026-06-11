"use client";

import { useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { ArrowLeft, MapPin, Phone, Store, Trash2 } from "lucide-react";
import type { SellerType } from "@/data/listings";
import type { SellerProfile } from "@/hooks/use-seller-profile";

export function SellerInfoView({
  profile,
  onProfileChange,
  onDeleteAccount,
  onBack
}: {
  profile: SellerProfile;
  onProfileChange: (updates: Partial<SellerProfile>) => void;
  onDeleteAccount: () => Promise<{ error: string | null }>;
  onBack: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const canDelete = confirmText.trim().toUpperCase() === "DELETE" && !deletePending;

  const handleDeleteAccount = async () => {
    if (!canDelete) return;

    setDeletePending(true);
    setDeleteError(null);

    const result = await onDeleteAccount();

    if (result.error) {
      setDeleteError(result.error);
      setDeletePending(false);
    }
  };

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
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
              Profile
            </p>
            <h1 className="text-3xl font-black">Seller information</h1>
            <p className="mt-2 max-w-[300px] text-sm font-semibold leading-6 text-white/48">
              This is used on your listings and buyer contact surfaces.
            </p>
          </div>
        </div>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.07] text-cyan-100">
          <Store className="h-6 w-6" />
        </div>
      </header>

      <section className="mt-5 rounded-[30px] border border-white/10 bg-white/[0.055] p-4">
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-white/36">
          Seller type
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(["Private Seller", "Dealer", "Small Lot"] satisfies SellerType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={`min-h-11 rounded-2xl border px-2 text-[11px] font-black transition active:scale-[0.98] ${
                profile.sellerType === type
                  ? "border-white bg-white text-black"
                  : "border-white/10 bg-black/24 text-white/58 hover:bg-white/[0.06]"
              }`}
              onClick={() => onProfileChange({ sellerType: type })}
            >
              {sellerTypeLabel(type)}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-4 space-y-3">
        <ProfileInput
          label="Display name"
          value={profile.displayName}
          placeholder="Austin"
          onChange={(value) => onProfileChange({ displayName: value })}
        />
        <ProfileInput
          label="Location"
          value={profile.location}
          placeholder="Ozark, AL"
          icon={<MapPin className="h-4 w-4" />}
          onChange={(value) => onProfileChange({ location: value })}
        />
        <ProfileInput
          label="Phone"
          value={profile.phone}
          placeholder="Optional"
          inputMode="tel"
          icon={<Phone className="h-4 w-4" />}
          onChange={(value) => onProfileChange({ phone: value })}
        />
        <ProfileInput
          label="Email"
          value={profile.email}
          placeholder="Optional"
          inputMode="email"
          onChange={(value) => onProfileChange({ email: value })}
        />
      </div>

      <button
        type="button"
        className="mt-5 min-h-12 w-full rounded-full bg-white px-4 text-sm font-black text-black transition hover:bg-cyan-100 active:scale-[0.98]"
        onClick={onBack}
      >
        Back to profile
      </button>

      <section className="mt-5 rounded-[30px] border border-red-300/18 bg-red-300/[0.075] p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-red-200/16 bg-red-200/10 text-red-100">
            <Trash2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-red-50">Delete account</h2>
            <p className="mt-1 text-xs font-bold leading-5 text-red-50/62">
              This permanently deletes your account, seller profile, saved data, offers, and every
              listing you own. Listing photos, videos, and generated listing audio are removed too.
            </p>
          </div>
        </div>

        <label className="mt-4 block rounded-[20px] border border-red-200/14 bg-black/28 p-3">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-red-50/50">
            Type DELETE to confirm
          </span>
          <input
            value={confirmText}
            className="mt-2 w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-white/28"
            placeholder="DELETE"
            onChange={(event) => {
              setConfirmText(event.target.value);
              setDeleteError(null);
            }}
          />
        </label>

        {deleteError ? (
          <p className="mt-3 rounded-2xl border border-red-200/18 bg-red-200/10 px-3 py-2 text-xs font-bold leading-5 text-red-50">
            {deleteError}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!canDelete}
          className="mt-3 min-h-11 w-full rounded-full border border-red-200/24 bg-red-200/12 px-4 text-xs font-black uppercase tracking-[0.1em] text-red-50 transition hover:bg-red-200/18 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          onClick={handleDeleteAccount}
        >
          {deletePending ? "Deleting account..." : "Delete my account"}
        </button>
      </section>
    </section>
  );
}

function ProfileInput({
  label,
  value,
  placeholder,
  inputMode,
  icon,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  icon?: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-[22px] border border-white/10 bg-white/[0.055] p-3.5">
      <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/38">
        {icon}
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

function sellerTypeLabel(value: SellerType) {
  if (value === "Small Lot") return "Small lot";
  if (value === "Dealer") return "Dealer";
  return "Private";
}
