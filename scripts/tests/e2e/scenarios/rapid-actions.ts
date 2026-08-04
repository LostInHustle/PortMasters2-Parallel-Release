// =====================================================================
// The reducer in src/lib/use-game-session.ts dispatches every action as
// `{ type: "APPLY", fn }`, and each dispatch's fn always runs against
// React's current committed state, not a stale closure captured when the
// button was rendered — in theory immune to the classic "two rapid clicks
// both read the same pre-update snapshot" race. This scenario checks that
// holds under real, near-simultaneous browser events rather than trusting
// the theory: fire the same "assign a task" action three times back to
// back with no waiting in between, against three idle workers and only
// exactly enough material for all three, then verify all three actually
// landed (no lost update collapsing two clicks into one worker, no
// material double-deducted or under-deducted) by reading the state back
// from the server after the autosave debounce settles.
// =====================================================================
import { suite, test, assert, assertEqual } from "../harness";
import { TestClient, uniqueUsername } from "../api";
import { openAuthedPage } from "../browser";
import {
  createInitialGameState,
  type GameState,
} from "../../../../src/lib/game/types";
import { hireWorker } from "../../../../src/lib/game/engine";

const STARTING_HEMP = 100;

function buildThreeIdleWeavers(): GameState {
  const logs: string[] = [];
  const g = createInitialGameState();
  g.phase = "worker_mgmt";
  g.money = 5000;
  g.inventory.Hemp = STARTING_HEMP;
  hireWorker(g, "weaver", logs);
  hireWorker(g, "weaver", logs);
  hireWorker(g, "weaver", logs);
  return g;
}

export async function run(baseUrl: string): Promise<void> {
  suite("E2E: rapid concurrent clicks don't lose or duplicate updates");

  const client = new TestClient(baseUrl);
  await client.register(
    uniqueUsername("rapid"),
    "testpass123",
    "Rapid Captain",
  );
  const { room } = await client.createRoom({
    name: "Rapid Room",
    difficulty: "fair_winds",
  });
  await client.putGameState(room.id, buildThreeIdleWeavers());

  const { context, page } = await openAuthedPage(baseUrl, client);
  try {
    await test("three idle weavers are visible before the race", async () => {
      const body = await page.textContent("body");
      assert(
        !!body && (body.match(/Idle/g) ?? []).length >= 3,
        "expected 3 idle weavers before firing the rapid clicks",
      );
    });

    await test("firing the same action 3x near-simultaneously assigns all 3 workers exactly once each", async () => {
      const btn = page.getByRole("button", { name: /Make Linen Clothes/i });
      // Promise.all rather than sequential awaits: fires all three click
      // events back to back without waiting on each one's resulting
      // re-render first, the actual stress case for a lost-update race.
      await Promise.all([btn.click(), btn.click(), btn.click()]);
      // Let the 700ms autosave debounce in use-game-session.ts settle so
      // the server's copy reflects the client's final state.
      await page.waitForTimeout(1500);

      const { state: raw } = await client.getGameState(room.id);
      assert(!!raw, "expected a saved game state after the rapid clicks");
      const saved = JSON.parse(raw!) as GameState;

      assertEqual(
        saved.workers.weaver.length,
        3,
        "expected all 3 weavers to still exist (none lost)",
      );
      const assignedCount = saved.workers.weaver.filter(
        (w) => w.task === "Linen Clothes",
      ).length;
      assertEqual(
        assignedCount,
        3,
        "expected all 3 weavers to have been assigned Linen Clothes, not fewer (a lost update) or the same one thrice",
      );
      assertEqual(
        saved.inventory.Hemp,
        STARTING_HEMP - 3 * 2,
        "expected Hemp to be deducted exactly once per successful assignment (2 each), not double- or under-deducted",
      );
    });
  } finally {
    await context.close();
  }
}
