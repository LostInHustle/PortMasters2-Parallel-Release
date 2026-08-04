// =====================================================================
// Unit tests for the reducer in src/lib/use-game-session.ts. It's a pure
// function with no React dependency, exported specifically so it can be
// tested directly here rather than only through a browser (see
// scripts/tests/e2e/scenarios/notification-cap.ts for the end-to-end
// version, which proves the toast itself still fires; this file proves
// the reducer's own contract fast, without a server or a browser).
// Run with: npx tsx scripts/tests/unit.session.ts
// =====================================================================
import { suite, test, assert, assertEqual, summary } from "./harness";
import { reducer, type SessionState } from "../../src/lib/use-game-session";
import { createInitialGameState } from "../../src/lib/game/types";

// assertEqual compares with !==, which for two array literals is always
// "not equal" regardless of contents (different references). newLines is
// exactly the kind of ordered sequence assertArrayEqual (which sorts
// before comparing) shouldn't be trusted for either, so this is a plain
// order-sensitive equality check instead.
function assertLinesEqual(actual: string[], expected: string[], msg: string) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function freshState(): SessionState {
  return {
    game: createInitialGameState(),
    logs: [],
    newLines: [],
    loaded: false,
    saving: false,
    lastSavedAt: null,
  };
}

suite("session reducer :: INIT / START_FRESH");

test("INIT loads the given game and logs, and starts newLines empty", () => {
  const g = createInitialGameState();
  const s = reducer(freshState(), {
    type: "INIT",
    game: g,
    logs: ["a prior voyage's history", "line two"],
  });
  assertEqual(s.game, g, "INIT should install the given game as-is");
  assertEqual(s.logs.length, 2, "INIT should install the given logs as-is");
  assertEqual(
    s.newLines.length,
    0,
    "INIT must not treat restored history as new — nothing should toast on load",
  );
  assert(s.loaded, "INIT should mark the session loaded");
});

test("START_FRESH seeds a welcome message and starts newLines empty", () => {
  const s = reducer(freshState(), {
    type: "START_FRESH",
    checkpoint: null,
  });
  assert(
    s.logs.length > 0,
    "expected a welcome message in a fresh voyage's log",
  );
  assertEqual(
    s.newLines.length,
    0,
    "a fresh voyage's own welcome message must not toast either — same reasoning as INIT",
  );
  assert(s.loaded, "START_FRESH should mark the session loaded");
});

suite("session reducer :: APPLY");

test("APPLY captures exactly the lines the action added, not the whole log", () => {
  const s0 = reducer(freshState(), {
    type: "INIT",
    game: createInitialGameState(),
    logs: ["existing entry one", "existing entry two"],
  });
  const s1 = reducer(s0, {
    type: "APPLY",
    fn: (_g, logs) => {
      logs.push("brand new entry");
    },
  });
  assertEqual(s1.logs.length, 3, "expected the log to grow by one");
  assertLinesEqual(
    s1.newLines,
    ["brand new entry"],
    "newLines should hold exactly the one line this action added, not the pre-existing history",
  );
});

test("APPLY reports zero newLines when the action logs nothing", () => {
  const s0 = reducer(freshState(), {
    type: "INIT",
    game: createInitialGameState(),
    logs: ["existing entry"],
  });
  const s1 = reducer(s0, { type: "APPLY", fn: () => {} });
  assertEqual(
    s1.newLines.length,
    0,
    "an action that logs nothing should report no new lines",
  );
  assertEqual(s1.logs.length, 1, "and the log itself should be unchanged");
});

test("APPLY captures every line a single action logs, in one batch", () => {
  const s0 = reducer(freshState(), {
    type: "INIT",
    game: createInitialGameState(),
    logs: [],
  });
  const s1 = reducer(s0, {
    type: "APPLY",
    fn: (_g, logs) => {
      logs.push("line one");
      logs.push("line two");
      logs.push("line three");
    },
  });
  assertLinesEqual(
    s1.newLines,
    ["line one", "line two", "line three"],
    "a single action's several log lines should all land in one newLines batch",
  );
});

test("APPLY trims the ledger to 500 entries, but newLines still reports the true delta — the exact bug this reducer was fixed for", () => {
  // Fill the ledger to exactly the 500-entry cap.
  let s: SessionState = reducer(freshState(), {
    type: "INIT",
    game: createInitialGameState(),
    logs: Array.from({ length: 500 }, (_, i) => `entry ${i}`),
  });
  assertEqual(
    s.logs.length,
    500,
    "setup: ledger should start at exactly the cap",
  );

  // One more action, pushing the ledger to 501 lines pre-trim.
  s = reducer(s, {
    type: "APPLY",
    fn: (_g, logs) => logs.push("the 501st line"),
  });

  assertEqual(
    s.logs.length,
    500,
    "the ledger itself should stay pinned at the 500-entry cap",
  );
  // This is the assertion that would have failed before the fix: a
  // length-diff approach sees state.logs.length go 500 -> 500 (no change)
  // and concludes nothing happened. newLines sidesteps length entirely.
  assertLinesEqual(
    s.newLines,
    ["the 501st line"],
    "newLines must still report the one line just added, even though the ledger's own length didn't grow",
  );
  assertEqual(
    s.logs[s.logs.length - 1],
    "the 501st line",
    "the new line should be the last entry, with the oldest one trimmed off the front",
  );
  assertEqual(
    s.logs[0],
    "entry 1",
    "the single oldest entry (entry 0) should have been trimmed to make room",
  );
});

test("APPLY continues reporting fresh newLines correctly for many consecutive actions once saturated", () => {
  let s: SessionState = reducer(freshState(), {
    type: "INIT",
    game: createInitialGameState(),
    logs: Array.from({ length: 500 }, (_, i) => `entry ${i}`),
  });
  for (let i = 0; i < 20; i++) {
    s = reducer(s, {
      type: "APPLY",
      fn: (_g, logs) => logs.push(`post-cap line ${i}`),
    });
    assertLinesEqual(
      s.newLines,
      [`post-cap line ${i}`],
      `iteration ${i}: newLines should report that iteration's line even though the ledger length never changes once saturated`,
    );
    assertEqual(
      s.logs.length,
      500,
      `iteration ${i}: ledger should stay pinned at 500`,
    );
  }
});

test("APPLY mutates a clone, never the previous state's game object", () => {
  const originalGame = createInitialGameState();
  const s0 = reducer(freshState(), {
    type: "INIT",
    game: originalGame,
    logs: [],
  });
  const s1 = reducer(s0, {
    type: "APPLY",
    fn: (g) => {
      g.money = 999999;
    },
  });
  assertEqual(
    originalGame.money,
    100,
    "the game object passed into INIT must not be mutated by a later APPLY",
  );
  assertEqual(s1.game.money, 999999, "the new state should carry the mutation");
});

suite("session reducer :: SET_SAVING");

test("SET_SAVING updates only saving/lastSavedAt, leaving game/logs/newLines untouched", () => {
  const s0 = reducer(freshState(), {
    type: "INIT",
    game: createInitialGameState(),
    logs: ["one"],
  });
  const s1 = reducer(s0, { type: "SET_SAVING", saving: true, at: 12345 });
  assert(s1.saving, "expected saving to flip true");
  assertEqual(s1.lastSavedAt, 12345, "expected lastSavedAt to update");
  assertEqual(s1.game, s0.game, "SET_SAVING should not touch game");
  assertEqual(s1.logs, s0.logs, "SET_SAVING should not touch logs");
  assertEqual(s1.newLines, s0.newLines, "SET_SAVING should not touch newLines");
});

const ok = summary();
process.exit(ok ? 0 : 1);
