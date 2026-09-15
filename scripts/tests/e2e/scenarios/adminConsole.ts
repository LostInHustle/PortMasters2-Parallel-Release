// =====================================================================
// The admin console, driven the way it is actually used: over HTTP with
// three real accounts against a live instance whose environment carries
// an ADMIN_KEY (see E2E_ADMIN_KEY in ../server.ts), then once through a
// real browser to make sure /admin renders the console for the admin and
// the claim form for everyone else. The permission matrix itself is unit
// tested in scripts/tests/unit.admin.ts; this checks that the routes wire
// it up, that a ban really ends a session, and that the log records it.
// =====================================================================
import { suite, test, assert, assertEqual } from "../harness";
import { TestClient, statusOf, uniqueUsername } from "../api";
import { openAuthedPage } from "../browser";
import { E2E_ADMIN_KEY } from "../server";

type Status = { role: string; configured: boolean; seatTaken: boolean };
type Roster = {
  players: {
    id: string;
    username: string;
    role: string;
    bannedAt: string | null;
  }[];
  total: number;
};
type Log = {
  entries: {
    action: string;
    actorName: string;
    targetName: string;
    reason: string | null;
  }[];
};
type Outcome = {
  done: { id: string }[];
  skipped: { id: string; displayName: string | null; reason: string }[];
};

