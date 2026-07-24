// =====================================================================
// Integration test: Backing (Manifest 05), merged as its own commit right
// after the Convoy Ventures suite.
//
// The one piece of real math this feature adds is computeBackingResolution
// in src/lib/game/backing.ts: given a loan's original amount, whatever the
// borrower actually managed to pay directly, and whatever a backer
// pledged, decide how much of that pledge is actually called on to cover
// the lender's shortfall, and how much comes back untouched. This suite
// covers that function directly, the three engine side Gold effects it
// feeds (pledgeBacking, receiveBackingOutcome, receiveBackedCoverage), and
// a sanity check that the Reputation bonus really is half the ordinary
// lending rate, as documented.
//
// Run with: npx tsx scripts/tests/integration.backing.ts
// =====================================================================
import { suite, test, assert, assertEqual, summary } from "./harness";
import { computeBackingResolution } from "../../src/lib/game/backing";
import {
  AID_REPUTATION_PER_GOLD,
  BACKING_REPUTATION_PER_GOLD,
} from "../../src/lib/game/constants";
import {
  pledgeBacking,
  receiveBackedCoverage,
  receiveBackingOutcome,
} from "../../src/lib/game/engine";
import { createInitialGameState } from "../../src/lib/game/types";

// ---------- computeBackingResolution ----------
suite(
  "Backing: computeBackingResolution decides exactly how much of a pledge is called on",
);

test("a loan repaid in full never calls on the backer at all", () => {
  const { calledAmount, refundAmount } = computeBackingResolution(100, 100, 40);
  assertEqual(calledAmount, 0, "nothing called on when there's no shortfall");
  assertEqual(refundAmount, 40, "the entire pledge comes back");
});

test("a shortfall smaller than the pledge is covered in full, with the rest refunded", () => {
  const { calledAmount, refundAmount } = computeBackingResolution(100, 70, 40);
  assertEqual(calledAmount, 30, "exactly the 30 Gold shortfall is called on");
  assertEqual(
    refundAmount,
    10,
    "the untouched remainder of the pledge comes back",
  );
});

test("a shortfall larger than the pledge only ever calls on the pledge itself, never more", () => {
  const { calledAmount, refundAmount } = computeBackingResolution(100, 20, 40);
  assertEqual(
    calledAmount,
    40,
    "capped at the full pledge, even though the shortfall (80) is larger",
  );
  assertEqual(refundAmount, 0, "nothing left to refund");
});

test("a shortfall exactly equal to the pledge calls on all of it and refunds nothing", () => {
  const { calledAmount, refundAmount } = computeBackingResolution(100, 60, 40);
  assertEqual(calledAmount, 40, "the full pledge is called on");
  assertEqual(refundAmount, 0, "nothing left over");
});

test("an overpayment (more than the loan's own amount) is treated the same as full repayment, never a negative shortfall", () => {
  const { calledAmount, refundAmount } = computeBackingResolution(100, 150, 40);
  assertEqual(calledAmount, 0, "no shortfall, however much extra was paid");
  assertEqual(refundAmount, 40, "the entire pledge comes back");
});

// ---------- Engine side: the Gold effects ----------
suite("Backing: the engine functions apply Gold exactly as resolved");

test("pledgeBacking escrows the exact amount, and refuses a pledge the captain can't afford", () => {
  const state = createInitialGameState(0, 1, 0, "fair_winds");
  const startingGold = state.money;
  const logs: string[] = [];
  pledgeBacking(state, 30, logs);
  assertEqual(
    state.money,
    startingGold - 30,
    "exactly the pledged amount is deducted",
  );

  const before = state.money;
  pledgeBacking(state, before + 1, logs);
  assertEqual(
    state.money,
    before,
    "a pledge beyond current Gold is refused, no partial deduction",
  );
});

test("receiveBackingOutcome refunds in full and grants a Reputation bonus only when nothing was called on", () => {
  const state = createInitialGameState(0, 1, 0, "fair_winds");
  const before = state.money;
  const beforeScore = state.score;
  const logs: string[] = [];
  receiveBackingOutcome(state, 40, 0, logs);
  assertEqual(state.money, before + 40, "the full pledge is credited back");
  assert(
    state.score > beforeScore,
    "a Reputation bonus is granted when the backing was never called on",
  );
  assertEqual(
    state.score - beforeScore,
    Math.max(1, Math.floor(40 * BACKING_REPUTATION_PER_GOLD)),
    "the bonus matches BACKING_REPUTATION_PER_GOLD exactly",
  );
});

test("receiveBackingOutcome credits only the refund, and grants no Reputation, when the backing was called on", () => {
  const state = createInitialGameState(0, 1, 0, "fair_winds");
  const before = state.money;
  const beforeScore = state.score;
  const logs: string[] = [];
  receiveBackingOutcome(state, 10, 30, logs);
  assertEqual(
    state.money,
    before + 10,
    "only the untouched remainder of the pledge is credited back",
  );
  assertEqual(
    state.score,
    beforeScore,
    "no Reputation bonus when the backing genuinely had to cover a shortfall",
  );
});

test("receiveBackedCoverage credits the lender exactly the amount the backer covered", () => {
  const state = createInitialGameState(0, 1, 0, "fair_winds");
  const before = state.money;
  const logs: string[] = [];
  receiveBackedCoverage(state, 25, "Backer B", "Borrower C", logs);
  assertEqual(
    state.money,
    before + 25,
    "exactly the covered amount is credited",
  );
  assert(logs.length > 0, "a log line is written");
});

// ---------- Constant sanity ----------
suite("Backing: the Reputation bonus is documented correctly");

test("BACKING_REPUTATION_PER_GOLD is exactly half AID_REPUTATION_PER_GOLD", () => {
  assertEqual(
    BACKING_REPUTATION_PER_GOLD,
    AID_REPUTATION_PER_GOLD / 2,
    "backing is a supporting role, earning half the lender's own rate per Gold",
  );
});

const ok = summary();
process.exit(ok ? 0 : 1);
