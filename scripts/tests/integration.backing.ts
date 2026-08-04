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
  helperReputationCapFor,
} from "../../src/lib/game/constants";
import {
  grantLoan,
  pledgeBacking,
  receiveBackedCoverage,
  receiveBackingOutcome,
  receiveLoan,
  repayLoan,
  settleOutstandingDebts,
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

// ---------- Forced settlement reporting ----------
// The bug these cover: computeBackingResolution was always correct, but for a
// total default nothing ever called it. settleOutstandingDebts only recorded a
// settlement when the borrower paid something, and that record is the one
// signal that closes the loan on the server's ledger and resolves the pledge
// (see aid:repay in src/server/realtime.ts). A borrower reaching the final
// round with no Gold therefore stranded the loan open forever: the backer's
// escrowed Gold was neither returned nor called, and the lender never received
// the coverage that pledge existed for, in exactly the case Backing is for.
suite("Backing: a forced settlement is always reported, even at zero Gold");

function debtState(money: number, owed: number) {
  const state = createInitialGameState(0, 1, 0, "fair_winds");
  state.money = money;
  state.debts = [
    {
      id: "debt-1",
      counterpartyId: "lender-1",
      counterpartyName: "Lender L",
      amount: owed,
      roundBorrowed: 1,
    },
  ];
  return state;
}

test("a borrower holding no Gold at all still reports the debt as settled", () => {
  const state = debtState(0, 60);
  const logs: string[] = [];
  settleOutstandingDebts(state, logs);
  const pending = state._pendingDebtSettlements ?? [];
  assertEqual(pending.length, 1, "the closure is reported despite paying 0");
  assertEqual(pending[0].amount, 0, "reported amount is exactly 0");
  assertEqual(pending[0].debtId, "debt-1", "the debt it closes is identified");
  assert(
    state.defaultedDebt,
    "the borrower is still marked as having defaulted",
  );
  assertEqual(state.debts.length, 0, "the debt is cleared from the borrower");
});

test("that zero report is what lets the whole pledge be called on", () => {
  const state = debtState(0, 60);
  settleOutstandingDebts(state, []);
  const reported = (state._pendingDebtSettlements ?? [])[0];
  const { calledAmount, refundAmount } = computeBackingResolution(
    60,
    reported.amount,
    20,
  );
  assertEqual(calledAmount, 20, "the backer's entire pledge covers the gap");
  assertEqual(refundAmount, 0, "nothing comes back to the backer");
});

test("a partial payment reports the partial amount, not the full debt", () => {
  const state = debtState(25, 60);
  settleOutstandingDebts(state, []);
  const reported = (state._pendingDebtSettlements ?? [])[0];
  assertEqual(reported.amount, 25, "only what the borrower could pay");
  assertEqual(state.money, 0, "every Gold the borrower had went to the lender");
});

test("a borrower who can cover the debt reports it in full and does not default", () => {
  const state = debtState(100, 60);
  settleOutstandingDebts(state, []);
  const reported = (state._pendingDebtSettlements ?? [])[0];
  assertEqual(reported.amount, 60, "the whole debt is repaid");
  assert(!state.defaultedDebt, "no default is recorded");
  const { calledAmount, refundAmount } = computeBackingResolution(
    60,
    reported.amount,
    20,
  );
  assertEqual(calledAmount, 0, "the pledge is never called on");
  assertEqual(refundAmount, 20, "the pledge comes back whole");
});

// ---------- The helper Reputation ceiling ----------
// The exploit this closes needed no tampering at all: two captains agree in
// chat, one requests a large loan, the other grants it and banks a fifth of
// it as Reputation, and the Gold goes straight back. aid:post accepts any
// whole number, so the pair could repeat that indefinitely. Lending and
// backing share one ceiling, since two separate ones would only move the
// exploit to whichever was not capped.
suite("Helping other captains earns Reputation, but only up to a ceiling");

function lender(gold: number) {
  const s = createInitialGameState(0, 1, 0, "fair_winds");
  s.money = gold;
  return s;
}

test("an ordinary loan still pays the documented rate", () => {
  const s = lender(1000);
  const before = s.score;
  grantLoan(
    s,
    { id: "d1", borrowerId: "b", borrowerName: "B", amount: 100 },
    [],
  );
  assertEqual(
    s.score - before,
    Math.floor(100 * AID_REPUTATION_PER_GOLD),
    "twenty percent of the loan, exactly as before",
  );
});

test("one enormous loan cannot earn more than the voyage's whole ceiling", () => {
  const s = lender(1_000_000);
  const before = s.score;
  grantLoan(
    s,
    { id: "d1", borrowerId: "b", borrowerName: "B", amount: 1_000_000 },
    [],
  );
  assertEqual(
    s.score - before,
    helperReputationCapFor("fair_winds"),
    "a million Gold loan earns the ceiling and not a point more",
  );
});

test("splitting one loan into many earns exactly the same as one large one", () => {
  const s = lender(1_000_000);
  const before = s.score;
  for (let i = 0; i < 40; i++) {
    grantLoan(
      s,
      { id: `d${i}`, borrowerId: "b", borrowerName: "B", amount: 500 },
      [],
    );
  }
  assertEqual(
    s.score - before,
    helperReputationCapFor("fair_winds"),
    "forty loans and one loan reach the same ceiling, which is what closes the farm",
  );
});

test("backing draws on the same ceiling as lending, not a second one", () => {
  const s = lender(1_000_000);
  const before = s.score;
  grantLoan(
    s,
    { id: "d1", borrowerId: "b", borrowerName: "B", amount: 1_000_000 },
    [],
  );
  receiveBackingOutcome(s, 1_000_000, 0, []);
  assertEqual(
    s.score - before,
    helperReputationCapFor("fair_winds"),
    "the ceiling is shared, so backing cannot top up an exhausted allowance",
  );
});

test("the ceiling scales with the tier's own voyage length", () => {
  const fair = helperReputationCapFor("fair_winds");
  const open = helperReputationCapFor("open_waters");
  const monsoon = helperReputationCapFor("monsoon");
  assert(fair < open && open < monsoon, "a longer voyage allows more helping");
  assertEqual(fair, 96, "eight rounds");
  assertEqual(open, 120, "twelve rounds");
  assertEqual(monsoon, 144, "sixteen rounds");
});

test("an unknown tier still returns a usable ceiling rather than nothing", () => {
  assert(
    helperReputationCapFor("not_a_tier") > 0,
    "difficultyConfig falls back to the default tier, so the cap never lands at zero",
  );
});

test("three sizeable bailouts pay in full on every tier", () => {
  const s = lender(2000);
  const before = s.score;
  for (const id of ["d1", "d2", "d3"]) {
    grantLoan(s, { id, borrowerId: "b", borrowerName: "B", amount: 150 }, []);
  }
  assertEqual(
    s.score - before,
    90,
    "450 Gold of genuine lending is paid in full, under even the shortest tier's ceiling",
  );
});

test("a long voyage allows more helping than a short one, at the same loans", () => {
  const long = createInitialGameState(0, 1, 0, "monsoon");
  long.money = 1_000_000;
  const shortV = createInitialGameState(0, 1, 0, "fair_winds");
  shortV.money = 1_000_000;
  for (const st of [long, shortV]) {
    for (let i = 0; i < 60; i++) {
      grantLoan(
        st,
        { id: `d${i}`, borrowerId: "b", borrowerName: "B", amount: 500 },
        [],
      );
    }
  }
  assertEqual(
    long.helperReputationEarned,
    helperReputationCapFor("monsoon"),
    "sixteen rounds reach the monsoon ceiling",
  );
  assertEqual(
    shortV.helperReputationEarned,
    helperReputationCapFor("fair_winds"),
    "eight rounds stop at the shorter one",
  );
  assert(
    long.helperReputationEarned > shortV.helperReputationEarned,
    "which is the whole point of deriving it from the tier",
  );
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

// ---------- Voluntary repayment ----------
// repayLoan is the borrower paying a debt back early, by choice, rather
// than having it seized at the end of the voyage by settleOutstandingDebts
// (covered further up). It had no coverage of its own despite being the
// only path that clears a debt while the captain is still sailing.
suite("Loans: a borrower repaying voluntarily, before the forced settlement");

function borrowerOwing(amount: number) {
  const state = createInitialGameState();
  const logs: string[] = [];
  receiveLoan(
    state,
    { id: "loan-1", fromUserId: "lender-1", fromName: "Lender", amount },
    logs,
  );
  return state;
}

test("receiving a loan credits the Gold and records the debt", () => {
  const state = borrowerOwing(60);
  assertEqual(state.money, 160, "the borrowed Gold should land in the purse");
  assertEqual(state.debts.length, 1, "and the debt should be recorded");
  assertEqual(state.debts[0].amount, 60, "for the amount borrowed");
});

test("repaying clears the debt and takes exactly what was owed", () => {
  const state = borrowerOwing(60);
  const logs: string[] = [];
  repayLoan(state, "loan-1", logs);
  assertEqual(state.money, 100, "the borrowed Gold should go back out again");
  assertEqual(state.debts.length, 0, "and the debt should be cleared");
});

test("a borrower who cannot cover the debt keeps both the Gold and the debt", () => {
  const state = borrowerOwing(60);
  const logs: string[] = [];
  state.money = 59;

  repayLoan(state, "loan-1", logs);
  assertEqual(state.money, 59, "an unaffordable repayment must take nothing");
  assertEqual(
    state.debts.length,
    1,
    "and must leave the debt outstanding rather than quietly forgiving it",
  );
});

test("repaying an unknown debt id does nothing at all", () => {
  const state = borrowerOwing(60);
  const logs: string[] = [];
  const before = state.money;

  repayLoan(state, "no-such-loan", logs);
  assertEqual(before, state.money, "no Gold should move for an unknown debt");
  assertEqual(state.debts.length, 1, "and the real debt should survive");
});

test("repaying one debt leaves any others outstanding", () => {
  const state = borrowerOwing(60);
  const logs: string[] = [];
  receiveLoan(
    state,
    { id: "loan-2", fromUserId: "lender-2", fromName: "Other", amount: 25 },
    logs,
  );
  assertEqual(state.debts.length, 2, "setup: two debts outstanding");

  repayLoan(state, "loan-1", logs);
  assertEqual(state.debts.length, 1, "only the repaid debt should clear");
  assertEqual(
    state.debts[0].id,
    "loan-2",
    "and it should be the right one that remains",
  );
});

const ok = summary();
process.exit(ok ? 0 : 1);