export async function run(baseUrl: string): Promise<void> {
  suite("E2E: the admin console");

  // `admin` and `mod` are the two accounts that race for the seat below;
  // whichever wins is the admin for the rest of the scenario, so both are
  // reassignable and the log assertions read names off the clients.
  let admin = new TestClient(baseUrl);
  let mod = new TestClient(baseUrl);
  const player = new TestClient(baseUrl);
  let adminName = uniqueUsername("adm");
  let modName = uniqueUsername("mod");
  const playerName = uniqueUsername("ply");
  await admin.register(adminName, "testpass123", "Harbor Master");
  await mod.register(modName, "testpass123", "Dockmaster");
  await player.register(playerName, "testpass123", "Deckhand");
  let modId = mod.user!.id;
  const playerId = player.user!.id;

  await test("a fresh account sees the claim form, not the console", async () => {
    const status = await admin.get<Status>("/api/admin/status");
    assertEqual(status.role, "player", "role before claiming");
    assert(status.configured, "the test server carries an ADMIN_KEY");
    assert(!status.seatTaken, "nobody holds the seat on a fresh database");
    assertEqual(
      await statusOf(admin.get("/api/admin/players")),
      403,
      "the roster is closed to a player",
    );
  });

  await test("the wrong key is refused, and the seat goes to exactly one of two accounts presenting the right key at the same instant", async () => {
    assertEqual(
      await statusOf(admin.post("/api/admin/claim", { key: "not it" })),
      403,
      "wrong key",
    );
    // Both requests are in flight together; the single UPDATE behind the
    // claim is what guarantees only one of them lands.
    const [first, second] = await Promise.all([
      statusOf(admin.post("/api/admin/claim", { key: E2E_ADMIN_KEY })),
      statusOf(mod.post("/api/admin/claim", { key: E2E_ADMIN_KEY })),
    ]);
    assert(
      [first, second].sort().join(",") === "200,409",
      `expected one claim to succeed and one to be refused, got ${first} and ${second}`,
    );
    const adminRole = (await admin.me()).user?.role;
    const modRole = (await mod.me()).user?.role;
    assert(
      (adminRole === "admin") !== (modRole === "admin"),
      "exactly one of the two accounts holds the seat",
    );
    // Whichever account won is the admin for the rest of the scenario.
    if (modRole === "admin") {
      [admin, mod] = [mod, admin];
      [adminName, modName] = [modName, adminName];
      modId = mod.user!.id;
    }
    assert(
      (await admin.get<Status>("/api/admin/status")).seatTaken,
      "status now reports the seat as taken",
    );
  });

  await test("once taken, the seat is refused to everyone, the admin included, even with the right key", async () => {
    assertEqual(
      await statusOf(mod.post("/api/admin/claim", { key: E2E_ADMIN_KEY })),
      409,
      "another account cannot take the seat",
    );
    assertEqual(
      await statusOf(admin.post("/api/admin/claim", { key: E2E_ADMIN_KEY })),
      409,
      "the admin cannot claim it a second time",
    );
    assertEqual(
      (await admin.me()).user?.role,
      "admin",
      "the admin keeps the seat",
    );
    assertEqual(
      (await mod.me()).user?.role,
      "player",
      "the other account gained nothing",
    );
  });

  await test("the admin can appoint a moderator, and a moderator cannot appoint anyone", async () => {
    await admin.post(`/api/admin/players/${modId}/role`, { role: "moderator" });
    assertEqual((await mod.me()).user?.role, "moderator", "promoted");
    assertEqual(
      await statusOf(
        mod.post(`/api/admin/players/${playerId}/role`, { role: "moderator" }),
      ),
      403,
      "role changes are admin only",
    );
    assertEqual(
      await statusOf(mod.delete(`/api/admin/players/${playerId}`)),
      403,
      "deletions are admin only",
    );
  });

  await test("a moderator can ban a player, and the ban ends their session on the spot", async () => {
    assertEqual(
      await statusOf(mod.post(`/api/admin/players/${playerId}/ban`, {})),
      400,
      "a ban needs a reason",
    );
    await mod.post(`/api/admin/players/${playerId}/ban`, {
      reason: "Testing the ban path",
    });
    assertEqual((await player.me()).user, null, "the banned session is gone");
    assertEqual(
      await statusOf(player.login(playerName, "testpass123")),
      403,
      "a banned captain cannot sign back in",
    );
    const roster = await mod.get<Roster>(`/api/admin/players?q=${playerName}`);
    assert(roster.players[0]?.bannedAt !== null, "the roster shows the ban");
  });

  await test("nobody can moderate the admin, and nobody can act on themselves", async () => {
    const adminId = admin.user!.id;
    assertEqual(
      await statusOf(
        mod.post(`/api/admin/players/${adminId}/ban`, { reason: "no" }),
      ),
      403,
      "a moderator cannot ban the admin",
    );
    assertEqual(
      await statusOf(admin.delete(`/api/admin/players/${adminId}`)),
      403,
      "the admin cannot delete themselves",
    );
    assertEqual(
      await statusOf(
        mod.post(`/api/admin/players/${modId}/ban`, { reason: "no" }),
      ),
      403,
      "a moderator cannot ban themselves",
    );
  });

  await test("lifting the ban lets the captain sign in again", async () => {
    await admin.post(`/api/admin/players/${playerId}/unban`);
    await player.login(playerName, "testpass123");
    assertEqual(
      (await player.me()).user?.username,
      playerName,
      "signed in again",
    );
  });

  await test("deleting an account removes it and the log remembers everything", async () => {
    await admin.delete(`/api/admin/players/${playerId}`);
    assertEqual((await player.me()).user, null, "the deleted session is gone");
    assertEqual(
      await statusOf(player.login(playerName, "testpass123")),
      401,
      "the account no longer exists",
    );
    const log = await admin.get<Log>("/api/admin/log");
    const mine = log.entries.filter((e) => e.targetName === "Deckhand");
    const actions = mine.map((e) => e.action);
    assert(actions.includes("ban"), "ban was logged");
    assert(actions.includes("unban"), "unban was logged");
    assert(actions.includes("delete"), "delete was logged");
    assert(
      mine.some(
        (e) => e.action === "ban" && e.actorName === mod.user!.displayName,
      ),
      "the log names the moderator who banned",
    );
  });

  // Three fresh captains for the selection tests below.
  const crew = [
    new TestClient(baseUrl),
    new TestClient(baseUrl),
    new TestClient(baseUrl),
  ];
  const crewNames = crew.map((_, i) => uniqueUsername(`crew${i}`));
  for (let i = 0; i < crew.length; i++) {
    await crew[i].register(crewNames[i], "testpass123", `Crew ${i}`);
  }
  const crewIds = crew.map((c) => c.user!.id);

  await test("a moderator can ban a selection with one reason, and the reply names who was skipped and why", async () => {
    assertEqual(
      await statusOf(
        mod.post("/api/admin/players/bulk", {
          action: "ban",
          ids: [crewIds[0], crewIds[1]],
        }),
      ),
      400,
      "a batch of bans still needs a reason",
    );
    // The admin is in the selection on purpose: the batch must reach the
    // two captains it can and report the one it cannot, not fail outright.
    const outcome = await mod.post<Outcome>("/api/admin/players/bulk", {
      action: "ban",
      ids: [crewIds[0], crewIds[1], admin.user!.id],
      reason: "Testing the batch path",
    });
    assertEqual(outcome.done.length, 2, "two captains banned");
    assertEqual(outcome.skipped.length, 1, "one skipped");
    assertEqual(
      outcome.skipped[0].id,
      admin.user!.id,
      "the admin was the one skipped",
    );
    assert(
      /admin/i.test(outcome.skipped[0].reason),
      "with the matrix's reason",
    );
    assertEqual(
      (await crew[0].me()).user,
      null,
      "the first banned session is gone",
    );
    assertEqual(
      (await crew[1].me()).user,
      null,
      "the second banned session is gone",
    );
    assertEqual(
      (await admin.me()).user?.role,
      "admin",
      "the admin is untouched",
    );
  });

  await test("lifting bans as a batch skips anyone not actually banned", async () => {
    const outcome = await mod.post<Outcome>("/api/admin/players/bulk", {
      action: "unban",
      ids: crewIds,
    });
    assertEqual(outcome.done.length, 2, "the two bans were lifted");
    assertEqual(
      outcome.skipped.length,
      1,
      "the never banned captain was skipped",
    );
    assertEqual(outcome.skipped[0].id, crewIds[2], "and it was the right one");
    await crew[0].login(crewNames[0], "testpass123");
    assertEqual(
      (await crew[0].me()).user?.username,
      crewNames[0],
      "signed in again",
    );
  });

  await test("deleting a selection is the admin's alone", async () => {
    assertEqual(
      await statusOf(
        mod.post("/api/admin/players/bulk", { action: "delete", ids: crewIds }),
      ),
      403,
      "a moderator cannot delete a selection",
    );
    const outcome = await admin.post<Outcome>("/api/admin/players/bulk", {
      action: "delete",
      ids: [crewIds[0], crewIds[1], "no-such-captain"],
    });
    assertEqual(outcome.done.length, 2, "two accounts deleted");
    assertEqual(
      outcome.skipped.length,
      1,
      "an unknown id is reported, not fatal",
    );
    assertEqual(
      outcome.skipped[0].displayName,
      null,
      "an unknown id has no name to report",
    );
    assertEqual(
      await statusOf(crew[0].login(crewNames[0], "testpass123")),
      401,
      "the deleted account is gone",
    );
    assertEqual(
      (await crew[2].me()).user?.username,
      crewNames[2],
      "the third captain is untouched",
    );
  });

  await test("only the admin can clear the log, and the clear leaves its own entry behind", async () => {
    assertEqual(
      await statusOf(mod.delete("/api/admin/log")),
      403,
      "a moderator cannot clear the log",
    );
    const before = (await admin.get<Log>("/api/admin/log")).entries.length;
    assert(before > 5, "the log had a history to clear");
    const { removed } = await admin.delete<{ removed: number }>(
      "/api/admin/log",
    );
    assertEqual(removed, before, "every entry was removed");
    const after = (await admin.get<Log>("/api/admin/log")).entries;
    assertEqual(after.length, 1, "exactly one entry remains");
    assertEqual(after[0].action, "clear_log", "and it is the clear itself");
    assertEqual(
      after[0].actorName,
      admin.user!.displayName,
      "naming who cleared it",
    );
    assert(
      !!after[0].reason && after[0].reason.includes(String(before)),
      "and how many entries went",
    );
  });

  await test("the browser shows the console to the admin", async () => {
    const { context, page } = await openAuthedPage(baseUrl, admin);
    try {
      await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
      await page
        .getByRole("heading", { name: "Harbor Office" })
        .waitFor({ timeout: 10_000 });
      await page
        .getByText(mod.user!.displayName)
        .first()
        .waitFor({ timeout: 10_000 });
      const body = await page.textContent("body");
      assert(
        !!body && body.includes("Moderation log"),
        "the log panel renders",
      );
      assert(
        !!body && body.includes("Moderator"),
        "the moderator badge renders",
      );
    } finally {
      await context.close();
    }
  });

  await test("the browser shows an ordinary captain a closed door once the seat is taken", async () => {
    const someone = new TestClient(baseUrl);
    await someone.register(uniqueUsername("vis"), "testpass123", "Visitor");
    const { context, page } = await openAuthedPage(baseUrl, someone);
    try {
      await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
      await page
        .getByText("already has its admin")
        .waitFor({ timeout: 10_000 });
      const body = await page.textContent("body");
      assert(
        !!body && !body.includes("Take the seat"),
        "no key form once the seat is taken",
      );
      assert(
        !!body && !body.includes("Moderation log"),
        "no console for a player",
      );
    } finally {
      await context.close();
    }
  });
}
