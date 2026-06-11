"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

export function FeedChromeToggle({
  hidden,
  onChange,
  className = ""
}: {
  hidden: boolean;
  onChange: (hidden: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`grid h-9 w-9 place-items-center rounded-full border border-white/14 bg-black/42 text-white/84 shadow-[0_14px_34px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition hover:bg-white/16 hover:text-white active:scale-95 ${className}`}
      onClick={() => onChange(!hidden)}
      aria-pressed={hidden}
      aria-label={hidden ? "Show listing details" : "Hide listing details"}
      title={hidden ? "Show details" : "Hide details"}
    >
      {hidden ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
    </button>
  );
}
