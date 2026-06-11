"use client";

import { ChangeEvent, FormEvent, type InputHTMLAttributes, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Gauge,
  Images,
  Route,
  ScanLine,
  ShieldCheck,
  Upload,
  UserRound,
  Video
} from "lucide-react";
import type {
  CarListing,
  KnownIssueFlag,
  ListingMediaItem,
  SellerTitleStatus,
  SellerType,
  VehicleConditionStatus
} from "@/data/listings";
import type { SellerProfile } from "@/hooks/use-seller-profile";
import type { MediaVerificationResult } from "@/lib/media-verification";
import {
  getKnownIssueOption,
  getTitleStatusOption,
  getVehicleConditionOption,
  knownIssueOptions,
  titleStatusOptions,
  vehicleConditionOptions,
  type DisclosureOption
} from "@/lib/listing-disclosures";
import { normalizeListing } from "@/src/lib/normalizeListing";

const maxImageUploads = 90;
type MediaMode = "video" | "photos";
type SellerProofItem =
  | "exterior"
  | "walkaround_video"
  | "cold_start"
  | "test_drive"
  | "tires"
  | "interior_dash"
  | "odometer"
  | "title"
  | "flaws";
type DraftSellerTitleStatus = "" | Exclude<SellerTitleStatus, "not_disclosed">;
type DraftVehicleConditionStatus = "" | Exclude<VehicleConditionStatus, "not_disclosed">;
type ListingDraftForm = {
  year: string;
  make: string;
  model: string;
  trim: string;
  price: string;
  mileage: string;
  location: string;
  vin: string;
  sellerType: SellerType;
  sellerName: string;
  sellerPhone: string;
  sellerEmail: string;
  sellerTitleStatus: DraftSellerTitleStatus;
  vehicleCondition: DraftVehicleConditionStatus;
  knownIssueFlags: KnownIssueFlag[];
  sellerProofItems: SellerProofItem[];
  sellerDisclosureNotes: string;
  description: string;
};
type DraftTextField = Exclude<keyof ListingDraftForm, "knownIssueFlags" | "sellerProofItems">;
type PreparedVideoWork = {
  source: File;
  promise: Promise<File>;
  result?: File;
};
type VinDecodeStatus = "idle" | "loading" | "success" | "error";
type VinDecodedVehicle = {
  vin: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  series?: string;
  bodyClass?: string;
  vehicleType?: string;
  doors?: number;
  driveType?: string;
  engineCylinders?: number;
  displacementL?: string;
  engineHp?: string;
  engineModel?: string;
  fuelTypePrimary?: string;
  transmission?: string;
  manufacturer?: string;
  plant?: string;
  errorCode?: string;
  errorText?: string;
  raw?: Record<string, unknown>;
};
type VinDecodeState = {
  status: VinDecodeStatus;
  message: string | null;
  decoded: VinDecodedVehicle | null;
  source?: string;
  decodedAt?: string;
};
type VinDecodeApiResponse = {
  source: string;
  decodedAt: string;
  decoded: VinDecodedVehicle;
  error?: string;
};
type SellerGuidanceItem = {
  id: string;
  label: string;
  description: string;
  done: boolean;
  weight: number;
};
type SellerGuidanceStep = {
  id: string;
  label: string;
  status: "done" | "needs_work" | "boost";
};
type SellerGuidance = {
  score: number;
  label: string;
  summary: string;
  steps: SellerGuidanceStep[];
};
type MediaVerificationSample = {
  dataUrl: string;
  label: string;
  sourceType: "image" | "video_frame";
};

type SellerProofOption = {
  value: SellerProofItem;
  label: string;
  description: string;
  icon: "video" | "camera" | "gauge" | "route" | "title" | "flaws";
  modes: MediaMode[];
};

const sellerProofOptions: SellerProofOption[] = [
  {
    value: "exterior",
    label: "Exterior set",
    description: "Front, rear, both sides, panels, glass.",
    icon: "camera",
    modes: ["photos"]
  },
  {
    value: "walkaround_video",
    label: "Walkaround",
    description: "All sides, panels, wheels, glass, lights.",
    icon: "video",
    modes: ["video"]
  },
  {
    value: "cold_start",
    label: "Engine start",
    description: "Bonus proof if the engine start is captured.",
    icon: "video",
    modes: ["video"]
  },
  {
    value: "test_drive",
    label: "Test drive",
    description: "Acceleration, braking, steering, shifts.",
    icon: "route",
    modes: ["video"]
  },
  {
    value: "tires",
    label: "Tires",
    description: "Tread, sidewalls, wheel rash, brake view.",
    icon: "camera",
    modes: ["video", "photos"]
  },
  {
    value: "interior_dash",
    label: "Interior + dash",
    description: "Seats, screens, dash lights, controls.",
    icon: "gauge",
    modes: ["video", "photos"]
  },
  {
    value: "odometer",
    label: "Odometer",
    description: "Clear mileage shot with the dash on.",
    icon: "gauge",
    modes: ["video", "photos"]
  },
  {
    value: "title",
    label: "Title",
    description: "Title, payoff, or lien status proof.",
    icon: "title",
    modes: ["video", "photos"]
  },
  {
    value: "flaws",
    label: "Flaws",
    description: "Scratches, rust, warning lights, leaks.",
    icon: "flaws",
    modes: ["video", "photos"]
  }
];

const emptyVinDecodeState: VinDecodeState = {
  status: "idle",
  message: null,
  decoded: null
};

