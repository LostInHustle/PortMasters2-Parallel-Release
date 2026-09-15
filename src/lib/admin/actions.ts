// =====================================================================
// PortMasters 2 Parallel Release: moderation actions
// Everything the admin console can do, as plain database logic with no
// Next specific import, so the API routes under src/app/api/admin stay
// thin and every action lands in the same audit log the same way.
//
// Each action here does three things in a fixed order: check the rules
// (src/lib/admin/rules.ts), write the change, then reach the affected
// captain wherever they are right now through the realtime bridge. The
// bridge call is last and never awaited on, because the database is
// already correct by then; dropping a socket is a courtesy to the rest of
// the room, not what makes the ban real.
// =====================================================================
import { timingSafeEqual } from "crypto";
import { db } from "../db";
import { leaveRoomForUser, roomIdsForUser, roomMemberIds } from "../rooms";
import { realtimeModeration } from "./bridge";
import {
  BULK_LIMIT,
  bulkEligibility,
  canModerate,
  normalizeRole,
  PLAYER_PAGE_SIZE,
  type BulkAction,
  type LoggedAction,
  type ModerationAction,
  type Role,
} from "./rules";

// Thrown for anything the caller did wrong (bad target, forbidden action),
// carrying the HTTP status the route should answer with. Real failures
// (the database being unreachable) stay ordinary errors and become 500s.
export class ModerationError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Actor = { id: string; displayName: string; role: Role };

// ========== The admin key ==========

function configuredKey(): string {
  return (process.env.ADMIN_KEY ?? "").trim();
}

export function adminKeyConfigured(): boolean {
  return configuredKey().length > 0;
}

// Constant time on equal lengths; a length mismatch short circuits, which
// leaks only the key's length, and only to someone already signed in and
// already being throttled (see KeyAttemptThrottle in rules.ts).
export function adminKeyMatches(candidate: string): boolean {
  const expected = Buffer.from(configuredKey(), "utf8");
  const given = Buffer.from(candidate, "utf8");
  if (expected.length === 0 || expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

// ========== Audit log ==========

async function record(
  actor: { id: string; displayName: string },
  action: LoggedAction,
  target: { id: string; displayName: string },
  reason?: string,
) {
  await db.moderationLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.displayName,
      action,
      targetId: target.id,
      targetName: target.displayName,
      reason: reason ?? null,
    },
  });
}

export type ModerationLogEntry = {
  id: string;
  actorId: string;
  actorName: string;
  action: LoggedAction;
  targetId: string;
  targetName: string;
  reason: string | null;
  createdAt: string;
};

