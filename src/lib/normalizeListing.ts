import type {
  CarListing,
  DealGrade,
  KnownIssueFlag,
  ListingMediaItem,
  ListingMediaType,
  ListingSource,
  RawListingInput,
  RiskLevel,
  SellerTitleStatus,
  SellerType,
  VehicleConditionStatus
} from "@/src/lib/listingTypes";

const fallbackImage = "/cars/sedan-night.svg";

const dealGrades = new Set<DealGrade>(["A", "A-", "B+", "B", "C", "Pass"]);
const riskLevels = new Set<RiskLevel>(["Low", "Medium", "High"]);
const sellerTypes = new Set<SellerType>(["Private Seller", "Dealer", "Small Lot"]);
const sellerTitleStatuses = new Set<SellerTitleStatus>([
  "not_disclosed",
  "paid_off_title_in_hand",
  "paid_off_title_pending",
  "financed_lien",
  "lease_payoff",
  "not_sure"
]);
const vehicleConditionStatuses = new Set<VehicleConditionStatus>([
  "not_disclosed",
  "excellent",
  "good",
  "runs_with_issues",
  "needs_repair",
  "mechanic_special",
  "project_non_running"
]);
const knownIssueFlags = new Set<KnownIssueFlag>([
  "warning_lights",
  "engine_issue",
  "transmission_issue",
  "leak",
  "body_damage",
  "rebuilt_or_salvage_title",
  "ac_or_heat_issue",
  "tires_or_brakes_due"
]);