export function AddListingView({
  sellerProfile,
  storageWarning,
  requiresManualReview = false,
  onCreateListing
}: {
  sellerProfile: SellerProfile;
  storageWarning: string | null;
  requiresManualReview?: boolean;
  onCreateListing: (listing: CarListing, files: File[]) => void | Promise<void>;
}) {
  const [mediaMode, setMediaMode] = useState<MediaMode>("video");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [draftCreated, setDraftCreated] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compressionStatus, setCompressionStatus] = useState<string | null>(null);
  const [vinDecodeState, setVinDecodeState] = useState<VinDecodeState>(emptyVinDecodeState);
  const [sellerDetailsOpen, setSellerDetailsOpen] = useState(false);
  const retainedMediaUrls = useRef(new Set<string>());
  const preparedVideoRef = useRef<PreparedVideoWork | null>(null);
  const [form, setForm] = useState<ListingDraftForm>({
    year: "",
    make: "",
    model: "",
    trim: "",
    price: "",
    mileage: "",
    location: sellerProfile.location,
    vin: "",
    sellerType: sellerProfile.sellerType,
    sellerName: sellerProfile.displayName,
    sellerPhone: sellerProfile.phone,
    sellerEmail: sellerProfile.email,
    sellerTitleStatus: "",
    vehicleCondition: "",
    knownIssueFlags: [],
    sellerProofItems: [],
    sellerDisclosureNotes: "",
    description: ""
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      location: current.location || sellerProfile.location,
      sellerType: current.sellerType || sellerProfile.sellerType,
      sellerName: current.sellerName || sellerProfile.displayName,
      sellerPhone: current.sellerPhone || sellerProfile.phone,
      sellerEmail: current.sellerEmail || sellerProfile.email
    }));
  }, [sellerProfile]);

  useEffect(() => {
    if (selectedFiles.length === 0) {
      setPreviewUrls([]);
      return;
    }

    const objectUrls = selectedFiles.map((file) => URL.createObjectURL(file));
    setPreviewUrls(objectUrls);

    return () => {
      objectUrls.forEach((url) => {
        if (!retainedMediaUrls.current.has(url)) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [selectedFiles]);

  const selectedFile = selectedFiles[0] ?? null;
  const previewUrl = previewUrls[0];
  const isVideo = mediaMode === "video" && selectedFile?.type.startsWith("video/");
  const imageCount = isVideo ? 0 : selectedFiles.length;
  const isPrivateSeller = form.sellerType === "Private Seller";
  const hasRequiredSellerDisclosure =
    !isPrivateSeller || (Boolean(form.sellerTitleStatus) && Boolean(form.vehicleCondition));
  const normalizedVin = normalizeVinInput(form.vin);
  const canPublish =
    selectedFiles.length > 0 &&
    Boolean(form.year.trim()) &&
    Boolean(form.make.trim()) &&
    Boolean(form.model.trim()) &&
    Boolean(form.price.trim()) &&
    Boolean(form.mileage.trim()) &&
    hasRequiredSellerDisclosure &&
    !isPublishing;
  const sellerGuidance = getSellerGuidance({
    form,
    mediaMode,
    selectedFiles,
    normalizedVin,
    vinDecodeState
  });

  const selectMediaMode = (mode: MediaMode) => {
    setMediaMode(mode);
    setForm((current) => ({
      ...current,
      sellerProofItems: current.sellerProofItems.filter((item) =>
        getSellerProofOptionsForMode(mode).some((option) => option.value === item)
      )
    }));
    setSelectedFiles([]);
    setDraftCreated(false);
    setError(null);
    setCompressionStatus(null);
    preparedVideoRef.current = null;
  };

  const beginBackgroundVideoOptimization = (file: File | null) => {
    if (!file?.type.startsWith("video/")) {
      preparedVideoRef.current = null;
      return;
    }

    const work: PreparedVideoWork = {
      source: file,
      promise: prepareVideoFileForUpload(file, () => null)
    };

    work.promise
      .then((preparedFile) => {
        work.result = preparedFile;
      })
      .catch(() => {
        work.result = file;
      });

    preparedVideoRef.current = work;
  };

  const getPreparedVideoFileForPublish = async (file: File) => {
    const work = preparedVideoRef.current;

    if (work?.source === file) {
      if (work.result) {
        if (work.result !== file) {
          setCompressionStatus(
            `Optimized video from ${formatFileSize(file.size)} to ${formatFileSize(work.result.size)} before upload.`
          );
        }

        return work.result;
      }

      setCompressionStatus("Finishing video optimization before upload...");
      const preparedFile = await work.promise;
      if (preparedFile !== file) {
        setCompressionStatus(
          `Optimized video from ${formatFileSize(file.size)} to ${formatFileSize(preparedFile.size)} before upload.`
        );
      }
      return preparedFile;
    }

    return prepareVideoFileForUpload(file, setCompressionStatus);
  };

  const handleVideoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const videos = files.filter((file) => file.type.startsWith("video/"));
    const firstVideo = videos[0] ?? null;

    if (firstVideo) {
      setSelectedFiles([firstVideo]);
      setError(videos.length > 1 ? "Only one video can be used per listing." : null);
      beginBackgroundVideoOptimization(firstVideo);
    } else {
      setSelectedFiles([]);
      setError("Choose one video, or switch to Photos for image uploads.");
      beginBackgroundVideoOptimization(null);
    }

    setDraftCreated(false);
    setCompressionStatus(null);
    event.target.value = "";
  };

  const handlePhotoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const images = files.filter((file) => file.type.startsWith("image/"));

    setSelectedFiles(images.slice(0, maxImageUploads));
    preparedVideoRef.current = null;
    setDraftCreated(false);
    setCompressionStatus(null);
    setError(
      images.length > maxImageUploads
        ? `Selected first ${maxImageUploads} images. Extra photos were ignored.`
        : null
    );
    event.target.value = "";
  };

  const updateField = (name: DraftTextField, value: string) => {
    const nextValue = name === "vin" ? normalizeVinInput(value) : value;

    setForm((current) => ({ ...current, [name]: nextValue }));
    if (name === "vin") {
      setVinDecodeState((current) =>
        current.decoded?.vin === nextValue ? current : emptyVinDecodeState
      );
    }
    setDraftCreated(false);
    setError(null);
  };

  const toggleKnownIssueFlag = (flag: KnownIssueFlag) => {
    setForm((current) => {
      const nextFlags = current.knownIssueFlags.includes(flag)
        ? current.knownIssueFlags.filter((item) => item !== flag)
        : [...current.knownIssueFlags, flag];

      return { ...current, knownIssueFlags: nextFlags };
    });
    setDraftCreated(false);
    setError(null);
  };

  const decodeVin = async () => {
    const vin = normalizeVinInput(form.vin);

    if (vin.length !== 17) {
      setVinDecodeState({
        status: "error",
        message: "Enter the full 17-character VIN to decode.",
        decoded: null
      });
      return;
    }

    setVinDecodeState({
      status: "loading",
      message: "Decoding VIN with NHTSA...",
      decoded: null
    });
    setError(null);

    try {
      const response = await fetch("/api/vehicles/decode-vin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vin,
          modelYear: form.year || undefined
        })
      });
      const body = (await response.json()) as Partial<VinDecodeApiResponse>;

      if (!response.ok || !body.decoded) {
        throw new Error(body.error ?? "Could not decode that VIN.");
      }

      const decoded = body.decoded;
      setForm((current) => ({
        ...current,
        vin: decoded.vin,
        year: decoded.year ? String(decoded.year) : current.year,
        make: decoded.make || current.make,
        model: decoded.model || current.model,
        trim: decoded.trim || current.trim
      }));
      setVinDecodeState({
        status: "success",
        message: formatDecodedVinMessage(decoded),
        decoded,
        source: body.source,
        decodedAt: body.decodedAt
      });
      setDraftCreated(false);
    } catch (decodeError) {
      setVinDecodeState({
        status: "error",
        message: readErrorMessage(decodeError),
        decoded: null
      });
    }
  };

  const publishListing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPublishing(true);
    setError(null);
    setCompressionStatus(null);
    let preparedVideoPreviewUrl: string | null = null;

    try {
      const year = toNumber(form.year);
      const price = toNumber(form.price);
      const mileage = toNumber(form.mileage);

      if (!year || !price || !mileage || !form.make.trim() || !form.model.trim()) {
        setError("Add year, make, model, price, and mileage before publishing.");
        return;
      }

      if (selectedFiles.length === 0) {
        setError(
          mediaMode === "video"
            ? "Add one video before publishing."
            : "Add at least one photo before publishing."
        );
        return;
      }

      if (isPrivateSeller && (!form.sellerTitleStatus || !form.vehicleCondition)) {
        setError("Select title or loan status and vehicle condition before publishing.");
        return;
      }

      const preparedFiles =
        mediaMode === "video"
          ? [await getPreparedVideoFileForPublish(selectedFiles[0])]
          : selectedFiles;
      if (mediaMode === "video" && preparedFiles[0] !== selectedFiles[0]) {
        preparedVideoPreviewUrl = URL.createObjectURL(preparedFiles[0]);
      }
      const preparedPreviewUrls = preparedVideoPreviewUrl ? [preparedVideoPreviewUrl] : previewUrls;
      const mediaItems = await getListingMediaItems(preparedFiles, preparedPreviewUrls, mediaMode);
      if (mediaItems.length === 0) {
        setError(
          mediaMode === "video"
            ? "Choose one video before publishing."
            : "Choose at least one photo before publishing."
        );
        return;
      }

      setCompressionStatus(
        requiresManualReview
          ? "Sending this listing to manual review..."
          : "Checking media trust signals..."
      );
      const mediaVerification = requiresManualReview
        ? createManualReviewMediaVerification()
        : await verifyListingMedia({
            files: preparedFiles,
            mediaMode,
            listing: {
              year,
              make: form.make.trim(),
              model: form.model.trim(),
              trim: form.trim.trim(),
              vin: form.vin.trim(),
              mileage
            }
          });
      setCompressionStatus(null);

      mediaItems.forEach((item) => {
        if (previewUrls.includes(item.url)) {
          retainedMediaUrls.current.add(item.url);
        }
      });
      const imageUrls = mediaItems.filter((item) => item.type === "image").map((item) => item.url);
      const primaryMediaUrl = imageUrls[0] ?? mediaItems[0]?.url ?? "/cars/sedan-night.svg";
      const title = `${year} ${form.make.trim()} ${form.model.trim()} ${form.trim.trim()}`.trim();
      const sellerTitleStatus: SellerTitleStatus =
        isPrivateSeller && form.sellerTitleStatus ? form.sellerTitleStatus : "not_disclosed";
      const vehicleCondition: VehicleConditionStatus =
        isPrivateSeller && form.vehicleCondition ? form.vehicleCondition : "not_disclosed";
      const knownIssueFlags = isPrivateSeller ? form.knownIssueFlags : [];
      const sellerDisclosureNotes = isPrivateSeller ? form.sellerDisclosureNotes.trim() : "";
      const disclosureSummary = formatSellerDisclosureSummary(
        sellerTitleStatus,
        vehicleCondition,
        knownIssueFlags
      );
      const sellerProofSummary = formatSellerProofSummary(form.sellerProofItems);
      const listingDescription = formatListingDescription({
        title,
        sellerType: form.sellerType as SellerType,
        description: form.description,
        disclosureSummary,
        sellerDisclosureNotes,
        sellerProofSummary
      });
      const issueRedFlags = knownIssueFlags.map((flag) => {
        const option = getKnownIssueOption(flag);
        return `Seller disclosed: ${option?.label ?? flag}`;
      });
      const decodedVin =
        vinDecodeState.decoded?.vin === normalizeVinInput(form.vin)
          ? vinDecodeState.decoded
          : null;
      const vinDecodeSummary = formatVinDecodeSummary(decodedVin);
      const disclosureTags = buildDisclosureTags(sellerTitleStatus, vehicleCondition, knownIssueFlags);
      const sellerProofTags = form.sellerProofItems.map(
        (item) => `proof-${item.replace(/_/g, "-")}`
      );
      const mediaVerificationTags = buildMediaVerificationTags(mediaVerification);
      const moderationTags = requiresManualReview
        ? ["manual-review-required", "resubmission-no-vision"]
        : [];
      const mediaVerificationRedFlags = buildMediaVerificationRedFlags(mediaVerification);
      const listing = normalizeListing(
        {
          id: `user-${Date.now()}`,
          sourceName: "CarIndex.ai seller upload",
          sourceMode: "user",
          year,
          make: form.make,
          model: form.model,
          trim: form.trim,
          price,
          mileage,
          location: form.location || sellerProfile.location,
          distance: 0,
          sellerType: form.sellerType as SellerType,
          sellerName: form.sellerName,
          sellerPhone: form.sellerPhone,
          sellerEmail: form.sellerEmail,
          vin: form.vin,
          sellerTitleStatus,
          vehicleCondition,
          knownIssueFlags,
          sellerDisclosureNotes: sellerDisclosureNotes || undefined,
          imageUrl: primaryMediaUrl,
          imageUrls,
          mediaItems,
          listingTitle: title,
          listingDescription,
          dealGrade: "B",
          feedBadge: "Fresh Upload",
          aiHook: `${title}: new seller upload. ${
            sellerProofSummary ||
            vinDecodeSummary ||
            disclosureSummary ||
            "The basics are ready, but more proof will raise buyer trust."
          }`,
          aiTake:
            `Fresh seller upload. ${
              sellerProofSummary ||
              vinDecodeSummary ||
              disclosureSummary ||
              "The AI has enough to stage it, but VIN, proof shots, and clearer condition details will make it easier to trust."
            }`,
          estimatedMarketEdge: "Seller upload - needs market check",
          confidence: 58,
          riskLevel: "Medium",
          whyItMadeTheFeed:
            `It was created from the in-app seller flow with a listing quality score of ${sellerGuidance.score}%.`,
          redFlags: [
            ...mediaVerificationRedFlags,
            ...issueRedFlags
          ],
          sellerQuestions: [
            getTitleQuestion(sellerTitleStatus),
            "Do you have service records?",
            "Are there any warning lights, leaks, or known issues?"
          ],
          suggestedFirstMessage: `Hi, I saw your ${title}. Is the title clean, and are you open to a pre-purchase inspection?`,
          suggestedOffer: Math.round(price * 0.94),
          walkawayPrice: Math.round(price * 1.02),
          checklistItems: [
            "Confirm VIN and title status",
            "Walkaround and key sounds",
            "Dash warning lights",
            "Tires, brakes, and service records"
          ],
          tags: [
            "user-upload",
            "seller-listing",
            form.sellerType === "Dealer" ? "dealer" : "private-seller",
            decodedVin ? "vin-decoded" : "vin-not-decoded",
            ...mediaVerificationTags,
            ...moderationTags,
            ...disclosureTags,
            ...sellerProofTags
          ],
          reelCaptions: [
            "Fresh upload from the app.",
            sellerProofSummary ||
              vinDecodeSummary ||
              disclosureSummary ||
              "More proof shots will make this listing easier to trust.",
            "Media publishes to the CarIndex listing feed.",
            "Ask the seller for title, service records, and inspection flexibility.",
            `Asking ${formatDollars(price)} with ${formatMiles(mileage)} miles.`
          ],
          rawProviderSummary: {
            createdInApp: true,
            mediaType: preparedFiles[0]?.type,
            mediaCount: mediaItems.length,
            mediaStorage: "supabase",
            optimizedBeforeUpload: mediaMode === "video" && preparedFiles[0] !== selectedFiles[0],
            originalBytes: selectedFiles[0]?.size,
            uploadBytes: preparedFiles[0]?.size,
            mediaDurationSeconds: mediaItems[0]?.durationSeconds,
            sellerProofItems: form.sellerProofItems,
            mediaVerification,
            moderation: requiresManualReview
              ? {
                  status: "manual_review_required",
                  reason: "seller_has_prior_rejected_media_upload",
                  requestedAt: new Date().toISOString(),
                  reviewCostPolicy: "manual_review_no_additional_vision_check"
                }
              : undefined,
            sellerGuidanceScore: sellerGuidance.score,
            sellerTitleStatus,
            vehicleCondition,
            knownIssueFlags,
            vinDecode: decodedVin
              ? {
                  source: vinDecodeState.source ?? "nhtsa-vpic",
                  decodedAt: vinDecodeState.decodedAt,
                  vehicle: decodedVin
                }
              : undefined
          }
        },
        "user"
      );

      await onCreateListing(listing, preparedFiles);
      setDraftCreated(true);
    } catch (publishError) {
      setError(formatPublishError(publishError));
    } finally {
      if (preparedVideoPreviewUrl) {
        URL.revokeObjectURL(preparedVideoPreviewUrl);
      }
      setCompressionStatus(null);
      setIsPublishing(false);
    }
  };

  const helperText = useMemo(() => {
    if (selectedFiles.length === 0) {
      return mediaMode === "video"
        ? "Add one 9:16 walkaround video, then publish it to the feed."
        : `Select up to ${maxImageUploads} photos. The feed will treat them like a swipeable story.`;
    }

    if (isVideo) {
      return `Video selected: ${formatFileSize(selectedFile.size)}. Upload uses resumable storage and may take a moment on mobile.`;
    }

    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 30_000_000) {
      return `Photo set selected: ${formatFileSize(totalSize)} total. Large photo sets can take a moment to upload on mobile.`;
    }

    return `${selectedFiles.length} photo${selectedFiles.length === 1 ? "" : "s"} selected. They will upload when you publish.`;
  }, [isVideo, mediaMode, selectedFiles]);

  return (
    <form
      className="no-scrollbar h-full overflow-y-auto bg-[#07080c] px-4 pb-[calc(env(safe-area-inset-bottom)+92px)] pt-[calc(env(safe-area-inset-top)+14px)] text-white"
      onSubmit={publishListing}
    >
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.055]">
        <div className="add-media-stage relative h-[320px] bg-[linear-gradient(180deg,#161b22_0%,#050608_100%)]">
          {previewUrl ? (
            isVideo ? (
              <video
                src={previewUrl}
                className="h-full w-full object-cover"
                controls
                muted
                playsInline
              />
            ) : (
              <>
                <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                {imageCount > 1 ? (
                  <div className="absolute right-4 top-4 rounded-full border border-white/12 bg-black/52 px-3 py-1.5 text-xs font-black text-white/86 backdrop-blur-xl">
                    {imageCount} photos
                  </div>
                ) : null}
              </>
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full border border-white/12 bg-white/10 shadow-[0_22px_60px_rgba(0,0,0,0.38)]">
                {mediaMode === "video" ? (
                  <Video className="h-8 w-8 text-cyan-100" />
                ) : (
                  <Images className="h-8 w-8 text-cyan-100" />
                )}
              </div>
              <p className="mt-5 text-xl font-black leading-tight">Create a seller reel</p>
              <p className="mt-2 max-w-[260px] text-sm font-semibold leading-relaxed text-white/58">
                {mediaMode === "video"
                  ? "Capture a walkaround, interior, dash, tires, and key sounds."
                  : "Pick exterior, interior, dash, tire, title, and detail shots."}
              </p>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/54 to-transparent p-4">
            <div className="add-mobile-actions grid grid-cols-2 gap-2">
              {mediaMode === "video" ? (
                <>
                  <label
                    htmlFor="listing-camera-capture"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-3 text-sm font-black text-black transition active:scale-[0.98]"
                  >
                    <Camera className="h-[18px] w-[18px]" />
                    Record
                  </label>
                  <label
                    htmlFor="listing-video-upload"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/12 bg-white/12 px-3 text-sm font-black text-white backdrop-blur-xl transition active:scale-[0.98]"
                  >
                    <Upload className="h-[18px] w-[18px]" />
                    Pick video
                  </label>
                </>
              ) : (
                <label
                  htmlFor="listing-photo-upload"
                  className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-3 text-sm font-black text-black transition active:scale-[0.98]"
                >
                  <Images className="h-[18px] w-[18px]" />
                  Select photos
                </label>
              )}
            </div>

            <label
              htmlFor={mediaMode === "video" ? "listing-video-upload" : "listing-photo-upload"}
              className="add-desktop-upload hidden min-h-12 items-center justify-center gap-2 rounded-full bg-white px-3 text-sm font-black text-black transition active:scale-[0.98]"
            >
              <Upload className="h-[18px] w-[18px]" />
              {mediaMode === "video" ? "Upload video" : "Upload photos"}
            </label>
          </div>
        </div>

        <input
          id="listing-camera-capture"
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={handleVideoFileChange}
        />
        <input
          id="listing-video-upload"
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleVideoFileChange}
        />
        <input
          id="listing-photo-upload"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handlePhotoFileChange}
        />
      </div>

      <p className="mt-3 rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2 text-xs font-semibold leading-relaxed text-white/52">
        {helperText}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-[24px] border border-white/8 bg-white/[0.045] p-1">
        {(["video", "photos"] satisfies MediaMode[]).map((mode) => {
          const selected = mediaMode === mode;
          return (
            <button
              key={mode}
              type="button"
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[20px] text-sm font-black transition active:scale-[0.98] ${
                selected
                  ? "bg-white text-black"
                  : "text-white/58 hover:bg-white/[0.06] hover:text-white"
              }`}
              onClick={() => selectMediaMode(mode)}
            >
              {mode === "video" ? (
                <Video className="h-[17px] w-[17px]" />
              ) : (
                <Images className="h-[17px] w-[17px]" />
              )}
              {mode === "video" ? "Video" : "Photos"}
            </button>
          );
        })}
      </div>

      <SellerGuidancePanel guidance={sellerGuidance} />

      <section className="mt-4 rounded-[26px] border border-cyan-100/16 bg-cyan-100/[0.065] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-cyan-50">
          <ScanLine className="h-[18px] w-[18px]" />
          VIN decoder
        </div>
        <VinDecodeField
          value={form.vin}
          status={vinDecodeState.status}
          message={vinDecodeState.message}
          decoded={vinDecodeState.decoded?.vin === normalizedVin ? vinDecodeState.decoded : null}
          canDecode={normalizedVin.length === 17 && vinDecodeState.status !== "loading"}
          onChange={(value) => updateField("vin", value)}
          onDecode={decodeVin}
        />
      </section>

      <section className="mt-4 rounded-[26px] border border-white/10 bg-white/[0.055] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-white">
          <ScanLine className="h-[18px] w-[18px] text-cyan-100" />
          Vehicle details
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DraftField label="Year" value={form.year} placeholder="2020" inputMode="numeric" onChange={(value) => updateField("year", value)} />
          <DraftField label="Make" value={form.make} placeholder="Toyota" onChange={(value) => updateField("make", value)} />
          <DraftField label="Model" value={form.model} placeholder="Camry" onChange={(value) => updateField("model", value)} />
          <DraftField label="Trim" value={form.trim} placeholder="LE" onChange={(value) => updateField("trim", value)} />
          <DraftField label="Price" value={form.price} placeholder="$24,995" inputMode="numeric" onChange={(value) => updateField("price", value)} />
          <DraftField label="Mileage" value={form.mileage} placeholder="31,808" inputMode="numeric" onChange={(value) => updateField("mileage", value)} />
          <DraftField label="Location" value={form.location} placeholder="Ozark, AL" className="col-span-2" onChange={(value) => updateField("location", value)} />
        </div>
      </section>

      <SellerSummarySection
        open={sellerDetailsOpen}
        sellerType={form.sellerType}
        sellerName={form.sellerName}
        location={form.location}
        phone={form.sellerPhone}
        email={form.sellerEmail}
        onToggle={() => setSellerDetailsOpen((current) => !current)}
        onFieldChange={updateField}
      />

      {isPrivateSeller ? (
        <section className="mt-4 rounded-[26px] border border-white/10 bg-white/[0.055] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-black text-white">
            <ClipboardCheck className="h-[18px] w-[18px] text-cyan-100" />
            Condition & title
          </div>

          <DisclosureChipGroup
            label="Title / loan"
            icon={<BadgeCheck className="h-4 w-4 text-cyan-100" />}
            options={titleStatusOptions}
            value={form.sellerTitleStatus}
            onChange={(value) => updateField("sellerTitleStatus", value)}
          />

          <DisclosureChipGroup
            label="Condition"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-100" />}
            options={vehicleConditionOptions}
            value={form.vehicleCondition}
            onChange={(value) => updateField("vehicleCondition", value)}
            className="mt-3"
          />

          <div className="mt-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/42">
              <AlertTriangle className="h-4 w-4 text-amber-100/70" />
              Known issues
            </div>
            <div className="flex flex-wrap gap-2">
              {knownIssueOptions.map((option) => {
                const selected = form.knownIssueFlags.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-full border px-3 py-2 text-[11px] font-black transition active:scale-[0.98] ${
                      selected
                        ? "border-amber-100/60 bg-amber-100/18 text-amber-50"
                        : "border-white/10 bg-black/24 text-white/54 hover:bg-white/[0.06] hover:text-white"
                    }`}
                    onClick={() => toggleKnownIssueFlag(option.value)}
                    aria-pressed={selected}
                  >
                    {option.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="mt-3 block rounded-[22px] border border-white/10 bg-black/24 p-3">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/42">
              Optional disclosure notes
            </span>
            <textarea
              value={form.sellerDisclosureNotes}
              onChange={(event) => updateField("sellerDisclosureNotes", event.target.value)}
              placeholder="Payoff timing, known repairs, warning lights, recent work, or project details."
              className="mt-2 min-h-16 w-full resize-none bg-transparent text-sm font-semibold leading-relaxed text-white outline-none placeholder:text-white/30"
            />
          </label>
        </section>
      ) : null}

      <section className="mt-4 rounded-[26px] border border-cyan-200/14 bg-cyan-200/[0.075] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-cyan-50">
          <FileText className="h-[18px] w-[18px]" />
          Seller notes
        </div>
        <textarea
          value={form.description}
          onChange={(event) => updateField("description", event.target.value)}
          placeholder="Ownership history, recent service, why you're selling, upgrades, known flaws, or anything a buyer should notice."
          className="min-h-28 w-full resize-none rounded-3xl border border-white/10 bg-black/24 p-3 text-sm font-semibold leading-relaxed text-white outline-none placeholder:text-white/32"
        />

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold text-white/74">
          {["Save to database", "Upload media", "Mark seller type", "Add to feed"].map(
            (item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-100" />
                {item}
              </div>
            )
          )}
        </div>

        {error || storageWarning ? (
          <p className="mt-3 rounded-2xl border border-amber-200/18 bg-amber-200/10 px-3 py-2 text-xs font-bold leading-relaxed text-amber-50/80">
            {error ?? storageWarning}
          </p>
        ) : null}

        {compressionStatus ? (
          <p className="mt-3 rounded-2xl border border-cyan-200/18 bg-cyan-200/10 px-3 py-2 text-xs font-bold leading-relaxed text-cyan-50/82">
            {compressionStatus}
          </p>
        ) : null}

        <button
          type="submit"
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-black text-black transition disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.99]"
          disabled={!canPublish}
        >
          <CircleDollarSign className="h-[18px] w-[18px]" />
          {isPublishing ? "Publishing..." : draftCreated ? "Published to feed" : "Publish listing"}
        </button>
      </section>
    </form>
  );
}