export async function listModerationLog(
  limit = 100,
): Promise<ModerationLogEntry[]> {
  const rows = await db.moderationLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actorId,
    actorName: r.actorName,
    action: r.action as LoggedAction,
    targetId: r.targetId,
    targetName: r.targetName,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ========== Claiming the seat ==========

export async function adminSeatTaken(): Promise<boolean> {
  const holder = await db.user.findFirst({
    where: { role: "admin" },
    select: { id: true },
  });
  return holder !== null;
}

// The seat is claimed once and then never again. The first account to
// present the key becomes the one admin for good; from then on the key
// opens nothing, not for another account and not a second time for the
// admin themselves. There is no handover through the key by design: if the
// admin account is ever lost, an operator clears the role in the database
// by hand (see the README), and only then does the key work once more.
//
// A single UPDATE rather than a read followed by a write, so two accounts
// presenting the key in the same instant cannot both pass a "nobody holds
// it yet" check that each ran before the other wrote. SQLite applies the
// statement atomically: the subquery and the write see the same state, so
// exactly one of them changes a row.
export async function claimAdminSeat(claimant: {
  id: string;
  displayName: string;
}): Promise<"claimed" | "taken"> {
  const changed = await db.$executeRaw`
    UPDATE "User"
    SET "role" = 'admin'
    WHERE "id" = ${claimant.id}
      AND "role" <> 'admin'
      AND NOT EXISTS (SELECT 1 FROM "User" WHERE "role" = 'admin')`;
  if (changed === 0) return "taken";
  await record(claimant, "claim", claimant);
  return "claimed";
}

// ========== Reading players ==========

export type AdminPlayer = {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
  role: Role;
  createdAt: string;
  bannedAt: string | null;
  banReason: string | null;
  renownLevel: number;
  voyagesCompleted: number;
  online: boolean;
};

export async function listPlayers(opts: {
  query?: string;
  page?: number;
}): Promise<{ players: AdminPlayer[]; total: number; page: number }> {
  const query = (opts.query ?? "").trim();
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  // SQLite's LIKE is case insensitive for plain letters, which is what a
  // search box wants, so no separate lowercase column is needed.
  const where = query
    ? {
        OR: [
          { username: { contains: query } },
          { displayName: { contains: query } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PLAYER_PAGE_SIZE,
      take: PLAYER_PAGE_SIZE,
      include: {
        legacy: { select: { renownLevel: true, voyagesCompleted: true } },
      },
    }),
    db.user.count({ where }),
  ]);
  const online = new Set(realtimeModeration()?.onlineUserIds() ?? []);
  return {
    total,
    page,
    players: rows.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarHue: u.avatarHue,
      role: normalizeRole(u.role),
      createdAt: u.createdAt.toISOString(),
      bannedAt: u.bannedAt?.toISOString() ?? null,
      banReason: u.banReason,
      renownLevel: u.legacy?.renownLevel ?? 1,
      voyagesCompleted: u.legacy?.voyagesCompleted ?? 0,
      online: online.has(u.id),
    })),
  };
}

// ========== Acting on a player ==========

type Subject = {
  id: string;
  displayName: string;
  role: Role;
  bannedAt: string | null;
};

async function subjectFor(
  actor: Actor,
  action: ModerationAction,
  targetId: string,
): Promise<Subject> {
  const row = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, displayName: true, role: true, bannedAt: true },
  });
  if (!row) throw new ModerationError(404, "No captain with that id exists.");
  const target = {
    ...row,
    role: normalizeRole(row.role),
    bannedAt: row.bannedAt?.toISOString() ?? null,
  };
  const verdict = canModerate(actor, action, target);
  if (!verdict.ok) throw new ModerationError(403, verdict.reason);
  return target;
}

// Ends every session and clears every seat, the same two things signing
// out does, then lets the realtime layer drop whatever sockets are left.
async function forceOffline(userId: string, notice: string) {
  await db.session.deleteMany({ where: { userId } });
  for (const roomId of await roomIdsForUser(userId)) {
    await leaveRoomForUser(userId, roomId);
  }
  realtimeModeration()?.ejectUser(userId, notice);
}

export async function banPlayer(
  actor: Actor,
  targetId: string,
  reason: string,
): Promise<Subject> {
  const target = await subjectFor(actor, "ban", targetId);
  if (target.bannedAt) {
    throw new ModerationError(409, "That captain is already banned.");
  }
  // A banned moderator keeps no authority to come back to. The badge is
  // the admin's to hand out again on unban if they see fit.
  const bannedAt = new Date();
  await db.user.update({
    where: { id: target.id },
    data: { bannedAt, banReason: reason, role: "player" },
  });
  await record(actor, "ban", target, reason);
  await forceOffline(
    target.id,
    `${target.displayName} was banned from the harbor. Reason: ${reason}`,
  );
  return { ...target, role: "player", bannedAt: bannedAt.toISOString() };
}

export async function unbanPlayer(
  actor: Actor,
  targetId: string,
): Promise<Subject> {
  const target = await subjectFor(actor, "unban", targetId);
  if (!target.bannedAt) {
    throw new ModerationError(409, "That captain is not banned.");
  }
  await db.user.update({
    where: { id: target.id },
    data: { bannedAt: null, banReason: null },
  });
  await record(actor, "unban", target);
  return { ...target, bannedAt: null };
}

