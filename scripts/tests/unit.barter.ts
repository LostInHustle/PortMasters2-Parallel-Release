// =====================================================================
// Unit tests for the bartering primitives in src/lib/game/engine.ts.
//
// Why this file exists: bartering was the single largest hole in the test
// suite. The integration suites only ever call
// `completeBarterPhase(state, [], logs)` with an empty refund list, which
// walks past the entire mechanic without touching posting, accepting,
// settling, or refunding. Every one of those four primitives moves Gold
// and cargo between captains, and none of them had a single assertion.
//
// The invariant that matters most here is conservation. A barter is the
// one place in the game where goods cross between two captains' states,
// so a bug in the escrow accounting either duplicates goods out of thin
// air or destroys them. The paired posting/accepting tests below check
// both sides of a completed trade against each other, not just each side
// in isolation, because a symmetric error (both sides crediting) is
// exactly what a per-side test would miss.
//
// Run with: npx tsx scripts/tests/unit.barter.ts
// =====================================================================
import { suite, test, assert, assertEqual, summary } from "./harness";
import {
  createInitialGameState,
  type GameState,
} from "../../src/lib/game/types";
import {
  postBarterOffer,
  refundBarterOffer,
  acceptBarterOffer,
  settleBarterTrade,
  completeBarterPhase,
  getOwnedAmount,
} from "../../src/lib/game/engine";

// A captain mid voyage, holding the founding stock (Hemp 8, Silk 5, Tea 3)
// and the Fair Winds starting purse.
function captain(): GameState {
  const g = createInitialGameState();
  g.phase = "barter";
  return g;
}

suite("postBarterOffer :: the four constraints");

test("refuses to barter an item for itself, and changes nothing", () => {
  const g = captain();
  const logs: string[] = [];
  const before = g.inventory.Hemp;
  const ok = postBarterOffer(g, "Hemp", 2, "Hemp", 3, logs);
  assertEqual(ok, false, "an item-for-itself offer must be rejected");
  assertEqual(
    g.inventory.Hemp,
    before,
    "a rejected offer must not escrow anything",
  );
});

test("refuses fractional amounts on either side", () => {
  const g = captain();
  const logs: string[] = [];
  assertEqual(
    postBarterOffer(g, "Hemp", 1.5, "Silk", 1, logs),
    false,
    "a fractional offer amount must be rejected",
  );
  assertEqual(
    postBarterOffer(g, "Hemp", 1, "Silk", 2.5, logs),
    false,
    "a fractional request amount must be rejected",
  );
  assertEqual(g.inventory.Hemp, 8, "neither rejection may escrow anything");
});

test("refuses zero and negative amounts, so an offer can never mint goods", () => {
  const g = captain();
  const logs: string[] = [];
  assertEqual(
    postBarterOffer(g, "Hemp", 0, "Silk", 1, logs),
    false,
    "a zero offer must be rejected",
  );
  // The important one: a negative offer amount would run
  // addOwnedAmount(state, item, -negative), i.e. credit the poster.
  assertEqual(
    postBarterOffer(g, "Hemp", -5, "Silk", 1, logs),
    false,
    "a negative offer amount must be rejected",
  );
  assertEqual(
    postBarterOffer(g, "Hemp", 1, "Silk", -5, logs),
    false,
    "a negative request amount must be rejected",
  );
  assertEqual(
    g.inventory.Hemp,
    8,
    "no rejected offer may have moved the poster's stock",
  );
});

test("refuses to offer more than the captain actually holds", () => {
  const g = captain();
  const logs: string[] = [];
  const ok = postBarterOffer(g, "Hemp", 9, "Silk", 1, logs);
  assertEqual(ok, false, "offering 9 Hemp while holding 8 must be rejected");
  assertEqual(g.inventory.Hemp, 8, "a rejected offer must not escrow anything");
});

suite("postBarterOffer :: escrow");

test("a successful offer escrows the offered goods immediately", () => {
  const g = captain();
  const logs: string[] = [];
  const ok = postBarterOffer(g, "Hemp", 3, "Silk", 1, logs);
  assertEqual(ok, true, "a valid offer should be accepted");
  assertEqual(
    g.inventory.Hemp,
    5,
    "the offered goods should leave the hold the moment the offer is posted",
  );
});

