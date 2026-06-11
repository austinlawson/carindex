"use client";

import { useCallback, useEffect, useState } from "react";
import * as tus from "tus-js-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CarListing, ListingMediaItem } from "@/data/listings";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import {
  carListingToDatabaseInsert,
  databaseListingToCarListing,
  mediaItemToDatabaseInsert
} from "@/lib/supabase/listing-mappers";

const listingMediaBucket = "listing-media";
const resumableUploadThresholdBytes = 6 * 1024 * 1024;
const directVideoUploadFallbackMaxBytes = 45 * 1024 * 1024;

type SupabaseBrowserClient = SupabaseClient<Database>;
type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
type ListingInsert = Database["public"]["Tables"]["listings"]["Insert"];
type ListingUpdate = Database["public"]["Tables"]["listings"]["Update"];
type MediaRow = Database["public"]["Tables"]["listing_media"]["Row"];
type EditableListingFields = Pick<
  CarListing,
  | "year"
  | "make"
  | "model"
  | "trim"
  | "price"
  | "mileage"
  | "location"
  | "vin"
  | "listingDescription"
  | "sellerDisclosureNotes"
>;

export function useUserListings(userId?: string) {
  const [listings, setListings] = useState<CarListing[]>([]);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !userId) {
      setListings([]);
      return;
    }
    const client = supabase;
    const ownerId = userId;

    let cancelled = false;

    async function loadDatabaseListings() {
      const { data: listingRows, error } = await client
        .from("listings")
        .select("*")
        .eq("source_mode", "user")
        .eq("status", "active")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(80);

      if (cancelled) return;

      if (error) {
        setStorageWarning("Supabase listings are not available yet. Run the backend migration.");
        return;
      }

      const typedListingRows = (listingRows ?? []) as ListingRow[];
      const listingIds = typedListingRows.map((row) => row.id);
      const { data: mediaRows } =
        listingIds.length > 0
          ? await client
              .from("listing_media")
              .select("*")
              .in("listing_id", listingIds)
              .order("sort_order", { ascending: true })
          : { data: [] };

      if (cancelled) return;

      const typedMediaRows = (mediaRows ?? []) as MediaRow[];
      const mediaByListing = new Map<string, MediaRow[]>();
      for (const media of typedMediaRows) {
        const current = mediaByListing.get(media.listing_id) ?? [];
        current.push(media);
        mediaByListing.set(media.listing_id, current);
      }

      setListings(
        typedListingRows.map((row) =>
          databaseListingToCarListing(row, mediaByListing.get(row.id) ?? [])
        )
      );
      setStorageWarning(null);
    }

    void loadDatabaseListings();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const addListing = useCallback(
    async (listing: CarListing, files: File[] = []): Promise<CarListing> => {
      const supabase = createSupabaseBrowserClient();

      if (userId && supabase) {
        const listingId = createClientUuid();
        const databaseListing = {
          ...listing,
          id: listingId,
          ownerId: userId
        };

        const listingInsert = carListingToDatabaseInsert(databaseListing, userId, listingId);
        let usedLegacyDisclosureInsert = false;
        let { data: insertedListing, error: listingError } = await supabase
          .from("listings")
          .insert(listingInsert)
          .select("*")
          .single();

        if (listingError && isMissingDisclosureSchemaError(listingError)) {
          usedLegacyDisclosureInsert = true;
          const retryResult = await supabase
            .from("listings")
            .insert(removeDisclosureColumns(listingInsert))
            .select("*")
            .single();

          insertedListing = retryResult.data;
          listingError = retryResult.error;
        }

        if (listingError) {
          const message = `Could not save listing to Supabase: ${formatUploadError(listingError)}`;
          setStorageWarning(message);
          throw new Error(message);
        }

        if (!insertedListing) {
          const message = "Could not save listing to Supabase: no listing row was returned after insert.";
          setStorageWarning(message);
          throw new Error(message);
        }

        let mediaItems: ListingMediaItem[];
        try {
          mediaItems =
            files.length > 0
              ? await uploadListingFiles(supabase, userId, listingId, files, listing.mediaItems)
              : listing.mediaItems;
        } catch (error) {
          await supabase.from("listings").delete().eq("id", listingId).eq("owner_id", userId);
          setStorageWarning(formatStorageWarning(error));
          throw error;
        }

        const mediaInserts = mediaItems.map((media, index) =>
          mediaItemToDatabaseInsert({
            listingId,
            ownerId: userId,
            media,
            storagePath: readStoragePath(media.url, userId, listingId),
            sortOrder: index
          })
        );

        const { data: insertedMedia, error: mediaError } =
          mediaInserts.length > 0
            ? await supabase.from("listing_media").insert(mediaInserts).select("*")
            : { data: [], error: null };

        if (mediaError) {
          setStorageWarning(`Listing saved, but media rows could not be attached: ${formatUploadError(mediaError)}`);
          throw mediaError;
        }

        const savedListing = {
          ...databaseListingToCarListing(insertedListing, insertedMedia ?? []),
          sellerTitleStatus: databaseListing.sellerTitleStatus,
          vehicleCondition: databaseListing.vehicleCondition,
          knownIssueFlags: databaseListing.knownIssueFlags,
          sellerDisclosureNotes: databaseListing.sellerDisclosureNotes,
          rawProviderSummary: databaseListing.rawProviderSummary
        };
        setListings((current) => [
          savedListing,
          ...current.filter((item) => item.id !== savedListing.id)
        ]);
        setStorageWarning(
          usedLegacyDisclosureInsert
            ? "Listing published. Apply migration 004_private_seller_disclosures.sql so future posts persist structured disclosure labels."
            : null
        );
        return savedListing;
      }

      setStorageWarning("Sign in before publishing a listing.");
      throw new Error("Sign in before publishing a listing.");
    },
    [userId]
  );

  const removeListing = useCallback(
    async (id: string) => {
      setListings((current) => current.filter((listing) => listing.id !== id));

      if (userId) {
        const supabase = createSupabaseBrowserClient();
        await supabase?.from("listings").delete().eq("id", id).eq("owner_id", userId);
      }
    },
    [userId]
  );

  const updateListing = useCallback(
    async (id: string, updates: Partial<EditableListingFields>) => {
      if (!userId) {
        throw new Error("Sign in before editing a listing.");
      }

      const existingListing = listings.find((listing) => listing.id === id);
      if (!existingListing) {
        throw new Error("Could not find that listing.");
      }

      const nextListing = {
        ...existingListing,
        ...updates,
        listingTitle: formatListingTitle({
          ...existingListing,
          ...updates
        })
      };
      const databaseUpdates = editableListingToDatabaseUpdate(nextListing);
      const supabase = createSupabaseBrowserClient();

      if (!supabase) {
        throw new Error("Supabase is not available.");
      }

      const { error } = await supabase
        .from("listings")
        .update(databaseUpdates)
        .eq("id", id)
        .eq("owner_id", userId);

      if (error) {
        throw new Error(`Could not update listing: ${formatUploadError(error)}`);
      }

      setListings((current) =>
        current.map((listing) => (listing.id === id ? nextListing : listing))
      );

      return nextListing;
    },
    [listings, userId]
  );

  const requestManualReview = useCallback(
    async (id: string) => {
      if (!userId) {
        throw new Error("Sign in before requesting review.");
      }

      const existingListing = listings.find((listing) => listing.id === id);
      if (!existingListing) {
        throw new Error("Could not find that listing.");
      }

      const rawProviderSummary = {
        ...(existingListing.rawProviderSummary ?? {}),
        moderation: {
          ...readRawObject(existingListing.rawProviderSummary?.moderation),
          status: "manual_review_requested",
          requestedAt: new Date().toISOString(),
          reason: "seller_resubmission_after_media_hold",
          reviewCostPolicy: "manual_review_no_additional_vision_check"
        }
      };
      const tags = uniqueStrings([
        ...existingListing.tags,
        "manual-review-requested",
        "resubmission-no-vision"
      ]);
      const nextListing = {
        ...existingListing,
        tags,
        rawProviderSummary
      };
      const supabase = createSupabaseBrowserClient();

      if (!supabase) {
        throw new Error("Supabase is not available.");
      }

      const { error } = await supabase
        .from("listings")
        .update({
          tags,
          raw_provider_summary: rawProviderSummary as ListingUpdate["raw_provider_summary"]
        })
        .eq("id", id)
        .eq("owner_id", userId);

      if (error) {
        throw new Error(`Could not request manual review: ${formatUploadError(error)}`);
      }

      setListings((current) =>
        current.map((listing) => (listing.id === id ? nextListing : listing))
      );

      return nextListing;
    },
    [listings, userId]
  );

  return {
    listings,
    addListing,
    updateListing,
    requestManualReview,
    removeListing,
    storageWarning
  };
}

