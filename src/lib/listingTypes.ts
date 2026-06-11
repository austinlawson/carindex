export type DealGrade = "A" | "A-" | "B+" | "B" | "C" | "Pass";

export type RiskLevel = "Low" | "Medium" | "High";

export type SellerType = "Private Seller" | "Dealer" | "Small Lot";

export type ListingSource = "mock" | "csv" | "marketcheck" | "ebay" | "user";

export type ListingMediaType = "image" | "video";

export type SellerTitleStatus =
  | "not_disclosed"
  | "paid_off_title_in_hand"
  | "paid_off_title_pending"
  | "financed_lien"
  | "lease_payoff"
  | "not_sure";

export type VehicleConditionStatus =
  | "not_disclosed"
  | "excellent"
  | "good"
  | "runs_with_issues"
  | "needs_repair"
  | "mechanic_special"
  | "project_non_running";

export type KnownIssueFlag =
  | "warning_lights"
  | "engine_issue"
  | "transmission_issue"
  | "leak"
  | "body_damage"
  | "rebuilt_or_salvage_title"
  | "ac_or_heat_issue"
  | "tires_or_brakes_due";

export type ListingMediaItem = {
  url: string;
  type: ListingMediaType;
  thumbnailUrl?: string;
  label?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
};

export type ListingAiVoice = {
  script: string;
  audioUrl?: string;
  persona: string;
  voice: string;
  scriptModel?: string;
  ttsModel?: string;
  generatedAt?: string;
  promptVersion?: string;
};

export type CarListing = {
  id: string;
  ownerId?: string;
  sourceName?: string;
  sourceUrl?: string;
  externalListingUrl?: string;
  importedAt?: string;
  lastSeenAt?: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number;
  location: string;
  distance: number;
  sellerType: SellerType;
  sellerName?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  contactUrl?: string;
  vin?: string;
  sellerTitleStatus: SellerTitleStatus;
  vehicleCondition: VehicleConditionStatus;
  knownIssueFlags: KnownIssueFlag[];
  sellerDisclosureNotes?: string;
  providerListingId?: string;
  imageUrl: string;
  imageUrls: string[];
  mediaItems: ListingMediaItem[];
  listingTitle?: string;
  listingDescription?: string;
  dealGrade: DealGrade;
  feedBadge: string;
  aiHook: string;
  aiTake: string;
  fairValueRange: {
    low: number;
    high: number;
  };
  marketEdge: string;
  confidence: number;
  riskLevel: RiskLevel;
  whyItMadeTheFeed: string;
  redFlags: string[];
  sellerQuestions: string[];
  suggestedFirstMessage: string;
  suggestedOffer: number;
  walkawayPrice: number;
  checklistItems: string[];
  tags: string[];
  reelCaptions: string[];
  aiVoice?: ListingAiVoice;
  sourceMode?: ListingSource;
  rawProviderSummary?: Record<string, unknown>;
};

export type RawListingInput = Partial<
  Omit<CarListing, "fairValueRange" | "imageUrls" | "mediaItems" | "redFlags" | "sellerQuestions" | "checklistItems" | "tags" | "reelCaptions" | "knownIssueFlags">
> & {
  id?: string | number;
  year?: string | number;
  price?: string | number;
  mileage?: string | number;
  distance?: string | number;
  confidence?: string | number;
  suggestedOffer?: string | number;
  walkawayPrice?: string | number;
  imageUrl?: string;
  imageUrls?: string[] | string;
  mediaItems?: ListingMediaItem[] | string;
  estimatedFairValueLow?: string | number;
  estimatedFairValueHigh?: string | number;
  fairValueRange?: {
    low?: string | number;
    high?: string | number;
  };
  estimatedMarketEdge?: string;
  redFlags?: string[] | string;
  sellerQuestions?: string[] | string;
  checklistItems?: string[] | string;
  tags?: string[] | string;
  reelCaptions?: string[] | string;
  knownIssueFlags?: KnownIssueFlag[] | string[] | string;
};
