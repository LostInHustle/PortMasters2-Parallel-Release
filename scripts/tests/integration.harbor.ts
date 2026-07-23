// =====================================================================
// Integration test: the three room-wide harbor systems merged via PR #12
// — The Harbor Pulse, Word on the Docks, and Tidewatch Alerts — driven
// through the real phase-transition functions the way a live voyage
// actually calls them, rather than one function tested in isolation (see
// unit.game.ts for that level of coverage).
//
// A key simplification this file leans on: startPhase1's market and intel
// rng are seeded purely from (ctx.seedBase, voyageEpoch, currentRound) —
// see the "[ONLINE] Deterministic port market per (room, round)" comment on
// startPhase1 in engine.ts — so a freshly created state with currentRound
// set directly reproduces bit-for-bit the same Phase 1 a state that
// actually played every prior round would see. That makes the Harbor Pulse
// and Tidewatch card-count tests below exact and reproducible without
// simulating whole voyages; only the Word on the Docks suite, which depends
// on genuinely completing orders round over round, drives a real multi-round
// loop (boon draft and pirate rolls are unseeded there too, so that suite
// is written as a statistical invariant check across several trials, the
// same style the "fair_winds identity guarantees" suite in
// integration.voyage.ts already uses for unseeded RNG).
//
// Run with: npx tsx scripts/tests/integration.harbor.ts
// =====================================================================
import { suite, test, assert, assertEqual, summary } from "./harness";
import type { Difficulty } from "../../src/lib/game/difficulty";
import { roundsFor, marketCountsFor } from "../../src/lib/game/difficulty";
import { computeHarborPulse, PULSE_CAP } from "../../src/lib/game/harborPulse";
import {
  selectBoon,
  startPhase1,
  purchaseCard,
  getCardFinalCost,
  completePhase1,
  completeBarterPhase,
  startPhase2,
  completeOrder,
  completePhase2,
  hireEscort,
  finishSettlement,
  skipUpgrade,
  startBoonDrafting,
  tallyPurchasesByResource,
  applyHarborPulse,
} from "../../src/lib/game/engine";
import {
  createInitialGameState,
  type GameContext,
  type GameState,
  type ResourceCard,
} from "../../src/lib/game/types";
import { WORD_ON_THE_DOCKS_THRESHOLD } from "../../src/lib/game/constants";

const ctx: GameContext = { seedBase: "integration:harbor:room1:captain1" };

function stateAtRound(difficulty: Difficulty, round: number): GameState {
  const s = createInitialGameState(0, 1, 0, difficulty);
  s.currentRound = round;
  return s;
}

function rawEntries(card: ResourceCard) {
  return card.isProductCard ? [] : card.resources;
}

// ---------- The Harbor Pulse ----------
suite("Harbor Pulse: price nudge is item-surgical and direction-correct");

test("a positive Hemp pulse never lowers Hemp's price and never touches any other item's price, across every round of a Fair Winds voyage", () => {
  let hempIncreaseSeen = false;
  for (let round = 1; round <= roundsFor("fair_winds"); round++) {
    const base = stateAtRound("fair_winds", round);
    const pulsed = stateAtRound("fair_winds", round);
    pulsed.harborPulse = { Hemp: PULSE_CAP };
    startPhase1(base, ctx, []);
    startPhase1(pulsed, ctx, []);

    assertEqual(
      pulsed.resourceCards.length,
      base.resourceCards.length,
      `round ${round}: pulse never changes how many cards are offered`,
    );
    for (let i = 0; i < base.resourceCards.length; i++) {
      const baseResources = rawEntries(base.resourceCards[i]);
      const pulsedResources = rawEntries(pulsed.resourceCards[i]);
      assertEqual(
        pulsedResources.length,
        baseResources.length,
        `round ${round} card ${i}: same item selection regardless of pulse`,
      );
      for (let j = 0; j < baseResources.length; j++) {
        const b = baseResources[j];
        const p = pulsedResources[j];
        assertEqual(
          p.type,
          b.type,
          `round ${round} card ${i}.${j}: same item drawn`,
        );
        assertEqual(
          p.quantity,
          b.quantity,
          `round ${round} card ${i}.${j}: same quantity drawn`,
        );
        if (b.type === "Hemp") {
          assert(
            p.price! >= b.price!,
            `round ${round} card ${i}.${j}: Hemp priced ${p.price} under baseline ${b.price} with a positive pulse in play`,
          );
          if (p.price! > b.price!) hempIncreaseSeen = true;
        } else {
          assertEqual(
            p.price,
            b.price,
            `round ${round} card ${i}.${j}: ${b.type} price moved even though only Hemp was pulsed`,
          );
        }
      }
    }
  }
  assert(
    hempIncreaseSeen,
    "sanity check: across a full voyage the pulse should visibly raise at least one Hemp price, or this test is vacuous",
  );
});

