"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  APP_NAME,
  BARTER_ITEMS,
  BROKERS_FAVOR_UNLOCK_LEVEL,
  COLORS,
  ICONS,
  PRODUCTS,
  RECIPES,
  RESOURCES,
  WAGES,
} from "@/lib/game/constants";
import { meritById } from "@/lib/game/merits";
import {
  assignTask,
  brokersFavorCommission,
  calcTransportCost,
  callBrokersFavor,
  completeBarterPhase,
  completeOrder,
  completePhase1,
  completePhase2,
  explainCardPrice,
  explainTransportCost,
  explainVAT,
  finalizeModuleSwap,
  finishSettlement,
  fireWorker,
  getCardFinalCost,
  getHireCost,
  getOwnedAmount,
  handleModuleSelect,
  hireEscort,
  hireWorker,
  merchantRatingForScore,
  postBarterOffer,
  purchaseCard,
  refundBarterOffer,
  resolvePirateAttack,
  selectBoon,
  startModuleDrafting,
  startPhase2,
  swapBoonChoices,
  swapModuleChoices,
  upgradeShip,
  skipUpgrade,
  explainExpectedPrice,
  type PriceBreakdown,
} from "@/lib/game/engine";
import type { GameContext, GameState, Worker } from "@/lib/game/types";
import {
  difficultyConfig,
  escortRateFor,
  pirateChanceFor,
} from "@/lib/game/difficulty";
import { cn } from "@/lib/utils";
import {
  Anchor,
  Ship,
  BookOpen,
  Coins,
  Trophy,
  Handshake,
  X,
  ShieldCheck,
  Skull,
  HandCoins,
  Crown,
} from "lucide-react";
import type { PublicUser } from "@/lib/api";
import type { VoyageCompleteEvent } from "@/lib/realtime";
import type { CaptainLegacySummary } from "@/lib/game/legacy";
import type { usePhaseSync } from "@/lib/use-phase-sync";
import type { useBarter, BarterOffer } from "@/lib/use-barter";
import type { useAid } from "@/lib/use-aid";
import { ReadyBar } from "./ReadyBar";
import { Term } from "../Term";
import { Avatar, MeritIcon } from "../shared";
import { CaptainLegacyCard } from "../CaptainLegacyCard";
import {
  PriceBreakdownTooltip,
  ExpectedPriceTooltip,
  priceAwareTermContent,
} from "./PriceTooltips";

// Every raw material and product gets a price preview here, not just the
// ones that happened to roll onto one of this round's five market cards.
// A captain planning ahead for Tea or Brocade should be able to check
// the going rate even when nobody's currently selling it.
function MarketPriceReference({ game }: { game: GameState }) {
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
            <span className="text-[11px]" style={{ color: COLORS[item] }}>
              {ICONS[item]} {item}
            </span>
          </Term>
        ))}
      </div>
    </div>
  );
}

// The pre-voyage lobby roster: just avatars and a headcount, no ready/not
// ready state since there's nothing to ready up for yet. Separate from
// ReadyBar (used everywhere else) on purpose, since reusing its check
// marks here would imply a vote that doesn't exist for this screen.
function HarborRoster({
  members,
  ids,
}: {
  members: PublicUser[];
  ids: string[];
}) {
  if (ids.length === 0) return null;
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        {ids.map((id) => {
          const m = byId.get(id);
          return m ? (
            <Avatar
              key={id}
              hue={m.avatarHue}
              name={m.displayName}
              size={28}
              ring
            />
          ) : null;
        })}
      </div>
      <div className="text-xs text-muted-foreground">
        {ids.length} captain{ids.length !== 1 ? "s" : ""} in the harbor
      </div>
    </div>
  );
}

type PhaseSync = ReturnType<typeof usePhaseSync>;
type Barter = ReturnType<typeof useBarter>;
type Aid = ReturnType<typeof useAid>;

type Props = {
  game: GameState;
  ctx: GameContext;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  members: PublicUser[];
  myUserId: string;
  isHost: boolean;
  phaseSync: PhaseSync;
  barter: Barter;
  aid: Aid;
  voyageResult: VoyageCompleteEvent | null;
  myLegacy: CaptainLegacySummary | null;
  onRestart: () => void;
  onShowRumors: () => void;
  onShowGuide: () => void;
  onShowTips: () => void;
  onShowTutorial: () => void;
};

// ---------- Shared "ready" footer ----------
// Every phase component below takes its data as explicit props rather than
// closing over GamePhasePanel's scope. Nested function components used to be
// declared inside GamePhasePanel's body, which meant React saw a brand-new
// component type for e.g. BarterPhase on every re-render of GamePhasePanel
// (any player's move replaces the `game` object, see use-game-session.ts's
// APPLY reducer). A new type forces React to unmount and remount the whole
// subtree, silently resetting any local useState in whatever phase is
// currently showing back to its initial value, this is what caused the
// barter form to snap back to Hemp mid-selection during a live multiplayer
// session. Module-level components have a stable identity across renders,
// so React just re-renders them in place and their local state survives.
function ReadyFooter({
  phaseSync,
  members,
  idleLabel,
  onConfirm,
  idleClassName,
}: {
  phaseSync: PhaseSync;
  members: PublicUser[];
  idleLabel: string;
  onConfirm: () => void;
  idleClassName?: string;
}) {
  if (phaseSync.waiting) {
    return (
      <div className="text-center mt-5 space-y-3">
        <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
          ⏳ Waiting for the rest of the crew…
        </div>
        <ReadyBar
          ready={phaseSync.ready}
          members={members}
          className="justify-center"
        />
        <Button
          variant="secondary"
          className="rounded-xl"
          onClick={phaseSync.cancelReady}
        >
          ↩️ Not ready yet
        </Button>
      </div>
    );
  }
  return (
    <div className="text-center mt-5">
      <Button
        className={cn("rounded-xl px-6", idleClassName)}
        onClick={onConfirm}
      >
        {idleLabel}
      </Button>
    </div>
  );
}

