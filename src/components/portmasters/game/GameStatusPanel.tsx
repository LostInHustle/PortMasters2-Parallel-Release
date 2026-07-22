"use client";

import { COLORS, ICONS } from "@/lib/game/constants";
import { getHireCost } from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import { difficultyConfig } from "@/lib/game/difficulty";
import {
  unlockedProducts,
  unlockedResources,
  unlockedWorkerTypes,
} from "@/lib/game/pools";
import { cn } from "@/lib/utils";
import { Term } from "../Term";
import { priceAwareTermContent } from "./PriceTooltips";
import { GameLogPanel } from "./GameLogPanel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The captain's own rail.
 *
 * This used to be five sections stacked in a single narrow column (Captain's
 * Log, Vessel Status, Cargo Hold, Outstanding Loans, Round End Obligations)
 * with the ledger dropped underneath all of it. In a rail roughly 260px wide
 * that is unavoidably a long vertical scroll, and the ledger, which a captain
 * consults constantly, sat furthest from the eye.
 *
 * So the handful of numbers that are checked every few seconds (round, waters,
 * funds, reputation, and what is owed at round end) are pinned at the top and
 * never scroll, and everything else is a tab. Each tab is short enough to read
 * without scrolling in the common case and scrolls inside its own box when it
 * is not, so the page itself never grows. The ledger becomes a peer tab rather
 * than a footnote below the fold.
 *
 * The pinned "Due" figure carries the safe/short tone, because that is the one
 * number that decides whether a captain is about to go bankrupt, and it should
 * be readable without opening anything.
 */
