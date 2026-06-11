"use client";

export const audioUnlockEvent = "carindex-audio-unlock";

let audioSessionUnlocked = false;
let audioContext: AudioContext | undefined;
let silentAudioUrl: string | undefined;

export function isAudioSessionUnlocked() {
  return audioSessionUnlocked;
}

export function unlockAudioSession() {
  if (typeof window === "undefined") {
    return;
  }

  void primeAudioOutput();

  if (audioSessionUnlocked) {
    return;
  }

  audioSessionUnlocked = true;
  window.dispatchEvent(new CustomEvent(audioUnlockEvent));
}

async function primeAudioOutput() {
  try {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (AudioContextConstructor) {
      audioContext ??= new AudioContextConstructor();

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.03);
    }

    const audio = new Audio(getSilentAudioUrl());
    audio.preload = "auto";
    audio.volume = 0.01;
    await audio.play();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  } catch {
    // Browsers may reject priming despite a gesture; media controls still retry normally.
  }
}

function getSilentAudioUrl() {
  if (silentAudioUrl) {
    return silentAudioUrl;
  }

  const sampleRate = 8000;
  const sampleCount = 320;
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset, value.charCodeAt(index));
      offset += 1;
    }
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * bytesPerSample, true);
  offset += 4;
  view.setUint16(offset, bytesPerSample, true);
  offset += 2;
  view.setUint16(offset, 8 * bytesPerSample, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true);

  silentAudioUrl = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
  return silentAudioUrl;
}

export const videoMutedPreferenceKey = "carindex.videoMuted.v4";
export const videoMutedPreferenceEvent = "carindex-video-muted-change";

export const aiVoiceMutedPreferenceKey = "carindex.aiVoiceMuted.v5";
export const aiVoiceMutedPreferenceEvent = "carindex-ai-voice-muted-change";

export function readVideoMutedPreference() {
  return readMutedPreference(videoMutedPreferenceKey);
}

export function setVideoMutedPreference(isMuted: boolean) {
  setMutedPreference(videoMutedPreferenceKey, videoMutedPreferenceEvent, isMuted);
}

export function readAiVoiceMutedPreference() {
  return readMutedPreference(aiVoiceMutedPreferenceKey);
}

export function setAiVoiceMutedPreference(isMuted: boolean) {
  setMutedPreference(aiVoiceMutedPreferenceKey, aiVoiceMutedPreferenceEvent, isMuted);
}

function readMutedPreference(key: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(key) === "true";
}

function setMutedPreference(key: string, eventName: string, isMuted: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, String(isMuted));
  window.dispatchEvent(new CustomEvent(eventName, { detail: isMuted }));
}
