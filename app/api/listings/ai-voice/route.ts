import { NextResponse } from "next/server";
import type { CarListing, ListingAiVoice } from "@/data/listings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { currentAiVoicePromptVersion, isCurrentAiVoice } from "@/lib/ai-voice";
import { formatCurrency, formatMileage } from "@/lib/format";
import { getListingConfidence } from "@/lib/listing-confidence";

export const dynamic = "force-dynamic";

const listingMediaBucket = process.env.SUPABASE_LISTING_MEDIA_BUCKET ?? "listing-media";
const scriptModel = process.env.OPENAI_AI_VOICE_SCRIPT_MODEL ?? "gpt-5.5";
const ttsModel = process.env.OPENAI_AI_VOICE_TTS_MODEL ?? "gpt-4o-mini-tts";
const audioFormat = getAudioFormat(process.env.OPENAI_AI_VOICE_AUDIO_FORMAT);
const audioFormatConfig = {
  mp3: { extension: "mp3", mimeType: "audio/mpeg" },
  aac: { extension: "aac", mimeType: "audio/aac" },
  opus: { extension: "opus", mimeType: "audio/ogg" }
} as const;

type ListingUpdate = Database["public"]["Tables"]["listings"]["Update"];
type ListingRow = Database["public"]["Tables"]["listings"]["Row"];

type VoicePersona = {
  id: string;
  label: string;
  voice: string;
  style: string;
  ttsInstructions: string;
};

type VoiceAngle = {
  id: string;
  label: string;
  direction: string;
};

const voicePersonas: VoicePersona[] = [
  {
    id: "deal-scout",
    label: "Deal Scout",
    voice: "coral",
    style: "practical, confident, buyer-first, with one memorable line",
    ttsInstructions: "Speak like a sharp used-car scout: warm, quick, confident, and conversational."
  },
  {
    id: "mechanic-friend",
    label: "Mechanic Friend",
    voice: "cedar",
    style: "calm, mechanically aware, skeptical without sounding negative",
    ttsInstructions: "Speak like a friendly mechanic giving quick advice before a test drive."
  },
  {
    id: "hype-or-pass",
    label: "Hype or Pass",
    voice: "verse",
    style: "energetic, punchy, social-feed ready, but still useful",
    ttsInstructions: "Speak with upbeat social-feed energy, but keep the delivery credible and not theatrical."
  },
  {
    id: "parent-mode",
    label: "Parent Mode",
    voice: "marin",
    style: "safety-minded, value-minded, grounded, gently witty",
    ttsInstructions: "Speak like a practical advisor focused on reliability, safety, and avoiding regret."
  },
  {
    id: "auction-block",
    label: "Auction Block",
    voice: "echo",
    style: "fast, lively, auction-adjacent, with clear buy-or-wait stakes",
    ttsInstructions: "Speak with lively auction-style momentum, but remain clear and easy to understand."
  },
  {
    id: "luxury-snob",
    label: "Luxury Snob",
    voice: "ballad",
    style: "dry, polished, lightly judgmental, especially about overpaying",
    ttsInstructions: "Speak with polished dry humor and a slightly elevated tone."
  }
];

const voiceAngles: VoiceAngle[] = [
  {
    id: "scroll-stopper",
    label: "Scroll Stopper",
    direction: "Give one punchy reason this listing deserves five more seconds of attention."
  },
  {
    id: "buyer-psychology",
    label: "Buyer Psychology",
    direction: "Describe the exact buyer this listing is trying to seduce, and why that buyer might linger."
  },
  {
    id: "market-tension",
    label: "Market Tension",
    direction: "Name the tension that makes the listing interesting: bargain, gamble, flex, utility, nostalgia, or convenience."
  },
  {
    id: "ownership-scene",
    label: "Ownership Scene",
    direction: "Paint a quick day-in-the-life scene that helps the viewer imagine owning it without inventing history."
  },
  {
    id: "resale-chess",
    label: "Resale Chess",
    direction: "Talk about what would make the next buyer believe the value story later."
  },
  {
    id: "lot-theater",
    label: "Lot Theater",
    direction: "Make it feel like a smart aside from the edge of a dealer lot or auction lane, not a checklist."
  },
  {
    id: "confidence-scan",
    label: "Confidence Scan",
    direction: "Focus on what would make the listing feel instantly trustworthy or instantly fragile."
  },
  {
    id: "garage-gossip",
    label: "Garage Gossip",
    direction: "Give the kind of slightly funny, specific take someone would say while sending the listing to a friend."
  }
];

