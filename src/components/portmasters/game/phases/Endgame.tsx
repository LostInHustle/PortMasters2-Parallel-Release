"use client";

import { Trophy, Coins, Crown, Skull } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BROKERS_FAVOR_UNLOCK_LEVEL } from "@/lib/game/constants";
import { merchantRatingForScore } from "@/lib/game/engine";
import { meritById } from "@/lib/game/merits";
import type { GameState } from "@/lib/game/types";
import type { CaptainLegacySummary } from "@/lib/game/legacy";
import type { VoyageCompleteEvent } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { Avatar, MeritIcon } from "../../shared";
import { CaptainLegacyCard } from "../../CaptainLegacyCard";

export function Endgame({
  game,
  isHost,
  onRestart,
  voyageResult,
  myLegacy,
  myUserId,
}: {
  game: GameState;
  isHost: boolean;
  onRestart: () => void;
  voyageResult: VoyageCompleteEvent | null;
  myLegacy: CaptainLegacySummary | null;
  myUserId: string;
}) {
  // Mirrors the same rank shown in the Captain's Ledger (see
  // merchantRatingForScore in engine.ts). Checks defaultedDebt first, the
  // one case a plain score lookup can't capture on its own.
  let rating: string;
  if (game.defaultedDebt) {
    rating = "💥 Bankrupt: Defaulted on a Loan";
  } else {
    const r = merchantRatingForScore(game.score);
    rating = `${r.icon} ${r.label}`;
  }
  const mine = voyageResult?.standings.find((s) => s.userId === myUserId);
  return (
    <div className="max-w-md mx-auto text-center py-4">
      <div className="text-2xl font-bold mb-4">🎮 Game Over!</div>
      <div className="text-xl font-bold text-teal-700 dark:text-teal-300 my-3 flex items-center justify-center gap-2">
        <Trophy className="h-5 w-5" />
        Final Reputation: {game.score}
      </div>
      <div className="text-lg text-emerald-600 dark:text-emerald-400 my-2 flex items-center justify-center gap-2">
        <Coins className="h-5 w-5" />
        Final Funds: {game.money} Gold
      </div>
      <div className="text-lg text-amber-600 dark:text-amber-400 my-4">
        📈 Merchant Rank: {rating}
      </div>

      {voyageResult ? (
        <div className="space-y-3 mb-5 text-left">
          {mine?.crowned && (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-400/10 px-4 py-3 text-center">
              <div className="text-lg font-bold text-amber-600 dark:text-amber-300 flex items-center justify-center gap-2">
                <Crown className="h-5 w-5" /> Crowned Sea Master!
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Highest Reputation in this harbor's voyage.
              </div>
            </div>
          )}
          {mine?.brokersFavorUnlocked && (
            <div className="rounded-xl border-2 border-violet-400 bg-violet-400/10 px-4 py-3 text-center">
              <div className="text-lg font-bold text-violet-600 dark:text-violet-300 flex items-center justify-center gap-2">
                🤝 Broker's Favor Unlocked!
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Renown Level {BROKERS_FAVOR_UNLOCK_LEVEL} reached. Starting next
                voyage, call one in from the Trade Manifest to summon a
                guaranteed buyer.
              </div>
            </div>
          )}
          {mine?.newMerits.map((meritId) => {
            const merit = meritById(meritId);
            if (!merit) return null;
            return (
              <div
                key={meritId}
                className="rounded-xl border-2 border-amber-400 bg-amber-400/10 px-4 py-3 text-center"
              >
                <div className="text-lg font-bold text-amber-600 dark:text-amber-300 flex items-center justify-center gap-2">
                  <MeritIcon id={merit.id} className="h-5 w-5" /> Captain's
                  Merit: {merit.name}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {merit.desc}
                </div>
              </div>
            );
          })}
          <div className="rounded-xl border border-black/5 dark:border-white/10 overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold bg-black/[0.03] dark:bg-white/[0.05]">
              🏁 Final Standings
            </div>
            <div className="divide-y divide-black/5 dark:divide-white/10">
              {voyageResult.standings.map((s, i) => (
                <div
                  key={s.userId}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm",
                    s.userId === myUserId && "bg-teal-500/[0.06]",
                  )}
                >
                  <span className="text-xs text-muted-foreground w-4 shrink-0">
                    {i + 1}
                  </span>
                  <Avatar hue={s.avatarHue} name={s.displayName} size={22} />
                  <span className="flex-1 truncate font-medium">
                    {s.displayName}
                  </span>
                  {s.crowned && (
                    <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  )}
                  {s.bankrupt && (
                    <Skull className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {s.reputation} Rep.
                  </span>
                </div>
              ))}
            </div>
          </div>
          {myLegacy && (
            <div>
              {mine && (
                <div className="text-xs text-center text-muted-foreground mb-1.5">
                  +{mine.xpGained} Renown XP this voyage
                  {mine.leveledUp ? " · Renown level up!" : ""}
                </div>
              )}
              <CaptainLegacyCard legacy={myLegacy} />
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground mb-5">
          ⏳ Waiting on the rest of the harbor to finish their voyage before Sea
          Master is crowned…
        </div>
      )}

      {isHost ? (
        <Button
          className="pm-grad-primary text-white rounded-xl px-8"
          onClick={onRestart}
        >
          🔄 Restart Voyage
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Waiting for the host to restart the voyage…
        </p>
      )}
    </div>
  );
}