export async function setModerator(
  actor: Actor,
  targetId: string,
  moderator: boolean,
): Promise<Subject> {
  const action: ModerationAction = moderator ? "promote" : "demote";
  const target = await subjectFor(actor, action, targetId);
  const role: Role = moderator ? "moderator" : "player";
  await db.user.update({ where: { id: target.id }, data: { role } });
  await record(actor, action, target);
  return { ...target, role };
}

// Deleting a host outright would cascade their rooms away along with
// every other captain's seat and saved voyage in them (Room.hostId
// cascades on delete). So the account leaves every room first, which
// hands the host crown on or closes an empty room, exactly as a voluntary
// departure does, and only then is the row removed.
export async function deletePlayer(
  actor: Actor,
  targetId: string,
): Promise<Subject> {
  const target = await subjectFor(actor, "delete", targetId);
  await forceOffline(
    target.id,
    `${target.displayName}'s account was removed by the admin.`,
  );
  const stillHosting = await db.room.findMany({
    where: { hostId: target.id },
    select: { id: true },
  });
  for (const room of stillHosting) {
    const remaining = await roomMemberIds(room.id);
    if (remaining.length) {
      await db.room.update({
        where: { id: room.id },
        data: { hostId: remaining[0] },
      });
    } else {
      await db.room.delete({ where: { id: room.id } });
    }
  }
  await db.user.delete({ where: { id: target.id } });
  await record(actor, "delete", target);
  return target;
}

// ========== Acting on several captains at once ==========

export type BulkOutcome = {
  done: Subject[];
  skipped: { id: string; displayName: string | null; reason: string }[];
};

// One request, one pass over the selection, and a report that names every
// captain the action did not reach and why. Each target goes through the
// very same single captain action above, so the rules, the log entry and
// the realtime eject are identical whether one captain was picked or
// forty. The pass runs one at a time on purpose: bans and deletions each
// touch sessions, rooms and sockets, and interleaving forty of those buys
// nothing on a single SQLite file.
export async function applyToMany(
  actor: Actor,
  action: BulkAction,
  ids: string[],
  reason?: string,
): Promise<BulkOutcome> {
  const unique = [...new Set(ids)].slice(0, BULK_LIMIT);
  const rows = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, displayName: true, role: true, bannedAt: true },
  });
  const known = new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        displayName: r.displayName,
        role: normalizeRole(r.role),
        bannedAt: r.bannedAt?.toISOString() ?? null,
      },
    ]),
  );
  const outcome: BulkOutcome = { done: [], skipped: [] };
  for (const id of unique) {
    if (!known.has(id)) {
      outcome.skipped.push({
        id,
        displayName: null,
        reason: "No captain with that id exists.",
      });
    }
  }
  // Judged up front from one snapshot rather than discovered one failure at
  // a time, so the report the console shows matches the preview it gave.
  const { eligible, skipped } = bulkEligibility(actor, action, [
    ...known.values(),
  ]);
  for (const { target, reason: why } of skipped) {
    outcome.skipped.push({
      id: target.id,
      displayName: target.displayName,
      reason: why,
    });
  }
  for (const target of eligible) {
    try {
      outcome.done.push(
        action === "ban"
          ? await banPlayer(actor, target.id, reason ?? "")
          : action === "unban"
            ? await unbanPlayer(actor, target.id)
            : await deletePlayer(actor, target.id),
      );
    } catch (err) {
      // Something changed between the snapshot and this write (another
      // moderator got there first, say). Report it and carry on with the
      // rest rather than abandoning the batch halfway.
      if (!(err instanceof ModerationError)) throw err;
      outcome.skipped.push({
        id: target.id,
        displayName: target.displayName,
        reason: err.message,
      });
    }
  }
  return outcome;
}

// ========== Clearing the log ==========

// Wipes every entry, then writes one more recording that it happened and
// how much went. A log that can vanish without trace is not an audit log;
// this way the clear is itself the oldest thing anyone will ever find.
export async function clearModerationLog(actor: Actor): Promise<number> {
  const { count } = await db.moderationLog.deleteMany({});
  await record(
    actor,
    "clear_log",
    actor,
    `removed ${count} ${count === 1 ? "entry" : "entries"}`,
  );
  return count;
}
