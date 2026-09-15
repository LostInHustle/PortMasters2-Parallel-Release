// =====================================================================
// The moderation rules behind the admin console (src/lib/admin/rules.ts):
// the permission matrix every console route enforces, the ban reason
// normaliser, and the throttle that slows down guesses at the admin key.
// Pure logic only, like every other suite here; the database side of the
// console is exercised end to end in scripts/tests/e2e/scenarios/adminConsole.ts.
//
// Run with: npm run test:admin
// =====================================================================
import { suite, test, assert, assertEqual, summary } from "./harness";
import {
  BAN_REASON_MAX_LENGTH,
  bulkEligibility,
  canModerate,
  isStaff,
  KeyAttemptThrottle,
  normalizeBanReason,
  normalizeRole,
  type ModerationAction,
  type Role,
} from "../../src/lib/admin/rules";

const admin = { id: "admin", role: "admin" as Role };
const modA = { id: "modA", role: "moderator" as Role };
const modB = { id: "modB", role: "moderator" as Role };
const player = { id: "player", role: "player" as Role };
const other = { id: "other", role: "player" as Role };

const ACTIONS: ModerationAction[] = [
  "ban",
  "unban",
  "delete",
  "promote",
  "demote",
];

suite("roles");

test("normalizeRole reads anything unknown as a player", () => {
  assertEqual(normalizeRole("admin"), "admin", "admin");
  assertEqual(normalizeRole("moderator"), "moderator", "moderator");
  assertEqual(normalizeRole("player"), "player", "player");
  assertEqual(normalizeRole("ADMIN"), "player", "wrong case");
  assertEqual(normalizeRole(undefined), "player", "missing");
  assertEqual(normalizeRole(42), "player", "not a string");
});

test("isStaff is true for the admin and moderators only", () => {
  assert(isStaff("admin"), "admin");
  assert(isStaff("moderator"), "moderator");
  assert(!isStaff("player"), "player");
});

suite("permission matrix :: the admin");

test("the admin may ban, unban, delete, promote and demote a player", () => {
  for (const action of ACTIONS) {
    const verdict = canModerate(admin, action, player);
    if (action === "demote") {
      assert(!verdict.ok, "a player has no moderator badge to remove");
    } else {
      assert(verdict.ok, `admin should be allowed to ${action} a player`);
    }
  }
});

test("the admin may ban, delete and demote a moderator, but not promote one twice", () => {
  assert(canModerate(admin, "ban", modA).ok, "ban a moderator");
  assert(canModerate(admin, "delete", modA).ok, "delete a moderator");
  assert(canModerate(admin, "demote", modA).ok, "demote a moderator");
  assert(!canModerate(admin, "promote", modA).ok, "already a moderator");
});

test("the admin can never act on their own account", () => {
  for (const action of ACTIONS) {
    assert(!canModerate(admin, action, admin).ok, `self ${action}`);
  }
});

suite("permission matrix :: moderators");

test("a moderator may ban and unban a player and nothing else", () => {
  assert(canModerate(modA, "ban", player).ok, "ban");
  assert(canModerate(modA, "unban", player).ok, "unban");
  assert(!canModerate(modA, "delete", player).ok, "delete is admin only");
  assert(!canModerate(modA, "promote", player).ok, "promote is admin only");
  assert(!canModerate(modA, "demote", player).ok, "demote is admin only");
});

test("moderators cannot touch each other", () => {
  for (const action of ACTIONS) {
    assert(!canModerate(modA, action, modB).ok, `mod on mod ${action}`);
  }
});

test("nobody can moderate the admin", () => {
  for (const action of ACTIONS) {
    assert(!canModerate(modA, action, admin).ok, `mod on admin ${action}`);
    assert(!canModerate(player, action, admin).ok, `player on admin ${action}`);
  }
});

test("a moderator cannot act on their own account", () => {
  for (const action of ACTIONS) {
    assert(!canModerate(modA, action, modA).ok, `self ${action}`);
  }
});

suite("permission matrix :: players");

test("a player has no authority over anyone", () => {
  for (const action of ACTIONS) {
    assert(!canModerate(player, action, other).ok, `player ${action}`);
  }
});

test("every refusal carries a reason a person can read", () => {
  const refused = [
    canModerate(player, "ban", other),
    canModerate(modA, "delete", player),
    canModerate(modA, "ban", modB),
    canModerate(admin, "ban", admin),
    canModerate(modA, "ban", admin),
  ];
  for (const verdict of refused) {
    assert(!verdict.ok && verdict.reason.length > 10, "reason present");
  }
});

suite("acting on a selection");

