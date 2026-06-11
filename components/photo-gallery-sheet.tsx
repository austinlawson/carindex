"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Grid2X2, X } from "lucide-react";
import type { CarListing } from "@/data/listings";

export function PhotoGallerySheet({
  listing,
  initialIndex,
  onClose
}: {
  listing: CarListing;
  initialIndex: number;
  onClose: () => void;
}) {
  const images = useMemo(() => listing.imageUrls.filter(Boolean), [listing.imageUrls]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(Math.max(0, Math.min(images.length - 1, initialIndex)));
  }, [images.length, initialIndex, listing.id]);

  if (images.length === 0) {
    return null;
  }

  const selectedUrl = images[selectedIndex] ?? images[0];
  const goPrevious = () => {
    setSelectedIndex((current) => (current - 1 + images.length) % images.length);
  };
  const goNext = () => {
    setSelectedIndex((current) => (current + 1) % images.length);
  };

  return (
    <div className="absolute inset-0 z-50 animate-fade-in bg-[#030406] text-white">
      <div className="flex h-full flex-col pt-[calc(env(safe-area-inset-top)+12px)]">
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/42">
              Photos
            </p>
            <h2 className="mt-1 truncate text-lg font-black leading-tight">
              {listing.year} {listing.make} {listing.model}
            </h2>
          </div>
          <button
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/12 bg-white/10 text-white backdrop-blur-xl transition active:scale-95"
            aria-label="Close photo gallery"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="relative min-h-0 flex-[1.05] bg-black">
          <img
            src={selectedUrl}
            alt={`${listing.year} ${listing.make} ${listing.model} photo ${selectedIndex + 1}`}
            className="h-full w-full object-contain"
          />

          {images.length > 1 ? (
            <>
              <button
                type="button"
                className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/14 bg-black/42 text-white shadow-lg backdrop-blur-xl transition active:scale-95"
                aria-label="Previous photo"
                onClick={goPrevious}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/14 bg-black/42 text-white shadow-lg backdrop-blur-xl transition active:scale-95"
                aria-label="Next photo"
                onClick={goNext}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/12 bg-black/52 px-3 py-1.5 text-xs font-black text-white/88 backdrop-blur-xl">
            {selectedIndex + 1}/{images.length}
          </div>
        </div>

        <section className="min-h-[250px] shrink-0 border-t border-white/10 bg-[#080a0e] px-4 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-black">
              <Grid2X2 className="h-[18px] w-[18px] text-cyan-100" />
              All photos
            </div>
            <span className="text-xs font-black uppercase tracking-[0.12em] text-white/42">
              {images.length} total
            </span>
          </div>

          <div className="no-scrollbar grid max-h-[224px] grid-cols-3 gap-1.5 overflow-y-auto pr-1">
            {images.map((imageUrl, index) => (
              <button
                key={`${imageUrl}-${index}`}
                type="button"
                className={`relative aspect-square overflow-hidden rounded-xl border transition ${
                  index === selectedIndex
                    ? "border-white ring-2 ring-cyan-200"
                    : "border-white/8 opacity-75 hover:opacity-100"
                }`}
                onClick={() => setSelectedIndex(index)}
                aria-label={`View photo ${index + 1}`}
              >
                <img
                  src={imageUrl}
                  alt={`${listing.year} ${listing.make} ${listing.model} thumbnail ${index + 1}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-1 right-1 rounded-full bg-black/58 px-1.5 py-0.5 text-[10px] font-black text-white/86">
                  {index + 1}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
