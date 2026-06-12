"use client";

import type { ReactNode } from "react";
import {
  Bell,
  Bookmark,
  ChevronRight,
  CircleUserRound,
  HandCoins,
  ListChecks,
  LogOut,
  ShieldCheck,
  Store
} from "lucide-react";
import type { SellerType } from "@/data/listings";
import type { SellerProfile } from "@/hooks/use-seller-profile";

export function ProfileView({
  savedCount,
  listingCount,
  offerCount,
  profile,
  authEmail,
  onSignOut,
  onOpenSellerInfo,
  onOpenListings,
  onOpenInbox,
  onOpenSaved,
  isAdmin = false,
  adminReviewCount = 0,
  onOpenAdminReview
}: {
  savedCount: number;
  listingCount: number;
  offerCount: number;
  profile: SellerProfile;
  authEmail: string;
  onSignOut: () => void;
  onOpenSellerInfo: () => void;
  onOpenListings: () => void;
  onOpenInbox: () => void;
  onOpenSaved: () => void;
  isAdmin?: boolean;
  adminReviewCount?: number;
  onOpenAdminReview?: () => void;
}) {
  return (
    <section className="no-scrollbar h-full overflow-y-auto bg-[#07080b] px-4 pb-[calc(env(safe-area-inset-bottom)+112px)] pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">Account</p>
          <h1 className="text-3xl font-black">Profile</h1>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.07]">
          <CircleUserRound className="h-6 w-6 text-cyan-200" />
        </div>
      </header>

      <section className="mt-6 rounded-[30px] border border-white/10 bg-white/[0.06] p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-white text-xl font-black text-black">
            {profile.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="line-clamp-1 text-xl font-black">{profile.displayName}</h2>
            <p className="mt-1 text-sm font-semibold text-white/56">
              {sellerTypeLabel(profile.sellerType)}{profile.location ? ` - ${profile.location}` : ""}
            </p>
            {authEmail ? (
              <p className="mt-1 line-clamp-1 text-xs font-bold text-white/36">{authEmail}</p>
            ) : null}
          </div>
        </div>
      </section>

      <nav className="mt-4 space-y-3" aria-label="Profile sections">
        <ProfileNavCard
          icon={<Store className="h-5 w-5" />}
          title="Seller information"
          detail={sellerInfoSummary(profile)}
          meta="Name, seller type, location, phone, email"
          onClick={onOpenSellerInfo}
        />
        <ProfileNavCard
          icon={<ListChecks className="h-5 w-5" />}
          title="Listings"
          detail={`${listingCount} ${listingCount === 1 ? "listing" : "listings"}`}
          meta="Status, feedback, edits, review tools"
          onClick={onOpenListings}
        />
        <ProfileNavCard
          icon={<HandCoins className="h-5 w-5" />}
          title="Inbox"
          detail={`${offerCount} ${offerCount === 1 ? "offer" : "offers"}`}
          meta="Offer activity for your private listings"
          onClick={onOpenInbox}
        />
        <ProfileNavCard
          icon={<Bookmark className="h-5 w-5" />}
          title="Saved cars"
          detail={`${savedCount} saved`}
          meta="Listings you want to revisit"
          onClick={onOpenSaved}
        />
        {isAdmin ? (
          <ProfileNavCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Admin review"
            detail={`${adminReviewCount} pending`}
            meta="Approve or reject manual-review listings"
            onClick={onOpenAdminReview}
          />
        ) : null}
        <ProfileNavCard
          icon={<Bell className="h-5 w-5" />}
          title="Notifications"
          detail="Feed bell"
          meta="Listing status alerts appear in the feed action rail"
          disabled
        />
      </nav>

      <button
        type="button"
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-black/24 px-4 text-xs font-black uppercase tracking-[0.1em] text-white/60 transition hover:bg-white/[0.06] hover:text-white active:scale-[0.98]"
        onClick={onSignOut}
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </section>
  );
}

function ProfileNavCard({
  icon,
  title,
  detail,
  meta,
  disabled = false,
  onClick
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  meta: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="flex min-h-[92px] w-full items-center gap-4 rounded-[28px] border border-white/10 bg-white/[0.055] p-4 text-left transition hover:bg-white/[0.085] active:scale-[0.99] disabled:cursor-default disabled:hover:bg-white/[0.055]"
      onClick={onClick}
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/24 text-cyan-100">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-black text-white">{title}</span>
        <span className="mt-1 block line-clamp-1 text-sm font-black text-white/68">{detail}</span>
        <span className="mt-1 block line-clamp-1 text-xs font-bold text-white/38">{meta}</span>
      </span>
      {disabled ? null : (
        <ChevronRight className="h-5 w-5 shrink-0 text-white/34" />
      )}
    </button>
  );
}

function sellerInfoSummary(profile: SellerProfile) {
  return [
    sellerTypeLabel(profile.sellerType),
    profile.location || "No location",
    profile.phone ? "Phone set" : "No phone"
  ].join(" - ");
}

function sellerTypeLabel(value: SellerType) {
  if (value === "Small Lot") return "Small lot";
  if (value === "Dealer") return "Dealer";
  return "Private seller";
}
