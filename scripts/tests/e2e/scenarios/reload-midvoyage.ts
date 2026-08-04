// =====================================================================
// The load path in src/lib/use-game-session.ts runs a long chain of `??`
// back-compat repairs (normalizeInventory, normalizeWorkerRoster,
// defaulting a dozen optional arrays/flags) every time a saved GameState
// is hydrated from JSON. None of the pure-logic suites exercise that path
// through the real HTTP round trip a browser reload actually takes; they
// either build a GameState in memory or call the normalize functions
// directly with hand-picked inputs. This scenario saves a mid-voyage
// state, loads it in a real browser, then reloads the tab outright and
// checks the same round/funds come back instead of a fresh voyage.
// =====================================================================
import { suite, test, assert } from "../harness";
import { TestClient, uniqueUsername } from "../api";
import { openAuthedPage } from "../browser";
import {
  createInitialGameState,
  type GameState,
} from "../../../../src/lib/game/types";
import { hireWorker } from "../../../../src/lib/game/engine";

const DISTINCTIVE_GOLD = 73311;

function buildMidVoyageState(): GameState {
  const logs: string[] = [];
  const g = createInitialGameState(0, 1, 0, "open_waters");
  g.currentRound = 6;
  g.phase = "worker_mgmt";
  g.money = DISTINCTIVE_GOLD;
  g.score = 42;
  hireWorker(g, "weaver", logs);
  return g;
}

export async function run(baseUrl: string): Promise<void> {
  suite("E2E: mid-voyage state survives a full page reload");

  const client = new TestClient(baseUrl);
  await client.register(
    uniqueUsername("reload"),
    "testpass123",
    "Reload Captain",
  );
  const { room } = await client.createRoom({
    name: "Reload Room",
    difficulty: "open_waters",
  });
  await client.putGameState(room.id, buildMidVoyageState());

  const { context, page } = await openAuthedPage(baseUrl, client);
  try {
    await test("initial load renders the saved round and funds", async () => {
      const body = await page.textContent("body");
      assert(
        !!body && body.includes("6/12"),
        "expected round 6/12 (open_waters) to render on first load",
      );
      assert(
        !!body && body.includes(String(DISTINCTIVE_GOLD)),
        "expected the saved Gold figure to render on first load",
      );
    });

    await test("reloading the tab preserves the same state rather than resetting", async () => {
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      const body = await page.textContent("body");
      assert(
        !!body && body.includes("6/12"),
        "expected round 6/12 to survive a reload instead of resetting to a fresh voyage",
      );
      assert(
        !!body && body.includes(String(DISTINCTIVE_GOLD)),
        "expected Gold to survive a reload instead of resetting to the starting amount",
      );
      assert(
        !!body && body.includes("Artisan Management"),
        "expected the worker_mgmt phase to survive a reload",
      );
    });
  } finally {
    await context.close();
  }
}
