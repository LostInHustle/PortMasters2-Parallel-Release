"use client";

import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Crown, Trophy, Ship, Star } from "lucide-react";
import {
  renownProgress,
  renownTitleForLevel,
  type CaptainLegacySummary,
} from "@/lib/game/legacy";
import { BROKERS_FAVOR_UNLOCK_LEVEL } from "@/lib/game/constants";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/lib/game/difficulty";
import { MERITS } from "@/lib/game/merits";
import { MeritIcon } from "./shared";
import { cn } from "@/lib/utils";

// Shown both in the Lobby (a captain's standing account of who they are
// across every voyage they've ever sailed) and on the Endgame screen
// right after a voyage concludes (see GamePhasePanel.tsx), where it
// reflects the account *after* this voyage's Renown XP was applied.
export function CaptainLegacyCard({
  legacy,
  className,
  compact,
}: {
  legacy: CaptainLegacySummary;
  className?: string;
  compact?: boolean;
}) {
  const { level, xpIntoLevel, xpForNextLevel } = renownProgress(
    legacy.renownXP,
  );
  const title = renownTitleForLevel(level);
  const pct =
    xpForNextLevel > 0
      ? Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100))
      : 100;
  const favorUnlocked = level >= BROKERS_FAVOR_UNLOCK_LEVEL;
  const favorLevelsToGo = BROKERS_FAVOR_UNLOCK_LEVEL - level;
  // Crowns and best score split by the waters they were earned on. Only tiers
  // this captain has actually sailed appear, so a new account sees nothing
  // extra while a veteran sees where their crowns were really won. Optional
  // chaining guards a cached response written before this field existed.
  const perTier = DIFFICULTY_ORDER.map((key) => ({
    key,
    cfg: DIFFICULTIES[key],
    stats: legacy.statsByDifficulty?.[key],
  })).filter((t) => t.stats && (t.stats.crowns > 0 || t.stats.bestScore > 0));

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3.5",
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="pm-grad-amber h-8 w-8 rounded-lg flex items-center justify-center shrink-0">
          <Star className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            Renown {level} · {title}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {legacy.renownXP} XP earned in total
          </div>
        </div>
      </div>
      <Progress value={pct} className="h-1.5 mb-1" />
      <div className="text-[10px] text-muted-foreground mb-1.5">
        {xpIntoLevel} / {xpForNextLevel} XP to Renown {level + 1}
      </div>
      <div
        className={cn(
          "text-[10px] mb-2.5",
          favorUnlocked
            ? "text-violet-600 dark:text-violet-400 font-medium"
            : "text-muted-foreground",
        )}
      >
        {favorUnlocked
          ? "🤝 Broker's Favor unlocked"
          : `🔒 Broker's Favor unlocks at Renown ${BROKERS_FAVOR_UNLOCK_LEVEL}, ${renownTitleForLevel(BROKERS_FAVOR_UNLOCK_LEVEL)} (${favorLevelsToGo} level${favorLevelsToGo === 1 ? "" : "s"} to go)`}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {MERITS.map((m) => {
          const earned = legacy.meritIds.includes(m.id);
          return (
            <Tooltip key={m.id}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border cursor-default",
                    earned
                      ? "bg-amber-500/15 border-amber-500/40"
                      : "bg-background/60 border-black/10 dark:border-white/10 opacity-35 grayscale",
                  )}
                >
                  <MeritIcon
                    id={m.id}
                    className={cn(
                      "h-3.5 w-3.5",
                      earned
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground",
                    )}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="font-semibold flex items-center gap-1.5">
                  <MeritIcon id={m.id} className="h-3.5 w-3.5" /> {m.name}
                </div>
                <div className="text-muted-foreground">{m.desc}</div>
                {!earned && (
                  <div className="text-muted-foreground mt-1">
                    Not yet earned
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {!compact && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-background/60 py-1.5">
              <div className="text-sm font-bold flex items-center justify-center gap-1">
                <Ship className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />{" "}
                {legacy.voyagesCompleted}
              </div>
              <div className="text-[9px] text-muted-foreground">Voyages</div>
            </div>
            <div className="rounded-lg bg-background/60 py-1.5">
              <div className="text-sm font-bold flex items-center justify-center gap-1">
                <Crown className="h-3.5 w-3.5 text-amber-500" />{" "}
                {legacy.seaMasterCrowns}
              </div>
              <div className="text-[9px] text-muted-foreground">Sea Master</div>
            </div>
            <div className="rounded-lg bg-background/60 py-1.5">
              <div className="text-sm font-bold flex items-center justify-center gap-1">
                <Trophy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />{" "}
                {legacy.bestScore}
              </div>
              <div className="text-[9px] text-muted-foreground">Best Rep.</div>
            </div>
          </div>
          {perTier.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {perTier.map(({ key, cfg, stats }) => (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-default items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-[10px]">
                      <span>{cfg.icon}</span>
                      <span className="text-muted-foreground">{cfg.badge}</span>
                      {stats!.crowns > 0 && (
                        <span className="inline-flex items-center gap-0.5 font-semibold">
                          <Crown className="h-2.5 w-2.5 text-amber-500" />
                          {stats!.crowns}
                        </span>
                      )}
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {stats!.bestScore}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="font-semibold">{cfg.name}</div>
                    <div className="text-muted-foreground">
                      {stats!.crowns} Sea Master crown
                      {stats!.crowns === 1 ? "" : "s"} · best Reputation{" "}
                      {stats!.bestScore}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
