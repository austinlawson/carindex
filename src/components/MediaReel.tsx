"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import type { ListingMediaItem } from "@/data/listings";
import {
  audioUnlockEvent,
  isAudioSessionUnlocked,
  readVideoMutedPreference,
  setVideoMutedPreference,
  unlockAudioSession,
  videoMutedPreferenceEvent
} from "@/lib/audio-session";
import type { MediaPreloadMode } from "@/lib/feed-ranking";

const frameMs = 2600;

export function MediaReel({
  mediaItems,
  imageUrls,
  captions,
  isActive,
  preloadMode = "metadata",
  chromeHidden = false,
  onOpenGallery,
  layout = "market"
}: {
  mediaItems?: ListingMediaItem[];
  imageUrls: string[];
  captions: string[];
  isActive: boolean;
  preloadMode?: MediaPreloadMode;
  chromeHidden?: boolean;
  onOpenGallery?: (initialIndex: number) => void;
  layout?: "market" | "seller";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsHideTimeoutRef = useRef<number | null>(null);
  const isScrubbingRef = useRef(false);
  const videoRetryInProgressRef = useRef(false);
  const frames = useMemo<ListingMediaItem[]>(() => {
    const explicit = mediaItems?.filter((item) => item.url);
    if (explicit?.length) {
      return explicit;
    }

    return imageUrls.filter(Boolean).map((url, index) => ({
      url,
      type: "image",
      label: `Photo ${index + 1}`
    }));
  }, [imageUrls, mediaItems]);
  const hasMedia = frames.length > 0;
  const [activeIndex, setActiveIndex] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoIsLoading, setVideoIsLoading] = useState(false);
  const [videoControlsVisible, setVideoControlsVisible] = useState(false);
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isMuted, setIsMuted] = useState(readVideoMutedPreference);
  const [audioSessionUnlocked, setAudioSessionUnlocked] = useState(isAudioSessionUnlocked);
  const [videoPlaybackWasBlocked, setVideoPlaybackWasBlocked] = useState(false);
  const safeActiveIndex = activeIndex % Math.max(frames.length, 1);
  const activeMedia = hasMedia ? frames[safeActiveIndex] : undefined;
  const activeMediaIsVideo = activeMedia?.type === "video";
  const shouldAttachVideoSource = isActive || preloadMode !== "none";
  const effectiveVideoPreload: MediaPreloadMode =
    isActive || preloadMode === "auto" ? "auto" : preloadMode;
  const nextImageUrl =
    hasMedia && frames[(safeActiveIndex + 1) % frames.length]?.type === "image"
      ? frames[(safeActiveIndex + 1) % frames.length]?.url
      : undefined;
  const hasGallery = frames.some((item) => item.type === "image");
  const activeImageIndex = Math.max(
    0,
    frames.slice(0, safeActiveIndex + 1).filter((item) => item.type === "image").length - 1
  );

  useEffect(() => {
    if (isActive) {
      setActiveIndex(0);
    }
  }, [isActive]);

  useEffect(() => {
    if (activeIndex >= frames.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, frames.length]);

  useEffect(() => {
    setVideoProgress(0);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setVideoIsLoading(Boolean(isActive && activeMediaIsVideo));
    setVideoControlsVisible(false);
    setIsVideoPaused(false);
    setIsScrubbing(false);
    setVideoPlaybackWasBlocked(false);
    isScrubbingRef.current = false;
    videoRetryInProgressRef.current = false;
  }, [activeMedia?.url, activeMediaIsVideo, isActive]);

  useEffect(() => {
    if (!isActive) {
      setIsVideoPaused(false);
      setIsScrubbing(false);
      setVideoControlsVisible(false);
      setVideoPlaybackWasBlocked(false);
      isScrubbingRef.current = false;
      videoRetryInProgressRef.current = false;
    }
  }, [isActive]);

  useEffect(() => {
    return () => {
      if (controlsHideTimeoutRef.current !== null) {
        window.clearTimeout(controlsHideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handlePreferenceChange = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      setIsMuted(Boolean(customEvent.detail));
    };

    window.addEventListener(videoMutedPreferenceEvent, handlePreferenceChange);

    return () => window.removeEventListener(videoMutedPreferenceEvent, handlePreferenceChange);
  }, []);

  useEffect(() => {
    const handleAudioUnlock = () => setAudioSessionUnlocked(true);

    window.addEventListener(audioUnlockEvent, handleAudioUnlock);

    return () => window.removeEventListener(audioUnlockEvent, handleAudioUnlock);
  }, []);

  useEffect(() => {
    if (!isActive || frames.length <= 1 || activeMediaIsVideo) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % frames.length);
    }, frameMs);

    return () => window.clearInterval(interval);
  }, [activeMediaIsVideo, frames.length, isActive]);

  const playActiveVideo = useCallback(
    async ({ allowMutedFallback = true }: { allowMutedFallback?: boolean } = {}) => {
      const video = videoRef.current;
      if (!video || !isActive || !activeMediaIsVideo || isVideoPaused) return;

      video.muted = isMuted;
      setVideoIsLoading(video.readyState < 3);

      try {
        await video.play();
        setVideoIsLoading(false);
        setVideoPlaybackWasBlocked(false);
      } catch {
        if (!isMuted) {
          setVideoPlaybackWasBlocked(true);
        }

        if (!isMuted && allowMutedFallback) {
          video.muted = true;
          void video.play().then(() => setVideoIsLoading(false)).catch(() => undefined);
          return;
        }

        if (!isMuted) {
          video.muted = true;
        }
      }
    },
    [activeMediaIsVideo, isActive, isMuted, isVideoPaused]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!isActive || !activeMediaIsVideo) {
      video.pause();
      return;
    }

    if (isVideoPaused) {
      video.pause();
      setVideoIsLoading(false);
      return;
    }

    void playActiveVideo();
  }, [
    activeMedia?.url,
    activeMediaIsVideo,
    audioSessionUnlocked,
    isActive,
    isVideoPaused,
    playActiveVideo
  ]);

  useEffect(() => {
    if (!audioSessionUnlocked || isMuted || !isActive || !activeMediaIsVideo || isVideoPaused) {
      return;
    }

    void playActiveVideo();
  }, [
    activeMedia?.url,
    activeMediaIsVideo,
    audioSessionUnlocked,
    isActive,
    isMuted,
    isVideoPaused,
    playActiveVideo
  ]);

  useEffect(() => {
    if (!videoPlaybackWasBlocked || isMuted || !isActive || !activeMediaIsVideo || isVideoPaused) {
      return;
    }

    const retryAudiblePlayback = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("[data-audio-control]")) {
        return;
      }

      if (videoRetryInProgressRef.current) {
        return;
      }

      videoRetryInProgressRef.current = true;
      void playActiveVideo().finally(() => {
        videoRetryInProgressRef.current = false;
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
  }, [
    activeMediaIsVideo,
    isActive,
    isMuted,
    isVideoPaused,
    playActiveVideo,
    videoPlaybackWasBlocked
  ]);

  useEffect(() => {
    if (isMuted || !isActive || !activeMediaIsVideo || isVideoPaused) {
      return;
    }

    const playOnUnlock = () => {
      if (videoRetryInProgressRef.current) {
        return;
      }

      videoRetryInProgressRef.current = true;
      void playActiveVideo().finally(() => {
        videoRetryInProgressRef.current = false;
      });
    };

    window.addEventListener(audioUnlockEvent, playOnUnlock);

    return () => window.removeEventListener(audioUnlockEvent, playOnUnlock);
  }, [activeMediaIsVideo, isActive, isMuted, isVideoPaused, playActiveVideo]);

  const revealVideoControls = (hold = false) => {
    if (!activeMediaIsVideo) return;

    setVideoControlsVisible(true);

    if (controlsHideTimeoutRef.current !== null) {
      window.clearTimeout(controlsHideTimeoutRef.current);
    }

    if (!hold && !isVideoPaused && !isScrubbing) {
      controlsHideTimeoutRef.current = window.setTimeout(() => {
        setVideoControlsVisible(false);
      }, 1800);
    }
  };

  const toggleVideoPaused = () => {
    if (!activeMediaIsVideo || !isActive) return;

    if (!isMuted && videoPlaybackWasBlocked) {
      unlockAudioSession();
      videoRetryInProgressRef.current = true;
      void playActiveVideo().finally(() => {
        videoRetryInProgressRef.current = false;
      });
      return;
    }

    setIsVideoPaused((current) => {
      const nextPaused = !current;

      setVideoControlsVisible(true);
      if (controlsHideTimeoutRef.current !== null) {
        window.clearTimeout(controlsHideTimeoutRef.current);
      }

      if (!nextPaused) {
        controlsHideTimeoutRef.current = window.setTimeout(() => {
          setVideoControlsVisible(false);
        }, 1800);
      }

      return nextPaused;
    });
  };

  const seekVideoTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(seconds)) return;

    const duration = Number.isFinite(video.duration) ? video.duration : videoDuration;
    const nextTime = Math.max(0, Math.min(seconds, duration || 0));
    video.currentTime = nextTime;
    setVideoCurrentTime(nextTime);
    setVideoProgress(duration > 0 ? (nextTime / duration) * 100 : 0);
  };

  const seekVideoBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    seekVideoTo(video.currentTime + seconds);
    revealVideoControls();
  };

  const seekVideoFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeMediaIsVideo || videoDuration <= 0) return;

    event.preventDefault();
    event.stopPropagation();

    const bounds = event.currentTarget.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    seekVideoTo(progress * videoDuration);
  };

  const finishScrubbing = () => {
    isScrubbingRef.current = false;
    setIsScrubbing(false);
    setVideoControlsVisible(true);

    if (controlsHideTimeoutRef.current !== null) {
      window.clearTimeout(controlsHideTimeoutRef.current);
    }

    if (!isVideoPaused) {
      controlsHideTimeoutRef.current = window.setTimeout(() => {
        setVideoControlsVisible(false);
      }, 1800);
    }
  };

  const handleVideoKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleVideoPaused();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekVideoBy(-5);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      seekVideoBy(5);
    }
  };

  const toggleMuted = () => {
    if (!isMuted && videoPlaybackWasBlocked) {
      unlockAudioSession();
      videoRetryInProgressRef.current = true;
      void playActiveVideo().finally(() => {
        videoRetryInProgressRef.current = false;
      });
      return;
    }

    const nextMuted = !isMuted;
    setVideoMutedPreference(nextMuted);
    setIsMuted(nextMuted);
    setVideoPlaybackWasBlocked(false);

    const video = videoRef.current;
    if (!video) return;

    video.muted = nextMuted;

    if (!nextMuted && isActive) {
      unlockAudioSession();
      void playActiveVideo();
    }
  };

  const activeCaption = captions[safeActiveIndex % Math.max(captions.length, 1)] ?? captions[0];
  const showVideoTime = activeMediaIsVideo && (isVideoPaused || videoControlsVisible || isScrubbing);
  const videoSoundNeedsGesture = videoPlaybackWasBlocked && !isMuted;

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#090b10] ${
        layout === "seller" ? "seller-media-reel" : "market-media-reel"
      }`}
    >
      <div
        className={`feed-media-progress ${
          chromeHidden ? "feed-media-progress-focus" : ""
        } absolute left-3 right-3 top-[calc(env(safe-area-inset-top)+78px)] z-20 flex items-center gap-2`}
      >
        <div className="flex min-w-0 flex-1 gap-px">
          {(hasMedia ? frames : [{ url: "placeholder", type: "image" as const }]).map((frame, index) => {
            const isCurrentFrame = index === safeActiveIndex;
            const canScrubFrame = activeMediaIsVideo && isCurrentFrame && videoDuration > 0;
            const widthClass =
              index < safeActiveIndex
                ? "w-full"
                : isCurrentFrame && frame.type !== "video"
                  ? "w-full origin-left"
                  : "w-0";

            return (
              <div
                key={`${frame.url}-${index}`}
                className={`relative h-5 flex-1 ${canScrubFrame ? "pointer-events-auto cursor-ew-resize touch-none" : ""}`}
                onPointerDown={
                  canScrubFrame
                    ? (event) => {
                        isScrubbingRef.current = true;
                        setIsScrubbing(true);
                        event.currentTarget.setPointerCapture(event.pointerId);
                        seekVideoFromPointer(event);
                        revealVideoControls(true);
                      }
                    : undefined
                }
                onPointerMove={
                  canScrubFrame
                    ? (event) => {
                        if (isScrubbingRef.current) {
                          seekVideoFromPointer(event);
                        }
                      }
                    : undefined
                }
                onPointerUp={canScrubFrame ? finishScrubbing : undefined}
                onPointerCancel={canScrubFrame ? finishScrubbing : undefined}
              >
                <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/20">
                  <div
                    className={`h-full rounded-full bg-white transition-[width] duration-100 ${
                      isActive && isCurrentFrame && frame.type === "image" ? "animate-story-progress" : ""
                    } ${widthClass}`}
                    style={
                      isCurrentFrame && frame.type === "video"
                        ? { width: `${Math.max(0, Math.min(100, videoProgress))}%` }
                        : undefined
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
        {hasMedia ? (
          <span className="rounded-full bg-black/36 px-2 py-0.5 text-[10px] font-black text-white/76 backdrop-blur-xl">
            {showVideoTime
              ? `${formatVideoTime(videoCurrentTime)} / ${formatVideoTime(videoDuration)}`
              : `${safeActiveIndex + 1}/${frames.length}`}
          </span>
        ) : null}
      </div>

      {activeMediaIsVideo ? (
        <div key={activeMedia.url} className="absolute inset-0 animate-fade-in">
          <video
            ref={videoRef}
            src={shouldAttachVideoSource ? activeMedia.url : undefined}
            className={`absolute inset-0 h-full w-full object-cover saturate-[1.08] ${
              chromeHidden ? "brightness-100" : "brightness-[0.74]"
            }`}
            muted={isMuted}
            playsInline
            preload={effectiveVideoPreload}
            onLoadStart={() => {
              if (isActive) {
                setVideoIsLoading(true);
              }
            }}
            onLoadedData={() => setVideoIsLoading(false)}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              const duration = Number.isFinite(video.duration) ? video.duration : 0;
              setVideoDuration(duration);
              setVideoCurrentTime(video.currentTime);
              setVideoProgress(duration > 0 ? (video.currentTime / duration) * 100 : 0);
            }}
            onCanPlay={() => setVideoIsLoading(false)}
            onPlaying={(event) => {
              setVideoIsLoading(false);
              if (isMuted || !event.currentTarget.muted) {
                setVideoPlaybackWasBlocked(false);
              }
            }}
            onWaiting={() => {
              if (isActive) {
                setVideoIsLoading(true);
              }
            }}
            onStalled={() => {
              if (isActive) {
                setVideoIsLoading(true);
              }
            }}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              const duration = Number.isFinite(video.duration) ? video.duration : 0;
              setVideoDuration(duration);
              setVideoCurrentTime(video.currentTime);
              setVideoProgress(duration > 0 ? (video.currentTime / duration) * 100 : 0);
            }}
            onEnded={() => {
              setVideoProgress(100);
              setVideoCurrentTime(videoDuration);
              setIsVideoPaused(false);
              setVideoControlsVisible(false);
              if (frames.length > 1) {
                setActiveIndex((current) => (current + 1) % frames.length);
                return;
              }

              const video = videoRef.current;
              if (video) {
                video.currentTime = 0;
                setVideoProgress(0);
                setVideoCurrentTime(0);
                void video.play().catch(() => undefined);
              }
            }}
          />
          <button
            type="button"
            className="pointer-events-auto absolute inset-0 z-10 cursor-default"
            onClick={toggleVideoPaused}
            onKeyDown={handleVideoKeyDown}
            onMouseEnter={() => revealVideoControls()}
            onMouseMove={() => revealVideoControls()}
            onFocus={() => revealVideoControls(true)}
            onBlur={() => {
              if (!isVideoPaused && !isScrubbing) {
                setVideoControlsVisible(false);
              }
            }}
            aria-label={isVideoPaused ? "Play video" : "Pause video"}
          />
          {!chromeHidden ? <div className="absolute inset-0 bg-black/14" /> : null}
          {isActive && videoIsLoading ? <VideoLoadingOverlay /> : null}
          {isVideoPaused ? (
            <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
              <span className="grid h-16 w-16 place-items-center rounded-full border border-white/16 bg-black/42 text-white shadow-[0_18px_58px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
                <Play className="ml-1 h-7 w-7 fill-white" />
              </span>
            </div>
          ) : null}
          <button
            type="button"
            data-audio-control="video"
            className={`pointer-events-auto absolute right-4 z-30 grid place-items-center rounded-full border border-white/14 bg-black/46 text-white shadow-[0_14px_34px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition hover:bg-white/16 active:scale-95 ${
              chromeHidden
                ? "top-[calc(env(safe-area-inset-top)+44px)] h-9 w-9"
                : "top-[calc(env(safe-area-inset-top)+112px)] h-11 w-11"
            } ${videoSoundNeedsGesture ? "ring-2 ring-cyan-200/50" : ""}`}
            onClick={toggleMuted}
            aria-label={isMuted ? "Turn video sound on" : videoSoundNeedsGesture ? "Start video sound" : "Mute video"}
            title={isMuted ? "Turn sound on" : videoSoundNeedsGesture ? "Tap to start sound" : "Mute"}
          >
            {isMuted ? (
              <VolumeX className={chromeHidden ? "h-4 w-4" : "h-5 w-5"} />
            ) : (
              <Volume2 className={chromeHidden ? "h-4 w-4" : "h-5 w-5"} />
            )}
          </button>
          {!chromeHidden ? <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+88px)] z-10 flex justify-center px-6">
            <span className="feed-video-pill rounded-full border border-white/12 bg-black/36 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/72 backdrop-blur-xl">
              Seller video
            </span>
          </div> : null}
        </div>
      ) : activeMedia?.type === "image" ? (
        <div key={activeMedia.url} className="absolute inset-0 animate-fade-in">
          <img
            src={activeMedia.url}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover saturate-[1.12] ${
              chromeHidden ? "opacity-0" : "brightness-[0.72] blur-2xl"
            } ${
              isActive ? "animate-reel-pan" : ""
            }`}
          />
          {!chromeHidden ? <div className="absolute inset-0 bg-black/28" /> : null}
          <div
            className={`feed-media-stage absolute overflow-visible ${
              layout === "seller" || chromeHidden
                ? "inset-0"
                : "inset-x-0 top-[calc(env(safe-area-inset-top)+92px)] h-[46%] min-h-[292px] max-h-[430px]"
            }`}
          >
            {layout === "seller" || chromeHidden ? null : (
              <div className="absolute inset-x-4 bottom-6 top-4 rounded-[32px] bg-gradient-to-b from-white/8 via-white/[0.025] to-black/10 blur-sm" />
            )}
            <div
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${
                layout === "seller" || chromeHidden ? "h-full w-full" : "h-[92%] w-[94%]"
              }`}
            >
              <img
                src={activeMedia.url}
                alt=""
                className={`h-full w-full ${
                  layout === "seller"
                    ? `object-cover ${chromeHidden ? "brightness-100" : "brightness-[0.86]"}`
                    : "object-contain"
                } ${chromeHidden ? "" : "drop-shadow-[0_28px_48px_rgba(0,0,0,0.74)]"} ${
                  isActive ? "animate-hero-float" : ""
                }`}
              />
            </div>
          </div>
          {nextImageUrl ? <img src={nextImageUrl} alt="" className="hidden" /> : null}
        </div>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(74,90,112,0.58),transparent_38%),linear-gradient(180deg,#151922_0%,#050608_100%)]">
          <div className="absolute left-1/2 top-[38%] h-24 w-44 -translate-x-1/2 rounded-[28px] border border-white/12 bg-white/[0.055] shadow-[0_24px_80px_rgba(0,0,0,0.5)]" />
        </div>
      )}

      {!chromeHidden ? (
        <>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.54)_0%,rgba(0,0,0,0.08)_24%,rgba(0,0,0,0.04)_58%,rgba(0,0,0,0.62)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-[36%] bg-[linear-gradient(180deg,transparent_0%,rgba(5,7,10,0.18)_22%,rgba(0,0,0,0.76)_72%,rgba(0,0,0,0.95)_100%)]" />
          <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-black/46 to-transparent" />
        </>
      ) : null}

      {!chromeHidden && hasGallery && activeMedia?.type === "image" && onOpenGallery ? (
        <button
          type="button"
          className={`feed-gallery-target pointer-events-auto absolute z-10 cursor-zoom-in ${
            layout === "seller"
              ? "inset-0"
              : "inset-x-0 top-[calc(env(safe-area-inset-top)+92px)] h-[46%] min-h-[292px] max-h-[430px]"
          }`}
          aria-label="Open photo gallery"
          onClick={() => onOpenGallery(activeImageIndex)}
        />
      ) : null}

      {!chromeHidden && activeCaption ? (
        <div className="feed-ai-caption absolute left-4 right-[100px] top-[calc(env(safe-area-inset-top)+102px)] z-20">
          <p className="max-w-[220px] rounded-2xl border border-white/8 bg-black/22 px-2.5 py-1.5 text-[11px] font-black leading-snug text-white/58 shadow-[0_10px_26px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <span className="mr-1 text-cyan-100/70">AI</span>
            <span>{activeCaption}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function formatVideoTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const roundedSeconds = Math.floor(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainder = roundedSeconds % 60;

  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function VideoLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/16 px-8 backdrop-blur-[1px]">
      <div className="w-full max-w-[220px] rounded-[26px] border border-white/12 bg-black/56 p-4 text-center shadow-[0_22px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
        <div className="mx-auto flex h-10 w-16 items-end justify-center gap-1.5">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="block w-2 rounded-full bg-cyan-100/80 animate-pulse"
              style={{
                height: `${18 + index * 7}px`,
                animationDelay: `${index * 120}ms`
              }}
            />
          ))}
        </div>
        <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-white/80">
          Loading walkaround
        </p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/12">
          <div className="h-full w-1/2 animate-story-progress rounded-full bg-white" />
        </div>
      </div>
    </div>
  );
}