export function normalizeListing(input: RawListingInput, sourceMode: ListingSource = "csv"): CarListing {
  const effectiveSourceMode = input.sourceMode ?? sourceMode;
  const mediaItems = normalizeMediaItems(input.mediaItems, input.imageUrls ?? input.imageUrl);
  const imageUrls = mediaItems.filter((item) => item.type === "image").map((item) => item.url);
  const firstMediaUrl = mediaItems[0]?.thumbnailUrl ?? mediaItems[0]?.url;
  const year = toNumber(input.year, 0);
  const make = cleanText(input.make, "Unknown");
  const model = cleanText(input.model, "Vehicle");
  const trim = cleanText(input.trim, "");
  const price = toNumber(input.price, 0);
  const mileage = toNumber(input.mileage, 0);
  const estimated = estimateFairValue(year, price, mileage);
  const low = toNumber(input.estimatedFairValueLow ?? input.fairValueRange?.low, estimated.low);
  const high = toNumber(input.estimatedFairValueHigh ?? input.fairValueRange?.high, estimated.high);
  const fairLow = Math.min(low, high);
  const fairHigh = Math.max(low, high);
  const suggestedOffer = toNumber(input.suggestedOffer, Math.max(0, price - 700));
  const walkawayPrice = toNumber(input.walkawayPrice, price);
  const aiHook =
    cleanText(input.aiHook, "") ||
    cleanText(input.aiTake, "") ||
    `${make} ${model}: ${price > 0 ? "worth a closer look" : "needs a price check"}.`;
  const sellerQuestions = toStringList(input.sellerQuestions, [
    "Is the title clean and in your name?",
    "Can I see recent service records?",
    "Are you open to a pre-purchase inspection?"
  ]);

  return {
    id: cleanText(input.id, `${effectiveSourceMode}-${year}-${make}-${model}-${price}`)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, ""),
    sourceName: cleanOptional(input.sourceName),
    sourceUrl: cleanOptional(input.sourceUrl),
    externalListingUrl: cleanOptional(input.externalListingUrl ?? input.sourceUrl),
    importedAt: cleanOptional(input.importedAt) ?? new Date().toISOString(),
    lastSeenAt: cleanOptional(input.lastSeenAt) ?? new Date().toISOString(),
    year,
    make,
    model,
    trim,
    price,
    mileage,
    location: cleanText(input.location, "Local market"),
    distance: toNumber(input.distance, 0),
    sellerType: coerceSellerType(input.sellerType),
    sellerName: cleanOptional(input.sellerName),
    sellerPhone: cleanOptional(input.sellerPhone),
    sellerEmail: cleanOptional(input.sellerEmail),
    contactUrl: cleanOptional(input.contactUrl ?? input.externalListingUrl ?? input.sourceUrl),
    vin: cleanOptional(input.vin),
    sellerTitleStatus: coerceSellerTitleStatus(input.sellerTitleStatus),
    vehicleCondition: coerceVehicleConditionStatus(input.vehicleCondition),
    knownIssueFlags: toKnownIssueFlagList(input.knownIssueFlags),
    sellerDisclosureNotes: cleanOptional(input.sellerDisclosureNotes),
    providerListingId: cleanOptional(input.providerListingId),
    imageUrl: imageUrls[0] ?? firstMediaUrl ?? fallbackImage,
    imageUrls: imageUrls.length > 0 ? imageUrls : [fallbackImage],
    mediaItems:
      mediaItems.length > 0
        ? mediaItems
        : [{ url: fallbackImage, type: "image", label: "Fallback image" }],
    listingTitle: cleanOptional(input.listingTitle) ?? `${year} ${make} ${model}`.trim(),
    listingDescription: cleanOptional(input.listingDescription),
    dealGrade: coerceDealGrade(input.dealGrade, deriveDealGrade(price, fairLow, mileage, year)),
    feedBadge: cleanText(input.feedBadge, deriveFeedBadge(price, fairLow, mileage, year, imageUrls.length)),
    aiHook,
    aiTake: cleanText(input.aiTake, aiHook),
    fairValueRange: {
      low: fairLow,
      high: fairHigh
    },
    marketEdge: cleanText(input.estimatedMarketEdge ?? input.marketEdge, deriveMarketEdge(price, fairLow, fairHigh)),
    confidence: clamp(toNumber(input.confidence, deriveConfidence(price, fairLow, fairHigh, imageUrls.length, mileage)), 0, 100),
    riskLevel: coerceRiskLevel(input.riskLevel, deriveRiskLevel(year, mileage)),
    whyItMadeTheFeed: cleanText(
      input.whyItMadeTheFeed,
      "It matched the search because the price, mileage, and model profile are worth comparing against local comps."
    ),
    redFlags: toStringList(input.redFlags, ["Verify title status", "Confirm service history"]),
    sellerQuestions,
    suggestedFirstMessage: cleanText(
      input.suggestedFirstMessage,
      `Hi, I am interested in the ${year} ${make} ${model}. Is the title clean, and are you open to a pre-purchase inspection?`
    ),
    suggestedOffer,
    walkawayPrice,
    checklistItems: toStringList(input.checklistItems, [
      "Cold start",
      "Scan for codes",
      "Check tires and brakes",
      "Verify title and VIN"
    ]),
    tags: toStringList(input.tags, deriveTags(make, model, price, mileage, year, effectiveSourceMode)),
    reelCaptions: normalizeReelCaptions(input, aiHook, sellerQuestions[0], suggestedOffer, walkawayPrice),
    aiVoice: normalizeAiVoice(input.aiVoice),
    sourceMode: effectiveSourceMode,
    rawProviderSummary: input.rawProviderSummary
  };
}

export function normalizeListings(inputs: RawListingInput[], sourceMode: ListingSource = "csv") {
  return inputs.map((input) => normalizeListing(input, sourceMode));
}

function normalizeReelCaptions(
  input: RawListingInput,
  aiHook: string,
  sellerQuestion: string,
  suggestedOffer: number,
  walkawayPrice: number
) {
  const provided = toStringList(input.reelCaptions, []);
  if (provided.length > 0) {
    return provided.slice(0, 5);
  }

  return [
    aiHook,
    cleanText(input.estimatedMarketEdge ?? input.marketEdge, "Price needs a comp check."),
    `${coerceRiskLevel(input.riskLevel, "Medium")} risk. Verify before driving out.`,
    sellerQuestion,
    suggestedOffer > 0
      ? `Start around ${formatDollars(suggestedOffer)} if it checks out.`
      : `Walk away over ${formatDollars(walkawayPrice)}.`
  ];
}

