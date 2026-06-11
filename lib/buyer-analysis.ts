import type { CarListing } from "@/data/listings";
import { formatCurrency, formatMileage } from "@/lib/format";
import { getKnownIssueOption, getTitleStatusOption, getVehicleConditionOption } from "@/lib/listing-disclosures";
import { getListingConfidence } from "@/lib/listing-confidence";
import { getSellerDisplayLabel } from "@/lib/listing-display";
import {
  getVisibleProofLabel,
  hasJunkMediaSignal,
  hasMediaMismatch,
  hasVerifiedVehicleMedia,
  readMediaVerification
} from "@/lib/media-verification";

export type BuyerAnalysisTone = "default" | "positive" | "warning" | "action";

export type BuyerAnalysisSection = {
  id: "interesting" | "deal_context" | "risk" | "verify" | "next_move";
  title: string;
  eyebrow: string;
  body: string;
  items: string[];
  tone: BuyerAnalysisTone;
};

export type BuyerAnalysis = {
  headline: string;
  subhead: string;
  sections: BuyerAnalysisSection[];
};

export function getBuyerAnalysis(listing: CarListing): BuyerAnalysis {
  const confidenceRead = getListingConfidence(listing);
  const sellerLabel = getSellerDisplayLabel(listing);
  const videoCount = listing.mediaItems.filter((item) => item.type === "video").length;
  const photoCount = listing.mediaItems.filter((item) => item.type === "image").length || listing.imageUrls.length;
  const titleStatus = getTitleStatusOption(listing.sellerTitleStatus);
  const conditionStatus = getVehicleConditionOption(listing.vehicleCondition);
  const knownIssueLabels = listing.knownIssueFlags
    .map((issue) => getKnownIssueOption(issue)?.label)
    .filter((label): label is string => Boolean(label));
  const sellerNotes = listing.sellerDisclosureNotes?.trim();
  const cleanSellerDisclosure = Boolean(
    listing.sourceMode === "user" &&
      listing.knownIssueFlags.length === 0 &&
      (listing.vehicleCondition === "excellent" || listing.vehicleCondition === "good")
  );
  const sellerProofItems = readStringArray(listing.rawProviderSummary?.sellerProofItems);
  const mediaVerification = readMediaVerification(listing);
  const verifiedVehicleMedia = hasVerifiedVehicleMedia(listing);
  const mediaMismatch = hasMediaMismatch(listing) || hasJunkMediaSignal(listing);
  const hasOrganicMediaProof =
    listing.sourceMode !== "user" ||
    verifiedVehicleMedia ||
    (!mediaMismatch && sellerProofItems.length > 0);
  const hasDecodedVin = listing.tags.includes("vin-decoded") || Boolean(listing.rawProviderSummary?.vinDecode);
  const isExternalInventory = Boolean(
    listing.sourceMode && listing.sourceMode !== "user" && listing.sourceMode !== "mock"
  );
  const mediaLabel = getAnalysisMediaLabel(
    listing,
    videoCount,
    photoCount,
    hasOrganicMediaProof,
    mediaVerification
  );
  const mediaRisk = getMediaRisk({
    listing,
    videoCount,
    photoCount,
    hasOrganicMediaProof,
    mediaVerification
  });
  const mileageRisk = getMileageRisk(listing);
  const mediaVerificationRisk = getMediaVerificationRisk(listing);
  const hasAnyDisclosure =
    Boolean(titleStatus) ||
    Boolean(conditionStatus) ||
    knownIssueLabels.length > 0 ||
    Boolean(sellerNotes);

  const verificationPrompts = unique(
    [...listing.redFlags, ...listing.sellerQuestions].filter(isVerificationPrompt)
  );
  const riskItems = unique([
    ...listing.redFlags.filter((item) => !isVerificationPrompt(item) && !isDataGapPrompt(item)),
    mediaRisk,
    mediaVerificationRisk,
    mileageRisk,
    ...knownIssueLabels,
    titleStatus && titleStatus.tone === "warning" ? titleStatus.label : "",
    conditionStatus && conditionStatus.tone !== "positive" ? conditionStatus.label : "",
    listing.riskLevel === "High" ? "Overall risk is elevated from the available data." : ""
  ]).slice(0, 4);

  const verifyItems = buildVerifyItems({
    listing,
    hasDecodedVin,
    hasAnyDisclosure,
    isExternalInventory,
    mediaLabel,
    hasOrganicMediaProof,
    mileageRisk,
    mediaVerification,
    titleLabel: titleStatus?.label,
    verificationPrompts
  });

  const nextMove = getNextMove(listing, confidenceRead.score, hasAnyDisclosure, isExternalInventory);

  return {
    headline: confidenceRead.label,
    subhead: buildConfidenceSummary({
      listing,
      score: confidenceRead.score,
      isExternalInventory,
      riskCount: riskItems.length,
      hasAnyDisclosure,
      hasDecodedVin
    }),
    sections: [
      {
        id: "interesting",
        title: "Why it's interesting",
        eyebrow: "Buyer angle",
        body: buildBuyerBrief({
          listing,
          isExternalInventory,
          mediaLabel,
          hasOrganicMediaProof,
          mediaVerification,
          hasAnyDisclosure,
          cleanSellerDisclosure,
          knownIssueLabels,
          titleLabel: titleStatus?.shortLabel,
          conditionLabel: conditionStatus?.shortLabel
        }),
        items: [],
        tone: "positive"
      },
      {
        id: "deal_context",
        title: "Deal context",
        eyebrow: "Asking price only",
        body:
          `${formatCurrency(listing.price)} is the seller's asking price. Treat it as context, not a market-value call.`,
        items: unique([
          `${formatMileage(listing.mileage)} on the odometer`,
          sellerLabel,
          listing.location,
          hasDecodedVin ? "VIN decoded" : listing.vin ? "VIN provided, not decoded" : "No VIN verification yet"
        ]).slice(0, 4),
        tone: "default"
      },
      {
        id: "risk",
        title: "What could be wrong",
        eyebrow: "Risk read",
        body:
          riskItems.length > 0
            ? "These are the actual risk signals in the listing data, not generic chores."
            : isExternalInventory
              ? "No specific mechanical issue is visible from the imported data."
              : "No major issue is obvious from the seller's current disclosures.",
        items: riskItems,
        tone: riskItems.length > 0 ? "warning" : "default"
      },
      {
        id: "verify",
        title: "What to verify",
        eyebrow: "Before contact",
        body:
          "Confirm the few details that decide whether this is worth a drive.",
        items: verifyItems,
        tone: "action"
      },
      {
        id: "next_move",
        title: "Best next move",
        eyebrow: "Action",
        body: nextMove.body,
        items: nextMove.items,
        tone: "positive"
      }
    ]
  };
}