export function GameStatusPanel({
  game,
  logs,
  onRepayLoan,
}: {
  game: GameState;
  logs: string[];
  onRepayLoan?: (debtId: string) => void;
}) {
  const discount = game.shipLevel * 5;
  const showObligations = ![0, 5, "endgame", "bankruptcy"].includes(game.phase);

  // Summed across the whole unlocked roster, not the three founding types.
  // Hardcoding those three meant a captain who hired a charter artisan was
  // shown a wages figure that omitted them, understating the round end bill
  // and therefore the bankruptcy risk this panel exists to warn about.
  const roster = unlockedWorkerTypes(game.difficulty, game.currentRound).map(
    (w) => {
      const list = game.workers[w.id] ?? [];
      return { ...w, list, due: list.length * getHireCost(game, w.id) };
    },
  );
  const pendWages = roster.reduce((sum, r) => sum + r.due, 0);
  const pendMaint = game.fixedCost + game.maintenancePenalty;
  const pendTotal = pendWages + pendMaint;
  const safe = game.money >= pendTotal;
  const nW = roster.reduce((sum, r) => sum + r.list.length, 0);
  const cfg = difficultyConfig(game.difficulty);
  const hasLoans = game.debts.length > 0 || game.loansGiven.length > 0;
  const duesAlert = (showObligations && !safe) || game.debts.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Pinned: never scrolls, so the numbers a captain checks constantly
          are always in the same place. */}
      <div className="shrink-0">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground">
            🌊 Voyage{" "}
            <b className="text-foreground">
              {game.currentRound}/{game.maxRounds}
            </b>
          </span>
          <span className="truncate text-foreground/80" title={cfg.name}>
            {cfg.icon} {cfg.name}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Stat
            label="Funds"
            value={`${game.money}`}
            className="text-emerald-600 dark:text-emerald-400"
          />
          <Stat
            label="Reputation"
            value={`${game.score}`}
            className="text-amber-600 dark:text-amber-400"
          />
          {showObligations ? (
            <Stat
              label="Due"
              value={`${pendTotal}`}
              className={cn(
                safe
                  ? "text-foreground/80"
                  : "text-rose-600 dark:text-rose-400",
              )}
            />
          ) : (
            <Stat
              label="Ship"
              value={`Lv ${game.shipLevel}`}
              className="text-teal-600 dark:text-teal-400"
            />
          )}
        </div>
      </div>

      <Tabs
        defaultValue="hold"
        className="mt-2.5 flex min-h-0 flex-1 flex-col gap-2"
      >
        <TabsList className="grid w-full shrink-0 grid-cols-4">
          <TabsTrigger value="hold" className="text-[11px]">
            Hold
          </TabsTrigger>
          <TabsTrigger value="ship" className="text-[11px]">
            Ship
          </TabsTrigger>
          <TabsTrigger value="dues" className="text-[11px]">
            Dues
            {duesAlert && (
              <span
                className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-500"
                aria-label="attention needed"
              />
            )}
          </TabsTrigger>
          <TabsTrigger value="log" className="text-[11px]">
            Ledger
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="hold"
          className="pm-scroll min-h-0 flex-1 overflow-y-auto"
        >
          <div className="text-[10px] font-semibold tracking-wide text-muted-foreground/80 mb-0.5">
            ━━ Raw Materials ━━
          </div>
          {unlockedResources(game.difficulty, game.currentRound).map((r) => (
            <InvItem
              key={r}
              icon={ICONS[r]}
              name={r}
              color={COLORS[r]}
              count={game.inventory[r] || 0}
              priceContent={priceAwareTermContent(game, r)}
            />
          ))}
          <div className="text-[10px] font-semibold tracking-wide text-muted-foreground/80 mt-2 mb-0.5">
            ━━ Finished Goods ━━
          </div>
          {unlockedProducts(game.difficulty, game.currentRound).map((r) => (
            <InvItem
              key={r}
              icon={ICONS[r]}
              name={r}
              color={COLORS[r]}
              count={game.inventory[r] || 0}
              priceContent={priceAwareTermContent(game, r)}
            />
          ))}
          {nW > 0 ? (
            <>
              <div className="text-[10px] font-semibold tracking-wide text-muted-foreground/80 mt-2 mb-0.5">
                ━━ Artisans ━━
              </div>
              {/* Each row reports how many are trained. A skilled artisan
                  produces two items per round instead of one (see
                  processProduction), which was invisible everywhere before. */}
              {roster
                .filter((r) => r.list.length > 0)
                .map((r) => (
                  <InvItem
                    key={r.id}
                    icon={r.icon}
                    name={r.plural}
                    term={r.label}
                    count={r.list.length}
                    skilled={r.list.filter((x) => x.isSkilled).length}
                    muted
                  />
                ))}
            </>
          ) : null}
        </TabsContent>

        <TabsContent
          value="ship"
          className="pm-scroll min-h-0 flex-1 overflow-y-auto"
        >
          <Row label={<Term term="Ship Level">Class</Term>}>
            <b>Level {game.shipLevel}</b>
          </Row>
          <Row label={<Term term="Freight">Freight</Term>}>
            <span className="text-[10px] text-muted-foreground">
              max(5, n×2 − {discount})
            </span>
          </Row>
          <Row label="Modules">
            <b>
              {game.equippedModules.length}/{game.shipLevel}
            </b>
          </Row>
          {game.equippedModules.length === 0 ? (
            <p className="pt-1 text-[10px] text-muted-foreground/80">
              No modules installed. Upgrade the ship in the Shipyard to unlock
              slots.
            </p>
          ) : (
            game.equippedModules.map((m) => (
              <div key={m.id} className="py-0.5 text-[11px]">
                <span className="mr-1">{m.icon}</span>
                <span className="text-foreground/90">{m.name}</span>
                <div className="pl-5 text-[10px] text-muted-foreground">
                  {m.desc}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent
          value="dues"
          className="pm-scroll min-h-0 flex-1 overflow-y-auto"
        >
          {showObligations ? (
            <>
              <Row label={<Term term="Maintenance">🔧 Maintenance</Term>}>
                <b>{pendMaint} Gold</b>
              </Row>
              <Row
                label={
                  <Term term="Wages">
                    👥 Wages{nW > 0 ? ` (${nW} workers)` : ""}
                  </Term>
                }
              >
                <b>{nW > 0 ? `${pendWages} Gold` : "…"}</b>
              </Row>
              {roster
                .filter((r) => r.due > 0)
                .map((r) => (
                  <SubRow
                    key={r.id}
                    label={`↳ ${r.list.length}× ${r.label}`}
                    value={`${r.due}g`}
                  />
                ))}
              <div
                className={cn(
                  "mt-1 flex items-center justify-between border-t pt-2",
                  safe ? "border-teal-500/20" : "border-rose-500/30",
                )}
              >
                <span className="text-xs font-semibold">💸 Total Due</span>
                <span
                  className={cn(
                    "font-bold",
                    safe
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {pendTotal} Gold
                </span>
              </div>
              {safe ? (
                <div className="mt-1.5 text-center text-[10px] text-emerald-600 dark:text-emerald-400">
                  ✅ Funds sufficient for round end
                </div>
              ) : (
                <div className="mt-1.5 rounded-md bg-rose-500/15 py-1 text-center text-[10px] text-rose-600 dark:text-rose-300">
                  🚨 Risk: Funds may fall short at round end!
                </div>
              )}
            </>
          ) : (
            <p className="py-2 text-[11px] text-muted-foreground/80">
              Nothing is owed until the voyage is under way.
            </p>
          )}

          {hasLoans && (
            <div className="mt-3 border-t border-black/5 pt-2 dark:border-white/10">
              <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground/80">
                ━━ Outstanding Loans ━━
              </div>
              {game.debts.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-1.5 py-0.5"
                >
                  <span className="text-[12px] text-muted-foreground">
                    You owe{" "}
                    <b className="text-foreground/90">{d.counterpartyName}</b>
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[12px] font-bold text-rose-600 dark:text-rose-400">
                      {d.amount}g
                    </span>
                    {onRepayLoan && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-6 rounded px-2 text-[10px]"
                        disabled={game.money < d.amount}
                        onClick={() => onRepayLoan(d.id)}
                      >
                        Repay
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {game.loansGiven.map((l) => (
                <Row
                  key={l.id}
                  label={
                    <span>
                      Owed by <b>{l.counterpartyName}</b>
                    </span>
                  }
                >
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {l.amount}g
                  </span>
                </Row>
              ))}
              <p className="pt-1 text-[10px] text-muted-foreground/80">
                Unpaid loans settle automatically at the end of Round{" "}
                {game.maxRounds}.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="log" className="min-h-0 flex-1">
          <GameLogPanel logs={logs} embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg bg-black/[0.03] px-2 py-1.5 text-center dark:bg-white/[0.05]">
      <div className={cn("text-[15px] font-bold leading-tight", className)}>
        {value}
      </div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground/90">{children}</span>
    </div>
  );
}

function SubRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5 pl-3 text-[10px] text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function InvItem({
  icon,
  name,
  term,
  color,
  count,
  muted,
  skilled,
  priceContent,
}: {
  icon: string;
  name: string;
  term?: string;
  color?: string;
  count: number;
  muted?: boolean;
  // Artisan rows only: how many of this type have been promoted. Rendered as
  // a star tally beside the head count rather than a second row, so the
  // hold stays scannable.
  skilled?: number;
  priceContent?: React.ReactNode;
}) {
  return (
    <div className="flex items-center py-0.5 text-[11px]">
      <span className="mr-1.5 text-[14px]">{icon}</span>
      <span className="flex-1" style={{ color: muted ? undefined : color }}>
        <Term term={term ?? name} content={priceContent}>
          {name}
        </Term>
      </span>
      {skilled !== undefined && skilled > 0 && (
        <span
          className="mr-1.5 text-[10px] text-amber-600 dark:text-amber-400"
          title={`${skilled} of ${count} trained: each produces 2 per round`}
        >
          ⭐{skilled}
        </span>
      )}
      <span
        className="min-w-[30px] text-right font-bold"
        style={{ color: muted ? undefined : color }}
      >
        {count}
      </span>
    </div>
  );
}
