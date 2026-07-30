"use client";

import { Button } from "@/components/ui/button";
import { PRODUCTS, RESOURCES } from "@/lib/game/constants";
import {
  completePhase1,
  explainCardPrice,
  explainExpectedPrice,
  getCardFinalCost,
  purchaseCard,
} from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { itemColorResolver } from "@/lib/use-color-preference";
import { Anchor } from "lucide-react";
import type { PublicUser } from "@/lib/api";
import { Term } from "../../Term";
import { ItemIcon } from "../../shared";
import {
  PriceBreakdownTooltip,
  ExpectedPriceTooltip,
  priceAwareTermContent,
} from "../PriceTooltips";
import { ReadyFooter, type PhaseSync } from "./PhaseShared";

// Every raw material and product gets a price preview here, not just the
// ones that happened to roll onto one of this round's five market cards.
// A captain planning ahead for Tea or Brocade should be able to check
// the going rate even when nobody's currently selling it.
function MarketPriceReference({
  game,
  colorFor,
}: {
  game: GameState;
  colorFor: (item: string) => string | undefined;
}) {
  return (
    <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] px-3.5 py-2.5 mb-3.5">
      <div className="text-[10px] font-semibold tracking-wide text-muted-foreground/80 mb-1.5">
        ━━ MARKET PRICE REFERENCE (hover for details) ━━
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {[...RESOURCES, ...PRODUCTS].map((item) => (
          <Term
            key={item}
            term={item}
            content={
              <ExpectedPriceTooltip price={explainExpectedPrice(game, item)} />
            }
          >
            <span className="text-[11px]" style={{ color: colorFor(item) }}>
              <ItemIcon item={item} className="h-3 w-3" /> {item}
            </span>
          </Term>
        ))}
      </div>
    </div>
  );
}

export function Purchase({
  game,
  act,
  phaseSync,
  members,
  onShowRumors,
  colorFor,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
  onShowRumors: () => void;
  // [MANIFEST 16: Colorblind Safe Palette] Optional, falls back to the
  // plain COLORS lookup when a caller hasn't wired useColorPreference in.
  colorFor?: (item: string) => string | undefined;
}) {
  const resolveColor = itemColorResolver(colorFor);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Anchor className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          Port Merchant Exchange
        </h2>
        <Button
          variant="secondary"
          size="sm"
          className="rounded-lg"
          onClick={onShowRumors}
        >
          🔮 Broker's Rumor Board
        </Button>
      </div>
      {game.revealedIntel.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 mb-3.5 text-xs">
          <strong>🗣️ Broker's Whispers active this round:</strong>{" "}
          {game.revealedIntel.map((i, idx) => (
            <span key={idx}>
              {idx > 0 && ", "}
              <ItemIcon item={i.item} className="h-3.5 w-3.5" /> {i.item} (
              {i.port})
            </span>
          ))}
          <span className="text-muted-foreground">
            {" "}
            (a matching order is guaranteed in Phase 2, buy accordingly).
          </span>
        </div>
      )}
      <MarketPriceReference game={game} colorFor={resolveColor} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {game.resourceCards.map((c) => {
          const finalCost = getCardFinalCost(game, c);
          const breakdown = explainCardPrice(game, c);
          const purchased = game.purchasedCards.includes(c.id);
          const canAfford = game.money >= finalCost && !purchased;
          return (
            <div
              key={c.id}
              className={cn(
                "rounded-xl border overflow-hidden flex flex-col",
                purchased
                  ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                  : "border-black/10 dark:border-white/10 bg-background/50",
              )}
            >
              <div className="px-3.5 py-2 text-xs font-semibold border-b border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] flex items-center justify-between">
                <span>📍 {c.port}</span>
                <span className="text-muted-foreground">
                  {c.isProductCard ? "Product" : "Raw Material"}
                </span>
              </div>
              <div className="p-3.5 flex-1 space-y-1.5">
                {c.resources.map((r, i) => (
                  <div key={i} className="flex items-center text-[12px]">
                    <ItemIcon item={r.type} className="mr-1.5 h-4 w-4" />
                    <Term
                      term={r.type}
                      content={priceAwareTermContent(game, r.type)}
                    >
                      <span
                        className="font-medium"
                        style={{ color: resolveColor(r.type) }}
                      >
                        {r.type}
                      </span>
                    </Term>
                    <span className="mx-1.5">×{r.quantity}</span>
                    <span className="ml-auto text-muted-foreground">
                      Unit: {r.price}💰
                    </span>
                  </div>
                ))}
                {c.isProductCard && c.resources[0].materialCost ? (
                  <div className="text-[10px] text-muted-foreground pl-6">
                    📦 Mat Cost: {c.resources[0].materialCost} Gold (
                    {c.resources[0].materialDetails})
                  </div>
                ) : null}
                <div className="pt-2 mt-1 border-t border-dashed border-black/10 dark:border-white/10">
                  <Term
                    content={<PriceBreakdownTooltip breakdown={breakdown} />}
                  >
                    <span className="text-rose-600 dark:text-rose-400 font-bold text-sm">
                      💰 Total: {finalCost} Gold
                    </span>
                  </Term>
                  {finalCost < c.totalCost && (
                    <span className="text-muted-foreground text-[10px] ml-1">
                      (Was {c.totalCost})
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3 pt-0">
                <Button
                  className={cn(
                    "w-full rounded-lg",
                    canAfford ? "pm-grad-emerald text-white" : "",
                  )}
                  variant={canAfford ? "default" : "secondary"}
                  disabled={!canAfford}
                  onClick={() => act((g, l) => purchaseCard(g, c.id, l))}
                >
                  {purchased ? "✅ Purchased" : `🛒 Buy (${finalCost}💰)`}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <ReadyFooter
        phaseSync={phaseSync}
        members={members}
        idleLabel="✅ Complete Purchase, Continue"
        onConfirm={() => phaseSync.markReady((g, l) => completePhase1(g, l))}
      />
    </div>
  );
}