function buildVerifyItems({
  listing,
  hasDecodedVin,
  hasAnyDisclosure,
  isExternalInventory,
  mediaLabel,
  hasOrganicMediaProof,
  mileageRisk,
  mediaVerification,
  titleLabel,
  verificationPrompts
}: {
  listing: CarListing;
  hasDecodedVin: boolean;
  hasAnyDisclosure: boolean;
  isExternalInventory: boolean;
  mediaLabel: string;
  hasOrganicMediaProof: boolean;
  mileageRisk: string;
  mediaVerification: ReturnType<typeof readMediaVerification>;
  titleLabel?: string;
  verificationPrompts: string[];
}) {
  const items: string[] = [];

  if (listing.sellerType === "Dealer") {
    if (!verificationPrompts.some((item) => /out.?the.?door|add-?ons?|fees?/i.test(item))) {
      items.push("Confirm the real out-the-door number, including required add-ons and fees.");
    }
  } else {
    items.push(titleLabel ? `Confirm transfer details: ${titleLabel}.` : "Confirm title status and payoff logistics.");
  }

  if (!hasDecodedVin) {
    items.push(
      listing.vin
        ? "Use the VIN on the source listing to check history, trim, mileage, and title records."
        : "Get the VIN before treating the listing as verified."
    );
  }

  if (!hasAnyDisclosure) {
    items.push(
      isExternalInventory
        ? "Use the source page and photos to confirm condition, flaws, and included equipment."
        : "Ask for a direct condition note and photos of any flaws."
    );
  }

  if (listing.sourceMode === "user" && !hasOrganicMediaProof) {
    items.push(
      mediaVerification?.status === "mismatch"
        ? "Ask the seller to replace the media with proof that shows this exact vehicle."
        : "Ask for one car-specific proof shot or clip: odometer, dash, VIN plate, walkaround, or a visible flaw."
    );
  }

  if (/mileage|service records/i.test(mileageRisk)) {
    items.push("Ask what major maintenance is documented at this mileage.");
  }

  items.push(
    ...verificationPrompts.filter((item) =>
      !isAvailabilityOnlyPrompt(item) && !isRedundantTitlePrompt(item, items)
    )
  );

  if (listing.sellerQuestions.length > 0) {
    items.push(
      ...listing.sellerQuestions
        .filter((item) => !isAvailabilityOnlyPrompt(item) && !isRedundantTitlePrompt(item, items))
        .slice(0, 2)
    );
  } else if (listing.mediaItems.some((item) => item.type === "video")) {
    items.push("Use the video to spot dash lights, odd sounds, smoke, leaks, or shifting issues.");
  } else {
    items.push(
      mediaLabel === "no useful media"
        ? "Do not spend time on it until there are car-specific photos or video."
        : "Check the photos for tires, dash lights, odometer, title, and visible flaws."
    );
  }

  return unique(items).slice(0, 4);
}

