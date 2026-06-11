"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readVideoElementReadiness,
  type FeedVideoPreloadTarget,
  type FeedVideoReadiness
} from "@/lib/feed-video-readiness";

export function FeedVideoPreloader({
  targets,
  onReadinessChange
}: {
  targets: FeedVideoPreloadTarget[];
  onReadinessChange: (url: string, state: FeedVideoReadiness) => void;
}) {
  if (targets.length === 0) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0"
    >
      {targets.map((target) => (
        <PreloadedVideo
          key={target.url}
          target={target}
          onReadinessChange={onReadinessChange}
        />
      ))}
    </div>
  );
}

function PreloadedVideo({
  target,
  onReadinessChange
}: {
  target: FeedVideoPreloadTarget;
  onReadinessChange: (url: string, state: FeedVideoReadiness) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [canPlayThrough, setCanPlayThrough] = useState(false);
  const [hasError, setHasError] = useState(false);

  const reportReadiness = useCallback(
    (nextCanPlayThrough = canPlayThrough, nextHasError = hasError) => {
      const video = videoRef.current;
      if (!video) return;

      onReadinessChange(
        target.url,
        readVideoElementReadiness(video, target, nextCanPlayThrough, nextHasError)
      );
    },
    [canPlayThrough, hasError, onReadinessChange, target]
  );

  useEffect(() => {
    setCanPlayThrough(false);
    setHasError(false);
  }, [target.url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.load();
    reportReadiness(false, false);

    const interval = window.setInterval(() => {
      reportReadiness();
    }, 1200);

    return () => window.clearInterval(interval);
  }, [reportReadiness, target.url]);

  return (
    <video
      ref={videoRef}
      src={target.url}
      muted
      playsInline
      preload="auto"
      tabIndex={-1}
      onLoadedMetadata={() => reportReadiness(false, false)}
      onLoadedData={() => reportReadiness(false, false)}
      onProgress={() => reportReadiness()}
      onCanPlay={() => reportReadiness()}
      onCanPlayThrough={() => {
        setCanPlayThrough(true);
        reportReadiness(true, false);
      }}
      onError={() => {
        setHasError(true);
        reportReadiness(canPlayThrough, true);
      }}
    />
  );
}
