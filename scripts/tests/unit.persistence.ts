// =====================================================================
// Unit tests for the defensive "repair whatever a save actually holds"
// functions in src/lib/game/types.ts (normalizeInventory,
// normalizeWorkerRoster), and for restartGame's Object.assign-based reset
// in engine.ts. None of these had any coverage before: every existing
// suite either builds a GameState fresh in memory or drives one through a
// full voyage, never round-trips a save through the same repair path a
// real page load (src/lib/use-game-session.ts) or a real restart takes.
// That's exactly the kind of path where a subtle gap silently corrupts a
// captain's save rather than crashing loudly, the same failure shape as
// the notification-toast bug this whole scenario suite exists because of.
// Run with: npx tsx scripts/tests/unit.persistence.ts
// =====================================================================
import { suite, test, assert, assertEqual, summary } from "./harness";
import {
  normalizeInventory,
  normalizeWorkerRoster,
  createInitialGameState,
  type Worker,
} from "../../src/lib/game/types";
import { restartGame, startModuleDrafting } from "../../src/lib/game/engine";
import { ITEMS, WORKER_TYPE_IDS } from "../../src/lib/game/constants";

suite("normalizeInventory");

test("null/undefined input produces a zeroed entry for every catalogued item", () => {
  const out = normalizeInventory(null);
  for (const item of ITEMS) {
    assertEqual(out[item], 0, `expected ${item} to default to 0`);
  }
});

test("a JSON-poisoned NaN (stored as null) heals back to 0 instead of staying broken", () => {
  // JSON.stringify(NaN) -> "null", so a save damaged before validation
  // existed reads back exactly like this on the next load.
  const out = normalizeInventory({ Hemp: null, Silk: 12 });
  assertEqual(out.Hemp, 0, "a null (ex-NaN) figure should heal to 0");
  assertEqual(out.Silk, 12, "an untouched valid figure should pass through");
});

test("a non-numeric value for a known item is coerced to 0, not carried through", () => {
  const out = normalizeInventory({ Hemp: "eight" as unknown as number });
  assertEqual(out.Hemp, 0, "a string where a number belongs should heal to 0");
});

test("an unrecognized key with a valid number survives (a good retired from the catalogue keeps its count)", () => {
  const out = normalizeInventory({ "Antique Astrolabe": 3 });
  assertEqual(
    out["Antique Astrolabe"],
    3,
    "a retired good's count should not be silently deleted from a captain's hold",
  );
});

test("an unrecognized key with an invalid value is dropped, not defaulted to 0 as a phantom entry", () => {
  const out = normalizeInventory({ "Some Garbage Key": "not a number" });
  assert(
    !("Some Garbage Key" in out),
    "a non-numeric unknown key should not manufacture a new inventory line",
  );
});

suite("normalizeWorkerRoster");

const IDLE: Worker = {
  task: null,
  progress: 0,
  producedCount: 0,
  isSkilled: false,
};

test("null/undefined input with no legacy produces an empty array for every worker type", () => {
  const roster = normalizeWorkerRoster(null);
  for (const id of WORKER_TYPE_IDS) {
    assertEqual(
      roster[id].length,
      0,
      `expected ${id} to default to an empty roster`,
    );
  }
});

test("a partially populated save keeps its real workers and defaults the rest empty", () => {
  const roster = normalizeWorkerRoster({ weaver: [IDLE, IDLE] });
  assertEqual(roster.weaver.length, 2, "weaver roster should be read as-is");
  assertEqual(
    roster.master.length,
    0,
    "an absent type should default empty, not crash",
  );
  assertEqual(
    roster.jeweler.length,
    0,
    "a tier2 type absent from an old save should default empty",
  );
});

test("a pre-charter save (weavers/masterWeavers/sachetMakers, no roster) migrates via the legacy fallback", () => {
  const roster = normalizeWorkerRoster(
    { weaver: "not-an-array" }, // predates the roster key entirely, in spirit
    { weavers: [IDLE], masterWeavers: [IDLE, IDLE], sachetMakers: [] },
  );
  assertEqual(roster.weaver.length, 1, "legacy weavers should populate weaver");
  assertEqual(
    roster.master.length,
    2,
    "legacy masterWeavers should populate master",
  );
  assertEqual(
    roster.sachet_maker.length,
    0,
    "legacy sachetMakers (empty) should populate sachet_maker as empty, not skip it",
  );
});