export async function POST(request: Request) {
  let listing: CarListing | undefined;

  try {
    const body = (await request.json()) as { listing?: CarListing; force?: boolean };
    listing = body.listing;

    if (!listing?.id) {
      return NextResponse.json({ error: "A listing is required." }, { status: 400 });
    }

    if (listing.aiVoice && !body.force && isCurrentAiVoice(listing.aiVoice)) {
      return NextResponse.json({ aiVoice: listing.aiVoice, persisted: true });
    }

    const supabase = createSupabaseAdminClient();
    const cachedVoice = body.force ? null : await fetchCachedVoice(listing.id);

    if (cachedVoice) {
      return NextResponse.json({ aiVoice: cachedVoice, persisted: true });
    }

    const persona = getVoicePersona(listing.id);
    const angle = getVoiceAngle(listing.id);
    const script = await createVoiceScript(listing, persona, angle);
    const audioBytes = await createVoiceAudio(script, persona);
    const audioUrl = audioBytes ? await uploadVoiceAudio(listing.id, audioBytes) : undefined;
    const aiVoice: ListingAiVoice = {
      script,
      audioUrl,
      persona: persona.label,
      voice: persona.voice,
      scriptModel: process.env.OPENAI_API_KEY ? scriptModel : "local-fallback",
      ttsModel: audioUrl ? ttsModel : undefined,
      generatedAt: new Date().toISOString(),
      promptVersion: currentAiVoicePromptVersion
    };

    const persisted = supabase ? await persistAiVoice(listing.id, aiVoice) : false;

    return NextResponse.json({
      aiVoice,
      persisted,
      usedFallback: !process.env.OPENAI_API_KEY
    });
  } catch (error) {
    const fallbackVoice = listing
      ? createFallbackVoice(listing, getVoicePersona(listing.id), getVoiceAngle(listing.id))
      : null;

    return NextResponse.json(
      {
        aiVoice: fallbackVoice,
        persisted: false,
        usedFallback: true,
        error: error instanceof Error ? error.message : "Could not generate AI voice."
      },
      { status: fallbackVoice ? 200 : 500 }
    );
  }
}

async function fetchCachedVoice(listingId: string): Promise<ListingAiVoice | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("listings")
    .select("ai_voice_script, ai_voice_url, ai_voice_persona, ai_voice_voice, ai_voice_script_model, ai_voice_tts_model, ai_voice_prompt_version, ai_voice_generated_at")
    .eq("id", listingId)
    .maybeSingle();

  if (error) {
    return fetchRawSummaryCachedVoice(listingId);
  }

  if (!data?.ai_voice_script) {
    return null;
  }

  const aiVoice = {
    script: data.ai_voice_script,
    audioUrl: data.ai_voice_url ?? undefined,
    persona: data.ai_voice_persona ?? "Deal Scout",
    voice: data.ai_voice_voice ?? "coral",
    scriptModel: data.ai_voice_script_model ?? undefined,
    ttsModel: data.ai_voice_tts_model ?? undefined,
    generatedAt: data.ai_voice_generated_at ?? undefined,
    promptVersion: data.ai_voice_prompt_version ?? undefined
  };

  return isCurrentAiVoice(aiVoice) ? aiVoice : null;
}

