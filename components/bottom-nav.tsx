"use client";

import { Bookmark, CirclePlus, CircleUserRound, Home, Search } from "lucide-react";

export type TabId =
  | "feed"
  | "search"
  | "add"
  | "saved"
  | "profile"
  | "listings"
  | "inbox"
  | "seller-info";

const tabs = [
  { id: "feed", label: "Feed", icon: Home },
  { id: "search", label: "Search", icon: Search },
  { id: "add", label: "Add listing", icon: CirclePlus },
  { id: "saved", label: "Saved", icon: Bookmark },
  { id: "profile", label: "Profile", icon: CircleUserRound }
] satisfies Array<{
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}>;

export function BottomNav({
  activeTab,
  onTabChange
}: {
  activeTab: TabId;
  attentionCount?: number;
  onTabChange: (tab: TabId) => void;
}) {
  return (
    <nav className="pointer-events-auto absolute inset-x-0 bottom-0 z-[70] border-t border-white/8 bg-black/62 px-2.5 pb-[calc(env(safe-area-inset-bottom)+6px)] pt-1.5 backdrop-blur-2xl">
      <div className="grid grid-cols-5 items-center gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isProfileSection =
            tab.id === "profile" &&
            (activeTab === "listings" || activeTab === "inbox" || activeTab === "seller-info");
          const isActive = activeTab === tab.id || isProfileSection;
          const isAdd = tab.id === "add";

          return (
            <button
              key={tab.id}
              type="button"
              className={`group relative flex min-h-11 min-w-0 items-center justify-center rounded-2xl transition active:scale-95 ${
                isActive
                  ? "border border-white/12 bg-white/[0.085] text-white shadow-[0_10px_26px_rgba(0,0,0,0.24)]"
                  : "text-white/42 hover:bg-white/[0.055] hover:text-white/74"
              }`}
              onClick={() => onTabChange(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={`${isAdd ? "h-[25px] w-[25px]" : "h-[21px] w-[21px]"} ${
                  isAdd && !isActive ? "text-cyan-100/82" : ""
                }`}
                strokeWidth={isActive ? 2.7 : isAdd ? 2.45 : 2.25}
              />
              <span className="sr-only">{tab.label}</span>
              <span
                className={`absolute bottom-1.5 h-1 rounded-full transition-all ${
                  isActive ? "w-4 bg-cyan-200/90" : "w-1 bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