function getNextMove(
  listing: CarListing,
  score: number,
  hasAnyDisclosure: boolean,
  isExternalInventory: boolean
) {
  if (isExternalInventory) {
    return {
      body:
        score >= 54
          ? "Open the source listing only if the photos, mileage, and dealer terms still fit."
          : "Thin imported listing. Confirm the basics on the source page before spending time on it.",
      items: [
        listing.sellerType === "Dealer"
          ? "Check the dealer page for current availability, fees, and required add-ons."
          : "Use the source listing to confirm availability and seller terms.",
        "Skip it if the final price or condition detail changes materially."
      ]
    };
  }

  if (score >= 76 && hasAnyDisclosure) {
    return {
      body: "This is worth a real contact attempt if the photos or video match the written condition.",
      items: [
        listing.sellerType === "Dealer"
          ? "Ask for the out-the-door number before going in."
          : "Use the first message below and keep the title/payment question upfront.",
        "Save it if you want to compare similar cars before reaching out."
      ]
    };
  }

  if (score >= 54) {
    return {
      body: "This is workable, but the missing proof matters. Ask for the gap before spending time on the car.",
      items: [
        "Contact only if the seller can quickly fill the missing proof.",
        "If the answer is vague, wait for a better listing."
      ]
    };
  }

  return {
    body: "Treat this as a thin listing. It needs better proof before it deserves serious buyer time.",
    items: [
      "Ask for more media and disclosure detail first.",
      "Do not drive out until the basics are confirmed."
    ]
  };
}