function SellerGuidancePanel({ guidance }: { guidance: SellerGuidance }) {
  return (
    <section className="mt-4 px-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-white/54">
            <ShieldCheck className="h-4 w-4" />
            Listing readiness
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] tracking-[0.12em] text-white/36">
              Auto
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-black text-white">
            {guidance.score}%
          </span>
        </div>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-200 via-emerald-200 to-white"
          style={{ width: `${guidance.score}%` }}
        />
      </div>

      <div className="relative mt-2 grid grid-cols-5 gap-1.5">
        <div className="pointer-events-none absolute left-[10%] right-[10%] top-3 h-px bg-white/10" />
        {guidance.steps.map((step) => (
          <ReadinessStep key={step.id} step={step} />
        ))}
      </div>
    </section>
  );
}

function ReadinessStep({ step }: { step: SellerGuidanceStep }) {
  const active = step.status === "done";
  const boost = step.status === "boost";

  return (
    <div className="relative min-w-0 text-center">
      <div
        className={`relative z-10 mx-auto grid h-6 w-6 place-items-center rounded-full border text-[9px] font-black ${
          active
            ? "border-emerald-100/60 bg-emerald-100 text-black"
            : boost
              ? "border-cyan-100/34 bg-[#151f24] text-cyan-50"
              : "border-white/12 bg-[#111315] text-white/34"
        }`}
      >
        {active ? <CheckCircle2 className="h-3 w-3" /> : boost ? "+" : ""}
      </div>
      <p className="mt-1 truncate text-[8.5px] font-black uppercase tracking-[0.05em] text-white/38">
        {step.label}
      </p>
    </div>
  );
}

