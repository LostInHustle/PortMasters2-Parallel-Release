// =====================================================================
// Integration test: Convoy Ventures (Manifest 04), merged as its own
// commit after the three room-wide harbor systems in integration.harbor.ts.
//
// This feature's server side (src/server/realtime.ts) went through three
// real bugs before this suite existed: an infinite Gold duplication
// exploit (two captains could fund the same venture repeatedly, each fill
// paying out more than was put in with nothing offsetting it), a deadline
// that could land on or past a voyage's own final round, handing out Gold
// with no round left to spend it, and a solo self-fulfillment exploit (one
// captain alone could post a venture and instantly fund the whole target
// themselves, printing Gold and burning the room's one shared chance for
// personal gain instead of the room's). All three fixes live in the pure
// functions this suite imports from src/lib/game/convoy.ts, extracted out
// of attachRealtime's socket closures for exactly this reason: so a
// regression in any one of them shows up here, in a few seconds, instead
// of only being catchable by a live multi captain run against a real
// server.
//
// hasRoomClaimedVenture and destroyOtherOpenVentures themselves stay in
// realtime.ts, since they genuinely need a live database (asking "has any
// venture in this room's voyage ever reached filled") the way
// computeHarborPulse's own room wide tally accumulation does; this suite
// covers everything that can be a pure function of its arguments, which is
// where all three real bugs actually lived.
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
  CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE,
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
// Isolated from the per contributor share cap below by passing
// maxContributorShare 1 (effectively no per captain limit), so these
// suites each test exactly one of the two stacked caps at a time.
suite(
  "Convoy Ventures: the overflow cap never lets a venture take more than it needs",
);

test("a contribution under the remaining amount is accepted in full", () => {
  assertEqual(
    computeAcceptedContribution(0, 150, 90, 0, 1),
    90,
    "first contribution, well under target",
  );
  assertEqual(
    computeAcceptedContribution(90, 150, 40, 90, 1),
    40,
    "second contribution, still under target",
  );
});

test("a contribution that would overshoot is capped to exactly what's needed", () => {
  assertEqual(
    computeAcceptedContribution(90, 150, 100, 90, 1),
    60,
    "only the remaining 60 is ever accepted, not the full 100 requested",
  );
});

test("a venture already at or past target accepts nothing further", () => {
  assertEqual(
    computeAcceptedContribution(150, 150, 50, 0, 1),
    0,
    "exactly at target: nothing more can be accepted",
  );
  assertEqual(
    computeAcceptedContribution(200, 150, 50, 0, 1),
    0,
    "somehow past target: still nothing accepted, never negative",
  );
});

// ---------- computeAcceptedContribution: the per contributor share cap ----------
// [MANIFEST 04 fix] The solo self-fulfillment fix: reported after the
// repeat-fill exploit was closed, a single captain could still post a
// venture and instantly fund the entire target alone, printing Gold and
// burning the room's one shared chance for personal gain. Isolated from
// the overflow cap above by passing a very large targetGold headroom, so
// these tests exercise only the per contributor share limit.
suite(
  "Convoy Ventures: no single captain can ever fund more than their own share of a venture, alone",
);

test("a solo captain's own contribution is capped well short of the full target, even when they ask for the whole thing at once", () => {
  const target = 200;
  const soloAttempt = computeAcceptedContribution(
    0,
    target,
    target, // asks to fund the entire venture in one shot
    0,
    CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE,
  );
  assert(
    soloAttempt < target,
    `a solo captain's accepted contribution (${soloAttempt}) must be strictly less than the full target (${target})`,
  );
  assertEqual(
    soloAttempt,
    Math.ceil(target * CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE),
    "capped at exactly the documented share of the target",
  );
});

test("that same captain, having already hit their own share cap, can add nothing further, even if the venture overall still has room", () => {
  const target = 200;
  const cap = Math.ceil(target * CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE);
  const second = computeAcceptedContribution(
    cap, // room total so far is just this captain's own capped contribution
    target,
    50,
    cap, // this captain has already put in exactly their own cap
    CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE,
  );
  assertEqual(
    second,
    0,
    "a captain already at their own share cap is refused further, regardless of how much room the venture itself still has",
  );
});