function editableListingToDatabaseUpdate(listing: CarListing): ListingUpdate {
  return {
    year: listing.year,
    make: listing.make.trim(),
    model: listing.model.trim(),
    trim: listing.trim.trim(),
    price: listing.price,
    mileage: listing.mileage,
    location: listing.location.trim(),
    vin: listing.vin?.trim() || null,
    listing_title: listing.listingTitle ?? formatListingTitle(listing),
    listing_description: listing.listingDescription?.trim() || null,
    seller_disclosure_notes: listing.sellerDisclosureNotes?.trim() || null
  };
}

function formatListingTitle(listing: Pick<CarListing, "year" | "make" | "model" | "trim">) {
  return [listing.year, listing.make, listing.model, listing.trim]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function readRawObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

async function uploadListingFiles(
  supabase: SupabaseBrowserClient,
  userId: string,
  listingId: string,
  files: File[],
  sourceMediaItems: ListingMediaItem[] = []
): Promise<ListingMediaItem[]> {
  const uploaded: ListingMediaItem[] = [];

  for (const [index, file] of files.entries()) {
    const extension = getExtension(file);
    const storagePath = `${userId}/${listingId}/${String(index + 1).padStart(2, "0")}-${Date.now()}.${extension}`;
    const shouldUseResumableUpload =
      file.type.startsWith("video/") || file.size > resumableUploadThresholdBytes;

    if (shouldUseResumableUpload) {
      try {
        await uploadFileWithTus(supabase, storagePath, file);
      } catch (error) {
        if (file.size > directVideoUploadFallbackMaxBytes) {
          throw error;
        }

        await uploadFileDirect(supabase, storagePath, file);
      }
    } else {
      await uploadFileDirect(supabase, storagePath, file);
    }

    const {
      data: { publicUrl }
    } = supabase.storage.from(listingMediaBucket).getPublicUrl(storagePath);

    const sourceMedia = sourceMediaItems[index];
    const fileMetadata =
      sourceMedia?.width && sourceMedia.height && (!file.type.startsWith("video/") || sourceMedia.durationSeconds)
        ? {}
        : await readFileMediaMetadata(file);

    uploaded.push({
      url: publicUrl,
      type: file.type.startsWith("video/") ? "video" : "image",
      label: file.type.startsWith("video/") ? "Walkaround video" : `Photo ${index + 1}`,
      width: sourceMedia?.width ?? fileMetadata.width,
      height: sourceMedia?.height ?? fileMetadata.height,
      durationSeconds: file.type.startsWith("video/")
        ? sourceMedia?.durationSeconds ?? fileMetadata.durationSeconds
        : undefined
    });
  }

  return uploaded;
}

async function uploadFileDirect(
  supabase: SupabaseBrowserClient,
  storagePath: string,
  file: File
) {
  await retryUpload(async () => {
    const { error } = await supabase.storage
      .from(listingMediaBucket)
      .upload(storagePath, file, {
        contentType: getStorageContentType(file),
        upsert: false
      });

    if (error) {
      throw error;
    }
  });
}

async function uploadFileWithTus(
  supabase: SupabaseBrowserClient,
  storagePath: string,
  file: File
) {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("Could not start video upload because the auth session was missing.");
  }

  const endpoint = getResumableUploadEndpoint();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        ...(publishableKey ? { apikey: publishableKey } : {})
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: listingMediaBucket,
        objectName: storagePath,
        contentType: getStorageContentType(file) ?? "application/octet-stream",
        cacheControl: "3600"
      },
      chunkSize: resumableUploadThresholdBytes,
      onError: reject,
      onSuccess: () => resolve()
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }

      upload.start();
    }).catch(reject);
  });
}