// ---------- Welcome ----------
function Welcome({
  phaseSync,
  members,
  isHost,
  onShowTutorial,
}: {
  phaseSync: PhaseSync;
  members: PublicUser[];
  isHost: boolean;
  onShowTutorial: () => void;
}) {
  const harborIds = phaseSync.ready?.requiredUserIds ?? [];
  const canStart = harborIds.length >= 2;
  return (
    <div className="max-w-3xl mx-auto text-center py-4">
      <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-1">
        <span className="pm-text-sea">⚓ {APP_NAME} 🚢</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        🌊 Eight Voyages await, become the Sea Master!
      </p>
      <div className="flex flex-col items-center gap-3 mb-6">
        <HarborRoster members={members} ids={harborIds} />
        {isHost ? (
          <>
            <Button
              size="lg"
              className={cn(
                "rounded-xl h-12 px-8 text-base",
                canStart && "pm-grad-primary text-white",
              )}
              variant={canStart ? "default" : "secondary"}
              disabled={!canStart}
              onClick={() => phaseSync.startGame()}
            >
              <Ship className="h-5 w-5 mr-2" />
              {canStart
                ? "Start the Voyage"
                : `Need at least 2 captains (${harborIds.length}/2)`}
            </Button>
            {phaseSync.startError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {phaseSync.startError}
              </p>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            ⏳ Waiting for the host to start the voyage… ({harborIds.length} in
            harbor)
          </div>
        )}
        <Button variant="ghost" className="rounded-xl" onClick={onShowTutorial}>
          <BookOpen className="h-4 w-4 mr-2" />
          New Player Tutorial
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left max-w-2xl mx-auto">
        <InfoCard
          tone="emerald"
          title="🚀 Starting Resources"
          rows={["📦 Hemp×8, Silk×5, Tea×3", "💰 100 Gold starting funds"]}
        />
        <InfoCard
          tone="amber"
          title="⏱️ Production Delay"
          rows={[
            "Assign task now → item arrives at Phase 3",
            "Workers don't produce instantly!",
          ]}
        />
        <InfoCard
          tone="sea"
          title="💸 Round-End Costs"
          rows={[
            "🔧 Maintenance: 15 Gold (fixed each round)",
            "👥 Wages settled at Phase 3, not on hire",
          ]}
        />
        <InfoCard
          tone="rose"
          title="🧾 Taxes Explained"
          rows={[
            "VAT: 5% of finished-good profit margin",
            "Income Tax: 10% of round net profit",
          ]}
        />
        <InfoCard
          tone="amber"
          title="🏴‍☠️ Pirates & Borrowing"
          rows={[
            "20% chance of losing all Gold each round",
            "Hire an escort, or ask the harbor for a loan",
          ]}
        />
      </div>
      <div className="max-w-2xl mx-auto mt-3 space-y-2">
        <div className="rounded-lg bg-teal-500/[0.06] border border-teal-500/15 px-3.5 py-2.5 text-xs">
          <strong>🔄 4 Phases per Voyage:</strong> 1️⃣ Buy at Ports (+ 🤝 Barter)
          → 2️⃣ Fill Trade Orders → 3️⃣ Pirates, Wages & Maintenance → 4️⃣ Upgrade
          Ship
        </div>
        <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/15 px-3.5 py-2.5 text-xs">
          <strong>💡 New Player Tip:</strong> Rely on raw material orders early.
          Hire artisans only when you can sustain at least 2 rounds of wages.
          Always keep funds &gt; Maintenance + All Wages.
        </div>
      </div>
    </div>
  );
}

// ---------- Boon Drafting ----------
function BoonDraft({
  game,
  ctx,
  act,
  phaseSync,
  members,
}: {
  game: GameState;
  ctx: GameContext;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  const picks = game.boonChoices;
  // This is the screen the user specifically called out for a visible
  // ready indicator: once a captain locks in a boon, swap the picker for
  // the same "x/y ready" readout everyone else gets, rather than leaving
  // a now-meaningless set of cards on screen.
  if (phaseSync.waiting) {
    return (
      <div className="max-w-md mx-auto text-center py-10">
        <div className="text-2xl font-bold mb-1 pm-text-gold">
          🧭 Boon Locked In
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          The voyage begins once every captain has chosen.
        </p>
        <ReadyBar
          ready={phaseSync.ready}
          members={members}
          className="justify-center mb-5"
        />
        <Button
          variant="secondary"
          className="rounded-xl"
          onClick={phaseSync.cancelReady}
        >
          ↩️ Choose a different Boon
        </Button>
      </div>
    );
  }
  const canSwap = !game.boonSwapUsed && game.money >= 10;
  return (
    <div className="max-w-4xl mx-auto text-center py-2">
      <div className="text-2xl font-bold mb-1 pm-text-gold">
        🧭 The Navigator's Compass
      </div>
      <p className="text-sm text-muted-foreground mb-2">
        Draft a Boon to synergize with your strategy
      </p>
      <ReadyBar
        ready={phaseSync.ready}
        members={members}
        className="justify-center mb-3"
      />
      <div className="flex justify-center mb-4">
        <Button
          size="sm"
          variant="secondary"
          className="rounded-lg"
          disabled={!canSwap}
          onClick={() => act((g, l) => swapBoonChoices(g, l))}
        >
          {game.boonSwapUsed
            ? "✅ Boons Swapped This Voyage"
            : "🔄 Swap Boons (10💰, 1 use/voyage)"}
        </Button>
      </div>
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.06 } },
        }}
      >
        {picks.map((b) => (
          <motion.div
            key={b.id}
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.22, ease: "easeOut" },
              },
            }}
            whileHover={{ y: -6 }}
            className="pm-glass rounded-2xl p-5 flex flex-col items-center text-center border border-amber-500/20"
          >
            <div className="text-5xl mb-2">{b.icon}</div>
            <div className="font-semibold text-foreground mb-2">
              <Term term={b.name}>{b.name}</Term>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">
              {b.desc}
            </div>
            <Button
              className="pm-grad-gold text-amber-950 font-semibold rounded-xl w-full"
              onClick={() =>
                phaseSync.markReady((g, l) => selectBoon(g, ctx, b.id, l))
              }
            >
              🔒 Lock In Boon
            </Button>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

// ---------- Purchase ----------
function Purchase({
  game,
  act,
  phaseSync,
  members,
  onShowRumors,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
  onShowRumors: () => void;
}) {
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
              {ICONS[i.item] ?? ""} {i.item} ({i.port})
            </span>
          ))}
          <span className="text-muted-foreground">
            {" "}
            (a matching order is guaranteed in Phase 2, buy accordingly).
          </span>
        </div>
      )}
      <MarketPriceReference game={game} />
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
                    <span className="mr-1.5 text-base">{ICONS[r.type]}</span>
                    <Term
                      term={r.type}
                      content={priceAwareTermContent(game, r.type)}
                    >
                      <span
                        className="font-medium"
                        style={{ color: COLORS[r.type] }}
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