test("a negative Tea pulse never raises Tea's price, across every round of a Fair Winds voyage", () => {
  let teaDecreaseSeen = false;
  for (let round = 1; round <= roundsFor("fair_winds"); round++) {
    const base = stateAtRound("fair_winds", round);
    const pulsed = stateAtRound("fair_winds", round);
    pulsed.harborPulse = { Tea: -PULSE_CAP };
    startPhase1(base, ctx, []);
    startPhase1(pulsed, ctx, []);

    for (let i = 0; i < base.resourceCards.length; i++) {
      const baseResources = rawEntries(base.resourceCards[i]);
      const pulsedResources = rawEntries(pulsed.resourceCards[i]);
      for (let j = 0; j < baseResources.length; j++) {
        const b = baseResources[j];
        const p = pulsedResources[j];
        if (b.type === "Tea") {
          assert(
            p.price! <= b.price!,
            `round ${round} card ${i}.${j}: Tea priced ${p.price} over baseline ${b.price} with a negative pulse in play`,
          );
          if (p.price! < b.price!) teaDecreaseSeen = true;
        }
      }
    }
  }
  assert(
    teaDecreaseSeen,
    "sanity check: the negative pulse should visibly lower at least one Tea price",
  );
});

suite(
  "Harbor Pulse: end-to-end pipeline (buy -> tally -> aggregate -> apply -> reprice)",
);

test("what a captain buys in round 1 shapes round 2's prices through the exact same formula the server runs", () => {
  const round1 = stateAtRound("fair_winds", 1);
  startPhase1(round1, ctx, []);
  // An eager captain who buys the entire board — the simplest way to
  // guarantee a non-empty, non-trivial tally to feed into the pipeline.
  round1.purchasedCards = round1.resourceCards.map((c) => c.id);
  const tally = tallyPurchasesByResource(round1);
  assert(
    Object.keys(tally).length > 0,
    "round 1 produced a non-empty purchase tally",
  );

  // This is the exact function src/server/realtime.ts calls (computeHarborPulse,
  // now shared from src/lib/game/harborPulse.ts) — not a re-implementation of
  // its formula, so this test breaks if the two ever drift apart.
  const pulse = computeHarborPulse(tally);

  const round2Base = stateAtRound("fair_winds", 2);
  startPhase1(round2Base, ctx, []);

  const round2Pulsed = stateAtRound("fair_winds", 2);
  applyHarborPulse(round2Pulsed, pulse);
  startPhase1(round2Pulsed, ctx, []);

  let sawADirectedNudge = false;
  for (let i = 0; i < round2Base.resourceCards.length; i++) {
    const baseResources = rawEntries(round2Base.resourceCards[i]);
    const pulsedResources = rawEntries(round2Pulsed.resourceCards[i]);
    for (let j = 0; j < baseResources.length; j++) {
      const b = baseResources[j];
      const p = pulsedResources[j];
      const nudge = pulse[b.type];
      if (!nudge) {
        assertEqual(
          p.price,
          b.price,
          `round 2 card ${i}.${j}: ${b.type} has no pulse entry, price must be untouched`,
        );
        continue;
      }
      if (nudge > 0)
        assert(
          p.price! >= b.price!,
          `round 2 card ${i}.${j}: ${b.type} should not have dropped under a positive pulse`,
        );
      if (nudge < 0)
        assert(
          p.price! <= b.price!,
          `round 2 card ${i}.${j}: ${b.type} should not have risen under a negative pulse`,
        );
      if (p.price !== b.price) sawADirectedNudge = true;
    }
  }
  assert(
    sawADirectedNudge,
    "the round 1 purchase pattern should visibly move at least one round 2 price",
  );
});

// ---------- Tidewatch Alerts ----------
suite(
  "Tidewatch Alerts: the +1 cargo lot applies on top of the tier's own schedule",
);

test("tidewatchSurge adds exactly one extra purchase card, every round, on every difficulty", () => {
  const cases: { difficulty: Difficulty; round: number }[] = [
    { difficulty: "fair_winds", round: 1 },
    { difficulty: "fair_winds", round: 8 },
    { difficulty: "open_waters", round: 1 },
    { difficulty: "open_waters", round: 8 }, // the round its own charter widens the board
    { difficulty: "monsoon", round: 11 }, // the round its own charter widens the board
  ];
  for (const { difficulty, round } of cases) {
    const base = stateAtRound(difficulty, round);
    const surged = stateAtRound(difficulty, round);
    surged.tidewatchSurge = true;
    startPhase1(base, ctx, []);
    startPhase1(surged, ctx, []);
    const tierCount = marketCountsFor(difficulty, round).purchase;
    assertEqual(
      base.resourceCards.length,
      tierCount,
      `${difficulty} round ${round}: baseline matches the tier's own schedule`,
    );
    assertEqual(
      surged.resourceCards.length,
      tierCount + 1,
      `${difficulty} round ${round}: surge adds exactly +1 on top of the tier's own count`,
    );
  }
});

test("tidewatchSurge never touches voyage length or difficulty identity", () => {
  const base = stateAtRound("open_waters", 5);
  const surged = stateAtRound("open_waters", 5);
  surged.tidewatchSurge = true;
  startPhase1(base, ctx, []);
  startPhase1(surged, ctx, []);
  assertEqual(
    surged.maxRounds,
    base.maxRounds,
    "maxRounds unaffected by the surge flag",
  );
  assertEqual(
    surged.difficulty,
    base.difficulty,
    "difficulty unaffected by the surge flag",
  );
});