function SellerSummarySection({
  open,
  sellerType,
  sellerName,
  location,
  phone,
  email,
  onToggle,
  onFieldChange
}: {
  open: boolean;
  sellerType: SellerType;
  sellerName: string;
  location: string;
  phone: string;
  email: string;
  onToggle: () => void;
  onFieldChange: (name: DraftTextField, value: string) => void;
}) {
  const summary = [
    sellerName.trim() || "Seller",
    sellerType,
    location.trim() || "Location pending"
  ].join(" - ");

  return (
    <section className="mt-4 rounded-[26px] border border-white/10 bg-white/[0.055] p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left transition active:scale-[0.99]"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-emerald-100/18 bg-emerald-100/10">
            <UserRound className="h-[18px] w-[18px] text-emerald-100" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-white">Seller</span>
            <span className="mt-1 block truncate text-xs font-bold text-white/50">{summary}</span>
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-white/10 bg-black/24 px-3 py-2 text-xs font-black text-white/72">
          {open ? "Done" : "Edit"}
        </span>
      </button>

      {open ? (
        <div className="mt-4">
          <div className="mb-3 grid grid-cols-3 gap-2">
            {(["Private Seller", "Dealer", "Small Lot"] satisfies SellerType[]).map((type) => (
              <button
                key={type}
                type="button"
                className={`min-h-11 rounded-2xl border px-2 text-[11px] font-black transition active:scale-[0.98] ${
                  sellerType === type
                    ? "border-white bg-white text-black"
                    : "border-white/10 bg-black/22 text-white/58"
                }`}
                onClick={() => onFieldChange("sellerType", type)}
              >
                {sellerTypeLabel(type)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DraftField label="Seller name" value={sellerName} placeholder="Austin" className="col-span-2" onChange={(value) => onFieldChange("sellerName", value)} />
            <DraftField label="Phone" value={phone} placeholder="Optional" inputMode="tel" onChange={(value) => onFieldChange("sellerPhone", value)} />
            <DraftField label="Email" value={email} placeholder="Optional" inputMode="email" onChange={(value) => onFieldChange("sellerEmail", value)} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function VinDecodeField({
  value,
  status,
  message,
  decoded,
  canDecode,
  onChange,
  onDecode
}: {
  value: string;
  status: VinDecodeStatus;
  message: string | null;
  decoded: VinDecodedVehicle | null;
  canDecode: boolean;
  onChange: (value: string) => void;
  onDecode: () => void;
}) {
  const isLoading = status === "loading";
  const statusTone =
    status === "success"
      ? "border-emerald-200/18 bg-emerald-200/10 text-emerald-50/86"
      : status === "error"
        ? "border-amber-200/18 bg-amber-200/10 text-amber-50/86"
        : "border-white/10 bg-black/20 text-white/54";

  return (
    <div className="col-span-2 rounded-[22px] border border-white/10 bg-black/24 p-3">
      <div className="flex items-start gap-3">
        <label className="min-w-0 flex-1">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/42">
            VIN
          </span>
          <input
            value={value}
            maxLength={17}
            autoCapitalize="characters"
            spellCheck={false}
            className="mt-2 w-full bg-transparent font-mono text-sm font-black uppercase tracking-[0.08em] text-white outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-white/30"
            placeholder="17-character VIN"
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-cyan-100/24 bg-cyan-100/12 px-3 text-xs font-black text-cyan-50 transition disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
          disabled={!canDecode}
          onClick={onDecode}
        >
          {isLoading ? "Decoding..." : "Decode VIN"}
        </button>
      </div>

      {message ? (
        <p
          className={`mt-3 rounded-2xl border px-3 py-2 text-xs font-bold leading-relaxed ${statusTone}`}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}

      {decoded ? (
        <div className="mt-3 grid gap-2 text-[11px] font-bold text-white/62 sm:grid-cols-2">
          {decoded.bodyClass ? <span>{decoded.bodyClass}</span> : null}
          {decoded.driveType ? <span>{decoded.driveType}</span> : null}
          {decoded.engineCylinders || decoded.displacementL ? (
            <span>{formatVinEngine(decoded)}</span>
          ) : null}
          {decoded.transmission ? <span>{decoded.transmission}</span> : null}
          {decoded.fuelTypePrimary ? <span>{decoded.fuelTypePrimary}</span> : null}
          {decoded.plant ? <span>{decoded.plant}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function DisclosureChipGroup<T extends string>({
  label,
  icon,
  options,
  value,
  onChange,
  className = ""
}: {
  label: string;
  icon: React.ReactNode;
  options: DisclosureOption<T>[];
  value: "" | T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/42">
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option.value;
          const selectedTone =
            option.tone === "positive"
              ? "border-emerald-100/60 bg-emerald-100/18 text-emerald-50"
              : option.tone === "warning"
                ? "border-amber-100/60 bg-amber-100/18 text-amber-50"
                : "border-cyan-100/60 bg-cyan-100/16 text-cyan-50";

          return (
            <button
              key={option.value}
              type="button"
              className={`rounded-full border px-3 py-2 text-[11px] font-black transition active:scale-[0.98] ${
                selected
                  ? selectedTone
                  : "border-white/10 bg-black/24 text-white/54 hover:bg-white/[0.06] hover:text-white"
              }`}
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              title={option.description}
            >
              {option.shortLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DraftField({
  label,
  value,
  placeholder,
  onChange,
  inputMode,
  className = ""
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  className?: string;
}) {
  return (
    <label className={`block rounded-[22px] border border-white/10 bg-black/24 p-3 ${className}`}>
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/42">
        {label}
      </span>
      <input
        value={value}
        inputMode={inputMode}
        className="mt-2 w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-white/30"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

async function getListingMediaItems(
  files: File[],
  previewUrls: string[],
  mediaMode: MediaMode
): Promise<ListingMediaItem[]> {
  if (files.length === 0) {
    return [{ url: "/cars/sedan-night.svg", type: "image", label: "Fallback image" }] satisfies ListingMediaItem[];
  }

  if (mediaMode === "video") {
    const firstVideoIndex = files.findIndex((file) => file.type.startsWith("video/"));
    if (firstVideoIndex < 0) {
      return [];
    }

    return [
      {
        url: previewUrls[firstVideoIndex] ?? "/cars/sedan-night.svg",
        type: "video",
        label: "Walkaround video",
        durationSeconds: await readVideoDurationSeconds(files[firstVideoIndex])
      }
    ] satisfies ListingMediaItem[];
  }

  const imageFiles = files.filter((file) => file.type.startsWith("image/")).slice(0, maxImageUploads);

  return imageFiles.map((file, index) => ({
    url: previewUrls[index],
    type: "image" as const,
    label: `Photo ${index + 1}`
  }));
}

async function readVideoDurationSeconds(file: File) {
  if (typeof document === "undefined" || !file.type.startsWith("video/")) {
    return undefined;
  }

  const video = document.createElement("video");
  const sourceUrl = URL.createObjectURL(file);

  try {
    video.src = sourceUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    await waitForVideoMetadata(video);

    return Number.isFinite(video.duration) && video.duration > 0
      ? Math.round(video.duration)
      : undefined;
  } catch {
    return undefined;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}

async function verifyListingMedia({
  files,
  mediaMode,
  listing
}: {
  files: File[];
  mediaMode: MediaMode;
  listing: {
    year: number;
    make: string;
    model: string;
    trim: string;
    vin: string;
    mileage: number;
  };
}): Promise<MediaVerificationResult> {
  try {
    const samples = await createMediaVerificationSamples(files, mediaMode);

    if (samples.length === 0) {
      return createLocalMediaVerification("No usable image or video frames could be sampled.");
    }

    const response = await fetch("/api/listings/media-verification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        listing,
        samples
      })
    });

    if (!response.ok) {
      return createLocalMediaVerification("Media verification did not complete.");
    }

    const payload = (await response.json()) as { mediaVerification?: MediaVerificationResult };
    return payload.mediaVerification ?? createLocalMediaVerification("Media verification returned no result.");
  } catch {
    return createLocalMediaVerification("Media verification could not run in this browser.");
  }
}

async function createMediaVerificationSamples(files: File[], mediaMode: MediaMode) {
  if (mediaMode === "video") {
    const videoFile = files.find((file) => file.type.startsWith("video/"));
    return videoFile ? createVideoFrameSamples(videoFile) : [];
  }

  const imageFiles = selectEvenly(
    files.filter((file) => file.type.startsWith("image/")),
    5
  );
  const samples = await Promise.all(
    imageFiles.map((file, index) => createImageSample(file, `Photo sample ${index + 1}`))
  );

  return samples.filter((sample): sample is MediaVerificationSample => Boolean(sample));
}

async function createImageSample(file: File, label: string): Promise<MediaVerificationSample | null> {
  if (typeof document === "undefined") return null;

  const imageUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    image.src = imageUrl;
    await waitForImageLoad(image);
    const dataUrl = drawImageToDataUrl(image, image.naturalWidth, image.naturalHeight);

    return dataUrl
      ? {
          dataUrl,
          label,
          sourceType: "image"
        }
      : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function createVideoFrameSamples(file: File): Promise<MediaVerificationSample[]> {
  if (typeof document === "undefined") return [];

  const video = document.createElement("video");
  const sourceUrl = URL.createObjectURL(file);

  try {
    video.src = sourceUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    await waitForVideoMetadata(video);

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const times = getVideoVerificationTimes(duration);
    const samples: MediaVerificationSample[] = [];

    for (const time of times) {
      video.currentTime = time;
      await waitForVideoSeeked(video);
      const dataUrl = drawImageToDataUrl(video, video.videoWidth, video.videoHeight);
      if (dataUrl) {
        samples.push({
          dataUrl,
          label: `Video frame at ${Math.round(time)}s`,
          sourceType: "video_frame"
        });
      }
    }

    return samples;
  } catch {
    return [];
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}

function getVideoVerificationTimes(duration: number) {
  if (!duration || duration <= 1) return [0];

  const percentages = duration < 12 ? [0.15, 0.5, 0.85] : [0.08, 0.25, 0.5, 0.75, 0.92];
  const maxTime = Math.max(0, duration - 0.35);
  const times = percentages.map((percentage) => {
    const minimum = duration >= 8 ? 2 : 0.1;
    return Math.min(maxTime, Math.max(minimum, duration * percentage));
  });

  return [...new Set(times.map((time) => Number(time.toFixed(2))))];
}

function drawImageToDataUrl(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number
) {
  if (!sourceWidth || !sourceHeight || typeof document === "undefined") return "";

  const maxDimension = 512;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";

  context.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.62);
}

function selectEvenly<T>(items: T[], limit: number) {
  if (items.length <= limit) return items;
  if (limit <= 1) return items.slice(0, 1);

  return Array.from({ length: limit }, (_, index) => {
    const itemIndex = Math.round((index * (items.length - 1)) / (limit - 1));
    return items[itemIndex];
  });
}

function waitForImageLoad(image: HTMLImageElement) {
  return new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Image sample could not be loaded."));
  });
}

function waitForVideoSeeked(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video frame sample timed out."));
    }, 5000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Video frame sample failed."));
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

function createLocalMediaVerification(reason: string): MediaVerificationResult {
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
    promptVersion: "media-verification-client-fallback"
  };
}

function createManualReviewMediaVerification(): MediaVerificationResult {
  return {
    status: "not_checked",
    confidence: 0,
    isVehicleMedia: false,
    appearsToMatchListing: false,
    visibleProof: [],
    qualityIssues: [],
    riskFlags: ["manual_review_required", "seller_prior_rejected_media"],
    notes: "This listing is waiting for manual review before it can appear in the public feed.",
    checkedAt: new Date().toISOString(),
    promptVersion: "manual-review-no-vision"
  };
}

function buildMediaVerificationTags(mediaVerification: MediaVerificationResult) {
  switch (mediaVerification.status) {
    case "verified_vehicle":
      return ["media-verified"];
    case "mismatch":
      return ["media-mismatch"];
    case "unclear":
      return ["media-unclear"];
    default:
      return ["media-not-checked"];
  }
}

function buildMediaVerificationRedFlags(mediaVerification: MediaVerificationResult) {
  if (mediaVerification.status === "mismatch") {
    return [
      mediaVerification.notes ||
        "Media verification could not match the upload to the listed vehicle."
    ];
  }

  if (mediaVerification.riskFlags.some((flag) => /junk|spam|scam|not_a_vehicle|unrelated/i.test(flag))) {
    return [
      mediaVerification.notes ||
        "Media verification found possible spam, junk-ad, or unrelated-media signals."
    ];
  }

  return [];
}

function toNumber(value: string) {
  const parsed = Number(value.replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getSellerGuidance({
  form,
  mediaMode,
  selectedFiles,
  normalizedVin,
  vinDecodeState
}: {
  form: ListingDraftForm;
  mediaMode: MediaMode;
  selectedFiles: File[];
  normalizedVin: string;
  vinDecodeState: VinDecodeState;
}): SellerGuidance {
  const isVideoMode = mediaMode === "video";
  const hasVideo = mediaMode === "video" && selectedFiles.some((file) => file.type.startsWith("video/"));
  const imageCount =
    mediaMode === "photos" ? selectedFiles.filter((file) => file.type.startsWith("image/")).length : 0;
  const hasDecodedVin = vinDecodeState.decoded?.vin === normalizedVin;
  const hasProof = (item: SellerProofItem) => form.sellerProofItems.includes(item);
  const hasKnownFlawDisclosure =
    hasProof("flaws") ||
    form.knownIssueFlags.length > 0 ||
    form.sellerDisclosureNotes.trim().length >= 30;
  const strongMedia = isVideoMode
    ? hasVideo
    : imageCount >= 10 || (imageCount >= 6 && Boolean(form.description.trim()));
  const hasTireSignal = hasProof("tires") || imageCount >= 8 || hasVideo;
  const hasInteriorProof = hasProof("interior_dash") || imageCount >= 8 || hasVideo;
  const hasOdometerSignal = hasProof("odometer") || (Boolean(form.mileage.trim()) && (imageCount >= 8 || hasVideo));
  const hasTitleProof = hasProof("title") || Boolean(form.sellerTitleStatus);
  const hasStory = form.description.trim().length >= 80;
  const hasCoreDetails = Boolean(
    form.year.trim() &&
      form.make.trim() &&
      form.model.trim() &&
      form.price.trim() &&
      form.mileage.trim() &&
      form.location.trim()
  );

  const commonItems: SellerGuidanceItem[] = [
    {
      id: "vehicle_details",
      label: "Vehicle details",
      description: "Year, make, model, price, mileage, and location are the core listing facts.",
      done: hasCoreDetails,
      weight: 24
    },
    {
      id: "vin",
      label: "Verified by VIN",
      description: "VIN decode is a trust boost, but complete vehicle details matter more.",
      done: hasDecodedVin,
      weight: 6
    },
    {
      id: "media",
      label: isVideoMode ? "Walkaround video selected" : "Strong photo set",
      description: isVideoMode
        ? "A clear walkaround gives buyers the fastest feel for the vehicle."
        : "Aim for 10+ useful photos: exterior, interior, dash, tires, odometer, title, and flaws.",
      done: strongMedia,
      weight: isVideoMode ? 22 : 20
    },
    {
      id: "tires",
      label: "Tire and wheel shots",
      description: "Tires, wheels, and brakes are quick trust signals.",
      done: hasTireSignal,
      weight: 6
    },
    {
      id: "interior_dash",
      label: "Interior, dash, odometer",
      description: "Show seats, screens, dash lights, and mileage clearly.",
      done: hasInteriorProof && hasOdometerSignal,
      weight: isVideoMode ? 8 : 10
    },
    {
      id: "title",
      label: "Title status",
      description: "Clear, lien, payoff, rebuilt, or pending title status should be explicit.",
      done: hasTitleProof,
      weight: 10
    },
    {
      id: "flaws",
      label: "Flaws disclosed",
      description: "Directly showing flaws can make the rest of the listing more believable.",
      done: hasKnownFlawDisclosure,
      weight: 10
    },
    {
      id: "seller_story",
      label: "Seller notes",
      description: "Ownership story, recent work, and reason for selling keep buyers engaged.",
      done: hasStory,
      weight: 6
    }
  ];
  const videoItems: SellerGuidanceItem[] = [
    {
      id: "video_context",
      label: "Video context",
      description: "Video gives buyers sound, motion, and a faster feel for the vehicle.",
      done: hasVideo,
      weight: 6
    }
  ];
  const photoItems: SellerGuidanceItem[] = [
    {
      id: "exterior",
      label: "Complete exterior set",
      description: "Photos should cover front, rear, both sides, panels, lights, glass, and wheels.",
      done: imageCount >= 6 || (imageCount > 0 && hasProof("exterior")),
      weight: 8
    }
  ];
  const items = isVideoMode
    ? [...commonItems.slice(0, 2), ...videoItems, ...commonItems.slice(2)]
    : [...commonItems.slice(0, 2), ...photoItems, ...commonItems.slice(2)];

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const earnedWeight = items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0);
  const score = Math.round((earnedWeight / totalWeight) * 100);
  const steps: SellerGuidanceStep[] = [
    {
      id: "media",
      label: "Media",
      status: strongMedia ? "done" : "needs_work"
    },
    {
      id: "details",
      label: "Details",
      status: hasCoreDetails ? "done" : "needs_work"
    },
    {
      id: "trust",
      label: "Trust",
      status:
        hasTitleProof && (hasKnownFlawDisclosure || hasInteriorProof || hasTireSignal)
          ? "done"
          : "boost"
    },
    {
      id: "vin",
      label: "Verified",
      status: hasDecodedVin ? "done" : "boost"
    },
    {
      id: "publish",
      label: "Publish",
      status: score >= 58 ? "done" : "boost"
    }
  ];

  return {
    score,
    label: score >= 80 ? "Strong listing" : score >= 58 ? "Good start" : "Needs proof",
    summary:
      score >= 80
        ? "This has the trust signals buyers need before they message."
        : score >= 58
          ? isVideoMode
            ? "This is publishable, and a few extra proof moments would make it easier to trust."
            : "This is publishable as a photo listing, but video would make it feel more complete."
          : isVideoMode
            ? "Add proof buyers can see. Clear video usually beats more sales copy."
            : "Add proof buyers can inspect. Photos can work, but they need to be complete.",
    steps
  };
}

function getSellerProofOptionsForMode(mode: MediaMode) {
  return sellerProofOptions.filter((option) => option.modes.includes(mode));
}

function formatDollars(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatMiles(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function prepareVideoFileForUpload(
  file: File,
  onStatus: (message: string | null) => void
) {
  const minimumCompressionSize = 12 * 1024 * 1024;

  if (!file.type.startsWith("video/") || file.size < minimumCompressionSize) {
    return file;
  }

  if (
    typeof MediaRecorder === "undefined" ||
    typeof document === "undefined" ||
    !HTMLCanvasElement.prototype.captureStream
  ) {
    onStatus("Video optimization is not supported in this browser. Uploading the original file.");
    return file;
  }

  try {
    const optimizedFile = await compressVideoFile(file, onStatus);

    if (optimizedFile.size >= file.size * 0.96) {
      onStatus(`Optimization did not reduce the file enough. Uploading original ${formatFileSize(file.size)} video.`);
      return file;
    }

    onStatus(
      `Optimized video from ${formatFileSize(file.size)} to ${formatFileSize(optimizedFile.size)} before upload.`
    );
    return optimizedFile;
  } catch (compressionError) {
    onStatus(`Video optimization skipped: ${readErrorMessage(compressionError)} Uploading the original file.`);
    return file;
  }
}

async function compressVideoFile(
  file: File,
  onStatus: (message: string | null) => void
) {
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    URL.revokeObjectURL(sourceUrl);
    throw new Error("Canvas rendering is unavailable.");
  }

  video.src = sourceUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";

  try {
    await waitForVideoMetadata(video);

    const dimensions = getCompressedVideoDimensions(video.videoWidth, video.videoHeight);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const mimeType = getSupportedRecordingMimeType();
    if (!mimeType) {
      throw new Error("No supported recording format was found.");
    }

    const canvasStream = canvas.captureStream(30);
    const outputTracks = [...canvasStream.getVideoTracks()];
    const sourceCapture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    const sourceAudioTracks = sourceCapture?.getAudioTracks() ?? [];
    outputTracks.push(...sourceAudioTracks);
    const outputStream = new MediaStream(outputTracks);
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(outputStream, {
      mimeType,
      videoBitsPerSecond: 2_200_000,
      audioBitsPerSecond: sourceAudioTracks.length > 0 ? 96_000 : undefined
    });

    const completion = new Promise<File>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = () => reject(new Error("MediaRecorder failed while optimizing the video."));
      recorder.onstop = () => {
        const storageMimeType = getStorageVideoMimeType(mimeType);
        const blob = new Blob(chunks, { type: storageMimeType });
        const extension = storageMimeType === "video/mp4" ? "mp4" : "webm";
        const baseName = file.name.replace(/\.[^.]+$/, "") || "seller-video";
        resolve(new File([blob], `${baseName}-optimized.${extension}`, { type: storageMimeType }));
      };
    });

    const startedAt = Date.now();
    let lastStatusAt = 0;
    const drawFrame = () => {
      if (video.paused || video.ended) return;

      drawContainedFrame(context, video, canvas.width, canvas.height);

      const now = Date.now();
      if (now - lastStatusAt > 700 && Number.isFinite(video.duration) && video.duration > 0) {
        lastStatusAt = now;
        const percentage = Math.min(99, Math.round((video.currentTime / video.duration) * 100));
        onStatus(`Optimizing video before upload... ${percentage}%`);
      }

      requestAnimationFrame(drawFrame);
    };

    recorder.start(1000);
    await video.play();
    drawFrame();

    await new Promise<void>((resolve) => {
      video.onended = () => {
        drawContainedFrame(context, video, canvas.width, canvas.height);
        resolve();
      };
    });

    if (recorder.state !== "inactive") {
      recorder.stop();
    }

    const optimizedFile = await completion;
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    onStatus(`Video optimized in ${elapsedSeconds}s. Preparing upload...`);
    return optimizedFile;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}

function waitForVideoMetadata(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not read the selected video."));
  });
}

function getCompressedVideoDimensions(width: number, height: number) {
  const maxLongSide = 1280;
  const maxShortSide = 720;
  const sourceWidth = Math.max(1, width);
  const sourceHeight = Math.max(1, height);
  const longSide = Math.max(sourceWidth, sourceHeight);
  const shortSide = Math.min(sourceWidth, sourceHeight);
  const scale = Math.min(1, maxLongSide / longSide, maxShortSide / shortSide);

  return {
    width: makeEven(Math.round(sourceWidth * scale)),
    height: makeEven(Math.round(sourceHeight * scale))
  };
}

function makeEven(value: number) {
  return Math.max(2, value % 2 === 0 ? value : value - 1);
}

function getSupportedRecordingMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

function getStorageVideoMimeType(mimeType: string) {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase();
  return normalized === "video/mp4" ? "video/mp4" : "video/webm";
}

function drawContainedFrame(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvasWidth: number,
  canvasHeight: number
) {
  const scale = Math.min(canvasWidth / video.videoWidth, canvasHeight / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  const x = (canvasWidth - width) / 2;
  const y = (canvasHeight - height) / 2;

  context.fillStyle = "#050608";
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.drawImage(video, x, y, width, height);
}

function formatPublishError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Could not publish the listing.";

  return /^could not publish the listing/i.test(message) ||
    /^could not save listing/i.test(message) ||
    message.startsWith("Media upload failed") ||
    message.includes("Supabase enforces")
    ? message
    : `Could not publish the listing: ${message}`;
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeVinInput(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function formatDecodedVinMessage(decoded: VinDecodedVehicle) {
  const title = [
    decoded.year ? String(decoded.year) : "",
    decoded.make,
    decoded.model,
    decoded.trim
  ]
    .filter(Boolean)
    .join(" ");

  return title ? `Decoded as ${title}.` : "VIN decoded.";
}

function formatVinDecodeSummary(decoded: VinDecodedVehicle | null) {
  if (!decoded) return "";

  const details = [
    decoded.bodyClass,
    decoded.driveType,
    formatVinEngine(decoded),
    decoded.transmission,
    decoded.fuelTypePrimary
  ].filter(Boolean);

  if (details.length === 0) {
    return "VIN decoded with NHTSA vehicle basics.";
  }

  return `VIN decoded: ${details.slice(0, 3).join(", ")}.`;
}

function formatVinEngine(decoded: VinDecodedVehicle) {
  const parts = [
    decoded.displacementL ? `${decoded.displacementL}L` : "",
    decoded.engineCylinders ? `${decoded.engineCylinders}-cyl` : "",
    decoded.engineHp ? `${decoded.engineHp} hp` : ""
  ].filter(Boolean);

  return parts.join(" ");
}

function formatSellerProofSummary(items: SellerProofItem[]) {
  if (items.length === 0) {
    return "";
  }

  const labels = items
    .map((item) => sellerProofOptions.find((option) => option.value === item)?.label)
    .filter((label): label is string => Boolean(label));

  if (labels.length === 0) {
    return "";
  }

  return `Seller proof included: ${labels.join(", ")}.`;
}

function sellerTypeLabel(value: SellerType) {
  if (value === "Small Lot") return "Small lot";
  if (value === "Dealer") return "Dealer";
  return "Private";
}

function formatSellerDisclosureSummary(
  sellerTitleStatus: SellerTitleStatus,
  vehicleCondition: VehicleConditionStatus,
  knownIssueFlags: KnownIssueFlag[]
) {
  const title = getTitleStatusOption(sellerTitleStatus)?.shortLabel;
  const condition = getVehicleConditionOption(vehicleCondition)?.shortLabel;
  const issueLabels = knownIssueFlags
    .map((flag) => getKnownIssueOption(flag)?.shortLabel)
    .filter(Boolean);
  const parts = [title, condition, ...issueLabels].filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  return `Seller disclosed: ${parts.join(", ")}.`;
}

function formatListingDescription({
  title,
  sellerType,
  description,
  disclosureSummary,
  sellerDisclosureNotes,
  sellerProofSummary
}: {
  title: string;
  sellerType: SellerType;
  description: string;
  disclosureSummary: string;
  sellerDisclosureNotes: string;
  sellerProofSummary: string;
}) {
  const providedDescription = description.trim();
  const disclosureNoteLine = sellerDisclosureNotes
    ? `Seller disclosure: ${sellerDisclosureNotes}`
    : disclosureSummary;

  if (providedDescription) {
    return [providedDescription, sellerProofSummary, disclosureNoteLine].filter(Boolean).join("\n\n");
  }

  return [
    `${title} listed on CarIndex.ai by ${sellerTypeLabel(sellerType)}.`,
    sellerProofSummary,
    disclosureNoteLine,
    "Buyer should verify title, condition, and service history."
  ]
    .filter(Boolean)
    .join(" ");
}

function buildDisclosureTags(
  sellerTitleStatus: SellerTitleStatus,
  vehicleCondition: VehicleConditionStatus,
  knownIssueFlags: KnownIssueFlag[]
) {
  return [
    sellerTitleStatus !== "not_disclosed" ? sellerTitleStatus.replace(/_/g, "-") : null,
    vehicleCondition !== "not_disclosed" ? vehicleCondition.replace(/_/g, "-") : null,
    ...knownIssueFlags.map((flag) => flag.replace(/_/g, "-"))
  ].filter((tag): tag is string => Boolean(tag));
}

function getTitleQuestion(sellerTitleStatus: SellerTitleStatus) {
  if (sellerTitleStatus === "financed_lien") {
    return "What is the current payoff amount, and how would you like to handle the lender payoff?";
  }

  if (sellerTitleStatus === "lease_payoff") {
    return "What is the lease buyout amount, and can the vehicle be sold directly to a private buyer?";
  }

  if (sellerTitleStatus === "paid_off_title_pending") {
    return "When do you expect the title to be ready for transfer?";
  }

  return "Is the title clean and in your name?";
}