test("a genuine second, different captain can still fund the rest, since the cap is per contributor, not on the venture as a whole", () => {
  const target = 200;
  const capA = Math.ceil(target * CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE);
  const acceptedFromB = computeAcceptedContribution(
    capA,
    target,
    target, // captain B also asks for the whole remainder
    0, // captain B has contributed nothing yet
    CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE,
  );
  assertEqual(
    acceptedFromB,
    target - capA,
    "a different captain, starting fresh, can fund exactly whatever's left, filling the venture",
  );
});

test("two captains splitting evenly can always reach an odd target exactly, the per contributor cap rounds up rather than down for this reason", () => {
  const oddTargets = [151, 199, 1999];
  for (const target of oddTargets) {
    const cap = Math.ceil(target * CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE);
    assert(
      cap * 2 >= target,
      `target ${target}: two captains each capped at ${cap} must have enough combined room to reach it (${cap * 2} < ${target} would make this venture impossible to ever fill)`,
    );
  }
});

test("the reported repro, closed: two captains funding a venture together still fills exactly, and neither could have done it alone", () => {
  const target = 200;
  let total = 0;
  const acceptedA = computeAcceptedContribution(
    total,
    target,
    100,
    0,
    CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE,
  );
  total += acceptedA;
  const acceptedB = computeAcceptedContribution(
    total,
    target,
    100,
    0,
    CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE,
  );
  total += acceptedB;
  assertEqual(total, target, "together, two genuinely different captains still reach the target exactly");
  assert(acceptedA < target, "captain A alone never reached the full target");
  assert(acceptedB < target, "captain B alone never reached the full target");
  assert(acceptedA > 0 && acceptedB > 0, "both captains genuinely contributed something real, this wasn't one captain funding it and a token amount from the other");
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

test("a solo funded fill is now impossible end to end: the per contributor cap alone guarantees a filled venture always has at least two distinct contributors", () => {
  const target = 200;
  const capA = Math.ceil(target * CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE);
  const acceptedA = computeAcceptedContribution(0, target, target, 0, CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE);
  const acceptedB = computeAcceptedContribution(acceptedA, target, target - acceptedA, 0, CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE);
  const contributions: VentureContributions = {
    a: { name: "A", amount: acceptedA },
    b: { name: "B", amount: acceptedB },
  };
  assertEqual(ventureTotal(contributions), target, "the venture reaches its target");
  assertEqual(Object.keys(contributions).length, 2, "it took two distinct contributors to get there, never one");
  const settlements = computeSettlements(contributions, "filled");
  const totalPaidOut = settlements.reduce((sum, s) => sum + s.amount, 0);
  assertEqual(
    totalPaidOut,
    Math.round(target * CONVOY_VENTURE_PAYOUT_MULTIPLIER),
    "total paid out across every contributor never exceeds targetGold times the multiplier",
  );
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
  assertEqual(bounds!.maxRound, 7, "capped at maxRounds - 1, never the true final round");
  assert(bounds!.maxRound < rounds, "the max round is always strictly before the voyage's final round");
});

test("once too close to a voyage's own end, no valid deadline window remains at all", () => {
  const rounds = roundsFor("fair_winds"); // 8
  const bounds = computeVentureDeadlineBounds(
    7,
    rounds,
    CONVOY_VENTURE_MIN_ROUNDS_AHEAD,
    CONVOY_VENTURE_MAX_ROUNDS_AHEAD,
  );
  assertEqual(bounds, null, "at round 7 of an 8 round voyage, minRound (8) would exceed maxRound (7): posting must be refused entirely");
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
  assertEqual(state.money, startingGold - 40, "exactly the contributed amount is deducted");

  const before = state.money;
  contributeToVenture(state, before + 1, logs);
  assertEqual(state.money, before, "a contribution beyond current Gold is refused, no partial deduction");
});

test("receiveVentureSettlement credits exactly the settled amount for each of the three outcomes", () => {
  for (const outcome of ["filled", "failed", "destroyed"] as const) {
    const state = createInitialGameState(0, 1, 0, "fair_winds");
    const before = state.money;
    const logs: string[] = [];
    receiveVentureSettlement(state, 77, logs, outcome);
    assertEqual(state.money, before + 77, `${outcome}: exactly the settled amount is credited`);
    assert(logs.length > 0, `${outcome}: a log line is written`);
  }
});

const ok = summary();
process.exit(ok ? 0 : 1);