const BANNED_AT = "2026-09-01T00:00:00.000Z";
const crew = [
  { id: "p1", role: "player" as Role, bannedAt: null },
  { id: "p2", role: "player" as Role, bannedAt: BANNED_AT },
  { id: "modA", role: "moderator" as Role, bannedAt: null },
  { id: "admin", role: "admin" as Role, bannedAt: null },
];

test("a ban reaches the players who are not banned yet and names why the rest are skipped", () => {
  const { eligible, skipped } = bulkEligibility(admin, "ban", crew);
  assertEqual(
    eligible.map((t) => t.id).join(","),
    "p1,modA",
    "the admin can ban a player and a moderator",
  );
  const reasons = Object.fromEntries(
    skipped.map((s) => [s.target.id, s.reason]),
  );
  assertEqual(reasons.p2, "Already banned.", "an existing ban is skipped");
  assert(!!reasons.admin, "the admin themselves is skipped with a reason");
});

test("lifting bans reaches only the banned, and a moderator's reach stops at other staff", () => {
  const { eligible, skipped } = bulkEligibility(modA, "unban", crew);
  assertEqual(
    eligible.map((t) => t.id).join(","),
    "p2",
    "only the banned player",
  );
  const reasons = Object.fromEntries(
    skipped.map((s) => [s.target.id, s.reason]),
  );
  assertEqual(reasons.p1, "Not banned.", "nothing to lift");
  assert(!!reasons.modA, "a moderator cannot act on themselves");
  assert(!!reasons.admin, "a moderator cannot act on the admin");
});

test("a moderator's delete reaches nobody, and the admin's reaches everyone but themselves", () => {
  assertEqual(
    bulkEligibility(modA, "delete", crew).eligible.length,
    0,
    "deletion is admin only",
  );
  assertEqual(
    bulkEligibility(admin, "delete", crew)
      .eligible.map((t) => t.id)
      .join(","),
    "p1,p2,modA",
    "banned or not, everyone but the admin can be deleted",
  );
});

test("an empty selection is simply empty", () => {
  const { eligible, skipped } = bulkEligibility(admin, "ban", []);
  assertEqual(eligible.length + skipped.length, 0, "nothing in, nothing out");
});

suite("ban reasons");

test("a reason is trimmed and its whitespace collapsed", () => {
  assertEqual(
    normalizeBanReason("  spamming   the   chat \n"),
    "spamming the chat",
    "collapsed",
  );
});

test("an empty, missing or overlong reason is refused", () => {
  assertEqual(normalizeBanReason(""), null, "empty");
  assertEqual(normalizeBanReason("   "), null, "blank");
  assertEqual(normalizeBanReason(undefined), null, "missing");
  assertEqual(normalizeBanReason(7), null, "not a string");
  assertEqual(
    normalizeBanReason("x".repeat(BAN_REASON_MAX_LENGTH + 1)),
    null,
    "too long",
  );
  assertEqual(
    normalizeBanReason("x".repeat(BAN_REASON_MAX_LENGTH)),
    "x".repeat(BAN_REASON_MAX_LENGTH),
    "exactly the limit is fine",
  );
});

suite("admin key throttle");

function clock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("allows attempts until the limit, then refuses with a wait", () => {
  const c = clock();
  const t = new KeyAttemptThrottle(3, 60_000, c.now);
  assert(t.check("u").allowed, "first");
  t.recordFailure("u");
  t.recordFailure("u");
  assert(t.check("u").allowed, "two failures is still under a limit of three");
  t.recordFailure("u");
  const verdict = t.check("u");
  assert(!verdict.allowed, "third failure trips the limit");
  assert(
    !verdict.allowed && verdict.retryAfterMs === 60_000,
    "wait is the whole window when the failures were just now",
  );
});

test("failures expire out of the window and the account is allowed again", () => {
  const c = clock();
  const t = new KeyAttemptThrottle(2, 10_000, c.now);
  t.recordFailure("u");
  c.advance(4_000);
  t.recordFailure("u");
  assert(!t.check("u").allowed, "tripped");
  c.advance(6_001);
  const verdict = t.check("u");
  assert(verdict.allowed, "the first failure aged out, one remains");
  c.advance(4_000);
  assert(t.check("u").allowed, "both aged out");
});

test("accounts are throttled independently and a success clears the slate", () => {
  const c = clock();
  const t = new KeyAttemptThrottle(1, 10_000, c.now);
  t.recordFailure("a");
  assert(!t.check("a").allowed, "a is blocked");
  assert(t.check("b").allowed, "b is untouched");
  t.clear("a");
  assert(t.check("a").allowed, "a is clear after a correct key");
});

process.exit(summary() ? 0 : 1);
