// =====================================================================
// PortMasters 2 Parallel Release: shared room logic
// Plain database logic with no Next specific imports, so it can be called
// from API routes, from the realtime layer (src/server/realtime.ts) and
// from the admin actions alike. This is where "a captain leaves a room"
// and "a captain joins a room" actually mean one thing each, and where a
// room is turned into the summary every route hands back.
// =====================================================================
import type { Prisma } from "../../generated/prisma";
import { db } from "./db";
import { PUBLIC_USER_SELECT, publicUser } from "./publicUser";

// ========== Codes ==========
// Six characters from an alphabet with no lookalikes (no 0/O, no 1/I),
// so a code read aloud across a table survives the trip.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

// ========== Summaries ==========
// The include every room read needs to produce a RoomSummary
// (see src/lib/api.ts for the client side type), and the one function
// that shapes it. Six routes used to each spell out the same eleven
// field mapping; adding a room field meant finding all six.
export const ROOM_SUMMARY_INCLUDE = {
  members: { include: { user: { select: PUBLIC_USER_SELECT } } },
  host: { select: PUBLIC_USER_SELECT },
} satisfies Prisma.RoomInclude;

export type RoomWithRoster = Prisma.RoomGetPayload<{
  include: typeof ROOM_SUMMARY_INCLUDE;
}>;

export function roomSummary(room: RoomWithRoster) {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    isPublic: room.isPublic,
    started: room.started,
    difficulty: room.difficulty,
    createdAt: room.createdAt,
    host: publicUser(room.host),
    memberCount: room.members.length,
    members: room.members.map((m) => ({
      ...publicUser(m.user),
      joinedAt: m.joinedAt,
    })),
  };
}

// ========== Joining ==========
// The voyage locks once it starts: someone who hadn't already joined
// can't slip in mid voyage, but a returning member (a brief disconnect,
// a refresh) is always welcome back to their own seat. Membership is an
// upsert for the same reason, so joining twice is harmless.
const VOYAGE_UNDER_WAY_MESSAGE =
  "This voyage has already set sail. Ask the host to open a new room.";

export async function joinRoom(
  userId: string,
  room: RoomWithRoster,
): Promise<
  | { ok: true; room: ReturnType<typeof roomSummary> }
  | { ok: false; error: string }
> {
  const alreadyMember = room.members.some((m) => m.userId === userId);
  if (!alreadyMember && room.started) {
    return { ok: false, error: VOYAGE_UNDER_WAY_MESSAGE };
  }
  await db.roomMember.upsert({
    where: { userId_roomId: { userId, roomId: room.id } },
    create: { userId, roomId: room.id },
    update: {},
  });
  const fresh = await db.room.findUniqueOrThrow({
    where: { id: room.id },
    include: ROOM_SUMMARY_INCLUDE,
  });
  return { ok: true, room: roomSummary(fresh) };
}

// ========== Leaving ==========
// Drop their seat, hand off the host crown if they were holding it, and
// remove the room entirely once nobody is left in it.
export type LeaveRoomResult =
  { roomDeleted: true } | { roomDeleted: false; newHostId: string | null };

export async function leaveRoomForUser(
  userId: string,
  roomId: string,
): Promise<LeaveRoomResult> {
  await db.roomMember.deleteMany({ where: { userId, roomId } }).catch(() => {});

  const room = await db.room.findUnique({
    where: { id: roomId },
    include: { members: { orderBy: { joinedAt: "asc" } } },
  });
  if (!room) return { roomDeleted: true };

  if (room.members.length === 0) {
    await db.room.delete({ where: { id: roomId } }).catch(() => {});
    return { roomDeleted: true };
  }

  if (room.hostId === userId) {
    const newHostId = room.members[0].userId;
    await db.room.update({
      where: { id: roomId },
      data: { hostId: newHostId },
    });
    return { roomDeleted: false, newHostId };
  }

  return { roomDeleted: false, newHostId: null };
}

// Every room a user currently sits in, for cleaning up on logout, on a
// ban, or when an account is deleted.
export async function roomIdsForUser(userId: string): Promise<string[]> {
  const memberships = await db.roomMember.findMany({
    where: { userId },
    select: { roomId: true },
  });
  return memberships.map((m) => m.roomId);
}

// Every userId currently seated in a room, straight from the membership
// table. This is the one and only definition of "who's in the room" that
// the ready check protocol and the Start Game gate both use (see
// src/server/realtime.ts). It's deliberately the durable list of
// members, not whoever happens to have a live socket connected right
// now. A member whose tab is still loading, or who had a brief network
// drop, still counts; only an actual departure (explicit leave, logout,
// or the disconnect grace timer expiring) removes them from this list.
export async function roomMemberIds(roomId: string): Promise<string[]> {
  const members = await db.roomMember.findMany({
    where: { roomId },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}
