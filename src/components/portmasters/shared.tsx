"use client";

import {
  Anchor,
  Crown,
  Trophy,
  Gem,
  Shield,
  Medal,
  Waves,
  CloudLightning,
  Eye,
  type LucideIcon,
} from "lucide-react";
import type { MeritId } from "@/lib/game/merits";
import { ICONS } from "@/lib/game/constants";
import { cn } from "@/lib/utils";

// A circular gradient avatar keyed off the user's avatarHue.
export function Avatar({
  hue,
  name,
  size = 36,
  className,
  ring,
}: {
  hue: number;
  name: string;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const c1 = `oklch(0.68 0.14 ${hue}deg)`;
  const c2 = `oklch(0.78 0.13 ${(hue + 40) % 360}deg)`;
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none",
        ring && "ring-2 ring-white/70 dark:ring-white/15",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})`,
        boxShadow: `0 4px 12px -4px ${c1}`,
      }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

export function OnlineDot({
  online,
  size = 10,
  className,
}: {
  online: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full",
        online ? "bg-emerald-400" : "bg-zinc-400/60",
        className,
      )}
      style={{
        width: size,
        height: size,
        boxShadow: online ? "0 0 8px 1px oklch(0.75 0.18 150 / 0.7)" : "none",
      }}
      aria-hidden
    />
  );
}

// A subtle pill badge.
export function Pill({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "gold" | "sea" | "emerald" | "rose" | "amber";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "bg-black/5 dark:bg-white/10 text-foreground/70",
    gold: "bg-amber-400/15 text-amber-700 dark:text-amber-300",
    sea: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    rose: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    amber: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// Which lucide-react icon represents each Captain's Merit (see
// src/lib/game/merits.ts, which deliberately carries no icon of its own
// since it's shared with the server). Kept here rather than duplicated at
// each call site, since a trophy case, an Endgame banner, and a toast all
// need the same mapping.
const MERIT_ICONS: Record<MeritId, LucideIcon> = {
  first_voyage: Anchor,
  first_crown: Crown,
  king_of_silk_road: Trophy,
  renown_legend: Gem,
  iron_hull: Shield,
  century_club: Medal,
  open_water_captain: Waves,
  storm_sovereign: CloudLightning,
  eye_of_the_storm: Eye,
};

export function MeritIcon({
  id,
  className,
}: {
  id: MeritId;
  className?: string;
}) {
  const Icon = MERIT_ICONS[id];
  return <Icon className={className} aria-hidden />;
}

// Hemp, Silk, and Tea have real cropped artwork (see public/icons, sourced
// from the modern UI pass); every other good still falls back to its own
// emoji from ICONS, exactly as before. The source images are a big circle
// already, so this only ever needs a plain circular clip, no separate
// masking: the black square corners the source files ship with are already
// cropped out ahead of time, this just fits the remaining circle into the
// surrounding text.
const ITEM_IMAGES: Record<string, string> = {
  Hemp: "/icons/hemp.png",
  Silk: "/icons/silk.png",
  Tea: "/icons/tea.png",
};

export function ItemIcon({
  item,
  className,
}: {
  item: string;
  className?: string;
}) {
  const src = ITEM_IMAGES[item];
  if (!src) {
    return (
      <span className={className} aria-hidden>
        {ICONS[item] ?? ""}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className={cn(
        "inline-block h-4 w-4 shrink-0 rounded-full object-cover align-[-3px]",
        className,
      )}
      aria-hidden
    />
  );
}
