import type { CarListing } from "@/data/listings";
import { getDisclosureBadges, type DisclosureBadge } from "@/lib/listing-disclosures";

export function ListingDisclosureBadges({
  listing,
  max = 2,
  compact = false,
  className = ""
}: {
  listing: CarListing;
  max?: number;
  compact?: boolean;
  className?: string;
}) {
  const badges = getDisclosureBadges(listing).slice(0, max);

  if (badges.length === 0) {
    return null;
  }

  return (
    <div
      className={`inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-[18px] border border-white/10 bg-black/54 p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.36)] backdrop-blur-2xl ${className}`}
    >
      {badges.map((badge) => (
        <span
          key={badge.key}
          className={`inline-flex max-w-[150px] items-center truncate rounded-full font-black shadow-[0_8px_18px_rgba(0,0,0,0.22)] ${
            compact ? "min-h-6 px-2.5 text-[9.5px]" : "min-h-7 px-3 text-[10.5px]"
          } ${getBadgeToneClass(badge)}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

function getBadgeToneClass(badge: DisclosureBadge) {
  if (badge.tone === "positive") {
    return "bg-emerald-200/95 text-emerald-950";
  }

  if (badge.tone === "warning") {
    return "bg-amber-200/95 text-amber-950";
  }

  return "bg-cyan-100/95 text-cyan-950";
}
