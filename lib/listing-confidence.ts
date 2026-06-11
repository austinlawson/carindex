import type {
  CarListing,
  DealGrade,
  KnownIssueFlag,
  SellerTitleStatus,
  VehicleConditionStatus
} from "@/data/listings";
import {
  hasJunkMediaSignal,
  hasMediaMismatch,
  hasVerifiedVehicleMedia,
  readMediaVerification
} from "@/lib/media-verification";

export type ListingConfidence = {
  score: number;
  grade: DealGrade;
  label: string;
  shortLabel: string;
  summary: string;
  strengths: string[];
  gaps: string[];
  mediaLabel: string;
  pricingLabel: string;
};

export function getListingConfidence(listing: CarListing): ListingConfidence {
  const strengths: string[] = [];
  const gaps: string[] = ["Market price check not run"];
  let score = 12;

  if (listing.year > 0 && listing.make && listing.model) {
    score += 10;
    strengths.push("Vehicle basics are filled");
  }

  if (listing.price > 0) score += 5;
  if (listing.mileage > 0) score += 5;
  if (listing.location?.trim()) score += 4;

  if (hasDecodedVin(listing)) {
    score += 8;
    strengths.push("VIN decoded");
  } else if (listing.vin) {
    score += 4;
    strengths.push("VIN provided");
    gaps.push("VIN not decoded");
  } else {
    gaps.push("VIN missing");
  }

  const videoCount = listing.mediaItems.filter((item) => item.type === "video").length;
  const photoCount = listing.mediaItems.filter((item) => item.type === "image").length;
  const mediaCount = listing.mediaItems.length;
  const sellerProofItems = readStringArray(listing.rawProviderSummary?.sellerProofItems);
  const mediaVerification = readMediaVerification(listing);
  const verifiedVehicleMedia = hasVerifiedVehicleMedia(listing);
  const mediaMismatch = hasMediaMismatch(listing) || hasJunkMediaSignal(listing);
  const hasOrganicMediaProof =
    listing.sourceMode !== "user" ||
    verifiedVehicleMedia ||
    (!mediaMismatch && sellerProofItems.length > 0);
  const mediaRead = getMediaRead(listing, videoCount, photoCount, hasOrganicMediaProof);
  score += mediaRead.score;
  if (mediaRead.strength) strengths.push(mediaRead.strength);
  gaps.push(...mediaRead.gaps);

  if (listing.sourceMode === "user" && verifiedVehicleMedia) {
    score += 6;
    strengths.push("Media verified as vehicle-specific");
  } else if (listing.sourceMode === "user" && mediaMismatch) {
    score -= 32;
    gaps.push("Media may not show the listed vehicle");
  } else if (listing.sourceMode === "user" && mediaVerification?.status === "unclear") {
    score -= 5;
    gaps.push("Media verification was inconclusive");
  }

  const titleScore = scoreTitleStatus(listing.sellerTitleStatus);
  score += titleScore.score;
  if (titleScore.strength) strengths.push(titleScore.strength);
  if (titleScore.gap) gaps.push(titleScore.gap);

  if (listing.sellerTitleStatus === "not_disclosed" && listing.sellerType === "Private Seller") {
    gaps.push("Title status not disclosed");
  }

  const conditionScore = scoreVehicleCondition(listing.vehicleCondition);
  score += conditionScore.score;
  if (conditionScore.strength) strengths.push(conditionScore.strength);
  if (conditionScore.gap) gaps.push(conditionScore.gap);

  if (listing.vehicleCondition === "not_disclosed" && listing.sellerType === "Private Seller") {
    gaps.push("Condition not disclosed");
  }

  if (listing.knownIssueFlags.length > 0) {
    score += 2;
    score -= scoreKnownIssuePenalty(listing.knownIssueFlags);
    strengths.push("Known issues disclosed");
  } else if (
    listing.sourceMode === "user" &&
    (listing.vehicleCondition === "excellent" || listing.vehicleCondition === "good")
  ) {
    score += 3;
    strengths.push("No known issue flags disclosed");
  }

  const mileageRead = getMileageRead(listing);
  if (mileageRead.penalty > 0) {
    score -= mileageRead.penalty;
    gaps.push(mileageRead.label);
  }

  if (sellerProofItems.length > 0) {
    score += Math.min(4, sellerProofItems.length);
    strengths.push(`${sellerProofItems.length} proof signal${sellerProofItems.length === 1 ? "" : "s"} marked`);
  } else if (listing.sourceMode === "user") {
    gaps.push("Car-specific media not verified");
  }

  const notesLength = Math.max(
    listing.listingDescription?.trim().length ?? 0,
    listing.sellerDisclosureNotes?.trim().length ?? 0
  );
  if (notesLength >= 120) {
    score += 8;
    strengths.push("Detailed seller notes");
  } else if (notesLength >= 40) {
    score += 5;
    strengths.push("Seller notes included");
  } else if (listing.sourceMode === "user") {
    gaps.push("Seller notes are thin");
  }

  if (listing.sellerPhone || listing.sellerEmail || listing.contactUrl || listing.externalListingUrl) {
    score += 5;
    strengths.push("Contact path available");
  } else {
    gaps.push("Contact path missing");
  }

  if (listing.rawProviderSummary && Object.keys(listing.rawProviderSummary).length > 0) {
    score += 3;
    strengths.push("Provider data attached");
  }

  if (listing.sourceMode && listing.sourceMode !== "mock") {
    score += 3;
  }

  if (listing.riskLevel === "High") {
    score -= 12;
    gaps.push("High-risk listing");
  } else if (listing.riskLevel === "Medium") {
    score -= 3;
  }

  score = Math.max(0, Math.min(100, score));
  const grade = gradeFromScore(score);
  const label = labelFromScore(score);
  const mediaLabel =
    listing.sourceMode === "user" && mediaMismatch && videoCount > 0
      ? "Flagged video"
      : listing.sourceMode === "user" && mediaMismatch && photoCount > 0
        ? `${photoCount} flagged photo${photoCount === 1 ? "" : "s"}`
    : listing.sourceMode === "user" && !hasOrganicMediaProof && videoCount > 0
      ? "Unverified video"
      : videoCount > 0
        ? getVideoMediaLabel(listing)
      : photoCount > 0
        ? listing.sourceMode === "user" && !hasOrganicMediaProof
          ? `${photoCount} unverified photo${photoCount === 1 ? "" : "s"}`
          : `${photoCount} photo${photoCount === 1 ? "" : "s"}`
        : `${mediaCount} media`;

  return {
    score,
    grade,
    label,
    shortLabel: shortLabelFromScore(score),
    summary:
      "This read weighs listing completeness, media depth, VIN/disclosure data, condition risk, mileage, seller notes, and contact readiness. Market pricing has not been verified yet.",
    strengths: strengths.slice(0, 5),
    gaps: unique(gaps).slice(0, 5),
    mediaLabel,
    pricingLabel: "Price check not run"
  };
}

