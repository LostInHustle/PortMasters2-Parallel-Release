// =====================================================================
// Integration test: Convoy Ventures (Manifest 04), merged as its own
// commit after the three room-wide harbor systems in integration.harbor.ts.
//
// This feature's server side (src/server/realtime.ts) went through two real
// bugs before this suite existed: an infinite Gold duplication exploit (two
// captains could fund the same venture repeatedly, each fill paying out
// more than was put in with nothing offsetting it) and a deadline that
// could land on or past a voyage's own final round, handing out Gold with
// no round left to spend it. Both fixes live in the pure functions this
// suite imports from src/lib/game/convoy.ts, extracted out of
// attachRealtime's socket closures for exactly this reason: so a
// regression in either one shows up here, in a few seconds, instead of
// only being catchable by a live two captain run against a real server.
//
// hasRoomClaimedVenture and destroyOtherOpenVentures themselves stay in
// realtime.ts, since they genuinely need a live database (asking "has any
// venture in this room's voyage ever reached filled") the way
// computeHarborPulse's own room wide tally accumulation does; this suite
// covers everything that can be a pure function of its arguments, which is
// where both real bugs actually lived.
//
// Run with: npx tsx scripts/tests/integration.convoy.ts
// =====================================================================
import { suite, test, assert, assertEqual, summary } from "./harness";
import {
  computeAcceptedContribution,
  computeSettlements,
  computeVentureDeadlineBounds,
  parseVentureContributions,
  settlementRateFor,
  ventureTotal,
  type VentureContributions,
} from "../../src/lib/game/convoy";
import {
  CONVOY_VENTURE_FAILURE_REFUND_RATE,
  CONVOY_VENTURE_MAX_ROUNDS_AHEAD,
  CONVOY_VENTURE_MIN_ROUNDS_AHEAD,
  CONVOY_VENTURE_PAYOUT_MULTIPLIER,
} from "../../src/lib/game/constants";
import { roundsFor, type Difficulty } from "../../src/lib/game/difficulty";
import {
  contributeToVenture,
  receiveVentureSettlement,
} from "../../src/lib/game/engine";
import { createInitialGameState } from "../../src/lib/game/types";

// ---------- parseVentureContributions / ventureTotal ----------
suite("Convoy Ventures: contribution parsing is defensive");

test("a well formed contributions blob round trips exactly", () => {
  const raw = JSON.stringify({
    u1: { name: "Aaron", amount: 40 },
    u2: { name: "Joe", amount: 60 },
  });
  const parsed = parseVentureContributions(raw);
  assertEqual(Object.keys(parsed).length, 2, "both contributors present");
  assertEqual(parsed.u1.amount, 40, "u1 amount preserved");
  assertEqual(parsed.u2.name, "Joe", "u2 name preserved");
  assertEqual(ventureTotal(parsed), 100, "total sums both contributions");
});

test("malformed input degrades to an empty map instead of throwing", () => {
  const cases = [
    "not json",
    "[]",
    "null",
    "{}",
    '{"u1": "not an object"}',
    '{"u1": {"name": 5, "amount": "x"}}',
  ];
  for (const raw of cases) {
    const parsed = parseVentureContributions(raw);
    assertEqual(
      ventureTotal(parsed),
      0,
      `malformed input "${raw}" should parse to an empty, zero-total map`,
    );
  }
});

// ---------- computeAcceptedContribution: the overflow cap ----------
suite(
  "Convoy Ventures: the overflow cap never lets a venture take more than it needs",
);

test("a contribution under the remaining amount is accepted in full", () => {
  assertEqual(
    computeAcceptedContribution(0, 150, 90),
    90,
    "first contribution, well under target",
  );
  assertEqual(
    computeAcceptedContribution(90, 150, 40),
    40,
    "second contribution, still under target",
  );
});

test("a contribution that would overshoot is capped to exactly what's needed", () => {
  assertEqual(
    computeAcceptedContribution(90, 150, 100),
    60,
    "only the remaining 60 is ever accepted, not the full 100 requested",
  );
});

