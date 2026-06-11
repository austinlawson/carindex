"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Volume2, VolumeX } from "lucide-react";
import type { ListingAiVoice } from "@/data/listings";
import {
  aiVoiceMutedPreferenceEvent,
  audioUnlockEvent,
  isAudioSessionUnlocked,
  readAiVoiceMutedPreference,
  setAiVoiceMutedPreference,
  unlockAudioSession
} from "@/lib/audio-session";

export function AiVoiceControl({
  aiVoice,
  isActive,
  isLoading = false,
  shouldPreload = false,
  className = ""
}: {
  aiVoice?: ListingAiVoice;
  isActive: boolean;
  isLoading?: boolean;
  shouldPreload?: boolean;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRetryInProgressRef = useRef(false);
  const [isMuted, setIsMuted] = useState(readAiVoiceMutedPreference);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioSessionUnlocked, setAudioSessionUnlocked] = useState(isAudioSessionUnlocked);
  const [playbackWasBlocked, setPlaybackWasBlocked] = useState(false);

  const stopVoice = useCallback(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    if (typeof window !== "undefined" && utteranceRef.current) {
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
    }

    setIsPlaying(false);
  }, []);

  const playVoice = useCallback(async ({ ignoreMuted = false }: { ignoreMuted?: boolean } = {}) => {
    if (!aiVoice || (!ignoreMuted && isMuted)) return;

    stopVoice();
    setPlaybackWasBlocked(false);

    const audio = audioRef.current;
    if (aiVoice.audioUrl && audio) {
      audio.currentTime = 0;
      setIsPlaying(true);
      await audio.play().catch(() => {
        setIsPlaying(false);
        setPlaybackWasBlocked(true);
      });
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlaybackWasBlocked(true);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(aiVoice.script);
    utterance.rate = 0.98;
    utterance.pitch = 1;
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => {
      setIsPlaying(false);
      setPlaybackWasBlocked(true);
    };
    utteranceRef.current = utterance;
    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  }, [aiVoice, isMuted, stopVoice]);

  useEffect(() => {
    const handlePreferenceChange = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      setIsMuted(Boolean(customEvent.detail));
    };

    window.addEventListener(aiVoiceMutedPreferenceEvent, handlePreferenceChange);

    return () => window.removeEventListener(aiVoiceMutedPreferenceEvent, handlePreferenceChange);
  }, []);

  useEffect(() => {
    const handleAudioUnlock = () => setAudioSessionUnlocked(true);

    window.addEventListener(audioUnlockEvent, handleAudioUnlock);

    return () => window.removeEventListener(audioUnlockEvent, handleAudioUnlock);
  }, []);

  useEffect(() => {
    if (!isActive || !aiVoice || isMuted) {
      stopVoice();
      return;
    }

    const timeout = window.setTimeout(() => {
      void playVoice();
    }, audioSessionUnlocked ? 80 : 450);

    return () => {
      window.clearTimeout(timeout);
      stopVoice();
    };
  }, [aiVoice, audioSessionUnlocked, isActive, isMuted, playVoice, stopVoice]);

  useEffect(() => {
    if (!isActive || !aiVoice || isMuted || isPlaying || !playbackWasBlocked) {
      return;
    }

    const retryAudiblePlayback = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("[data-audio-control]")) {
        return;
      }

      if (audioRetryInProgressRef.current) {
        return;
      }

      audioRetryInProgressRef.current = true;
      void playVoice({ ignoreMuted: true }).finally(() => {
        audioRetryInProgressRef.current = false;
      });
    };

    window.addEventListener("pointerdown", retryAudiblePlayback, { capture: true });
    window.addEventListener("click", retryAudiblePlayback, { capture: true });
    window.addEventListener("keydown", retryAudiblePlayback, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", retryAudiblePlayback, { capture: true });
      window.removeEventListener("click", retryAudiblePlayback, { capture: true });
      window.removeEventListener("keydown", retryAudiblePlayback, { capture: true });
    };
  }, [aiVoice, isActive, isMuted, isPlaying, playVoice, playbackWasBlocked]);

  useEffect(() => {
    if (!isActive || !aiVoice || isMuted || isPlaying) {
      return;
    }

    const playOnUnlock = () => {
      if (audioRetryInProgressRef.current) {
        return;
      }

      audioRetryInProgressRef.current = true;
      void playVoice({ ignoreMuted: true }).finally(() => {
        audioRetryInProgressRef.current = false;
      });
    };

    window.addEventListener(audioUnlockEvent, playOnUnlock);

    return () => window.removeEventListener(audioUnlockEvent, playOnUnlock);
  }, [aiVoice, isActive, isMuted, isPlaying, playVoice]);

  useEffect(() => {
    if (isMuted) {
      stopVoice();
    }
  }, [isMuted, stopVoice]);

  useEffect(() => {
    if (!aiVoice?.audioUrl || !shouldPreload) return;

    audioRef.current?.load();
  }, [aiVoice?.audioUrl, shouldPreload]);

  if (!aiVoice && !isLoading) {
    return null;
  }

  const togglePlayback = () => {
    if (isMuted) {
      setAiVoiceMutedPreference(false);
      setIsMuted(false);
      setPlaybackWasBlocked(false);
      unlockAudioSession();
      audioRetryInProgressRef.current = true;
      void playVoice({ ignoreMuted: true }).finally(() => {
        audioRetryInProgressRef.current = false;
      });
      return;
    }

    if (playbackWasBlocked) {
      setPlaybackWasBlocked(false);
      unlockAudioSession();
      audioRetryInProgressRef.current = true;
      void playVoice({ ignoreMuted: true }).finally(() => {
        audioRetryInProgressRef.current = false;
      });
      return;
    }

    if (isPlaying) {
      setAiVoiceMutedPreference(true);
      setIsMuted(true);
      stopVoice();
      return;
    }

    void playVoice();
  };

  const soundNeedsGesture = !isMuted && isActive && Boolean(aiVoice) && !isPlaying && playbackWasBlocked;

  return (
    <div className={className}>
      {aiVoice?.audioUrl ? (
        <audio
          ref={audioRef}
          src={aiVoice.audioUrl}
          preload={shouldPreload ? "auto" : "metadata"}
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => {
            setIsPlaying(true);
            setPlaybackWasBlocked(false);
          }}
        />
      ) : null}
      <button
        type="button"
        data-audio-control="ai"
        className={`grid h-11 w-11 place-items-center rounded-full border border-white/14 bg-black/46 text-white shadow-[0_14px_34px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition hover:bg-white/16 active:scale-95 ${
          soundNeedsGesture ? "ring-2 ring-cyan-200/50" : ""
        }`}
        onClick={togglePlayback}
        aria-pressed={!isMuted}
        aria-label={isMuted ? "Turn AI audio on" : soundNeedsGesture ? "Start AI audio" : isPlaying ? "Mute AI audio" : "Play AI audio"}
        title={isMuted ? "Turn AI audio on" : soundNeedsGesture ? "Tap to start AI audio" : isPlaying ? "Mute AI audio" : "Play AI audio"}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isMuted ? (
          <VolumeX className="h-5 w-5" />
        ) : (
          <Volume2 className="h-5 w-5" />
        )}
      </button>
    </div>
  );
}
