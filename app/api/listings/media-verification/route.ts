import { NextResponse } from "next/server";
import {
  createUncheckedMediaVerification,
  currentMediaVerificationPromptVersion,
  type MediaVerificationResult,
  type MediaVerificationStatus
} from "@/lib/media-verification";

export const dynamic = "force-dynamic";

const model = process.env.OPENAI_MEDIA_VERIFICATION_MODEL ?? "gpt-5.4-mini";
const maxSamples = 5;
const maxDataUrlCharacters = 1_500_000;

type MediaVerificationRequest = {
  listing?: {
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    vin?: string;
    mileage?: number;
  };
  samples?: Array<{
    dataUrl?: string;
    label?: string;
    sourceType?: "image" | "video_frame";
  }>;
};
type NormalizedSample = {
  dataUrl: string;
  label: string;
  sourceType: "image" | "video_frame";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MediaVerificationRequest;
    const samples = normalizeSamples(body.samples);

    if (samples.length === 0) {
      return NextResponse.json({
        mediaVerification: createUncheckedMediaVerification("No usable media samples were available.")
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        mediaVerification: createUncheckedMediaVerification("OpenAI API key is not configured.")
      });
    }

    const mediaVerification = await verifyMediaWithOpenAi(body.listing, samples);
    return NextResponse.json({ mediaVerification });
  } catch (error) {
    return NextResponse.json({
      mediaVerification: createUncheckedMediaVerification(
        error instanceof Error ? error.message : "Media verification failed."
      )
    });
  }
}

async function verifyMediaWithOpenAi(
  listing: MediaVerificationRequest["listing"],
  samples: NormalizedSample[]
) {
  const prompt = buildPrompt(listing, samples);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt
            },
            ...samples.map((sample) => ({
              type: "input_image",
              image_url: sample.dataUrl,
              detail: "low"
            }))
          ]
        }
      ],
      max_output_tokens: 900
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI media verification failed: ${await response.text()}`);
  }

  const data = await response.json();
  const rawText = extractOutputText(data);
  const parsed = parseJsonObject(rawText);
  return normalizeVerification(parsed, samples.length);
}

function buildPrompt(
  listing: MediaVerificationRequest["listing"],
  samples: Required<NonNullable<MediaVerificationRequest["samples"]>[number]>[]
) {
  const vehicle = [
    listing?.year,
    listing?.make,
    listing?.model,
    listing?.trim
  ].filter(Boolean).join(" ");
  const vinText = listing?.vin ? `VIN provided: ${listing.vin}.` : "No VIN provided.";
  const mileageText = listing?.mileage ? `Mileage: ${listing.mileage}.` : "Mileage not provided.";
  const sampleText = samples
    .map((sample, index) => `${index + 1}. ${sample.label} (${sample.sourceType})`)
    .join("\n");

  return [
    "You are verifying seller-uploaded vehicle listing media for a car marketplace.",
    "The goal is fraud/spam reduction and buyer trust, not cosmetic judging.",
    `Listed vehicle: ${vehicle || "unknown vehicle"}. ${vinText} ${mileageText}`,
    "Analyze the attached images/video frames together. Video frames may include a person at the start, so judge the full set.",
    "Flag junk or irrelevant media such as 'we buy junk cars' ads, memes, screenshots, stock-looking dealer ads, unrelated people/objects, or content that does not show a vehicle.",
    "If a vehicle is visible but the exact make/model cannot be confirmed, use unclear unless the media obviously conflicts with the listing.",
    "If the media appears to show a vehicle matching the listing at a reasonable category level, use verified_vehicle.",
    "Return only valid JSON. No markdown.",
    "Allowed status values: verified_vehicle, unclear, mismatch.",
    "Allowed visibleProof values: exterior, interior, dash, odometer, vin_plate, tires, flaws, title, engine_bay, video_context.",
    "Allowed qualityIssues values: too_dark, blurry, too_few_angles, no_vehicle_visible, screenshot_or_ad, possible_stock_media, unrelated_person_or_object, text_ad_or_junk_buyer.",
    "Allowed riskFlags values: not_a_vehicle, does_not_match_listing, junk_ad, scam_or_spam_signal, vehicle_not_clearly_visible, unrelated_media.",
    "Schema:",
    JSON.stringify({
      status: "verified_vehicle | unclear | mismatch",
      confidence: 0.82,
      isVehicleMedia: true,
      appearsToMatchListing: true,
      visibleProof: ["exterior", "interior"],
      qualityIssues: [],
      riskFlags: [],
      notes: "One concise sentence for buyer/seller context."
    }),
    "Samples:",
    sampleText
  ].join("\n");
}

function normalizeSamples(samples: MediaVerificationRequest["samples"]): NormalizedSample[] {
  if (!Array.isArray(samples)) return [];

  return samples
    .slice(0, maxSamples)
    .map<NormalizedSample>((sample, index) => ({
      dataUrl: typeof sample.dataUrl === "string" ? sample.dataUrl : "",
      label: typeof sample.label === "string" && sample.label.trim() ? sample.label.trim() : `Sample ${index + 1}`,
      sourceType: sample.sourceType === "video_frame" ? "video_frame" : "image"
    }))
    .filter((sample) =>
      /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(sample.dataUrl) &&
      sample.dataUrl.length <= maxDataUrlCharacters
    );
}

function normalizeVerification(value: unknown, sampleCount: number): MediaVerificationResult {
  const object = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawStatus = normalizeStatus(object.status);
  const isVehicleMedia = Boolean(object.isVehicleMedia);
  const appearsToMatchListing = Boolean(object.appearsToMatchListing);
  const riskFlags = readStringArray(object.riskFlags);
  const qualityIssues = readStringArray(object.qualityIssues);
  const status = shouldTreatAsMismatch({
    rawStatus,
    isVehicleMedia,
    appearsToMatchListing,
    riskFlags,
    qualityIssues
  })
    ? "mismatch"
    : rawStatus;

  return {
    status,
    confidence: clampConfidence(object.confidence),
    isVehicleMedia,
    appearsToMatchListing,
    visibleProof: readStringArray(object.visibleProof),
    qualityIssues,
    riskFlags,
    notes: typeof object.notes === "string" ? object.notes.slice(0, 240) : "",
    checkedAt: new Date().toISOString(),
    model,
    promptVersion: currentMediaVerificationPromptVersion,
    sampleCount
  };
}

function shouldTreatAsMismatch({
  rawStatus,
  isVehicleMedia,
  appearsToMatchListing,
  riskFlags,
  qualityIssues
}: {
  rawStatus: MediaVerificationStatus;
  isVehicleMedia: boolean;
  appearsToMatchListing: boolean;
  riskFlags: string[];
  qualityIssues: string[];
}) {
  if (rawStatus === "mismatch") return true;

  const strongMismatchSignal = [...riskFlags, ...qualityIssues].some((flag) =>
    /not_a_vehicle|unrelated|junk|spam|scam|text_ad|no_vehicle_visible|does_not_match/i.test(flag)
  );

  return strongMismatchSignal || (rawStatus === "unclear" && !isVehicleMedia && !appearsToMatchListing);
}

function normalizeStatus(value: unknown): MediaVerificationStatus {
  if (value === "verified_vehicle" || value === "unclear" || value === "mismatch") {
    return value;
  }

  return "unclear";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
}

function clampConfidence(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function parseJsonObject(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return {};

    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

function extractOutputText(data: unknown) {
  if (!data || typeof data !== "object") return "";

  const direct = (data as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;

  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    })
    .map((content) => {
      if (!content || typeof content !== "object") return "";
      const text = (content as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("\n")
    .trim();
}
