import type { CarListing } from "@/data/listings";

export const currentMediaVerificationPromptVersion = "media-verification-2026-06-11-v1";

export type MediaVerificationStatus = "verified_vehicle" | "unclear" | "mismatch" | "not_checked";

export type MediaVerificationResult = {
  status: MediaVerificationStatus;
  confidence: number;
  isVehicleMedia: boolean;
  appearsToMatchListing: boolean;
  visibleProof: string[];
  qualityIssues: string[];
  riskFlags: string[];
  notes: string;
  checkedAt: string;
  model?: string;
  promptVersion?: string;
  sampleCount?: number;
};

const statuses = new Set<MediaVerificationStatus>([
  "verified_vehicle",
  "unclear",
  "mismatch",
  "not_checked"
]);

export function readMediaVerification(listingOrRawSummary: CarListing | unknown) {
  const rawSummary =
    listingOrRawSummary &&
    typeof listingOrRawSummary === "object" &&
    !Array.isArray(listingOrRawSummary) &&
    "rawProviderSummary" in listingOrRawSummary
      ? (listingOrRawSummary as Pick<CarListing, "rawProviderSummary">).rawProviderSummary
      : listingOrRawSummary;

  if (!rawSummary || typeof rawSummary !== "object" || Array.isArray(rawSummary)) {
    return null;
  }

  const mediaVerification = (rawSummary as { mediaVerification?: unknown }).mediaVerification;
  if (!mediaVerification || typeof mediaVerification !== "object" || Array.isArray(mediaVerification)) {
    return null;
  }

  const candidate = mediaVerification as Partial<MediaVerificationResult>;
  const status = statuses.has(candidate.status as MediaVerificationStatus)
    ? (candidate.status as MediaVerificationStatus)
    : "not_checked";

  return {
    status,
    confidence: clampConfidence(candidate.confidence),
    isVehicleMedia: Boolean(candidate.isVehicleMedia),
    appearsToMatchListing: Boolean(candidate.appearsToMatchListing),
    visibleProof: readStringArray(candidate.visibleProof),
    qualityIssues: readStringArray(candidate.qualityIssues),
    riskFlags: readStringArray(candidate.riskFlags),
    notes: typeof candidate.notes === "string" ? candidate.notes : "",
    checkedAt: typeof candidate.checkedAt === "string" ? candidate.checkedAt : "",
    model: typeof candidate.model === "string" ? candidate.model : undefined,
    promptVersion: typeof candidate.promptVersion === "string" ? candidate.promptVersion : undefined,
    sampleCount: typeof candidate.sampleCount === "number" ? candidate.sampleCount : undefined
  } satisfies MediaVerificationResult;
}

export function hasVerifiedVehicleMedia(listingOrRawSummary: CarListing | unknown) {
  const verification = readMediaVerification(listingOrRawSummary);
  return verification?.status === "verified_vehicle" && verification.appearsToMatchListing;
}

export function hasMediaMismatch(listingOrRawSummary: CarListing | unknown) {
  const verification = readMediaVerification(listingOrRawSummary);
  return verification?.status === "mismatch";
}

export function hasJunkMediaSignal(listingOrRawSummary: CarListing | unknown) {
  const verification = readMediaVerification(listingOrRawSummary);
  if (!verification) return false;

  return verification.riskFlags.some((flag) =>
    /junk|spam|scam|not_a_vehicle|unrelated|text_ad|does_not_match/i.test(flag)
  );
}

export function getMediaVerificationIssue(listingOrRawSummary: CarListing | unknown) {
  const verification = readMediaVerification(listingOrRawSummary);

  if (!verification) {
    return "The media could not be verified.";
  }

  if (verification.notes.trim()) {
    return verification.notes.trim();
  }

  if (verification.riskFlags.length > 0) {
    return `Media check flagged: ${verification.riskFlags.join(", ")}.`;
  }

  return "The media check could not confirm this upload shows the listed vehicle.";
}

export function getVisibleProofLabel(value: string) {
  switch (value) {
    case "exterior":
      return "exterior";
    case "interior":
      return "interior";
    case "dash":
      return "dash";
    case "odometer":
      return "odometer";
    case "vin_plate":
      return "VIN plate";
    case "tires":
      return "tires";
    case "flaws":
      return "visible flaws";
    case "title":
      return "title";
    case "engine_bay":
      return "engine bay";
    case "video_context":
      return "video context";
    default:
      return value.replace(/_/g, " ");
  }
}

export function createUncheckedMediaVerification(reason: string): MediaVerificationResult {
  return {
    status: "not_checked",
    confidence: 0,
    isVehicleMedia: false,
    appearsToMatchListing: false,
    visibleProof: [],
    qualityIssues: [],
    riskFlags: [],
    notes: reason,
    checkedAt: new Date().toISOString(),
    promptVersion: currentMediaVerificationPromptVersion
  };
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function clampConfidence(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}