test("a save already on the new schema is never overwritten by legacy fields, even if both are present", () => {
  const roster = normalizeWorkerRoster(
    { weaver: [IDLE] },
    { weavers: [IDLE, IDLE, IDLE] }, // if this won, weaver.length would be 3
  );
  assertEqual(
    roster.weaver.length,
    1,
    "the new-schema roster field should always win over a legacy fallback when both exist",
  );
});

test("garbage in place of an array falls back to empty rather than crashing downstream code that expects an array", () => {
  const roster = normalizeWorkerRoster({ weaver: "garbage", master: 42 });
  assertEqual(
    roster.weaver.length,
    0,
    "non-array weaver data should heal to an empty array",
  );
  assertEqual(
    roster.master.length,
    0,
    "non-array master data should heal to an empty array",
  );
});

suite("restartGame :: transient signal fields must not survive a restart");

// These four fields (_draftChoices, _newModule, _pendingDebtSettlements,
// _pendingDocksClaim) are optional and meant to be short-lived signals to
// the React layer. restartGame resets a voyage via
// Object.assign(state, fresh), which only overwrites keys `fresh` itself
// has. Before createInitialGameState explicitly listed these four as
// `undefined`, they were simply absent from `fresh`, so Object.assign
// left a stale value from the abandoned voyage in place untouched.
// _draftChoices is the one with a real, easily reached, visible
// consequence: startModuleDrafting treats a non-undefined _draftChoices
// as "already rolled for this round" and skips rolling a fresh pool, so a
// captain who restarts while mid module-draft would have seen the
// PREVIOUS voyage's module pool (wrong tier's modules included) on their
// very first draft of the new one.

test("_draftChoices from an abandoned voyage does not leak into the restarted one", () => {
  const s = createInitialGameState(0, 1, 0, "fair_winds");
  s._draftChoices = [
    {
      id: "stale_module",
      name: "Stale",
      desc: "",
      icon: "?",
      tier: 0,
    } as never,
  ];

  const logs: string[] = [];
  restartGame(s, logs, 0, 1, 1, "monsoon");
  assertEqual(
    s._draftChoices,
    undefined,
    "restartGame must clear _draftChoices, not just the fields it happens to know about",
  );

  startModuleDrafting(s);
  assert(
    s._draftChoices !== undefined && s._draftChoices[0]?.id !== "stale_module",
    "the new voyage's first module draft must roll a fresh pool, not reuse the abandoned voyage's stale choices",
  );
});

test("_newModule from an abandoned voyage does not leak into the restarted one", () => {
  const s = createInitialGameState(0, 1, 0, "fair_winds");
  s._newModule = {
    id: "stale",
    name: "Stale",
    desc: "",
    icon: "?",
    tier: 0,
  } as never;
  const logs: string[] = [];
  restartGame(s, logs, 0, 1, 1, "fair_winds");
  assertEqual(s._newModule, undefined, "restartGame must clear _newModule");
});

test("_pendingDebtSettlements from an abandoned voyage does not leak into the restarted one", () => {
  const s = createInitialGameState(0, 1, 0, "fair_winds");
  s._pendingDebtSettlements = [
    { lenderId: "x", lenderName: "X", amount: 50, debtId: "d1" },
  ];
  const logs: string[] = [];
  restartGame(s, logs, 0, 1, 1, "fair_winds");
  assertEqual(
    s._pendingDebtSettlements,
    undefined,
    "restartGame must clear _pendingDebtSettlements, or the new voyage could relay a stale forced-repayment notice",
  );
});

test("_pendingDocksClaim from an abandoned voyage does not leak into the restarted one", () => {
  const s = createInitialGameState(0, 1, 0, "fair_winds");
  s._pendingDocksClaim = { total: 999 };
  const logs: string[] = [];
  restartGame(s, logs, 0, 1, 1, "fair_winds");
  assertEqual(
    s._pendingDocksClaim,
    undefined,
    "restartGame must clear _pendingDocksClaim, or a brand new voyage could pop a milestone claim using the old voyage's order count",
  );
});

const ok = summary();
process.exit(ok ? 0 : 1);