test("escrow blocks double-spending the same goods across two offers", () => {
  // This is the reason posting escrows up front rather than at accept
  // time. Without it a captain could post all 8 Hemp twice and have both
  // offers accepted.
  const g = captain();
  const logs: string[] = [];
  assertEqual(
    postBarterOffer(g, "Hemp", 8, "Silk", 1, logs),
    true,
    "the first offer for the full stock should succeed",
  );
  assertEqual(
    postBarterOffer(g, "Hemp", 8, "Tea", 1, logs),
    false,
    "a second offer for the same already-escrowed stock must be rejected",
  );
  assertEqual(g.inventory.Hemp, 0, "only the first offer's stock is escrowed");
});

test("Gold is barterable and escrows out of the purse, not the hold", () => {
  const g = captain();
  const logs: string[] = [];
  const ok = postBarterOffer(g, "Gold", 40, "Silk", 2, logs);
  assertEqual(ok, true, "Gold should be a valid offer item");
  assertEqual(g.money, 60, "offered Gold should leave the purse immediately");
  assertEqual(
    getOwnedAmount(g, "Gold"),
    60,
    "getOwnedAmount should read Gold from the purse, not the inventory map",
  );
});

test("a captain cannot offer more Gold than they hold", () => {
  const g = captain();
  const logs: string[] = [];
  assertEqual(
    postBarterOffer(g, "Gold", 101, "Silk", 1, logs),
    false,
    "offering 101 Gold while holding 100 must be rejected",
  );
  assertEqual(g.money, 100, "a rejected Gold offer must not move the purse");
});

suite("refundBarterOffer");

test("a refund returns exactly what was escrowed, leaving the hold whole", () => {
  const g = captain();
  const logs: string[] = [];
  postBarterOffer(g, "Hemp", 3, "Silk", 1, logs);
  refundBarterOffer(g, "Hemp", 3, logs);
  assertEqual(
    g.inventory.Hemp,
    8,
    "post then refund should be a round trip back to the starting stock",
  );
});

test("a Gold refund returns to the purse", () => {
  const g = captain();
  const logs: string[] = [];
  postBarterOffer(g, "Gold", 25, "Tea", 1, logs);
  refundBarterOffer(g, "Gold", 25, logs);
  assertEqual(g.money, 100, "post then refund should restore the full purse");
});

suite("acceptBarterOffer");

test("refuses when the accepting captain cannot pay the requested item", () => {
  const g = captain();
  const logs: string[] = [];
  const ok = acceptBarterOffer(g, "Tea", 4, "Hemp", 2, logs);
  assertEqual(ok, false, "paying 4 Tea while holding 3 must be rejected");
  assertEqual(g.inventory.Tea, 3, "a rejected accept must not spend anything");
  assertEqual(
    g.inventory.Hemp,
    8,
    "a rejected accept must not credit the offered goods either",
  );
});

test("a successful accept pays the request and receives the offer", () => {
  const g = captain();
  const logs: string[] = [];
  const ok = acceptBarterOffer(g, "Tea", 2, "Hemp", 5, logs);
  assertEqual(ok, true, "a payable accept should succeed");
  assertEqual(g.inventory.Tea, 1, "the requested item should be paid out");
  assertEqual(g.inventory.Hemp, 13, "the offered item should be received");
});

test("accepting an offer paid in Gold moves the purse and the hold together", () => {
  const g = captain();
  const logs: string[] = [];
  const ok = acceptBarterOffer(g, "Gold", 30, "Silk", 4, logs);
  assertEqual(ok, true, "paying in Gold should succeed when affordable");
  assertEqual(g.money, 70, "the Gold price should leave the purse");
  assertEqual(g.inventory.Silk, 9, "the offered Silk should land in the hold");
});

suite("settleBarterTrade");

test("the poster receives the requested item, having already paid at post time", () => {
  const g = captain();
  const logs: string[] = [];
  postBarterOffer(g, "Hemp", 4, "Silk", 2, logs);
  assertEqual(g.inventory.Hemp, 4, "setup: the offer escrowed 4 Hemp");
  settleBarterTrade(g, "Silk", 2, logs);
  assertEqual(g.inventory.Silk, 7, "the poster should receive the request");
  assertEqual(
    g.inventory.Hemp,
    4,
    "settling must not refund the already-escrowed offer as well",
  );
});

suite("a completed trade conserves goods across both captains");

