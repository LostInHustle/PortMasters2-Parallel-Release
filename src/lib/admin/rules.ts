// =====================================================================
// PortMasters 2 Parallel Release: moderation rules
// Who may do what to whom, as pure functions with no database or Next
// import, so the permission matrix can be unit tested on its own (see
// scripts/tests/unit.admin.ts) and every route enforces the very same
// rules instead of each spelling out its own checks.
//
// The shape of authority is deliberately small. One admin, the first
// account to present the ADMIN_KEY from the server environment, holding
// the seat for good. Any number of moderators, appointed by the admin.
// Moderators handle the day to day (banning and unbanning players);
// anything permanent or structural, deleting an account or changing a
// role, stays with the admin. Nobody, admin included, can act on their
// own account.
// =====================================================================

export type Role = "player" | "moderator" | "admin";

export const ROLES: readonly Role[] = ["player", "moderator", "admin"];

// Rows written before the role column existed, or a value that somehow
// escaped validation, read as an ordinary player rather than throwing.
export function normalizeRole(value: unknown): Role {
  return value === "admin" || value === "moderator" ? value : "player";
}

export function isStaff(role: Role): boolean {
  return role !== "player";
}

export type ModerationAction =
  "ban" | "unban" | "delete" | "promote" | "demote";

// Everything the log can record. The console only ever issues the five
// actions above; "claim" is written by the seat claim itself, and
// "clear_log" is the one entry a log clear leaves behind.
export type LoggedAction = ModerationAction | "claim" | "clear_log";

export type ModerationSubject = { id: string; role: Role };

export type RuleVerdict = { ok: true } | { ok: false; reason: string };

// The whole permission matrix. Returns a reason a route can hand straight
// back to the caller, phrased for the person who clicked the button.
export function canModerate(
  actor: ModerationSubject,
  action: ModerationAction,
  target: ModerationSubject,
): RuleVerdict {
  if (!isStaff(actor.role)) {
    return { ok: false, reason: "Only moderators and the admin can do that." };
  }
  if (actor.id === target.id) {
    return {
      ok: false,
      reason: "You cannot take moderation action on your own account.",
    };
  }
  if (target.role === "admin") {
    return { ok: false, reason: "The admin account cannot be moderated." };
  }
  const adminOnly =
    action === "delete" || action === "promote" || action === "demote";
  if (adminOnly && actor.role !== "admin") {
    return { ok: false, reason: "Only the admin can do that." };
  }
  if (actor.role === "moderator" && target.role === "moderator") {
    return {
      ok: false,
      reason: "Moderators cannot moderate each other. Ask the admin.",
    };
  }
  if (action === "promote" && target.role === "moderator") {
    return { ok: false, reason: "That captain is already a moderator." };
  }
  if (action === "demote" && target.role !== "moderator") {
    return { ok: false, reason: "That captain is not a moderator." };
  }
  return { ok: true };
}

// ---------- Acting on several captains at once ----------
// The bulk bar in the console and the bulk route on the server both need
// the same answer: of these selected captains, which ones can this action
// actually apply to, and why not the rest. Beyond the permission matrix
// this also reads the ban state, since banning someone already banned or
// lifting a ban that is not there is not an action, just noise in the log.
export type BulkAction = "ban" | "unban" | "delete";

// At most this many targets per request. Big enough for any real sweep,
// small enough that one request cannot tie the server up for long.
export const BULK_LIMIT = 100;

export type BulkTarget = ModerationSubject & { bannedAt: string | null };

export type BulkEligibility<T extends BulkTarget> = {
  eligible: T[];
  skipped: { target: T; reason: string }[];
};

export function bulkEligibility<T extends BulkTarget>(
  actor: ModerationSubject,
  action: BulkAction,
  targets: T[],
): BulkEligibility<T> {
  const out: BulkEligibility<T> = { eligible: [], skipped: [] };
  for (const target of targets) {
    const verdict = canModerate(actor, action, target);
    if (!verdict.ok) {
      out.skipped.push({ target, reason: verdict.reason });
    } else if (action === "ban" && target.bannedAt) {
      out.skipped.push({ target, reason: "Already banned." });
    } else if (action === "unban" && !target.bannedAt) {
      out.skipped.push({ target, reason: "Not banned." });
    } else {
      out.eligible.push(target);
    }
  }
  return out;
}

// Reasons are shown to the banned captain at sign in and kept in the log,
// so they are required, trimmed, and bounded.
export const BAN_REASON_MAX_LENGTH = 200;

export function normalizeBanReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const reason = raw.replace(/\s+/g, " ").trim();
  if (!reason || reason.length > BAN_REASON_MAX_LENGTH) return null;
  return reason;
}

// ---------- Admin key attempts ----------
// The key is the root credential for the whole console, so guessing at it
// is the one thing here worth slowing down. A handful of wrong tries per
// account within a window, then a wait. Kept per account rather than per
// address because every request here is already authenticated, and one
// signed in account hammering the form is exactly the case to stop.
export const KEY_ATTEMPT_LIMIT = 5;
export const KEY_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export type ThrottleVerdict =
  { allowed: true } | { allowed: false; retryAfterMs: number };

export class KeyAttemptThrottle {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly limit = KEY_ATTEMPT_LIMIT,
    private readonly windowMs = KEY_ATTEMPT_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(userId: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const kept = (this.failures.get(userId) ?? []).filter((t) => t > cutoff);
    if (kept.length) this.failures.set(userId, kept);
    else this.failures.delete(userId);
    return kept;
  }

  check(userId: string): ThrottleVerdict {
    const recent = this.recent(userId);
    if (recent.length < this.limit) return { allowed: true };
    const oldest = Math.min(...recent);
    return {
      allowed: false,
      retryAfterMs: Math.max(0, oldest + this.windowMs - this.now()),
    };
  }

  recordFailure(userId: string): void {
    this.failures.set(userId, [...this.recent(userId), this.now()]);
  }

  clear(userId: string): void {
    this.failures.delete(userId);
  }
}
