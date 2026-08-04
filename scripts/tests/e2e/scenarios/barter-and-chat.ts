// =====================================================================
// The barter:* and chat:* socket handlers in src/server/realtime.ts have
// no coverage of any kind. The unit suite (scripts/tests/unit.barter.ts)
// proves the engine side arithmetic is right, but it calls those pure
// functions directly and never touches a socket, so none of the handler
// code around them is exercised: payload validation, the room membership
// check, the offer board's shared per-room state, and the broadcast fan
// out that is the entire point of bartering being a multiplayer feature.
//
// This scenario drives two real browsers against one real server so the
// full round trip runs: one captain posts, the server validates and
// broadcasts, the other captain's board updates, they accept, and the
// goods actually move on both sides. Chat gets the same treatment, since
// chat:room is the other completely uncovered broadcast path.
//
// Both captains are seeded straight into the barter phase through the
// save API rather than played there through boon drafting and the market,
// which keeps the scenario about bartering instead of re-testing the
// phase gate that multiplayer-ready-gate.ts already covers. The
// barter:post handler only requires auth plus room membership, so seeding
// the phase this way exercises exactly the same server path a captain who
// arrived normally would take.
// =====================================================================
import { suite, test, assert, assertEqual } from "../harness";
import { TestClient, uniqueUsername } from "../api";
import { openAuthedPage } from "../browser";
import {
  createInitialGameState,
  type GameState,
} from "../../../../src/lib/game/types";

function barterReadyState(): GameState {
  const g = createInitialGameState();
  g.phase = "barter";
  return g;
}

export async function run(baseUrl: string): Promise<void> {
  suite("E2E: bartering and chat travel between two captains over sockets");

  const alice = new TestClient(baseUrl);
  await alice.register(uniqueUsername("btrA"), "testpass123", "Captain Alice");
  const { room } = await alice.createRoom({
    name: "Barter Room",
    difficulty: "fair_winds",
  });

  const bob = new TestClient(baseUrl);
  await bob.register(uniqueUsername("btrB"), "testpass123", "Captain Bob");
  await bob.joinRoomByCode(room.code);

  await alice.putGameState(room.id, barterReadyState());
  await bob.putGameState(room.id, barterReadyState());

  const { context: ctxA, page: pageA } = await openAuthedPage(baseUrl, alice);
  const { context: ctxB, page: pageB } = await openAuthedPage(baseUrl, bob);
  try {
    await test("both captains land on the Captain's Exchange", async () => {
      await pageA
        .getByText("Captain's Exchange")
        .first()
        .waitFor({ timeout: 8000 });
      await pageB
        .getByText("Captain's Exchange")
        .first()
        .waitFor({ timeout: 8000 });
    });

    await test("an offer posted by one captain appears on the other's board", async () => {
      // The form defaults to "1 Hemp for 1 Gold", which is already a valid
      // offer (different items, amount within the founding stock of 8
      // Hemp), so posting needs no field editing.
      await pageA.getByRole("button", { name: /Post Offer/i }).click();

      // Bob's board is only reachable through the server: his client has
      // no knowledge of Alice's action except the barter:state broadcast.
      await pageB
        .getByRole("button", { name: /Trade/i })
        .waitFor({ state: "visible", timeout: 8000 });
      const board = await pageB.textContent("body");
      assert(
        !!board && board.includes("Captain Alice"),
        "Bob's board should name the captain who posted the offer",
      );
    });

    await test("the poster sees their own offer as cancellable, not acceptable", async () => {
      await pageA
        .getByRole("button", { name: "Cancel", exact: true })
        .waitFor({ state: "visible", timeout: 5000 });
      assertEqual(
        await pageA.getByRole("button", { name: /Trade/i }).count(),
        0,
        "a captain must never be offered the chance to trade with themselves",
      );
    });

    await test("accepting moves the goods on both sides of the trade", async () => {
      await pageB.getByRole("button", { name: /Trade/i }).click();
      // The board should empty on both clients once the offer is taken.
      await pageB
        .getByText("No offers on the board yet")
        .waitFor({ timeout: 8000 });
      await pageA
        .getByText("No offers on the board yet")
        .waitFor({ timeout: 8000 });

      // Let the 700ms autosave debounce settle, then read both captains'
      // saved states back from the server rather than scraping the UI.
      await pageA.waitForTimeout(1800);
      const [aliceSaved, bobSaved] = await Promise.all([
        alice.getGameState(room.id),
        bob.getGameState(room.id),
      ]);
      const a = JSON.parse(aliceSaved.state!) as GameState;
      const b = JSON.parse(bobSaved.state!) as GameState;

      assertEqual(
        a.inventory.Hemp,
        7,
        "Alice should have given up the 1 Hemp she escrowed when posting",
      );
      assertEqual(a.money, 101, "and received the 1 Gold she asked for");
      assertEqual(b.inventory.Hemp, 9, "Bob should have received the Hemp");
      assertEqual(b.money, 99, "and paid the Gold");

      // The invariant the unit suite checks in memory, here across two
      // real clients and a real server round trip.
      assertEqual(
        a.inventory.Hemp + b.inventory.Hemp,
        16,
        "total Hemp across the harbor must be unchanged by a trade",
      );
      assertEqual(
        a.money + b.money,
        200,
        "total Gold across the harbor must be unchanged by a trade",
      );
    });

    await test("cancelling an offer clears it from every captain's board", async () => {
      await pageA.getByRole("button", { name: /Post Offer/i }).click();
      await pageB
        .getByRole("button", { name: /Trade/i })
        .waitFor({ state: "visible", timeout: 8000 });

      await pageA.getByRole("button", { name: "Cancel", exact: true }).click();
      await pageB
        .getByText("No offers on the board yet")
        .waitFor({ timeout: 8000 });
    });

    await test("a harbor message reaches the other captain", async () => {
      const note = `ahoy from alice ${Date.now()}`;
      await pageA.getByPlaceholder("Message the harbor…").fill(note);
      await pageA.getByPlaceholder("Message the harbor…").press("Enter");

      await pageB.getByText(note).waitFor({ timeout: 8000 });
    });

    await test("the sender sees their own message too", async () => {
      const note = `and one more ${Date.now()}`;
      await pageA.getByPlaceholder("Message the harbor…").fill(note);
      await pageA.getByPlaceholder("Message the harbor…").press("Enter");

      await pageA.getByText(note).waitFor({ timeout: 8000 });
    });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
}
