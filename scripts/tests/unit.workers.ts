// =====================================================================
// Unit tests for the artisan roster money paths in
// src/lib/game/engine.ts: fireWorker and payWages.
//
// Both move Gold and neither had a direct test. payWages was only ever
// reached indirectly through finishSettlement in the voyage simulations,
// which meant its bankruptcy branch and its per-artisan-type billing were
// never asserted on their own. fireWorker had no coverage at all.
//
// One real inconsistency is pinned down here rather than papered over:
// fireWorker charges severance from the raw WAGES table, while hireWorker
// and payWages both price through getHireCost, which applies the Artisan's
// Workshop wage penalty and any hire discount. The test named for it below
// documents today's behaviour so a refactor cannot change it silently. It
// is deliberately NOT asserting that the behaviour is correct, only that
// it is what ships today. Whether severance should follow getHireCost is a
// balance question for the designer, not something to fix mid refactor.
//
// Run with: npx tsx scripts/tests/unit.workers.ts
// =====================================================================
import { suite, test, assert, assertEqual, summary } from "./harness";
import {
  createInitialGameState,
  type GameState,
} from "../../src/lib/game/types";
import {
  fireWorker,
  payWages,
  hireWorker,
  getHireCost,
} from "../../src/lib/game/engine";
import { WAGES, MODULES_TIER0 } from "../../src/lib/game/constants";

function crewed(count: number, type = "weaver"): GameState {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.money = 1000;
  for (let i = 0; i < count; i++) hireWorker(g, type, logs);
  return g;
}

suite("fireWorker");

test("dismissing a worker charges severance and shrinks the roster", () => {
  const g = crewed(2);
  const logs: string[] = [];
  const before = g.money;
  fireWorker(g, "weaver", 0, logs);
  assertEqual(g.workers.weaver.length, 1, "the roster should lose one weaver");
  assertEqual(
    g.money,
    before - WAGES.weaver,
    "severance of one round's wage should be charged",
  );
});

test("an out-of-range index is ignored, charging nothing", () => {
  const g = crewed(1);
  const logs: string[] = [];
  const before = g.money;
  fireWorker(g, "weaver", 5, logs);
  fireWorker(g, "weaver", -1, logs);
  assertEqual(g.workers.weaver.length, 1, "the roster must be untouched");
  assertEqual(g.money, before, "no severance may be charged for a bad index");
});

test("an unknown artisan type is ignored rather than throwing", () => {
  const g = crewed(1);
  const logs: string[] = [];
  const before = g.money;
  fireWorker(g, "not_a_real_artisan", 0, logs);
  assertEqual(g.money, before, "an unknown type must cost nothing");
  assertEqual(g.workers.weaver.length, 1, "and must not touch another roster");
});

test("a captain who cannot afford severance keeps the worker", () => {
  const g = crewed(1);
  const logs: string[] = [];
  g.money = WAGES.weaver - 1;
  fireWorker(g, "weaver", 0, logs);
  assertEqual(
    g.workers.weaver.length,
    1,
    "the worker must stay on the roster when severance is unaffordable",
  );
  assertEqual(g.money, WAGES.weaver - 1, "and no Gold may be taken");
});

test("dismissing the right index removes that worker, not simply the last one", () => {
  const g = crewed(3);
  const logs: string[] = [];
  // Tag each worker so the removal is identifiable.
  g.workers.weaver[0].task = "first";
  g.workers.weaver[1].task = "second";
  g.workers.weaver[2].task = "third";
  fireWorker(g, "weaver", 1, logs);
  assertEqual(g.workers.weaver.length, 2, "one worker should be gone");
  assertEqual(g.workers.weaver[0].task, "first", "the first should remain");
  assertEqual(
    g.workers.weaver[1].task,
    "third",
    "the third should have shifted down into the freed slot",
  );
});

test("severance today is priced from the raw wage table, not getHireCost", () => {
  // Documents a real inconsistency rather than asserting it is correct.
  // Artisan's Workshop raises wages 20%, so getHireCost diverges from
  // WAGES while this module is equipped; hireWorker and payWages follow
  // getHireCost, fireWorker does not. Pinned so a refactor cannot quietly
  // change which one severance uses.
  const g = crewed(1);
  const logs: string[] = [];
  const workshop = MODULES_TIER0.find((m) => m.id === "artisans_workshop")!;
  g.equippedModules.push(workshop);

  const viaHireCost = getHireCost(g, "weaver");
  assert(
    viaHireCost !== WAGES.weaver,
    "setup: Artisan's Workshop should make getHireCost differ from the raw wage",
  );

  const before = g.money;
  fireWorker(g, "weaver", 0, logs);
  assertEqual(
    before - g.money,
    WAGES.weaver,
    "severance currently follows the raw WAGES table",
  );
});

suite("payWages");

test("an empty roster is free and never reports bankruptcy", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  const before = g.money;
  assertEqual(payWages(g, logs), true, "no artisans means nothing to pay");
  assertEqual(g.money, before, "and no Gold should move");
});

test("wages are billed per artisan and recorded in the round's cost ledger", () => {
  const g = crewed(3);
  const logs: string[] = [];
  const rate = getHireCost(g, "weaver");
  const before = g.money;

  assertEqual(payWages(g, logs), true, "an affordable payroll should succeed");
  assertEqual(
    before - g.money,
    rate * 3,
    "three weavers should cost three times the rate",
  );
  assertEqual(
    g.workerWages,
    rate * 3,
    "the wage total should land in the voyage's wage ledger",
  );
  assertEqual(g.roundCosts, rate * 3, "and in this round's cost ledger");
});

test("a mixed roster bills every artisan type, not just the first", () => {
  const g = crewed(2, "weaver");
  const logs: string[] = [];
  hireWorker(g, "master", logs);
  logs.length = 0;

  const expected = getHireCost(g, "weaver") * 2 + getHireCost(g, "master") * 1;
  const before = g.money;
  assertEqual(payWages(g, logs), true, "the payroll should be affordable");
  assertEqual(
    before - g.money,
    expected,
    "weavers and masters should both be billed",
  );
});

test("a payroll the captain cannot cover reports bankruptcy and takes nothing", () => {
  const g = crewed(2);
  const logs: string[] = [];
  const due = getHireCost(g, "weaver") * 2;
  g.money = due - 1;

  assertEqual(
    payWages(g, logs),
    "bankruptcy",
    "an unaffordable payroll must report bankruptcy",
  );
  assertEqual(
    g.money,
    due - 1,
    "a failed payroll must not partially drain the purse",
  );
  assertEqual(
    g.workerWages,
    0,
    "and must not record wages it never actually paid",
  );
});

test("exactly enough Gold pays in full rather than tipping into bankruptcy", () => {
  const g = crewed(2);
  const logs: string[] = [];
  const due = getHireCost(g, "weaver") * 2;
  g.money = due;

  assertEqual(payWages(g, logs), true, "an exact balance should still pay");
  assertEqual(g.money, 0, "the purse should be emptied exactly");
});

const ok = summary();
process.exit(ok ? 0 : 1);