function unique(values: Array<string | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase().replace(/[.!?]+$/g, "");
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function buildBuyerBrief({
  listing,
  isExternalInventory,
  mediaLabel,
  hasOrganicMediaProof,
  mediaVerification,
  hasAnyDisclosure,
  cleanSellerDisclosure,
  knownIssueLabels,
  titleLabel,
  conditionLabel
}: {
  listing: CarListing;
  isExternalInventory: boolean;
  mediaLabel: string;
  hasOrganicMediaProof: boolean;
  mediaVerification: ReturnType<typeof readMediaVerification>;
  hasAnyDisclosure: boolean;
  cleanSellerDisclosure: boolean;
  knownIssueLabels: string[];
  titleLabel?: string;
  conditionLabel?: string;
}) {
  const vehicle = `${listing.year} ${listing.make} ${listing.model}`.trim();
  const source = isExternalInventory
    ? listing.sourceMode === "ebay"
      ? "Imported eBay listing"
      : listing.sellerType === "Dealer"
        ? "Imported dealer listing"
        : "Imported source listing"
    : "Private seller upload";
  const disclosure = unique([titleLabel, conditionLabel, ...knownIssueLabels]).slice(0, 3);
  const hasUnverifiedOrganicMedia = listing.sourceMode === "user" && !hasOrganicMediaProof;
  const hasFlaggedOrganicMedia =
    listing.sourceMode === "user" &&
    Boolean(
      mediaVerification?.status === "mismatch" ||
        mediaVerification?.riskFlags.some((flag) => /junk|spam|scam|not_a_vehicle|unrelated/i.test(flag))
    );
  const verifiedProofLabels =
    mediaVerification?.status === "verified_vehicle"
      ? mediaVerification.visibleProof.map(getVisibleProofLabel).slice(0, 3)
      : [];

  if (hasFlaggedOrganicMedia) {
    return `${source} for a ${vehicle} with ${mediaLabel}. Media check says the upload appears unrelated to this vehicle.`;
  }

  if (disclosure.length > 0) {
    const proofText = verifiedProofLabels.length > 0
      ? ` Media check sees ${verifiedProofLabels.join(", ")}.`
      : "";
    return `${source} for a ${vehicle} with ${mediaLabel}. Seller data discloses: ${disclosure.join(", ")}${
      cleanSellerDisclosure ? ", with no known issue flags selected" : ""
    }.${proofText}`;
  }

  if (hasUnverifiedOrganicMedia) {
    return `${source} for a ${vehicle} with ${mediaLabel}. The upload still needs proof that the media shows this exact car.`;
  }

  if (!hasAnyDisclosure && !isExternalInventory) {
    return `${source} for a ${vehicle} with ${mediaLabel}. The media may help, but condition and title details are still thin.`;
  }

  if (isExternalInventory) {
    return `${source} for a ${vehicle} with ${mediaLabel}. Useful for scouting, but the dealer page still controls fees, availability, and condition detail.`;
  }

  return `${source} for a ${vehicle} with ${mediaLabel}. Enough to start a read, but buyer confidence depends on proof that the media matches the car.`;
}

function buildConfidenceSummary({
  listing,
  score,
  isExternalInventory,
  riskCount,
  hasAnyDisclosure,
  hasDecodedVin
}: {
  listing: CarListing;
  score: number;
  isExternalInventory: boolean;
  riskCount: number;
  hasAnyDisclosure: boolean;
  hasDecodedVin: boolean;
}) {
  if (score < 54) {
    return "Thin read: this needs better proof before it deserves serious buyer time.";
  }

  if (isExternalInventory) {
    return riskCount > 0
      ? "Imported read: useful for screening, but the dealer/source page needs to confirm the final price and condition."
      : "Imported read: enough data to screen, but still dependent on the dealer/source listing.";
  }

  if (!hasAnyDisclosure || !hasDecodedVin) {
    return "Seller read: promising only if the missing verification and disclosure details check out.";
  }

  return "Seller read: enough listing data to evaluate, with condition and transfer details still worth confirming.";
}

function getMileageRisk(listing: CarListing) {
  if (!listing.mileage || !listing.year) return "";

  const age = Math.max(1, new Date().getFullYear() - listing.year);
  const expectedMileage = Math.max(12000, age * 12000);
  const ratio = listing.mileage / expectedMileage;

  if (listing.mileage >= 750000) {
    return "Mileage is extreme enough to question the entry or treat it as a project-only listing.";
  }

  if (listing.mileage >= 250000 || ratio >= 2.4) {
    return "Mileage is very high for the year.";
  }

  if (listing.mileage >= 150000 || ratio >= 1.55) {
    return "Higher mileage means service records matter.";
  }

  return "";
}

function getMediaVerificationRisk(listing: CarListing) {
  if (listing.sourceMode !== "user") return "";

  const hasMedia = listing.mediaItems.length > 0 || listing.imageUrls.length > 0;

  if (!hasMedia) {
    return "No car-specific media is attached.";
  }

  return "";
}

function getAnalysisMediaLabel(
  listing: CarListing,
  videoCount: number,
  photoCount: number,
  hasOrganicMediaProof: boolean,
  mediaVerification: ReturnType<typeof readMediaVerification>
) {
  const hasFlaggedMedia =
    listing.sourceMode === "user" &&
    Boolean(
      mediaVerification?.status === "mismatch" ||
        mediaVerification?.riskFlags.some((flag) => /junk|spam|scam|not_a_vehicle|unrelated/i.test(flag))
    );

  if (videoCount > 0) {
    const duration = getLongestVideoDuration(listing);
    const label = duration > 0 ? `${formatDuration(duration)} video` : "video";
    if (hasFlaggedMedia) return `flagged ${label}`;
    return listing.sourceMode === "user" && !hasOrganicMediaProof ? `unverified ${label}` : label;
  }

  if (photoCount > 0) {
    if (hasFlaggedMedia) return `${photoCount} flagged photo${photoCount === 1 ? "" : "s"}`;
    return listing.sourceMode === "user" && !hasOrganicMediaProof
      ? `${photoCount} unverified photo${photoCount === 1 ? "" : "s"}`
      : `${photoCount} photo${photoCount === 1 ? "" : "s"}`;
  }

  return "no useful media";
}

function getMediaRisk({
  listing,
  videoCount,
  photoCount,
  hasOrganicMediaProof,
  mediaVerification
}: {
  listing: CarListing;
  videoCount: number;
  photoCount: number;
  hasOrganicMediaProof: boolean;
  mediaVerification: ReturnType<typeof readMediaVerification>;
}) {
  if (listing.sourceMode === "user" && mediaVerification?.status === "mismatch") {
    return mediaVerification.notes || "Media appears unrelated to the listed vehicle.";
  }

  if (listing.sourceMode === "user" && mediaVerification?.status === "unclear") {
    return mediaVerification.notes || "Media verification could not confidently confirm this exact vehicle.";
  }

  if (listing.sourceMode === "user" && !hasOrganicMediaProof && (videoCount > 0 || photoCount > 0)) {
    return "Media is attached, but it has not been marked or verified as car-specific proof.";
  }

  if (videoCount > 0) {
    const duration = getLongestVideoDuration(listing);

    if (duration > 210) {
      return "Long video may hide the important condition moments.";
    }

    if (duration > 0 && duration < 12) {
      return "Video may be too short to show condition clearly.";
    }

    return "";
  }

  if (photoCount > 0 && photoCount < 6) {
    return "Photo set is too thin to judge condition confidently.";
  }

  return "";
}

function getLongestVideoDuration(listing: CarListing) {
  const durations = listing.mediaItems
    .filter((item) => item.type === "video" && typeof item.durationSeconds === "number")
    .map((item) => item.durationSeconds ?? 0)
    .filter((duration) => duration > 0);

  return Math.max(0, ...durations);
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function isVerificationPrompt(value: string) {
  return /^(confirm|verify|ask|request|check)\b/i.test(value.trim()) ||
    /out.?the.?door|availability|available|listed price/i.test(value);
}

function isDataGapPrompt(value: string) {
  return /vin data has not|market comps|market-checked|price has not|disclosures are thin/i.test(value);
}

function isAvailabilityOnlyPrompt(value: string) {
  return /available|availability|still listed|still for sale/i.test(value) && !/fee|add-?on|out.?the.?door/i.test(value);
}

function isRedundantTitlePrompt(value: string, existingItems: string[]) {
  if (!/title|payoff|lien/i.test(value)) return false;
  return existingItems.some((item) => /title|payoff|lien|transfer details/i.test(item));
}