// ---------- Bartering ----------
function BarterPhase({
  game,
  act,
  barter,
  myUserId,
  phaseSync,
  members,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  barter: Barter;
  myUserId: string;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  const items = BARTER_ITEMS as readonly string[];
  const [offerItem, setOfferItem] = useState<string>("Hemp");
  const [offerAmount, setOfferAmount] = useState(1);
  const [requestItem, setRequestItem] = useState<string>("Gold");
  const [requestAmount, setRequestAmount] = useState(1);

  const owned = getOwnedAmount(game, offerItem);
  const sameItem = offerItem === requestItem;
  const validAmounts =
    Number.isInteger(offerAmount) &&
    offerAmount >= 1 &&
    Number.isInteger(requestAmount) &&
    requestAmount >= 1;
  const canPost = !sameItem && validAmounts && offerAmount <= owned;

  function submitOffer() {
    if (!canPost) return;
    act((g, l) => {
      postBarterOffer(g, offerItem, offerAmount, requestItem, requestAmount, l);
    });
    barter.post(offerItem, offerAmount, requestItem, requestAmount);
    setOfferAmount(1);
    setRequestAmount(1);
  }

  function cancelOffer(o: BarterOffer) {
    act((g, l) => {
      refundBarterOffer(g, o.offerItem, o.offerAmount, l);
    });
    barter.cancel(o.id);
  }

  const selectClass =
    "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <Handshake className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        <Term term="Barter">Captain&apos;s Exchange</Term>
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Short on one good and sitting on too much of another? Post a swap for
        the rest of the harbor to see, or take someone else&apos;s.
      </p>

      <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-4 mb-4">
        <h3 className="text-center font-semibold mb-3 text-sm">
          📤 Post an Offer
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-muted-foreground">I&apos;ll give</span>
          <Input
            type="number"
            min={1}
            step={1}
            value={offerAmount}
            onChange={(e) =>
              setOfferAmount(Math.max(1, parseInt(e.target.value, 10) || 1))
            }
            className="w-16 h-9"
          />
          <select
            value={offerItem}
            onChange={(e) => setOfferItem(e.target.value)}
            className={selectClass}
          >
            {items.map((it) => (
              <option key={it} value={it}>
                {ICONS[it]} {it}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">for</span>
          <Input
            type="number"
            min={1}
            step={1}
            value={requestAmount}
            onChange={(e) =>
              setRequestAmount(Math.max(1, parseInt(e.target.value, 10) || 1))
            }
            className="w-16 h-9"
          />
          <select
            value={requestItem}
            onChange={(e) => setRequestItem(e.target.value)}
            className={selectClass}
          >
            {items.map((it) => (
              <option key={it} value={it}>
                {ICONS[it]} {it}
              </option>
            ))}
          </select>
          <Button
            className={cn(
              "rounded-lg",
              canPost && "pm-grad-emerald text-white",
            )}
            variant={canPost ? "default" : "secondary"}
            disabled={!canPost}
            onClick={submitOffer}
          >
            🤝 Post Offer
          </Button>
        </div>
        {sameItem && (
          <p className="text-center text-[11px] text-rose-600 dark:text-rose-400 mt-2">
            Pick two different items to barter.
          </p>
        )}
        {!sameItem && offerAmount > owned && (
          <p className="text-center text-[11px] text-rose-600 dark:text-rose-400 mt-2">
            You only have {owned} {offerItem}.
          </p>
        )}
      </div>

      {barter.error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/25 px-3.5 py-2 mb-4 text-xs text-rose-600 dark:text-rose-300 flex items-center justify-between">
          <span>⚠️ {barter.error}</span>
          <button onClick={barter.clearError}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="rounded-xl border border-black/10 dark:border-white/10 bg-background/50 p-4 mb-4">
        <h3 className="text-center font-semibold mb-3 text-sm">
          📋 Open Offers
        </h3>
        {barter.offers.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-4">
            No offers on the board yet. Be the first.
          </p>
        ) : (
          <div className="space-y-1.5">
            {barter.offers.map((o) => {
              const mine = o.fromUserId === myUserId;
              const canAfford =
                getOwnedAmount(game, o.requestItem) >= o.requestAmount;
              return (
                <div
                  key={o.id}
                  className={cn(
                    "flex items-center justify-between rounded-md px-3 py-2 text-xs border gap-2",
                    mine
                      ? "bg-amber-500/[0.06] border-amber-500/20"
                      : "bg-background/60 border-black/5 dark:border-white/10",
                  )}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium">
                      {mine ? "You" : o.fromName}
                    </span>
                    <span className="text-muted-foreground">offer</span>
                    <span style={{ color: COLORS[o.offerItem] }}>
                      {ICONS[o.offerItem]} {o.offerAmount} {o.offerItem}
                    </span>
                    <span className="text-muted-foreground">for</span>
                    <span style={{ color: COLORS[o.requestItem] }}>
                      {ICONS[o.requestItem]} {o.requestAmount} {o.requestItem}
                    </span>
                  </div>
                  {mine ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2.5 text-[10px] rounded shrink-0"
                      onClick={() => cancelOffer(o)}
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className={cn(
                        "h-7 px-2.5 text-[10px] rounded shrink-0",
                        canAfford && "pm-grad-primary text-white",
                      )}
                      variant={canAfford ? "default" : "secondary"}
                      disabled={!canAfford}
                      onClick={() => barter.accept(o.id)}
                    >
                      🤝 Trade
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ReadyFooter
        phaseSync={phaseSync}
        members={members}
        idleLabel="✅ Done Bartering, Continue"
        onConfirm={() =>
          phaseSync.markReady((g, l) =>
            completeBarterPhase(g, barter.takeMyOpenRefunds(), l),
          )
        }
      />
    </div>
  );
}

// ---------- Worker Management ----------
function WorkerMgmt({
  game,
  ctx,
  act,
  phaseSync,
  members,
}: {
  game: GameState;
  ctx: GameContext;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  const weaverCost = getHireCost(game, "weaver");
  const masterCost = getHireCost(game, "master");
  const makerCost = getHireCost(game, "sachet_maker");
  const ww = game.weavers.length * weaverCost;
  const mw = game.masterWeavers.length * masterCost;
  const sw = game.sachetMakers.length * makerCost;
  const totalWages = ww + mw + sw;
  const nW =
    game.weavers.length + game.masterWeavers.length + game.sachetMakers.length;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-2xl font-bold text-center mb-1">
        👥 Artisan Management
      </div>
      <p className="text-center text-sm text-muted-foreground mb-4">
        💰 Current Funds: {game.money} Gold | 📦 See Inventory on the left
      </p>

      <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 p-3.5 mb-4 text-xs">
        <strong>⏱️ Production Cycle: What Happens When</strong>
        <div className="grid grid-cols-4 gap-1.5 mt-2 text-center">
          <div className="pm-grad-emerald text-white rounded-md py-1.5">
            <div>📋 Now</div>
            <div className="text-[9px] opacity-90">
              Assign task
              <br />
              consume materials
            </div>
          </div>
          <div className="pm-grad-primary text-white rounded-md py-1.5">
            <div>🤝 Phase 2</div>
            <div className="text-[9px] opacity-90">Trade orders</div>
          </div>
          <div className="pm-grad-amber text-white rounded-md py-1.5">
            <div>✅ Phase 3</div>
            <div className="text-[9px] opacity-90">
              Items produced
              <br />+ wages paid
            </div>
          </div>
          <div className="bg-fuchsia-600 text-white rounded-md py-1.5">
            <div>🚢 Phase 4</div>
            <div className="text-[9px] opacity-90">Shipyard</div>
          </div>
        </div>
        <div className="mt-2 text-emerald-700 dark:text-emerald-300">
          💡 Materials consumed <strong>now</strong>. Finished goods and wage
          deductions happen at <strong>Phase 3</strong>, not instantly.
        </div>
      </div>

      <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-4 mb-4">
        <h3 className="text-center font-semibold mb-2">📦 Current Inventory</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <strong className="text-xs text-teal-700 dark:text-teal-300">
              Raw Materials:
            </strong>
            {RESOURCES.map((r) => (
              <div key={r} className="flex items-center text-[11px] py-0.5">
                <span className="mr-1.5">{ICONS[r]}</span>
                <span className="flex-1" style={{ color: COLORS[r] }}>
                  {r}
                </span>
                <b style={{ color: COLORS[r] }}>{game.inventory[r] || 0}</b>
              </div>
            ))}
          </div>
          <div>
            <strong className="text-xs text-teal-700 dark:text-teal-300">
              Finished Goods:
            </strong>
            {PRODUCTS.map((r) => (
              <div key={r} className="flex items-center text-[11px] py-0.5">
                <span className="mr-1.5">{ICONS[r]}</span>
                <span className="flex-1" style={{ color: COLORS[r] }}>
                  {r}
                </span>
                <b style={{ color: COLORS[r] }}>{game.inventory[r] || 0}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {nW > 0 && (
        <div className="rounded-xl bg-orange-500/[0.06] border border-orange-500/20 p-3.5 mb-4">
          <h3 className="text-center font-semibold mb-2 text-orange-700 dark:text-orange-300">
            💰 Pending Payroll: Deducted at Phase 3
          </h3>
          <div className="text-xs space-y-0.5">
            {ww > 0 && (
              <div className="flex justify-between">
                <span>
                  👩‍🔧 {game.weavers.length}× Weaver @ {weaverCost}g
                </span>
                <b>{ww} Gold</b>
              </div>
            )}
            {mw > 0 && (
              <div className="flex justify-between">
                <span>
                  👩‍🎨 {game.masterWeavers.length}× Master @ {masterCost}g
                </span>
                <b>{mw} Gold</b>
              </div>
            )}
            {sw > 0 && (
              <div className="flex justify-between">
                <span>
                  🌸 {game.sachetMakers.length}× Maker @ {makerCost}g
                </span>
                <b>{sw} Gold</b>
              </div>
            )}
            <div className="flex justify-between border-t border-orange-500/20 pt-1 mt-1 font-bold">
              <span>💸 Total Wages Due</span>
              <span className="text-rose-600 dark:text-rose-400">
                {totalWages} Gold
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-amber-500/[0.05] border border-teal-500/15 p-4 mb-4">
        <h3 className="text-center font-semibold mb-2">🔨 Hire Workers</h3>
        <div className="text-xs space-y-1 mb-3">
          <div>
            <strong>
              👩‍🔧 <Term term="Weaver">Weaver</Term>
            </strong>
            : Linen Clothes(2 Hemp) or Cotton Clothes(2 Hemp+1 Silk),{" "}
            <span className="text-orange-600 dark:text-orange-400">
              {WAGES.weaver} Gold/round
            </span>
          </div>
          <div>
            <strong>
              👩‍🎨 <Term term="Master Weaver">Master Weaver</Term>
            </strong>
            : Linen, Cotton or Brocade(3 Silk),{" "}
            <span className="text-orange-600 dark:text-orange-400">
              {WAGES.master} Gold/round
            </span>
          </div>
          <div>
            <strong>
              🌸 <Term term="Sachet Maker">Sachet Maker</Term>
            </strong>
            : Sachet(1 Silk+2 Tea),{" "}
            <span className="text-orange-600 dark:text-orange-400">
              {WAGES.sachet_maker} Gold/round
            </span>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            size="sm"
            className="pm-grad-emerald text-white rounded-lg"
            onClick={() => act((g, l) => hireWorker(g, "weaver", l))}
          >
            👩‍🔧 Hire Weaver ({weaverCost}💰/round)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-lg"
            onClick={() => act((g, l) => hireWorker(g, "master", l))}
          >
            👩‍🎨 Hire Master ({masterCost}💰/round)
          </Button>
          <Button
            size="sm"
            className="pm-grad-amber text-white rounded-lg"
            onClick={() => act((g, l) => hireWorker(g, "sachet_maker", l))}
          >
            🌸 Hire Maker ({makerCost}💰/round)
          </Button>
        </div>
      </div>

      {game.weavers.length ||
      game.masterWeavers.length ||
      game.sachetMakers.length ? (
        <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-4 mb-4">
          <h3 className="text-center font-semibold mb-2">
            👥 Worker Status & Tasks
          </h3>
          <WorkerList
            type="weaver"
            list={game.weavers}
            name="Weaver"
            tasks={["Linen Clothes", "Cotton Clothes"]}
            act={act}
          />
          <WorkerList
            type="master"
            list={game.masterWeavers}
            name="Master"
            tasks={["Linen Clothes", "Cotton Clothes", "Brocade"]}
            act={act}
          />
          <WorkerList
            type="sachet_maker"
            list={game.sachetMakers}
            name="Maker"
            tasks={["Sachet"]}
            act={act}
          />
        </div>
      ) : null}

      <ReadyFooter
        phaseSync={phaseSync}
        members={members}
        idleLabel="✅ Complete Management, Set Sail"
        onConfirm={() => phaseSync.markReady((g, l) => startPhase2(g, ctx, l))}
      />
    </div>
  );
}

function WorkerList({
  type,
  list,
  name,
  tasks,
  act,
}: {
  type: string;
  list: Worker[];
  name: string;
  tasks: string[];
  act: (fn: (g: GameState, logs: string[]) => void) => void;
}) {
  if (!list.length) return null;
  const icon = type === "weaver" ? "👩‍🔧" : type === "master" ? "👩‍🎨" : "🌸";
  return (
    <div className="my-3">
      <div className="text-xs font-semibold text-teal-700 dark:text-teal-300">
        {icon} {name}s: {list.length}
      </div>
      {list.map((w, i) => (
        <div
          key={i}
          className="flex items-center justify-between bg-background/60 rounded-md px-3 py-1.5 my-1 text-xs border border-black/5 dark:border-white/10"
        >
          <span>
            {name} {i + 1}:{" "}
            {w.task
              ? `Working on: ${w.task}${w.isSkilled ? " (Skilled)" : ""}`
              : `Idle${w.isSkilled ? " ⭐ Skilled" : ""}`}
          </span>
          {!w.task && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 px-2 text-[10px] rounded"
              onClick={() => act((g, l) => fireWorker(g, type, i, l))}
            >
              Dismiss ({WAGES[type]}💰)
            </Button>
          )}
        </div>
      ))}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {tasks.map((t) => {
          const recipe = RECIPES[t];
          const mats = Object.entries(recipe.materials)
            .map(([m, a]) => `${ICONS[m]}${m}×${a}`)
            .join("+");
          return (
            <Button
              key={t}
              size="sm"
              variant="secondary"
              className="h-7 px-2.5 text-[10px] rounded"
              onClick={() => act((g, l) => assignTask(g, type, t, l))}
            >
              Make {t} (Need {mats})
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Orders ----------
function Orders({
  game,
  act,
  phaseSync,
  members,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  const [favorOpen, setFavorOpen] = useState(false);
  const [favorItem, setFavorItem] = useState<string | null>(null);
  const [favorQty, setFavorQty] = useState(1);
  const favorUnlocked = game.renownLevel >= BROKERS_FAVOR_UNLOCK_LEVEL;
  const sellableGoods = [...RESOURCES, ...PRODUCTS].filter(
    (it) => (game.inventory[it] || 0) > 0,
  );
  const favorHeld = favorItem ? game.inventory[favorItem] || 0 : 0;
  const closeFavor = () => {
    setFavorOpen(false);
    setFavorItem(null);
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Coins className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        Trade Manifest
      </h2>
      {game.revealedIntel.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 mb-3.5 text-xs">
          <strong>🗣️ Broker's Whispers active this round:</strong>{" "}
          {game.revealedIntel.map((i, idx) => (
            <span key={idx}>
              {idx > 0 && ", "}
              {ICONS[i.item] ?? ""} {i.item} ({i.port})
            </span>
          ))}
          <span className="text-muted-foreground">
            {" "}
            (look for the 🔮 badge below).
          </span>
        </div>
      )}
      {!favorUnlocked && (
        <div className="rounded-lg border border-dashed border-violet-500/25 bg-violet-500/[0.04] px-3.5 py-2.5 mb-3.5 text-xs text-muted-foreground">
          🔒 <strong className="text-foreground">Broker's Favor</strong> unlocks
          at Renown Level {BROKERS_FAVOR_UNLOCK_LEVEL}: call one in once per
          voyage to summon a guaranteed buyer for a good already in your hold.
          You're Renown Level {game.renownLevel} now,{" "}
          {BROKERS_FAVOR_UNLOCK_LEVEL - game.renownLevel} to go.
        </div>
      )}
      {favorUnlocked && !game.brokersFavorUsed && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-3.5 py-2.5 mb-3.5 text-xs">
          {!favorOpen ? (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span>
                <strong>🤝 Broker's Favor</strong> (once per voyage): summon a
                guaranteed buyer for as much of a good as you choose from your
                hold. The bigger the ask, the bigger the Broker's cut.
              </span>
              <Button
                size="sm"
                className="pm-grad-violet text-white font-semibold rounded-lg shrink-0 hover:opacity-95"
                onClick={() => setFavorOpen(true)}
              >
                Call in a Favor
              </Button>
            </div>
          ) : !favorItem ? (
            <div className="space-y-2">
              <div className="font-semibold">🤝 Which good needs a buyer?</div>
              {sellableGoods.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {sellableGoods.map((it) => (
                    <Button
                      key={it}
                      size="sm"
                      variant="secondary"
                      className="rounded-lg"
                      onClick={() => {
                        setFavorItem(it);
                        setFavorQty(game.inventory[it] || 1);
                      }}
                    >
                      {ICONS[it]} {it} ({game.inventory[it]})
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">
                  Your hold is empty, so there is nothing for the Broker to sell
                  right now.
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="rounded-lg"
                onClick={closeFavor}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="font-semibold">
                {ICONS[favorItem]} How much {favorItem} should the Broker sell?
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={favorHeld}
                  step={1}
                  value={favorQty}
                  onChange={(e) =>
                    setFavorQty(
                      Math.min(
                        favorHeld,
                        Math.max(1, parseInt(e.target.value, 10) || 1),
                      ),
                    )
                  }
                  className="w-20 h-9"
                />
                <span className="text-muted-foreground">
                  of {favorHeld} in your hold
                </span>
              </div>
              <p className="text-muted-foreground">
                A bigger ask pays out more, but the Broker's cut grows with it
                too, so a single favor can never swing the whole voyage.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="pm-grad-violet text-white font-semibold rounded-lg hover:opacity-95"
                  onClick={() => {
                    act((g, l) => callBrokersFavor(g, favorItem, favorQty, l));
                    closeFavor();
                  }}
                >
                  Call in the Favor
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-lg"
                  onClick={() => setFavorItem(null)}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {game.customerCards.map((o) => {
          const canComplete = o.resources.every(
            (r) => (game.inventory[r.type] || 0) >= r.required!,
          );
          const completed = game.completedOrders.includes(o.id);
          const hasSilk = o.resources.some((r) =>
            ["Silk", "Brocade", "Sachet", "Cotton Clothes"].includes(r.type),
          );
          const transport = calcTransportCost(game, o.totalItems, hasSilk);
          const transportBreakdown = explainTransportCost(
            game,
            o.totalItems,
            hasSilk,
          );
          let netProfit = o.reward - transport;
          let totalVat = 0;
          let vatBreakdown: PriceBreakdown | null = null;
          if (o.isProductOrder) {
            const product = o.resources[0].type;
            vatBreakdown = explainVAT(
              game,
              product,
              o.reward / o.resources[0].required!,
            );
            totalVat = vatBreakdown.final * o.resources[0].required!;
            netProfit -= totalVat;
          }
          const brokerCommission = o.isBrokerFavor
            ? brokersFavorCommission(o.reward)
            : 0;
          const brokerCommissionPct =
            o.reward > 0 ? Math.round((brokerCommission / o.reward) * 100) : 0;
          netProfit -= brokerCommission;
          const matchesIntel = game.revealedIntel.some((i) =>
            o.resources.some((r) => r.type === i.item),
          );
          return (
            <div
              key={o.id}
              className={cn(
                "rounded-xl border overflow-hidden flex flex-col",
                o.isMandate
                  ? "border-violet-500/45 bg-violet-500/[0.05]"
                  : o.isBrokerFavor
                    ? "border-emerald-500/45 bg-emerald-500/[0.05]"
                    : matchesIntel
                      ? "border-amber-500/40 bg-amber-500/[0.04]"
                      : "border-black/10 dark:border-white/10 bg-background/50",
              )}
            >
              <div className="px-3.5 py-2 text-xs font-semibold border-b border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] flex items-center justify-between gap-2">
                <span>
                  📍 {o.demandPort}{" "}
                  <span className="text-muted-foreground">
                    {o.isMandate
                      ? "· Imperial Commission"
                      : o.isProductOrder
                        ? "· Finished Product Demand"
                        : "· Raw Material Demand"}
                  </span>
                </span>
                {o.isMandate ? (
                  <span className="text-violet-600 dark:text-violet-400 shrink-0">
                    📜 Imperial Mandate
                  </span>
                ) : o.isBrokerFavor ? (
                  <span className="text-emerald-600 dark:text-emerald-400 shrink-0">
                    🤝 Broker's Favor
                  </span>
                ) : (
                  matchesIntel && (
                    <span className="text-amber-600 dark:text-amber-400 shrink-0">
                      🔮 Guaranteed
                    </span>
                  )
                )}
              </div>
              <div className="p-3.5 flex-1 space-y-1.5">
                {o.resources.map((r, i) => {
                  const has = (game.inventory[r.type] || 0) >= r.required!;
                  return (
                    <div key={i} className="flex items-center text-[12px]">
                      <span className="mr-1.5">{has ? "✅" : "❌"}</span>
                      <span className="mr-1.5 text-base">{ICONS[r.type]}</span>
                      <Term term={r.type}>
                        <span
                          className="font-medium"
                          style={{ color: COLORS[r.type] }}
                        >
                          {r.type}
                        </span>
                      </Term>
                      <span className="mx-1.5">×{r.required}</span>
                      <span
                        className="ml-auto text-[10px]"
                        style={{ color: has ? "#10b981" : "#f43f5e" }}
                      >
                        Inv: {game.inventory[r.type] || 0}
                      </span>
                    </div>
                  );
                })}
                <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5">
                  <Term
                    content={
                      <PriceBreakdownTooltip breakdown={transportBreakdown} />
                    }
                  >
                    ⚓ Freight: {transport} Gold
                  </Term>
                </div>
                <div
                  className={cn(
                    "text-[13px] font-semibold mt-0.5",
                    netProfit >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400",
                  )}
                >
                  💰 Reward: {o.reward} Gold 📊 Net: {netProfit} Gold
                </div>
                {o.isBrokerFavor && (
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-300">
                    🤝 Broker's cut ({brokerCommissionPct}%): {brokerCommission}{" "}
                    Gold
                  </div>
                )}
                {o.isProductOrder && vatBreakdown && (
                  <div className="text-[10px] text-muted-foreground">
                    <Term
                      content={
                        <PriceBreakdownTooltip breakdown={vatBreakdown} />
                      }
                    >
                      🧾 Est. VAT: {totalVat} Gold (per unit shown on hover)
                    </Term>
                  </div>
                )}
              </div>
              <div className="p-3 pt-0">
                <Button
                  className={cn(
                    "w-full rounded-lg",
                    canComplete && !completed
                      ? "pm-grad-primary text-white"
                      : "",
                  )}
                  variant={canComplete && !completed ? "default" : "secondary"}
                  disabled={!canComplete || completed}
                  onClick={() => act((g, l) => completeOrder(g, o.id, l))}
                >
                  {completed ? "✅ Completed" : `🤝 Trade (Net ${netProfit}💰)`}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <ReadyFooter
        phaseSync={phaseSync}
        members={members}
        idleLabel="✅ Complete Trades, Continue"
        onConfirm={() => phaseSync.markReady((g, l) => completePhase2(g, l))}
      />
    </div>
  );
}

// ---------- Settlement (pirates, then wages + maintenance) ----------
function Settlement({
  game,
  act,
  aid,
  myUserId,
  phaseSync,
  members,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  aid: Aid;
  myUserId: string;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  if (!game.pirateAttackResolved) return <PirateAttack game={game} act={act} />;
  return (
    <SettlementBills
      game={game}
      aid={aid}
      myUserId={myUserId}
      phaseSync={phaseSync}
      members={members}
    />
  );
}

function PirateAttack({
  game,
  act,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
}) {
  const escortCost = Math.floor(game.money * escortRateFor(game.difficulty));
  // Both the odds and the escort fee follow the room's tier, and a corrupt
  // broker's leak (see purchaseIntel) is folded into the number shown rather
  // than hidden, so what the captain reads is the real chance.
  const leak = game.brokerTippedPirates
    ? difficultyConfig(game.difficulty).brokerCorruptionRisk
    : 0;
  const raidPct = Math.round(
    Math.min(
      1,
      pirateChanceFor(game.difficulty, game.currentRound, game.maxRounds) +
        leak,
    ) * 100,
  );
  return (
    <div className="max-w-xl mx-auto text-center py-4">
      <div className="text-5xl mb-2">🏴‍☠️</div>
      <div className="text-2xl font-bold mb-1">Pirate Waters Ahead</div>
      <div className="mb-5 space-y-2">
        <p className="text-sm text-muted-foreground">
          Before this round's bills come due, your ship has to clear open water.
          There's a {raidPct}% chance pirates find you and take every coin in
          your hold. Hire an escort to sail through safely, or risk it and save
          the Gold.
        </p>
        {leak > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            🕵️ A corrupt broker leaked your position this round, so the odds
            above are already raised.
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
        <Button
          size="lg"
          className="pm-grad-primary text-white rounded-xl h-14"
          onClick={() => act((g, l) => hireEscort(g, l))}
        >
          <ShieldCheck className="h-5 w-5 mr-2" /> Hire Escort ({escortCost}{" "}
          Gold)
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="rounded-xl h-14"
          onClick={() => act((g, l) => resolvePirateAttack(g, l))}
        >
          <Skull className="h-5 w-5 mr-2" /> Set Sail Anyway
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Escort cost scales with your current Gold ({game.money}), so it's
        cheapest exactly when you have the least to lose.
      </p>
    </div>
  );
}

function SettlementBills({
  game,
  aid,
  myUserId,
  phaseSync,
  members,
}: {
  game: GameState;
  aid: Aid;
  myUserId: string;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  const ww = game.weavers.length * getHireCost(game, "weaver");
  const mw = game.masterWeavers.length * getHireCost(game, "master");
  const sw = game.sachetMakers.length * getHireCost(game, "sachet_maker");
  const wagesDue = ww + mw + sw;
  const maintCost = game.fixedCost + game.maintenancePenalty;
  const totalDue = wagesDue + maintCost;
  const canAfford = game.money >= totalDue;
  const balanceAfter = game.money - totalDue;
  const nWorkers =
    game.weavers.length + game.masterWeavers.length + game.sachetMakers.length;

  const myRequest = aid.requests.find((r) => r.fromUserId === myUserId);
  const otherRequests = aid.requests.filter((r) => r.fromUserId !== myUserId);
  const shortfall = Math.max(1, totalDue - game.money);
  const [requestAmount, setRequestAmount] = useState(shortfall);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-2xl font-bold text-center mb-4">
        🔧 Phase 3: Round Settlement
      </div>

      {game.pirateAttackResolved && (
        <div
          className={cn(
            "rounded-xl border p-3 my-3.5 text-center text-sm",
            game.escortHired
              ? "border-teal-500/20 bg-teal-500/[0.04]"
              : "border-black/10 dark:border-white/10 bg-background/40",
          )}
        >
          {game.escortHired
            ? "🛡️ Escort hired, you sailed through safely this round."
            : "🌊 You sailed without an escort this round."}
        </div>
      )}

      <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/20 p-3.5 my-3.5">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 mb-2">
          ⏳ Bills Due This Round
        </h3>
        <div className="flex justify-between text-[13px] py-0.5">
          <span>
            👥 Worker Wages ({nWorkers} worker{nWorkers !== 1 ? "s" : ""})
          </span>
          <span className="font-bold">{wagesDue} Gold</span>
        </div>
        <div className="flex justify-between text-sm py-0.5">
          <span>🔧 Ship Maintenance Fee</span>
          <span className="font-bold">{maintCost} Gold</span>
        </div>
        {game.maintenancePenalty > 0 && (
          <div className="text-[11px] text-muted-foreground pl-2.5">
            ↳ Base {game.fixedCost}g + Overdrive Engine penalty{" "}
            {game.maintenancePenalty}g
          </div>
        )}
        <div className="flex justify-between text-sm py-0.5 border-t border-orange-500/20 pt-1.5 mt-1.5 font-bold">
          <span>💸 Total Due</span>
          <span className="text-orange-600 dark:text-orange-400">
            {totalDue} Gold
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-teal-500/[0.04] border border-teal-500/15 p-3.5 my-3.5">
        <h3 className="font-semibold mb-2">💹 Balance Summary</h3>
        <div className="flex justify-between text-[13px] py-0.5">
          <span>Current Funds</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
            {game.money} Gold
          </span>
        </div>
        <div className="flex justify-between text-[13px] py-0.5">
          <span>After Settlement</span>
          <span
            className={cn(
              "font-bold",
              balanceAfter >= 0
                ? "text-teal-700 dark:text-teal-300"
                : "text-rose-600 dark:text-rose-400",
            )}
          >
            {balanceAfter} Gold
          </span>
        </div>
        <div className="flex justify-between text-[13px] py-0.5">
          <span>Round Revenue</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            +{game.roundRevenue} Gold
          </span>
        </div>
      </div>

      {!canAfford && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.04] p-3.5 my-3.5">
          <h3 className="font-semibold text-rose-700 dark:text-rose-300 mb-2 flex items-center gap-1.5">
            <HandCoins className="h-4 w-4" /> Short on Gold? Ask the Harbor for
            Help
          </h3>
          {myRequest ? (
            <div className="flex items-center justify-between text-sm bg-background/50 rounded-lg px-3 py-2">
              <span>
                🆘 Waiting for a captain to lend you{" "}
                <b>{myRequest.amount} Gold</b>…
              </span>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 px-2.5 text-[10px] rounded shrink-0"
                onClick={() => aid.cancel()}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Request</span>
              <Input
                type="number"
                min={1}
                step={1}
                value={requestAmount}
                onChange={(e) =>
                  setRequestAmount(
                    Math.max(1, parseInt(e.target.value, 10) || 1),
                  )
                }
                className="w-20 h-9"
              />
              <span className="text-muted-foreground">
                Gold from another captain
              </span>
              <Button
                size="sm"
                className="pm-grad-primary text-white rounded-lg"
                onClick={() => aid.post(requestAmount)}
              >
                🆘 Request Help
              </Button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">
            A loan transfers instantly if someone helps. Repay it any time
            before the voyage ends, or it's deducted automatically at Round 8
            and handed to them.
          </p>
        </div>
      )}

      {otherRequests.length > 0 && (
        <div className="rounded-xl border border-black/10 dark:border-white/10 bg-background/50 p-3.5 my-3.5">
          <h3 className="font-semibold mb-2 text-sm">
            🆘 Captains Asking for Help
          </h3>
          <div className="space-y-1.5">
            {otherRequests.map((r) => {
              const canHelp = game.money >= r.amount;
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs border border-black/5 dark:border-white/10 bg-background/60 gap-2"
                >
                  <span>
                    <b>{r.fromName}</b> needs{" "}
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">
                      {r.amount} Gold
                    </span>
                  </span>
                  <Button
                    size="sm"
                    className={cn(
                      "h-7 px-2.5 text-[10px] rounded shrink-0",
                      canHelp && "pm-grad-emerald text-white",
                    )}
                    variant={canHelp ? "default" : "secondary"}
                    disabled={!canHelp}
                    onClick={() => aid.help(r.id)}
                  >
                    🤝 Lend {r.amount} Gold
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {aid.error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/25 px-3.5 py-2 mb-3.5 text-xs text-rose-600 dark:text-rose-300 flex items-center justify-between">
          <span>⚠️ {aid.error}</span>
          <button onClick={aid.clearError}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <ReadyFooter
        phaseSync={phaseSync}
        members={members}
        idleLabel={
          canAfford
            ? `💸 Settle Bills: ${totalDue} Gold`
            : `⚠️ Force Pay (${game.money}/${totalDue} Gold)`
        }
        idleClassName="pm-grad-amber text-white h-12 px-8"
        onConfirm={() => phaseSync.markReady((g, l) => finishSettlement(g, l))}
      />
    </div>
  );
}

// ---------- Shipyard ----------
function Shipyard({
  game,
  act,
  phaseSync,
  members,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  const canUpgrade = game.shipLevel < 3;
  const upgCost = canUpgrade
    ? game.shipUpgradeCost[game.shipLevel] + game.shipUpgradePenalty
    : 0;
  const affordable = game.money >= upgCost;
  const canDraft = game.shipLevel > 0;
  const slotsFull =
    game.equippedModules.length >= game.shipLevel && game.shipLevel > 0;
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-2xl font-bold text-center mb-4">
        🚢 Shipyard & Module Rigging
      </div>
      <div className="rounded-xl border-2 border-teal-500/20 bg-teal-500/[0.04] p-5 my-4">
        <div className="text-base font-bold text-teal-700 dark:text-teal-300">
          🚢 Ship Level: {game.shipLevel} | ⚓ Discount: {game.shipLevel * 5}{" "}
          Gold
        </div>
        <div className="text-sm text-teal-600 dark:text-teal-400 mt-1.5">
          🔌 Module Slots: {game.equippedModules.length} / {game.shipLevel}
        </div>
        {game.equippedModules.length ? (
          <div className="mt-3 space-y-1">
            {game.equippedModules.map((m) => (
              <div key={m.id} className="text-xs">
                {m.icon}{" "}
                <strong>
                  <Term term={m.name}>{m.name}</Term>
                </strong>
                : {m.desc}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground mt-2">
            No modules installed. Upgrade ship to unlock slots!
          </div>
        )}
      </div>
      {phaseSync.waiting ? (
        <div className="text-center space-y-3">
          <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
            ⏳ Waiting for the rest of the crew…
          </div>
          <ReadyBar
            ready={phaseSync.ready}
            members={members}
            className="justify-center"
          />
          <Button
            variant="secondary"
            className="rounded-xl"
            onClick={phaseSync.cancelReady}
          >
            ↩️ Not ready yet
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {canUpgrade && (
            <Button
              size="lg"
              variant={affordable ? "default" : "secondary"}
              className={cn(
                "rounded-xl",
                affordable && "pm-grad-primary text-white",
              )}
              disabled={!affordable}
              onClick={() => act((g, l) => upgradeShip(g, l))}
            >
              ⚓ Upgrade Ship (Lvl {game.shipLevel + 1}), Cost {upgCost} Gold |
              +1 Slot, +5 Discount
            </Button>
          )}
          <Button
            size="lg"
            variant={canDraft ? "default" : "secondary"}
            className={cn(
              "rounded-xl",
              canDraft && "pm-grad-gold text-amber-950",
            )}
            disabled={!canDraft}
            onClick={() =>
              act((g) => {
                startModuleDrafting(g);
              })
            }
          >
            {slotsFull
              ? "🔄 Draft & Swap Module (Slots Full)"
              : "🔧 Draft & Install Module"}
          </Button>
          <Button
            size="lg"
            className="pm-grad-emerald text-white rounded-xl"
            onClick={() => phaseSync.markReady((g, l) => skipUpgrade(g, l))}
          >
            ⏭️ Continue Voyage
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- Module Draft ----------
function ModuleDraft({
  game,
  act,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
}) {
  const picks = game._draftChoices ?? [];
  const canSwap = !game.moduleSwapUsed && picks.length > 0;
  return (
    <div className="max-w-4xl mx-auto text-center">
      <div className="text-2xl font-bold mb-1">🔧 Module Drafting</div>
      <p className="text-sm text-muted-foreground mb-4">
        Choose a module to install or swap.
      </p>
      {picks.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-8">
          You've already drafted your module choices for this voyage. New
          options arrive next voyage.
        </div>
      ) : (
        <>
          <div className="flex justify-center mb-4">
            <Button
              size="sm"
              variant="secondary"
              className="rounded-lg"
              disabled={!canSwap}
              onClick={() => act((g, l) => swapModuleChoices(g, l))}
            >
              {game.moduleSwapUsed
                ? "✅ Choices Swapped This Voyage"
                : "🎲 Swap Choices (1 use/voyage)"}
            </Button>
          </div>
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.06 } },
            }}
          >
            {picks.map((m, i) => (
              <motion.div
                key={m.id}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.22, ease: "easeOut" },
                  },
                }}
                whileHover={{ y: -6 }}
                className="pm-glass rounded-2xl p-5 flex flex-col items-center text-center border border-teal-500/20"
              >
                <div className="text-5xl mb-2">{m.icon}</div>
                <div className="font-semibold mb-2">
                  <Term term={m.name}>{m.name}</Term>
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">
                  {m.desc}
                </div>
                <Button
                  className="pm-grad-gold text-amber-950 font-semibold rounded-xl w-full"
                  onClick={() => act((g, l) => handleModuleSelect(g, i, l))}
                >
                  {game.equippedModules.length < game.shipLevel
                    ? "✅ Install"
                    : "🔄 Swap"}
                </Button>
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
      <div className="mt-5">
        <Button
          variant="secondary"
          className="rounded-xl"
          onClick={() =>
            act((g, _l) => {
              g.phase = 4;
            })
          }
        >
          ⬅️ Back to Shipyard
        </Button>
      </div>
    </div>
  );
}

// ---------- Module Swap ----------
function ModuleSwap({
  game,
  act,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
}) {
  const newMod = game._newModule;
  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="text-2xl font-bold mb-1 text-rose-600 dark:text-rose-400">
        🔄 Select Module to Replace
      </div>
      {newMod && (
        <p className="text-sm text-muted-foreground mb-4">
          New: {newMod.icon} {newMod.name}: {newMod.desc}
        </p>
      )}
      <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-4 my-4 space-y-2 text-left">
        {game.equippedModules.map((m, i) => (
          <div
            key={m.id}
            className="flex justify-between items-center bg-background/60 rounded-md p-2.5 border border-black/5 dark:border-white/10"
          >
            <div>
              <strong>
                {m.icon} <Term term={m.name}>{m.name}</Term>
              </strong>
              <div className="text-[11px] text-muted-foreground">{m.desc}</div>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="rounded-lg"
              onClick={() => act((g, l) => finalizeModuleSwap(g, i, l))}
            >
              🗑️ Replace
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="secondary"
        className="rounded-xl"
        onClick={() =>
          act((g, _l) => {
            g.phase = "module_draft";
          })
        }
      >
        ⬅️ Back to Draft
      </Button>
    </div>
  );
}

// ---------- Bankruptcy ----------
function Bankruptcy({ game }: { game: GameState }) {
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
          <div className="space-y-1">
            {game.loansGiven.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">
                  Owed by{" "}
                  <b className="text-foreground/90">{l.counterpartyName}</b>
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {l.amount}g
                </span>
              </div>
            ))}
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

// ---------- Endgame ----------
function Endgame({
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

export function GamePhasePanel({
  game,
  ctx,
  act,
  members,
  myUserId,
  isHost,
  phaseSync,
  barter,
  aid,
  voyageResult,
  myLegacy,
  onRestart,
  onShowRumors,
  onShowTutorial,
}: Props) {
  return (
    <div className="pm-glass rounded-2xl p-4 sm:p-5 min-h-[520px]">
      <AnimatePresence mode="sync">
        <motion.div
          key={String(game.phase) + ":" + game.currentRound}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1.0] }}
        >
          {renderPhase()}
        </motion.div>
      </AnimatePresence>
    </div>
  );

  function renderPhase() {
    const p = game.phase;
    if (p === 0)
      return (
        <Welcome
          phaseSync={phaseSync}
          members={members}
          isHost={isHost}
          onShowTutorial={onShowTutorial}
        />
      );
    if (p === 5)
      return (
        <BoonDraft
          game={game}
          ctx={ctx}
          act={act}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === 1)
      return (
        <Purchase
          game={game}
          act={act}
          phaseSync={phaseSync}
          members={members}
          onShowRumors={onShowRumors}
        />
      );
    if (p === "barter")
      return (
        <BarterPhase
          game={game}
          act={act}
          barter={barter}
          myUserId={myUserId}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === "worker_mgmt")
      return (
        <WorkerMgmt
          game={game}
          ctx={ctx}
          act={act}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === 2)
      return (
        <Orders game={game} act={act} phaseSync={phaseSync} members={members} />
      );
    if (p === 3)
      return (
        <Settlement
          game={game}
          act={act}
          aid={aid}
          myUserId={myUserId}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === 4)
      return (
        <Shipyard
          game={game}
          act={act}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === "bankruptcy") return <Bankruptcy game={game} />;
    if (p === "endgame")
      return (
        <Endgame
          game={game}
          isHost={isHost}
          onRestart={onRestart}
          voyageResult={voyageResult}
          myLegacy={myLegacy}
          myUserId={myUserId}
        />
      );
    if (p === "module_draft") return <ModuleDraft game={game} act={act} />;
    if (p === "module_swap") return <ModuleSwap game={game} act={act} />;
    return null;
  }
}

function InfoCard({
  tone,
  title,
  rows,
}: {
  tone: "emerald" | "amber" | "sea" | "rose";
  title: string;
  rows: string[];
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-500/[0.06] border-emerald-500/20",
    amber: "bg-amber-500/[0.06] border-amber-500/20",
    sea: "bg-teal-500/[0.06] border-teal-500/20",
    rose: "bg-rose-500/[0.06] border-rose-500/20",
  };
  return (
    <div className={cn("rounded-lg border p-3", tones[tone])}>
      <div className="font-semibold text-sm mb-1">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="text-xs">
          {r}
        </div>
      ))}
    </div>
  );
}