async function createVoiceScript(listing: CarListing, persona: VoicePersona, angle: VoiceAngle) {
  if (!process.env.OPENAI_API_KEY) {
    return createFallbackVoice(listing, persona, angle).script;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: scriptModel,
      input: buildScriptPrompt(listing, persona, angle),
      max_output_tokens: 700
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI script generation failed: ${await response.text()}`);
  }

  const data = await response.json();
  const rawText = extractOutputText(data);
  const parsedScript = parseScriptFromModelOutput(rawText);

  return parsedScript || createFallbackVoice(listing, persona, angle).script;
}

async function createVoiceAudio(script: string, persona: VoicePersona) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ttsModel,
      voice: persona.voice,
      input: script,
      instructions: persona.ttsInstructions,
      response_format: audioFormat
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI TTS generation failed: ${await response.text()}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function uploadVoiceAudio(listingId: string, audioBytes: Buffer) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return undefined;

  const formatConfig = audioFormatConfig[audioFormat];
  const storagePath = `ai-voice/${listingId}/${Date.now()}.${formatConfig.extension}`;
  const { error } = await supabase.storage
    .from(listingMediaBucket)
    .upload(storagePath, audioBytes, {
      contentType: formatConfig.mimeType,
      upsert: true
    });

  if (error) {
    throw new Error(`Could not upload AI voice audio: ${error.message}`);
  }

  const {
    data: { publicUrl }
  } = supabase.storage.from(listingMediaBucket).getPublicUrl(storagePath);

  return publicUrl;
}

async function persistAiVoice(listingId: string, aiVoice: ListingAiVoice) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  const update: ListingUpdate = {
    ai_voice_script: aiVoice.script,
    ai_voice_url: aiVoice.audioUrl ?? null,
    ai_voice_persona: aiVoice.persona,
    ai_voice_voice: aiVoice.voice,
    ai_voice_script_model: aiVoice.scriptModel ?? null,
    ai_voice_tts_model: aiVoice.ttsModel ?? null,
    ai_voice_prompt_version: aiVoice.promptVersion ?? null,
    ai_voice_generated_at: aiVoice.generatedAt ?? null
  };
  const { error } = await supabase.from("listings").update(update).eq("id", listingId);

  if (!error) return true;

  return persistRawSummaryAiVoice(listingId, aiVoice);
}

async function fetchRawSummaryCachedVoice(listingId: string): Promise<ListingAiVoice | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("listings")
    .select("raw_provider_summary")
    .eq("id", listingId)
    .maybeSingle();

  if (error) return null;

  const aiVoice = readAiVoiceFromRawSummary(data?.raw_provider_summary);
  return aiVoice && isCurrentAiVoice(aiVoice) ? aiVoice : null;
}

async function persistRawSummaryAiVoice(listingId: string, aiVoice: ListingAiVoice) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("listings")
    .select("raw_provider_summary")
    .eq("id", listingId)
    .maybeSingle();

  if (error) return false;

  const existingSummary =
    data?.raw_provider_summary &&
    typeof data.raw_provider_summary === "object" &&
    !Array.isArray(data.raw_provider_summary)
      ? data.raw_provider_summary
      : {};

  const { error: updateError } = await supabase
    .from("listings")
    .update({
      raw_provider_summary: {
        ...existingSummary,
        aiVoice
      }
    } satisfies Pick<ListingRow, "raw_provider_summary">)
    .eq("id", listingId);

  return !updateError;
}

function readAiVoiceFromRawSummary(rawSummary: unknown): ListingAiVoice | null {
  if (!rawSummary || typeof rawSummary !== "object" || Array.isArray(rawSummary)) return null;

  const aiVoice = (rawSummary as { aiVoice?: unknown }).aiVoice;
  if (!aiVoice || typeof aiVoice !== "object" || Array.isArray(aiVoice)) return null;

  const candidate = aiVoice as Partial<ListingAiVoice>;
  if (typeof candidate.script !== "string" || !candidate.script.trim()) return null;

  return {
    script: candidate.script,
    audioUrl: typeof candidate.audioUrl === "string" ? candidate.audioUrl : undefined,
    persona: typeof candidate.persona === "string" ? candidate.persona : "Deal Scout",
    voice: typeof candidate.voice === "string" ? candidate.voice : "coral",
    scriptModel: typeof candidate.scriptModel === "string" ? candidate.scriptModel : undefined,
    ttsModel: typeof candidate.ttsModel === "string" ? candidate.ttsModel : undefined,
    generatedAt: typeof candidate.generatedAt === "string" ? candidate.generatedAt : undefined,
    promptVersion: typeof candidate.promptVersion === "string" ? candidate.promptVersion : undefined
  };
}

function buildScriptPrompt(listing: CarListing, persona: VoicePersona, angle: VoiceAngle) {
  const insightProfile = buildListingInsightProfile(listing);

  return `
You write short entertaining AI voiceovers for a used-car marketplace feed.

Return only the final spoken voiceover text.
Do not return JSON, Markdown, labels, quotation marks around the whole answer, or alternate options.

Voiceover rules:
- 24 to 40 words.
- Hidden host persona: ${persona.label}. Use the viewpoint, but never introduce yourself or say the persona name.
- Style: ${persona.style}.
- Useful, entertaining, and sales-supportive without sounding like an ad.
- Assume the viewer can already see year, make, model, price, mileage, location, and badges. Do not rehash those facts.
- Creative angle for this listing: ${angle.label}. ${angle.direction}
- Make this feel specific to this listing. Use one distinctive insight, not a summary.
- Favor retention: curiosity, tension, humor, taste, buyer psychology, or a tiny ownership fantasy.
- Do not say "ask the dealer", "ask the seller", "verify the title", "check the VIN", "get records", or list inspection chores.
- Avoid repeating phrases like "the selling angle is simple", "value story", "first five minutes", "slow-roll the handshake", "confidence sells harder than adjectives", "driveway conversation", or "owning this by Saturday".
- Do not invent accidents, maintenance history, title status, defects, or seller behavior.
- If data is sparse, talk about the listing's pitch or what kind of buyer it is trying to hook instead of pretending to know more.
- No profanity.

Listing context:
${insightProfile}
`.trim();
}

function createFallbackVoice(
  listing: CarListing,
  persona: VoicePersona,
  angle: VoiceAngle
): ListingAiVoice {
  const age = Math.max(1, new Date().getFullYear() - listing.year);
  const milesPerYear = Math.round(listing.mileage / age);
  const fallbackLines = [
    `This one is not trying to win on mystery. It needs one clean promise: about ${formatMileage(milesPerYear)} a year worth of use, with enough proof to keep the next buyer leaning in.`,
    `The hook is not the badge, it is the confidence. If the photos make it feel easy, this can turn from another scroll into a serious driveway conversation fast.`,
    `This is the kind of listing where proof sells harder than adjectives. Less fireworks, more "I can picture this in my week." That is what keeps people watching.`,
    `The entertainment here is the tension: practical enough to justify, interesting enough to keep staring. That is usually where a listing starts earning attention.`
  ];

  return {
    script: fallbackLines[Math.abs(hashString(`${listing.id}:${angle.id}`)) % fallbackLines.length],
    persona: persona.label,
    voice: persona.voice,
    scriptModel: "local-fallback",
    generatedAt: new Date().toISOString(),
    promptVersion: currentAiVoicePromptVersion
  };
}

function getVoicePersona(listingId: string) {
  const index = Math.abs(hashString(listingId)) % voicePersonas.length;
  return voicePersonas[index] ?? voicePersonas[0];
}

function getVoiceAngle(listingId: string) {
  const index = Math.abs(hashString(`${listingId}:angle`)) % voiceAngles.length;
  return voiceAngles[index] ?? voiceAngles[0];
}

function buildListingInsightProfile(listing: CarListing) {
  const age = Math.max(1, new Date().getFullYear() - listing.year);
  const milesPerYear = Math.round(listing.mileage / age);
  const confidenceRead = getListingConfidence(listing);
  const dataDepth = getListingDataDepth(listing);
  const mediaLabels = listing.mediaItems
    .map((item) => item.label)
    .filter((label): label is string => Boolean(label?.trim()))
    .slice(0, 8);

  return [
    `Vehicle: ${listing.year} ${listing.make} ${listing.model} ${listing.trim}`.trim(),
    `Source/data depth: ${listing.sourceMode ?? "unknown"} / ${dataDepth}`,
    `Seller type: ${listing.sellerType}`,
    `Asking price: ${formatCurrency(listing.price)}. Market price check has not been run.`,
    `Buyer confidence/readiness: ${confidenceRead.label}; score=${confidenceRead.score}; strengths=${confidenceRead.strengths.join(", ") || "none"}; gaps=${confidenceRead.gaps.join(", ") || "none"}`,
    `Mileage signal: ${formatMileage(listing.mileage)} total; about ${formatMileage(milesPerYear)} per year`,
    `Condition/risk texture: risk=${listing.riskLevel}; condition=${listing.vehicleCondition}; title=${listing.sellerTitleStatus}; known flags=${listing.knownIssueFlags.join(", ") || "none"}`,
    `AI analysis: hook=${listing.aiHook || "none"}; take=${listing.aiTake || "none"}; reason=${listing.whyItMadeTheFeed || "none"}`,
    `Seller/listing copy: ${cleanPromptText(listing.listingDescription || listing.sellerDisclosureNotes || "none", 420)}`,
    `Tags/captions/media: tags=${listing.tags.join(", ") || "none"}; captions=${listing.reelCaptions.slice(0, 4).join(" | ") || "none"}; media labels=${mediaLabels.join(", ") || "none"}`,
    `Provider summary: ${summarizeRawProviderSummary(listing.rawProviderSummary)}`
  ].join("\n");
}

function getListingDataDepth(listing: CarListing) {
  let score = 0;

  if (listing.aiTake) score += 1;
  if (listing.whyItMadeTheFeed) score += 1;
  if (listing.listingDescription) score += 1;
  if (listing.sellerDisclosureNotes) score += 1;
  if (listing.rawProviderSummary && Object.keys(listing.rawProviderSummary).length > 0) score += 1;
  if (listing.tags.length > 2) score += 1;
  if (listing.mediaItems.length > 3) score += 1;

  if (score >= 5) return "rich";
  if (score >= 3) return "moderate";
  return "sparse";
}

function summarizeRawProviderSummary(rawProviderSummary: CarListing["rawProviderSummary"]) {
  if (!rawProviderSummary) return "none";

  const summary = { ...rawProviderSummary };
  delete summary.aiVoice;

  return cleanPromptText(JSON.stringify(summary), 700);
}

function cleanPromptText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength) || "none";
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return hash;
}

function extractOutputText(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  const response = data as { output_text?: unknown; output?: unknown };

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) return "";

  return response.output
    .flatMap((item) => {
      if (typeof item !== "object" || item === null || !("content" in item)) return [];
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [];

      return content.map((part) => {
        if (typeof part !== "object" || part === null) return "";
        const candidate = part as { text?: unknown; content?: unknown };
        return typeof candidate.text === "string"
          ? candidate.text
          : typeof candidate.content === "string"
            ? candidate.content
            : "";
      });
    })
    .join("\n")
    .trim();
}

function parseScriptFromModelOutput(rawText: string) {
  const text = rawText.trim();

  if (!text) return "";

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { script?: unknown };
      if (typeof parsed.script === "string") {
        return cleanGeneratedScript(parsed.script);
      }
    } catch {
      const partialScript = text.match(/"script"\s*:\s*"([\s\S]*)/)?.[1] ?? "";
      if (partialScript) {
        return cleanGeneratedScript(partialScript);
      }
    }
  }

  return cleanGeneratedScript(text);
}

function cleanGeneratedScript(value: string) {
  return value
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

function getAudioFormat(value: string | undefined): keyof typeof audioFormatConfig {
  if (value === "mp3" || value === "aac" || value === "opus") {
    return value;
  }

  return "aac";
}
