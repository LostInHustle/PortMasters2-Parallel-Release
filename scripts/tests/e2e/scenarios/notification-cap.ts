// =====================================================================
// Regression test for the bug this scenario suite exists because of: the
// "Captain's Ledger" toast used to infer "is there anything new?" by
// diffing state.logs.length against a remembered count, which silently
// broke forever once the ledger saturated its 500-entry cap (the length
// stops growing once one entry is trimmed off the front for every one
// pushed onto the back). See src/lib/use-game-session.ts and
// src/components/portmasters/GameRoom.tsx for the fix (state.newLines,
// handed out by the reducer before trimming, instead of a length diff).
//
// This scenario proves it end to end: push the ledger well past 500
// entries via real button clicks in a real browser, then attempt an
// action that should log a message, and confirm the toast still fires.
// =====================================================================
import { suite, test, assert } from "../harness";
import { TestClient, uniqueUsername } from "../api";
import { openAuthedPage } from "../browser";
import {
  createInitialGameState,
  type GameState,
} from "../../../../src/lib/game/types";
import { hireWorker } from "../../../../src/lib/game/engine";

function buildShortageState(): GameState {
  const logs: string[] = [];
  const g = createInitialGameState();
  g.phase = "worker_mgmt";
  g.money = 50000; // covers 250+ severance cycles without going bankrupt
  hireWorker(g, "weaver", logs);
  g.inventory.Hemp = 1; // insufficient for Linen Clothes, which needs 2
  return g;
}

export async function run(baseUrl: string): Promise<void> {
  suite("E2E: notification survives the 500-entry ledger cap");

  const client = new TestClient(baseUrl);
  await client.register(
    uniqueUsername("notifcap"),
    "testpass123",
    "Notif Cap Captain",
  );
  const { room } = await client.createRoom({
    name: "Notif Cap Room",
    difficulty: "fair_winds",
  });
  await client.putGameState(room.id, buildShortageState());

  const { context, page } = await openAuthedPage(baseUrl, client);
  try {
    await test("lands on Artisan Management with the crafted state", async () => {
      const body = await page.textContent("body");
      assert(
        !!body && body.includes("Artisan Management"),
        "expected the crafted save to land on the WorkerMgmt phase",
      );
    });

    const hireBtn = page.getByRole("button", { name: /Hire Master Weaver/i });
    const dismissBtn = page.getByRole("button", { name: /Dismiss \(12/i });

    await test("push the ledger past its 500-entry cap via real clicks", async () => {
      // 2 log lines per cycle (hire + dismiss) x 255 = ~510, safely past 500.
      const CYCLES = 255;
      for (let i = 0; i < CYCLES; i++) {
        await hireBtn.click();
        await dismissBtn.click();
      }
    });

    await test("toast still fires for a shortage attempt past the cap", async () => {
      await page.getByRole("button", { name: /Make Linen Clothes/i }).click();
      await page.waitForTimeout(500);
      const toastVisible =
        (await page.locator("text=Captain's Ledger").count()) > 0;
      assert(
        toastVisible,
        "expected the Captain's Ledger toast to appear even once the ledger array saturated its cap",
      );
      const toastText = await page
        .locator("text=Captain's Ledger")
        .locator("..")
        .textContent();
      assert(
        !!toastText &&
          toastText.includes("Material shortage to produce Linen Clothes"),
        `expected the shortage message in the toast, got: ${toastText}`,
      );
      assert(
        !!toastText && toastText.includes("Hemp 1/2"),
        `expected the toast to name the short material and amounts, got: ${toastText}`,
      );
    });
  } finally {
    await context.close();
  }
}
