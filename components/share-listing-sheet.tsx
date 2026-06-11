"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Mail, MessageCircle, Send, X } from "lucide-react";
import type { CarListing } from "@/data/listings";
import {
  canNativeShareListing,
  copyListingSharePayload,
  getListingSharePayload,
  nativeShareListing
} from "@/lib/share-listing";

export function ShareListingSheet({
  listing,
  onClose
}: {
  listing: CarListing;
  onClose: () => void;
}) {
  const shareData = useMemo(() => getListingSharePayload(listing), [listing]);
  const [copied, setCopied] = useState(false);
  const canUseNativeShare = canNativeShareListing(shareData);

  useEffect(() => {
    if (!copied) return;

    const timeout = window.setTimeout(() => setCopied(false), 1600);

    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyShareLink = async () => {
    if (await copyListingSharePayload(shareData)) {
      setCopied(true);
    }
  };

  const openNativeShare = async () => {
    const result = await nativeShareListing(shareData);

    if (result === "shared") {
      onClose();
    }
  };

  return (
    <div className="absolute inset-0 z-50 animate-fade-in">
      <button
        type="button"
        aria-label="Close share options"
        className="absolute inset-0 bg-black/62 backdrop-blur-sm"
        onClick={onClose}
      />

      <section className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[30px] border border-white/12 bg-[#080a0e] shadow-[0_-24px_80px_rgba(0,0,0,0.7)] animate-sheet-up">
        <div className="border-b border-white/10 px-5 pb-4 pt-3">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/24" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
                Share listing
              </p>
              <h2 className="mt-1 line-clamp-1 text-2xl font-black leading-none">
                {listing.year} {listing.make} {listing.model}
              </h2>
              <p className="mt-1 line-clamp-1 text-sm font-bold text-white/52">{listing.trim}</p>
            </div>
            <button
              type="button"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/12 bg-white/10 text-white transition active:scale-95"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4">
          {canUseNativeShare ? (
            <ShareOptionButton
              icon={<Send className="h-5 w-5" />}
              label="More"
              sublabel="Share sheet"
              onClick={openNativeShare}
            />
          ) : null}

          <ShareOptionLink
            href={shareData.smsHref}
            icon={<MessageCircle className="h-5 w-5" />}
            label="Text"
            sublabel="SMS"
          />
          <ShareOptionLink
            href={shareData.emailHref}
            icon={<Mail className="h-5 w-5" />}
            label="Email"
            sublabel="Mail app"
          />
          <ShareOptionButton
            icon={copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            label={copied ? "Copied" : "Copy"}
            sublabel="Listing link"
            onClick={copyShareLink}
          />
        </div>
      </section>
    </div>
  );
}

function ShareOptionButton({
  icon,
  label,
  sublabel,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-20 items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.06] p-3 text-left transition active:scale-[0.98]"
      onClick={onClick}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-black">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-white">{label}</span>
        <span className="mt-0.5 block text-xs font-bold text-white/42">{sublabel}</span>
      </span>
    </button>
  );
}

function ShareOptionLink({
  icon,
  label,
  sublabel,
  href
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex min-h-20 items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.06] p-3 text-left transition active:scale-[0.98]"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-black">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-white">{label}</span>
        <span className="mt-0.5 block text-xs font-bold text-white/42">{sublabel}</span>
      </span>
    </a>
  );
}