// ---------- Word on the Docks ----------
// Unlike the two suites above, a real multi-round voyage is unavoidable here
// — the threshold is about genuinely completed trade orders, which depends
// on what the (unseeded) boon draft and order board hand a captain. Written
// as invariant checks across several independent trials rather than exact
// per-round assertions, the same statistical style integration.voyage.ts
// already uses for unseeded RNG.
suite(
  "Word on the Docks: threshold signal stays consistent across real voyages",
);

type DocksTrialResult = {
  finalTotal: number;
  claimTotalWhenFirstSet: number | undefined;
  claimEverResetOrChangedAfterFirstSet: boolean;
};

function playSafeRound(
  state: GameState,
  ctxIn: GameContext,
): "ok" | "bankrupt" | "endgame" {
  const logs: string[] = [];
  const choice = state.boonChoices[0];
  if (!choice) return "bankrupt"; // defensive; never expected mid-voyage
  selectBoon(state, ctxIn, choice.id, logs); // -> phase 1

  const RESERVE = state.fixedCost + state.maintenancePenalty + 50;
  for (const card of state.resourceCards) {
    const cost = getCardFinalCost(state, card);
    if (state.money - cost >= RESERVE) purchaseCard(state, card.id, logs);
  }
  completePhase1(state, logs); // -> barter
  completeBarterPhase(state, [], logs); // -> worker_mgmt

  startPhase2(state, ctxIn, logs); // -> phase 2
  for (const o of state.customerCards) {
    const canFulfill = o.resources.every(
      (r) => (state.inventory[r.type] ?? 0) >= (r.required ?? 0),
    );
    if (canFulfill) completeOrder(state, o.id, logs);
  }
  completePhase2(state, logs); // -> phase 3

  hireEscort(state, logs); // "safe" strategy: always escort
  finishSettlement(state, logs); // may set phase "bankruptcy"
  if (state.phase === "bankruptcy") return "bankrupt";

  skipUpgrade(state, logs); // -> endRound
  return state.phase === "endgame" ? "endgame" : "ok";
}

function runDocksTrial(seedSuffix: number): DocksTrialResult {
  const trialCtx: GameContext = {
    seedBase: `integration:harbor:docks-trial:${seedSuffix}`,
  };
  const state = createInitialGameState(0, 1, 0, "fair_winds");
  startBoonDrafting(state, []);

  let claimTotalWhenFirstSet: number | undefined;
  let claimEverResetOrChangedAfterFirstSet = false;
  const maxIterations = roundsFor("fair_winds") + 2;
  for (let i = 0; i < maxIterations; i++) {
    const outcome = playSafeRound(state, trialCtx);
    if (state._pendingDocksClaim) {
      if (claimTotalWhenFirstSet === undefined) {
        claimTotalWhenFirstSet = state._pendingDocksClaim.total;
      } else if (state._pendingDocksClaim.total !== claimTotalWhenFirstSet) {
        claimEverResetOrChangedAfterFirstSet = true;
      }
    }
    if (outcome === "bankrupt" || outcome === "endgame") break;
  }
  return {
    finalTotal: state.totalOrdersCompleted,
    claimTotalWhenFirstSet,
    claimEverResetOrChangedAfterFirstSet,
  };
}

test("across independent trials, a claim (when it fires) always fires at exactly the documented threshold, and never changes afterward", () => {
  const trials = 25;
  let trialsThatCrossedThreshold = 0;
  for (let i = 0; i < trials; i++) {
    const r = runDocksTrial(i);
    assert(
      !r.claimEverResetOrChangedAfterFirstSet,
      `trial ${i}: _pendingDocksClaim changed value after first being set — it must be a one-shot signal`,
    );
    if (r.claimTotalWhenFirstSet !== undefined) {
      trialsThatCrossedThreshold++;
      assertEqual(
        r.claimTotalWhenFirstSet,
        WORD_ON_THE_DOCKS_THRESHOLD,
        `trial ${i}: claim fired at total ${r.claimTotalWhenFirstSet}, expected exactly ${WORD_ON_THE_DOCKS_THRESHOLD}`,
      );
    }
    if (r.finalTotal >= WORD_ON_THE_DOCKS_THRESHOLD) {
      assert(
        r.claimTotalWhenFirstSet !== undefined,
        `trial ${i}: totalOrdersCompleted reached ${r.finalTotal} (>= threshold) but the claim signal never fired`,
      );
    }
  }
  // A "safe" captain reliably completes at least 3 orders over an 8-round Fair
  // Winds voyage; if this ever drops near zero it means the trade board or
  // this strategy stopped generating fulfillable orders, which would make
  // every assertion above vacuously true instead of actually exercising the
  // threshold crossing.
  assert(
    trialsThatCrossedThreshold >= trials * 0.5,
    `only ${trialsThatCrossedThreshold}/${trials} trials ever crossed the Word on the Docks threshold — suite may be vacuous`,
  );
});

const ok = summary();
process.exit(ok ? 0 : 1);