function normalizeImageUrls(value: string[] | string | undefined) {
  if (Array.isArray(value)) {
    return value.map((url) => cleanText(url, "")).filter(Boolean);
  }

  return cleanText(value, "")
    .split(/[|;]/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function normalizeMediaItems(
  mediaItems: ListingMediaItem[] | string | undefined,
  imageValue: string[] | string | undefined
): ListingMediaItem[] {
  if (Array.isArray(mediaItems)) {
    const items = mediaItems
      .map((item, index) => normalizeMediaItem(item, index))
      .filter((item): item is ListingMediaItem => Boolean(item));

    if (items.length > 0) {
      return items;
    }
  }

  if (typeof mediaItems === "string" && mediaItems.trim()) {
    const parsed = mediaItems
      .split(/[|;]/)
      .map((url, index) => createMediaItem(url.trim(), index))
      .filter((item): item is ListingMediaItem => Boolean(item));

    if (parsed.length > 0) {
      return parsed;
    }
  }

  return normalizeImageUrls(imageValue).map((url, index) => ({
    url,
    type: "image",
    label: `Photo ${index + 1}`
  }));
}

function normalizeMediaItem(item: ListingMediaItem, index: number): ListingMediaItem | undefined {
  const url = cleanText(item.url, "");
  if (!url) return undefined;

  const normalized: ListingMediaItem = {
    url,
    type: coerceMediaType(item.type, url),
    label: cleanOptional(item.label) ?? `Media ${index + 1}`
  };

  const thumbnailUrl = cleanOptional(item.thumbnailUrl);
  if (thumbnailUrl) {
    normalized.thumbnailUrl = thumbnailUrl;
  }

  const durationSeconds = toNumber(item.durationSeconds, 0);
  if (durationSeconds > 0) {
    normalized.durationSeconds = durationSeconds;
  }

  return normalized;
}

function normalizeAiVoice(value: RawListingInput["aiVoice"]) {
  if (!value?.script) {
    return undefined;
  }

  return {
    script: cleanText(value.script, ""),
    audioUrl: cleanOptional(value.audioUrl),
    persona: cleanText(value.persona, "Deal Scout"),
    voice: cleanText(value.voice, "coral"),
    scriptModel: cleanOptional(value.scriptModel),
    ttsModel: cleanOptional(value.ttsModel),
    generatedAt: cleanOptional(value.generatedAt),
    promptVersion: cleanOptional(value.promptVersion)
  };
}

function createMediaItem(url: string, index: number): ListingMediaItem | undefined {
  if (!url) return undefined;

  return {
    url,
    type: coerceMediaType(undefined, url),
    label: `Media ${index + 1}`
  };
}

function coerceMediaType(value: unknown, url: string): ListingMediaType {
  if (value === "video" || value === "image") return value;
  if (/\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url) || url.startsWith("blob:")) return "video";
  return "image";
}

function toStringList(value: string[] | string | undefined, fallback: string[]) {
  if (Array.isArray(value)) {
    const items = value.map((item) => cleanText(item, "")).filter(Boolean);
    return items.length > 0 ? items : fallback;
  }

  const items = cleanText(value, "")
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
}

function cleanText(value: unknown, fallback: string) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

function cleanOptional(value: unknown) {
  const text = cleanText(value, "");
  return text.length > 0 ? text : undefined;
}

function toNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(String(value ?? "").replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function coerceDealGrade(value: unknown, fallback: DealGrade = "B"): DealGrade {
  const grade = cleanText(value, fallback) as DealGrade;
  return dealGrades.has(grade) ? grade : fallback;
}

function coerceRiskLevel(value: unknown, fallback: RiskLevel = "Medium"): RiskLevel {
  const risk = cleanText(value, fallback) as RiskLevel;
  return riskLevels.has(risk) ? risk : fallback;
}

function coerceSellerType(value: unknown): SellerType {
  const sellerType = cleanText(value, "Private Seller") as SellerType;
  return sellerTypes.has(sellerType) ? sellerType : "Private Seller";
}

function coerceSellerTitleStatus(value: unknown): SellerTitleStatus {
  const status = cleanText(value, "not_disclosed") as SellerTitleStatus;
  return sellerTitleStatuses.has(status) ? status : "not_disclosed";
}

function coerceVehicleConditionStatus(value: unknown): VehicleConditionStatus {
  const condition = cleanText(value, "not_disclosed") as VehicleConditionStatus;
  return vehicleConditionStatuses.has(condition) ? condition : "not_disclosed";
}

function toKnownIssueFlagList(value: KnownIssueFlag[] | string[] | string | undefined) {
  const rawItems = Array.isArray(value)
    ? value
    : cleanText(value, "")
        .split(/[|;]/)
        .map((item) => item.trim())
        .filter(Boolean);

  return rawItems.filter((item): item is KnownIssueFlag =>
    knownIssueFlags.has(item as KnownIssueFlag)
  );
}

function formatDollars(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function estimateFairValue(year: number, price: number, mileage: number) {
  if (price <= 0) {
    return { low: 0, high: 0 };
  }

  const currentYear = new Date().getFullYear();
  const age = year > 0 ? Math.max(0, currentYear - year) : 8;
  const expectedMileage = Math.max(12000, age * 12000);
  const mileageAdjustment = mileage > 0 ? clamp((expectedMileage - mileage) / expectedMileage, -0.12, 0.12) : 0;
  const center = Math.round(price * (1.03 + mileageAdjustment));
  return {
    low: Math.max(500, Math.round(center * 0.94)),
    high: Math.max(750, Math.round(center * 1.08))
  };
}

function deriveDealGrade(price: number, fairLow: number, mileage: number, year: number): DealGrade {
  if (price <= 0 || fairLow <= 0) {
    return "C";
  }

  const edge = fairLow - price;
  const currentYear = new Date().getFullYear();
  const age = year > 0 ? Math.max(1, currentYear - year) : 8;
  const mileagePerYear = mileage > 0 ? mileage / age : 12000;

  if (edge > 1800 && mileagePerYear < 15000) return "A";
  if (edge > 900) return "A-";
  if (edge > 250) return "B+";
  if (edge > -900) return "B";
  return "C";
}

function deriveFeedBadge(price: number, fairLow: number, mileage: number, year: number, imageCount: number) {
  const grade = deriveDealGrade(price, fairLow, mileage, year);
  if (grade === "A") return "AI Pick";
  if (grade === "A-") return "Worth Watching";
  if (imageCount > 2) return "Photo Rich";
  if (deriveRiskLevel(year, mileage) === "High") return "Risky Deal";
  return "AI Watchlist";
}

function deriveMarketEdge(price: number, fairLow: number, fairHigh: number) {
  if (price <= 0 || fairLow <= 0 || fairHigh <= 0) {
    return "Needs market check";
  }

  if (price < fairLow) {
    return `${formatDollars(fairLow - price)} under market`;
  }

  if (price > fairHigh) {
    return `${formatDollars(price - fairHigh)} over market`;
  }

  return "Fair market range";
}

function deriveConfidence(price: number, fairLow: number, fairHigh: number, imageCount: number, mileage: number) {
  let score = 68;
  if (price > 0) score += 6;
  if (mileage > 0) score += 6;
  if (fairLow > 0 && fairHigh > 0) score += 5;
  if (imageCount > 0) score += 5;
  if (imageCount > 2) score += 4;
  return score;
}

function deriveRiskLevel(year: number, mileage: number): RiskLevel {
  const currentYear = new Date().getFullYear();
  const age = year > 0 ? Math.max(0, currentYear - year) : 10;
  if (mileage > 170000 || age > 17) return "High";
  if (mileage > 105000 || age > 10) return "Medium";
  return "Low";
}

function deriveTags(
  make: string,
  model: string,
  price: number,
  mileage: number,
  year: number,
  sourceMode: ListingSource
) {
  const tags = ["imported", sourceMode];
  const text = `${make} ${model}`.toLowerCase();
  if (price > 0 && price < 16000) tags.push("budget");
  if (mileage > 0 && mileage < 80000) tags.push("lower-mileage");
  if (/truck|f-150|silverado|ram|tacoma|frontier|sierra/.test(text)) tags.push("truck");
  if (/rav4|cr-v|cx-5|explorer|telluride|4runner|tahoe|pilot|highlander|suburban/.test(text)) tags.push("suv");
  if (/toyota|lexus|honda|acura|mazda/.test(text)) tags.push("reliable-watch");
  if (deriveRiskLevel(year, mileage) === "Low") tags.push("low-risk");
  return tags;
}