function scoreTitleStatus(value: SellerTitleStatus) {
  switch (value) {
    case "paid_off_title_in_hand":
      return { score: 8, strength: "Title in hand disclosed" };
    case "paid_off_title_pending":
    case "financed_lien":
      return { score: 4, strength: "Title/payoff status disclosed" };
    case "lease_payoff":
      return { score: 1, gap: "Lease payoff adds transfer complexity" };
    case "not_sure":
      return { score: -4, gap: "Seller is unsure about title status" };
    default:
      return { score: 0 };
  }
}

function scoreVehicleCondition(value: VehicleConditionStatus) {
  switch (value) {
    case "excellent":
      return { score: 8, strength: "Excellent condition disclosed" };
    case "good":
      return { score: 6, strength: "Good condition disclosed" };
    case "runs_with_issues":
      return { score: -3, gap: "Runs with disclosed issues" };
    case "needs_repair":
      return { score: -8, gap: "Needs repair" };
    case "mechanic_special":
      return { score: -10, gap: "Mechanic-special condition" };
    case "project_non_running":
      return { score: -14, gap: "Project or non-running condition" };
    default:
      return { score: 0 };
  }
}

function scoreKnownIssuePenalty(flags: KnownIssueFlag[]) {
  return flags.reduce((total, flag) => {
    switch (flag) {
      case "rebuilt_or_salvage_title":
        return total + 12;
      case "engine_issue":
      case "transmission_issue":
        return total + 10;
      case "warning_lights":
        return total + 6;
      case "leak":
      case "body_damage":
      case "ac_or_heat_issue":
      case "tires_or_brakes_due":
        return total + 3;
      default:
        return total;
    }
  }, 0);
}

