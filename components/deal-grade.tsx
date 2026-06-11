import type { DealGrade } from "@/data/listings";

const gradeStyles: Record<DealGrade, string> = {
  A: "border-emerald-300/85 bg-emerald-300/90 text-black shadow-emerald-300/25",
  "A-": "border-lime-300/85 bg-lime-300/90 text-black shadow-lime-300/25",
  "B+": "border-cyan-300/85 bg-cyan-300/90 text-black shadow-cyan-300/22",
  B: "border-sky-300/85 bg-sky-300/90 text-black shadow-sky-300/22",
  C: "border-amber-300/85 bg-amber-300/90 text-black shadow-amber-300/22",
  Pass: "border-rose-400/85 bg-rose-400/90 text-white shadow-rose-300/18"
};

export function DealGradeBadge({
  grade,
  compact = false,
  label = false,
  labelText = "read"
}: {
  grade: DealGrade;
  compact?: boolean;
  label?: boolean;
  labelText?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border font-black leading-none shadow-[0_0_14px] ${gradeStyles[grade]} ${
        compact ? "h-8 min-w-8 px-2 text-xs" : label ? "h-10 gap-1.5 px-2.5 text-base" : "h-10 min-w-10 px-2.5 text-base"
      }`}
    >
      <span>{grade}</span>
      {label ? <span className="text-[9px] font-black uppercase tracking-[0.12em]">{labelText}</span> : null}
    </span>
  );
}
