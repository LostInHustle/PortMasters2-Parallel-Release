"use client";

import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Crown, Trophy, Ship, Star } from "lucide-react";
import { renownProgress, renownTitleForLevel, type CaptainLegacySummary } from "@/lib/game/legacy";
import { BROKERS_FAVOR_UNLOCK_LEVEL } from "@/lib/game/constants";
import { MERITS } from "@/lib/game/merits";
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
  const { level, xpIntoLevel, xpForNextLevel } = renownProgress(legacy.renownXP);
  const title = renownTitleForLevel(level);
  const pct = xpForNextLevel > 0 ? Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100)) : 100;
  const favorUnlocked = level >= BROKERS_FAVOR_UNLOCK_LEVEL;
  const favorLevelsToGo = BROKERS_FAVOR_UNLOCK_LEVEL - level;

  return (
    <div className={cn("rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3.5", className)}>
      <div className="flex items-center gap-2 mb-2">
        <div className="pm-grad-amber h-8 w-8 rounded-lg flex items-center justify-center shrink-0">
          <Star className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">Renown {level} · {title}</div>
          <div className="text-[10px] text-muted-foreground">{legacy.renownXP} XP earned in total</div>
        </div>
      </div>
      <Progress value={pct} className="h-1.5 mb-1" />
      <div className="text-[10px] text-muted-foreground mb-1.5">
        {xpIntoLevel} / {xpForNextLevel} XP to Renown {level + 1}
      </div>
      <div className={cn("text-[10px] mb-2.5", favorUnlocked ? "text-violet-600 dark:text-violet-400 font-medium" : "text-muted-foreground")}>
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
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm cursor-default",
                    earned
                      ? "bg-amber-500/15 border-amber-500/40"
                      : "bg-background/60 border-black/10 dark:border-white/10 opacity-35 grayscale",
                  )}
                >
                  {m.icon}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="font-semibold">{m.icon} {m.name}</div>
                <div className="text-muted-foreground">{m.desc}</div>
                {!earned && <div className="text-muted-foreground mt-1">Not yet earned</div>}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {!compact && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-background/60 py-1.5">
            <div className="text-sm font-bold flex items-center justify-center gap-1">
              <Ship className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" /> {legacy.voyagesCompleted}
            </div>
            <div className="text-[9px] text-muted-foreground">Voyages</div>
          </div>
          <div className="rounded-lg bg-background/60 py-1.5">
            <div className="text-sm font-bold flex items-center justify-center gap-1">
              <Crown className="h-3.5 w-3.5 text-amber-500" /> {legacy.seaMasterCrowns}
            </div>
            <div className="text-[9px] text-muted-foreground">Sea Master</div>
          </div>
          <div className="rounded-lg bg-background/60 py-1.5">
            <div className="text-sm font-bold flex items-center justify-center gap-1">
              <Trophy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> {legacy.bestScore}
            </div>
            <div className="text-[9px] text-muted-foreground">Best Rep.</div>
          </div>
        </div>
      )}
    </div>
  );
}