function getMediaRead(
  listing: CarListing,
  videoCount: number,
  photoCount: number,
  hasOrganicMediaProof: boolean
) {
  const gaps: string[] = [];
  const videoDurations = listing.mediaItems
    .filter((item) => item.type === "video" && typeof item.durationSeconds === "number")
    .map((item) => item.durationSeconds ?? 0)
    .filter((duration) => duration > 0);
  const longestVideo = Math.max(0, ...videoDurations);

  if (listing.sourceMode === "user" && !hasOrganicMediaProof && (videoCount > 0 || photoCount > 0)) {
    return {
      score: videoCount > 0 ? 5 : 2,
      strength: videoCount > 0 ? "Unverified video attached" : "Unverified photos attached",
      gaps: ["Media is attached, but not marked as car-specific proof"]
    };
  }

  if (videoCount > 0) {
    if (longestVideo >= 12 && longestVideo <= 210) {
      return {
        score: 16,
        strength: `Useful video included (${formatDuration(longestVideo)})`,
        gaps
      };
    }

    if (longestVideo > 210) {
      return {
        score: 12,
        strength: `Long video included (${formatDuration(longestVideo)})`,
        gaps: ["Long videos need the key condition moments to be easy to find"]
      };
    }

    if (longestVideo > 0 && longestVideo < 12) {
      return {
        score: 8,
        strength: "Short video included",
        gaps: ["Video may be too short to show condition clearly"]
      };
    }

    return {
      score: 12,
      strength: "Video included",
      gaps: ["Video length is unknown"]
    };
  }

  if (photoCount >= 30) {
    return {
      score: 15,
      strength: `${photoCount} photos included`,
      gaps
    };
  }

  if (photoCount >= 12) {
    return {
      score: 12,
      strength: `${photoCount} photos included`,
      gaps
    };
  }

  if (photoCount >= 6) {
    return {
      score: 8,
      strength: `${photoCount} photos included`,
      gaps: ["Photo set may miss tires, dash, odometer, title, or flaws"]
    };
  }

  if (photoCount > 0) {
    return {
      score: 3,
      strength: `${photoCount} photo${photoCount === 1 ? "" : "s"} included`,
      gaps: ["Too few photos to judge condition confidently"]
    };
  }

  return {
    score: 0,
    strength: "",
    gaps: ["Media missing"]
  };
}

function getMileageRead(listing: CarListing) {
  if (!listing.mileage || !listing.year) {
    return { penalty: 0, label: "" };
  }

  const age = Math.max(1, new Date().getFullYear() - listing.year);
  const expectedMileage = Math.max(12000, age * 12000);
  const ratio = listing.mileage / expectedMileage;

  if (listing.mileage >= 750000) {
    return { penalty: 24, label: "Mileage is extreme enough to need explanation" };
  }

  if (listing.mileage >= 250000 || ratio >= 2.4) {
    return { penalty: 14, label: "Mileage is very high for the year" };
  }

  if (listing.mileage >= 150000 || ratio >= 1.55) {
    return { penalty: 7, label: "Higher mileage means service records matter" };
  }

  return { penalty: 0, label: "" };
}

function getVideoMediaLabel(listing: CarListing) {
  const durations = listing.mediaItems
    .filter((item) => item.type === "video" && typeof item.durationSeconds === "number")
    .map((item) => item.durationSeconds ?? 0)
    .filter((duration) => duration > 0);
  const longestVideo = Math.max(0, ...durations);

  return longestVideo > 0 ? `Video ${formatDuration(longestVideo)}` : "Video";
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function hasDecodedVin(listing: CarListing) {
  if (listing.tags.includes("vin-decoded")) return true;

  const vinDecode = listing.rawProviderSummary?.vinDecode;
  return Boolean(vinDecode && typeof vinDecode === "object" && !Array.isArray(vinDecode));
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function gradeFromScore(score: number): DealGrade {
  if (score >= 86) return "A";
  if (score >= 76) return "A-";
  if (score >= 66) return "B+";
  if (score >= 54) return "B";
  if (score >= 40) return "C";
  return "Pass";
}

function labelFromScore(score: number) {
  if (score >= 86) return "Strong buyer read";
  if (score >= 76) return "Good buyer read";
  if (score >= 66) return "Useful buyer read";
  if (score >= 54) return "Basic buyer read";
  if (score >= 40) return "Thin buyer read";
  return "Very thin buyer read";
}

function shortLabelFromScore(score: number) {
  if (score >= 76) return "High confidence";
  if (score >= 54) return "Moderate confidence";
  return "Thin confidence";
}

function unique(values: string[]) {
  return [...new Set(values)];
}