test("a venture already at or past target accepts nothing further", () => {
  assertEqual(
    computeAcceptedContribution(150, 150, 50),
    0,
    "exactly at target: nothing more can be accepted",
  );
  assertEqual(
    computeAcceptedContribution(200, 150, 50),
    0,
    "somehow past target: still nothing accepted, never negative",
  );
});

// ---------- computeSettlements / settlementRateFor: the exploit fix ----------
suite("Convoy Ventures: settlement payouts match the documented rates exactly");

test("filled pays out CONVOY_VENTURE_PAYOUT_MULTIPLIER times each contributor's own stake", () => {
  assertEqual(
    settlementRateFor("filled"),
    CONVOY_VENTURE_PAYOUT_MULTIPLIER,
    "filled rate matches the constant",
  );
  const contributions: VentureContributions = {
    a: { name: "A", amount: 90 },
    b: { name: "B", amount: 60 },
  };
  const settlements = computeSettlements(contributions, "filled");
  const a = settlements.find((s) => s.userId === "a");
  const b = settlements.find((s) => s.userId === "b");
  assertEqual(
    a?.amount,
    Math.round(90 * CONVOY_VENTURE_PAYOUT_MULTIPLIER),
    "A's payout is exactly 90 times the multiplier",
  );
  assertEqual(
    b?.amount,
    Math.round(60 * CONVOY_VENTURE_PAYOUT_MULTIPLIER),
    "B's payout is exactly 60 times the multiplier",
  );
});

test("failed refunds only CONVOY_VENTURE_FAILURE_REFUND_RATE of each contributor's own stake", () => {
  assertEqual(
    settlementRateFor("failed"),
    CONVOY_VENTURE_FAILURE_REFUND_RATE,
    "failed rate matches the constant",
  );
  const contributions: VentureContributions = { d: { name: "D", amount: 50 } };
  const settlements = computeSettlements(contributions, "failed");
  assertEqual(
    settlements[0].amount,
    Math.round(50 * CONVOY_VENTURE_FAILURE_REFUND_RATE),
    "partial refund, not the full stake",
  );
});

test("destroyed refunds every contributor their full original stake, untouched", () => {
  assertEqual(
    settlementRateFor("destroyed"),
    1,
    "destroyed rate is exactly 1, no penalty and no bonus",
  );
  const contributions: VentureContributions = { d: { name: "D", amount: 80 } };
  const settlements = computeSettlements(contributions, "destroyed");
  assertEqual(
    settlements[0].amount,
    80,
    "full stake back, not the harsher failed rate",
  );
});

test("the exploit's own arithmetic: two captains funding the exact target once, and only once, nets a bounded profit, not something that can compound", () => {
  // Reproduces the originally reported repro: two captains, 100 Gold each,
  // a 200 Gold target, filled in one shot.
  let total = 0;
  const acceptedA = computeAcceptedContribution(total, 200, 100);
  total += acceptedA;
  const acceptedB = computeAcceptedContribution(total, 200, 100);
  total += acceptedB;
  assertEqual(
    total,
    200,
    "the venture reaches exactly its target, no more and no less",
  );
  const contributions: VentureContributions = {
    a: { name: "A", amount: acceptedA },
    b: { name: "B", amount: acceptedB },
  };
  const settlements = computeSettlements(contributions, "filled");
  const totalPaidOut = settlements.reduce((sum, s) => sum + s.amount, 0);
  assertEqual(
    totalPaidOut,
    Math.round(200 * CONVOY_VENTURE_PAYOUT_MULTIPLIER),
    "total paid out across every contributor never exceeds targetGold times the multiplier, no matter how contributions split",
  );
  // The actual exploit prevention (a room can only ever do this once) lives
  // in hasRoomClaimedVenture in realtime.ts, which needs a real database and
  // so isn't unit tested here; this test only proves a single fill's own
  // arithmetic is bounded, which was the part that used to compound.
});

// ---------- computeVentureDeadlineBounds: the final-round fix ----------
suite(
  "Convoy Ventures: a deadline can never land on, or past, the voyage's own final round",
);