// The invariant a per-side test cannot catch: run both halves of one real
// trade and check the totals before and after. Alice offers 4 Hemp for 2
// Silk; Bob accepts.
test("no goods are created or destroyed by a full two-sided trade", () => {
  const alice = captain();
  const bob = captain();
  const logs: string[] = [];

  const hempBefore = alice.inventory.Hemp + bob.inventory.Hemp;
  const silkBefore = alice.inventory.Silk + bob.inventory.Silk;

  assert(
    postBarterOffer(alice, "Hemp", 4, "Silk", 2, logs),
    "setup: Alice's offer should post",
  );
  assert(
    acceptBarterOffer(bob, "Silk", 2, "Hemp", 4, logs),
    "setup: Bob should be able to accept",
  );
  settleBarterTrade(alice, "Silk", 2, logs);

  assertEqual(
    alice.inventory.Hemp + bob.inventory.Hemp,
    hempBefore,
    "total Hemp across both captains must be unchanged by a trade",
  );
  assertEqual(
    alice.inventory.Silk + bob.inventory.Silk,
    silkBefore,
    "total Silk across both captains must be unchanged by a trade",
  );
  assertEqual(alice.inventory.Hemp, 4, "Alice gave up 4 Hemp");
  assertEqual(alice.inventory.Silk, 7, "Alice gained 2 Silk");
  assertEqual(bob.inventory.Hemp, 12, "Bob gained 4 Hemp");
  assertEqual(bob.inventory.Silk, 3, "Bob gave up 2 Silk");
});

test("Gold is conserved the same way when it is the traded item", () => {
  const alice = captain();
  const bob = captain();
  const logs: string[] = [];

  const goldBefore = alice.money + bob.money;
  const teaBefore = alice.inventory.Tea + bob.inventory.Tea;

  assert(
    postBarterOffer(alice, "Gold", 35, "Tea", 3, logs),
    "setup: Alice's Gold offer should post",
  );
  assert(
    acceptBarterOffer(bob, "Tea", 3, "Gold", 35, logs),
    "setup: Bob should be able to pay 3 Tea",
  );
  settleBarterTrade(alice, "Tea", 3, logs);

  assertEqual(
    alice.money + bob.money,
    goldBefore,
    "total Gold across both captains must be unchanged by a trade",
  );
  assertEqual(
    alice.inventory.Tea + bob.inventory.Tea,
    teaBefore,
    "total Tea across both captains must be unchanged by a trade",
  );
  assertEqual(alice.money, 65, "Alice paid 35 Gold");
  assertEqual(bob.money, 135, "Bob received 35 Gold");
});

test("an offer that expires unaccepted is refunded, leaving both captains whole", () => {
  const alice = captain();
  const logs: string[] = [];
  const hempBefore = alice.inventory.Hemp;

  postBarterOffer(alice, "Hemp", 6, "Silk", 3, logs);
  assertEqual(alice.inventory.Hemp, 2, "setup: the offer is escrowed");

  completeBarterPhase(alice, [{ item: "Hemp", amount: 6 }], logs);
  assertEqual(
    alice.inventory.Hemp,
    hempBefore,
    "an unmatched offer must come back in full when the phase ends",
  );
});

suite("completeBarterPhase");

test("refunds every unmatched offer, not just the first", () => {
  const g = captain();
  const logs: string[] = [];
  postBarterOffer(g, "Hemp", 3, "Silk", 1, logs);
  postBarterOffer(g, "Tea", 2, "Silk", 1, logs);
  assertEqual(g.inventory.Hemp, 5, "setup: Hemp escrowed");
  assertEqual(g.inventory.Tea, 1, "setup: Tea escrowed");

  completeBarterPhase(
    g,
    [
      { item: "Hemp", amount: 3 },
      { item: "Tea", amount: 2 },
    ],
    logs,
  );
  assertEqual(g.inventory.Hemp, 8, "the first refund should land");
  assertEqual(g.inventory.Tea, 3, "the second refund should land too");
});

test("advances to worker management whether or not anything was refunded", () => {
  const withRefunds = captain();
  const logs: string[] = [];
  postBarterOffer(withRefunds, "Hemp", 1, "Silk", 1, logs);
  completeBarterPhase(withRefunds, [{ item: "Hemp", amount: 1 }], logs);
  assertEqual(
    withRefunds.phase,
    "worker_mgmt",
    "the phase should advance after refunding",
  );

  const empty = captain();
  completeBarterPhase(empty, [], logs);
  assertEqual(
    empty.phase,
    "worker_mgmt",
    "the phase should advance with nothing to refund",
  );
});

const ok = summary();
process.exit(ok ? 0 : 1);
