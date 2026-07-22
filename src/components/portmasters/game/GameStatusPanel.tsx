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
import { Button } from "@/components/ui/button";

export function GameStatusPanel({
  game,
  onRepayLoan,
}: {
  game: GameState;
  onRepayLoan?: (debtId: string) => void;
}) {
  const discount = game.shipLevel * 5;
  const showObligations = ![0, 5, "endgame", "bankruptcy"].includes(game.phase);

  const ww = game.workers.weaver.length * getHireCost(game, "weaver");
  const mw = game.workers.master.length * getHireCost(game, "master");
  const sw =
    game.workers.sachet_maker.length * getHireCost(game, "sachet_maker");
  const pendWages = ww + mw + sw;
  const pendMaint = game.fixedCost + game.maintenancePenalty;
  const pendTotal = pendWages + pendMaint;
  const safe = game.money >= pendTotal;
  const nW =
    game.workers.weaver.length +
    game.workers.master.length +
    game.workers.sachet_maker.length;

  return (
    <div className="space-y-3">
      <Section title="📊 Captain's Log" tone="sea">
        <Row label="🌊 Voyage">
          <b className="text-foreground">
            {game.currentRound}/{game.maxRounds}
          </b>
        </Row>
        <Row label="🧭 Waters">
          <span className="text-foreground/90">
            {difficultyConfig(game.difficulty).icon}{" "}
            {difficultyConfig(game.difficulty).name}
          </span>
        </Row>
        <Row label="💰 Funds">
          <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[15px]">
            {game.money} Gold
          </span>
        </Row>
        <Row label={<Term term="Reputation">🏆 Reputation</Term>}>
          <b className="text-amber-600 dark:text-amber-400">{game.score}</b>
        </Row>
      </Section>

      <Section title="🚢 Vessel Status" tone="sea">
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
        {game.equippedModules.map((m) => (
          <div
            key={m.id}
            className="text-[10px] text-muted-foreground pl-2 -mt-0.5"
          >
            {m.icon} {m.name}
          </div>
        ))}
      </Section>

      <Section title="📦 Cargo Hold" tone="sea">
        <div className="text-[10px] font-semibold tracking-wide text-muted-foreground/80 mt-0.5 mb-0.5">
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
        {game.workers.weaver.length ||
        game.workers.master.length ||
        game.workers.sachet_maker.length ? (
          <>
            <div className="text-[10px] font-semibold tracking-wide text-muted-foreground/80 mt-2 mb-0.5">
              ━━ Artisans ━━
            </div>
            <InvItem
              icon="👩‍🔧"
              name="Weavers"
              term="Weaver"
              count={game.workers.weaver.length}
              muted
            />
            <InvItem
              icon="👩‍🎨"
              name="Masters"
              term="Master Weaver"
              count={game.workers.master.length}
              muted
            />
            <InvItem
              icon="🌸"
              name="Makers"
              term="Sachet Maker"
              count={game.workers.sachet_maker.length}
              muted
            />
          </>
        ) : null}
      </Section>

      {(game.debts.length > 0 || game.loansGiven.length > 0) && (
        <Section
          title="📋 Outstanding Loans"
          tone={game.debts.length > 0 ? "rose" : "sea"}
        >
          {game.debts.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-1.5 py-0.5"
            >
              <span className="text-[12px] text-muted-foreground">
                You owe{" "}
                <b className="text-foreground/90">{d.counterpartyName}</b>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[12px] font-bold text-rose-600 dark:text-rose-400">
                  {d.amount}g
                </span>
                {onRepayLoan && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-[10px] rounded"
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
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {l.amount}g
              </span>
            </Row>
          ))}
          <p className="text-[10px] text-muted-foreground/80 pt-1">
            Unpaid loans settle automatically at the end of Round{" "}
            {game.maxRounds}.
          </p>
        </Section>
      )}

      {showObligations && (
        <Section title="⚠️ Round-End Obligations" tone={safe ? "sea" : "rose"}>
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
          {ww > 0 && (
            <SubRow
              label={`↳ ${game.workers.weaver.length}× Weaver`}
              value={`${ww}g`}
            />
          )}
          {mw > 0 && (
            <SubRow
              label={`↳ ${game.workers.master.length}× Master`}
              value={`${mw}g`}
            />
          )}
          {sw > 0 && (
            <SubRow
              label={`↳ ${game.workers.sachet_maker.length}× Maker`}
              value={`${sw}g`}
            />
          )}
          <div
            className={cn(
              "flex justify-between items-center pt-2 mt-1 border-t",
              safe ? "border-teal-500/20" : "border-rose-500/30",
            )}
          >
            <span className="font-semibold text-xs">💸 Total Due</span>
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
            <div className="mt-1.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-300 text-center text-[10px] py-1">
              🚨 Risk: Funds may fall short at round end!
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "sea" | "rose";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-3 border",
        tone === "rose"
          ? "border-rose-500/30 bg-rose-500/[0.04]"
          : "border-teal-500/15 bg-teal-500/[0.03]",
      )}
    >
      <h3 className="text-[12px] font-semibold text-foreground/80 mb-2 pb-1.5 border-b border-black/5 dark:border-white/10">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
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
    <div className="flex justify-between items-center text-[12px] py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground/90">{children}</span>
    </div>
  );
}

function SubRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[10px] text-muted-foreground pl-3 py-0.5">
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
  priceContent,
}: {
  icon: string;
  name: string;
  term?: string;
  color?: string;
  count: number;
  muted?: boolean;
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
      <span
        className="font-bold min-w-[30px] text-right"
        style={{ color: muted ? undefined : color }}
      >
        {count}
      </span>
    </div>
  );
}