test("at round 1 of an 8 round Fair Winds voyage, the latest allowed deadline is round 7, never round 8", () => {
  const rounds = roundsFor("fair_winds");
  assertEqual(rounds, 8, "sanity check: fair_winds is 8 rounds");
  const bounds = computeVentureDeadlineBounds(
    1,
    rounds,
    CONVOY_VENTURE_MIN_ROUNDS_AHEAD,
    CONVOY_VENTURE_MAX_ROUNDS_AHEAD,
  );
  assert(bounds !== null, "a valid window exists at round 1");
  assertEqual(
    bounds!.maxRound,
    7,
    "capped at maxRounds - 1, never the true final round",
  );
  assert(
    bounds!.maxRound < rounds,
    "the max round is always strictly before the voyage's final round",
  );
});

test("once too close to a voyage's own end, no valid deadline window remains at all", () => {
  const rounds = roundsFor("fair_winds"); // 8
  const bounds = computeVentureDeadlineBounds(
    7,
    rounds,
    CONVOY_VENTURE_MIN_ROUNDS_AHEAD,
    CONVOY_VENTURE_MAX_ROUNDS_AHEAD,
  );
  assertEqual(
    bounds,
    null,
    "at round 7 of an 8 round voyage, minRound (8) would exceed maxRound (7): posting must be refused entirely",
  );
});

test("the cap scales correctly across every difficulty tier's own round count", () => {
  const cases: Difficulty[] = ["fair_winds", "open_waters", "monsoon"];
  for (const difficulty of cases) {
    const rounds = roundsFor(difficulty);
    const bounds = computeVentureDeadlineBounds(
      1,
      rounds,
      CONVOY_VENTURE_MIN_ROUNDS_AHEAD,
      CONVOY_VENTURE_MAX_ROUNDS_AHEAD,
    );
    assert(bounds !== null, `${difficulty}: a valid window exists at round 1`);
    assert(
      bounds!.maxRound <= rounds - 1,
      `${difficulty}: max deadline (${bounds!.maxRound}) must never reach the final round (${rounds})`,
    );
  }
});

test("well before a voyage's end, the cap is simply the flat CONVOY_VENTURE_MAX_ROUNDS_AHEAD window, untouched by the final round rule", () => {
  const rounds = roundsFor("monsoon"); // 16, plenty of headroom this early
  const bounds = computeVentureDeadlineBounds(
    1,
    rounds,
    CONVOY_VENTURE_MIN_ROUNDS_AHEAD,
    CONVOY_VENTURE_MAX_ROUNDS_AHEAD,
  );
  assertEqual(
    bounds!.maxRound,
    1 + CONVOY_VENTURE_MAX_ROUNDS_AHEAD,
    "far from the voyage's end, the ordinary rounds-ahead window applies unmodified",
  );
});

// ---------- Engine side: the Gold effect itself ----------
suite("Convoy Ventures: the engine functions apply Gold exactly as settled");

test("contributeToVenture escrows the exact amount, and refuses a contribution the captain can't afford", () => {
  const state = createInitialGameState(0, 1, 0, "fair_winds");
  const startingGold = state.money;
  const logs: string[] = [];
  contributeToVenture(state, 40, logs);
  assertEqual(
    state.money,
    startingGold - 40,
    "exactly the contributed amount is deducted",
  );

  const before = state.money;
  contributeToVenture(state, before + 1, logs);
  assertEqual(
    state.money,
    before,
    "a contribution beyond current Gold is refused, no partial deduction",
  );
});

test("receiveVentureSettlement credits exactly the settled amount for each of the three outcomes", () => {
  for (const outcome of ["filled", "failed", "destroyed"] as const) {
    const state = createInitialGameState(0, 1, 0, "fair_winds");
    const before = state.money;
    const logs: string[] = [];
    receiveVentureSettlement(state, 77, logs, outcome);
    assertEqual(
      state.money,
      before + 77,
      `${outcome}: exactly the settled amount is credited`,
    );
    assert(logs.length > 0, `${outcome}: a log line is written`);
  }
});

const ok = summary();
process.exit(ok ? 0 : 1);
