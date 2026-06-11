import type { ListingAiVoice } from "@/data/listings";

export const currentAiVoicePromptVersion = "engagement-v5";

export function isCurrentAiVoice(aiVoice: ListingAiVoice | undefined) {
  return aiVoice?.promptVersion === currentAiVoicePromptVersion;
}
