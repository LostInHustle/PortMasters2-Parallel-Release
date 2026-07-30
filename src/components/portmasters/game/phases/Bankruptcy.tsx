"use client";

import type { GameState } from "@/lib/game/types";
import type { PublicUser } from "@/lib/api";
import type { Backing } from "./PhaseShared";

// [MANIFEST 07: Bequest Routing] Extends the already shipped Silent
// Partner panel below: at the moment bankruptcy is reached, a captain
// with open loans still owed to them can designate one still active
// captain in the room to receive future repayments instead of an inert
// number nobody can spend. Both props are optional so any other future
// caller of this screen (there is currently only one, GamePhasePanel.tsx)
// keeps compiling unchanged if it doesn't wire the board through.
export function Bankruptcy({
  game,
  members,
  backing,
  myUserId,
}: {
  game: GameState;
  members?: PublicUser[];
  backing?: Backing;
  myUserId?: string;
}) {
  return (
    <div className="max-w-md mx-auto text-center py-4">
      <div className="text-7xl mb-2">💥</div>
      <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mb-1">
        Ship Fleet Bankrupt!
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {game.money <= 0
          ? "Funds depleted, unable to pay essential operational costs"
          : "Insufficient funds to cover maintenance and wages"}
      </p>
      <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto text-left text-sm my-4">
        <div className="text-muted-foreground">🌊 Rounds Completed:</div>
        <div>
          <b>
            {game.currentRound - 1}/{game.maxRounds}
          </b>
        </div>
        <div className="text-muted-foreground">💰 Final Funds:</div>
        <div>
          <b>{game.money} Gold</b>
        </div>
        <div className="text-muted-foreground">🏆 Final Reputation:</div>
        <div>
          <b>{game.score}</b>
        </div>
        <div className="text-muted-foreground">🚢 Ship Level:</div>
        <div>
          <b>{game.shipLevel}</b>
        </div>
        <div className="text-muted-foreground">🧾 Taxes Paid:</div>
        <div>
          <b>{game.vatPaid + game.incomeTaxPaid} Gold</b>
        </div>
      </div>
      {game.loansGiven.length > 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3 mt-4 text-left">
          <div className="text-sm font-semibold text-foreground/90 mb-1.5 flex items-center gap-1.5">
            🤝 Silent Partner
          </div>
          <p className="text-xs text-muted-foreground mb-2.5">
            Gold you lent before the wreck is still out there, and it lands the
            moment each captain repays it.
          </p>
          <div className="space-y-2">
            {game.loansGiven.map((l) => {
              const live = backing?.loans.find((o) => o.debtId === l.id);
              // Neither the borrower (they owe it) nor myself (the "myself
              // (default)" option below already covers that, and the server
              // rejects a redirect to the lender of record anyway, so
              // listing my own name would be a dead choice that silently
              // snaps back).
              const candidates = (members ?? []).filter(
                (m) => m.id !== l.counterpartyId && m.id !== myUserId,
              );
              return (
                <div key={l.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Owed by{" "}
                      <b className="text-foreground/90">{l.counterpartyName}</b>
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {l.amount}g
                    </span>
                  </div>
                  {backing && candidates.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>Send repayment to</span>
                      <select
                        value={live?.redirectToUserId ?? ""}
                        onChange={(e) => backing.redirect(l.id, e.target.value)}
                        className="rounded-md border border-black/10 dark:border-white/15 bg-background/60 px-1.5 py-0.5 text-[11px]"
                      >
                        <option value="">myself (default)</option>
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.04] px-4 py-3 mt-4 text-sm text-muted-foreground">
        Your voyage has ended, but the others are still sailing. Click any
        captain in the <strong>Harbor Roster</strong> to watch their cargo,
        workers, and log update live.
      </div>
    </div>
  );
}
