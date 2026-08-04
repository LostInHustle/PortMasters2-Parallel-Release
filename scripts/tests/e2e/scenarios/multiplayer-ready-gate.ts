// =====================================================================
// Every existing pure-logic test (unit/effects/integration/harbor/convoy/
// backing) simulates ONE captain's GameState with direct engine function
// calls; none of them run the actual server-authoritative ready-check in
// src/lib/use-phase-sync.ts (backed by src/server/realtime.ts) across two
// independently connected clients. That mechanism is exactly where a real
// desync bug would live (one captain's client racing ahead of, or never
// hearing from, another's), and it's untestable without two real browser
// sessions talking to the same live server. This scenario drives two.
// =====================================================================
import { suite, test, assert } from "../harness";
import { TestClient, uniqueUsername } from "../api";
import { openAuthedPage } from "../browser";

export async function run(baseUrl: string): Promise<void> {
  suite("E2E: the room-wide ready gate actually waits for every captain");

  const host = new TestClient(baseUrl);
  await host.register(uniqueUsername("mpA"), "testpass123", "Captain Alpha");
  const { room } = await host.createRoom({
    name: "MP Sync Room",
    difficulty: "fair_winds",
  });

  const guest = new TestClient(baseUrl);
  await guest.register(uniqueUsername("mpB"), "testpass123", "Captain Bravo");
  await guest.joinRoomByCode(room.code);

  const { context: ctxA, page: pageA } = await openAuthedPage(baseUrl, host);
  const { context: ctxB, page: pageB } = await openAuthedPage(baseUrl, guest);
  try {
    await test("host's Start the Voyage arms once a second captain has joined", async () => {
      // Two distinct "Start the Voyage" buttons legitimately coexist once
      // armed: Welcome.tsx's own big call-to-action and GameControlPanel's
      // persistent bottom-bar control, so this is deliberately .first(),
      // not a workaround for duplication that shouldn't be there.
      const btn = pageA
        .getByRole("button", { name: /Start the Voyage/i })
        .first();
      await btn.waitFor({ state: "visible", timeout: 8000 });
      assert(
        await btn.isEnabled(),
        "expected the host's Start button to be enabled once the room has 2 members",
      );
    });

    await test("the non-host cannot start; sees a waiting state instead", async () => {
      await pageB
        .getByRole("button", { name: /Waiting for host/i })
        .waitFor({ state: "visible", timeout: 8000 });
    });

    await test("starting the voyage moves both captains to the Boon Draft", async () => {
      await pageA
        .getByRole("button", { name: /Start the Voyage/i })
        .first()
        .click();
      await pageA
        .getByText("🧭 The Navigator's Compass", { exact: true })
        .waitFor({ timeout: 8000 });
      await pageB
        .getByText("🧭 The Navigator's Compass", { exact: true })
        .waitFor({ timeout: 8000 });
    });

    await test("one captain locking in a boon does not advance the room alone", async () => {
      await pageA
        .getByRole("button", { name: /Lock In Boon/i })
        .first()
        .click();
      await pageA.getByText("Boon Locked In").waitFor({ timeout: 5000 });
      await pageA
        .getByText("1/2 ready", { exact: true })
        .waitFor({ timeout: 5000 });
      // Give a wrongly-premature advance a real chance to happen if the
      // gate were broken, rather than just checking the instant after.
      await pageB.waitForTimeout(1500);
      const stillPicking = await pageB
        .getByText("🧭 The Navigator's Compass", { exact: true })
        .count();
      assert(
        stillPicking > 0,
        "the second captain should still be choosing a boon while only 1 of 2 is ready, meaning the room advanced early",
      );
    });

    await test("the second captain locking in advances both to Phase 1 together", async () => {
      await pageB
        .getByRole("button", { name: /Lock In Boon/i })
        .first()
        .click();
      await pageA
        .getByText("Port Merchant Exchange")
        .waitFor({ timeout: 8000 });
      await pageB
        .getByText("Port Merchant Exchange")
        .waitFor({ timeout: 8000 });
    });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
}