async function retryUpload(operation: () => Promise<void>) {
  const delays = [0, 1000, 2500];
  let lastError: unknown;

  for (const delay of delays) {
    if (delay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }

    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function getResumableUploadEndpoint() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error("Supabase URL is missing.");
  }

  const url = new URL(supabaseUrl);
  const projectId = url.hostname.split(".")[0];

  if (!projectId || url.hostname === "localhost" || url.hostname.startsWith("127.")) {
    return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`;
  }

  return `${url.protocol}//${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
}

function getExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName) return fromName;
  if (file.type === "video/quicktime") return "mov";
  if (file.type === "video/webm") return "webm";
  if (file.type.startsWith("video/")) return "mp4";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function getStorageContentType(file: File) {
  const mimeType = file.type.split(";")[0]?.trim().toLowerCase();

  if (!mimeType) return undefined;
  if (mimeType === "video/quicktime") return "video/quicktime";
  if (mimeType === "video/mp4" || mimeType === "video/x-m4v") return "video/mp4";
  if (mimeType === "video/webm") return "video/webm";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "image/jpeg";
  if (mimeType === "image/png") return "image/png";
  if (mimeType === "image/webp") return "image/webp";
  if (mimeType === "image/gif") return "image/gif";

  return mimeType;
}

async function readFileMediaMetadata(file: File): Promise<{
  width?: number;
  height?: number;
  durationSeconds?: number;
}> {
  if (file.type.startsWith("video/")) {
    return readVideoFileMetadata(file);
  }

  if (file.type.startsWith("image/")) {
    return readImageDimensions(file);
  }

  return {};
}

