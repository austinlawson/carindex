import type { CarListing } from "@/data/listings";
import { formatCurrency } from "@/lib/format";

export type ShareListingResult = "shared" | "copied" | "cancelled" | "unavailable";
export type ListingSharePayload = ShareData & {
  clipboardText: string;
  emailHref: string;
  smsHref: string;
};

export async function shareListing(listing: CarListing): Promise<ShareListingResult> {
  if (typeof window === "undefined") {
    return "unavailable";
  }

  const shareData = getListingSharePayload(listing);
  const nativeResult = await nativeShareListing(shareData);

  if (nativeResult !== "unavailable") {
    return nativeResult;
  }

  return (await copyListingSharePayload(shareData)) ? "copied" : "unavailable";
}

export function getListingSharePayload(listing: CarListing): ListingSharePayload {
  const title = `${listing.year} ${listing.make} ${listing.model}`;
  const text = `${title} ${listing.trim} for ${formatCurrency(listing.price)}. ${listing.aiTake}`;
  const url = getListingShareUrl(listing.id);
  const clipboardText = `${text}\n${url}`;

  return {
    title,
    text,
    url,
    clipboardText,
    emailHref: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(clipboardText)}`,
    smsHref: `sms:?&body=${encodeURIComponent(clipboardText)}`
  };
}

export function canNativeShareListing(shareData: ShareData) {
  if (typeof window === "undefined" || !window.navigator.share) {
    return false;
  }

  const browserNavigator = window.navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };

  return !browserNavigator.canShare || browserNavigator.canShare(shareData);
}

export async function nativeShareListing(shareData: ShareData): Promise<ShareListingResult> {
  if (!canNativeShareListing(shareData)) {
    return "unavailable";
  }

  try {
    await window.navigator.share(shareData);
    return "shared";
  } catch (error) {
    return isShareCancellation(error) ? "cancelled" : "unavailable";
  }
}

export async function copyListingSharePayload(shareData: ListingSharePayload) {
  return copyTextToClipboard(shareData.clipboardText);
}

function getListingShareUrl(listingId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("listing", listingId);
  url.hash = "";

  return url.toString();
}

async function copyTextToClipboard(text: string) {
  try {
    if (window.navigator.clipboard?.writeText) {
      await window.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the selection-based copy path for mobile browsers.
  }

  const textarea = window.document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";

  window.document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return window.document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function isShareCancellation(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