async function readVideoFileMetadata(file: File): Promise<{
  width?: number;
  height?: number;
  durationSeconds?: number;
}> {
  if (typeof document === "undefined" || !file.type.startsWith("video/")) {
    return {};
  }

  const video = document.createElement("video");
  const url = URL.createObjectURL(file);

  try {
    video.preload = "metadata";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not read video duration."));
    });

    return {
      width: video.videoWidth > 0 ? video.videoWidth : undefined,
      height: video.videoHeight > 0 ? video.videoHeight : undefined,
      durationSeconds:
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.round(video.duration)
          : undefined
    };
  } catch {
    return {};
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function readImageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) {
    return {};
  }

  const image = new Image();
  const url = URL.createObjectURL(file);

  try {
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not read image dimensions."));
    });

    return {
      width: image.naturalWidth > 0 ? image.naturalWidth : undefined,
      height: image.naturalHeight > 0 ? image.naturalHeight : undefined
    };
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

function createClientUuid() {
  const browserCrypto = globalThis.crypto;

  if (browserCrypto?.randomUUID) {
    return browserCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (browserCrypto?.getRandomValues) {
    browserCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

function formatStorageWarning(error: unknown) {
  const message = formatUploadError(error);

  if (/exceeded|too large|payload|entity too large|file size|maximum/i.test(message)) {
    return `${message} Supabase enforces both the project Storage global file size limit and the listing-media bucket limit. Free projects are capped at 50 MB; Pro projects can raise the global limit higher. Raise Storage Settings > Global file size limit and the listing-media bucket limit, or compress the video.`;
  }

  return `Media upload failed: ${message}`;
}

function formatUploadError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; error?: unknown; statusCode?: unknown };
    return [value.message, value.error, value.statusCode ? `status ${value.statusCode}` : null]
      .filter(Boolean)
      .map(String)
      .join(" ");
  }

  return "Unknown upload error.";
}

function isMissingDisclosureSchemaError(error: unknown) {
  const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  const text = [
    value?.code,
    value?.message,
    value?.details,
    value?.hint
  ]
    .filter(Boolean)
    .map(String)
    .join(" ");

  return (
    text.includes("42703") ||
    /seller_title_status|vehicle_condition|known_issue_flags|seller_disclosure_notes|schema cache/i.test(text)
  );
}

function removeDisclosureColumns(insert: ListingInsert): ListingInsert {
  const {
    seller_title_status: _sellerTitleStatus,
    vehicle_condition: _vehicleCondition,
    known_issue_flags: _knownIssueFlags,
    seller_disclosure_notes: _sellerDisclosureNotes,
    ...legacyInsert
  } = insert;

  return legacyInsert;
}

function readStoragePath(url: string, userId: string, listingId: string) {
  const marker = `/${listingMediaBucket}/`;
  if (!url.includes(userId) || !url.includes(listingId) || !url.includes(marker)) {
    return null;
  }

  return url.split(marker)[1] ?? null;
}
