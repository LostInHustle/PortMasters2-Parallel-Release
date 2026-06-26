// =====================================================================
// PortMasters 2 Parallel Release: shared room-membership helper
// Plain database logic with no Next-specific imports, so it can be called
// from API routes and from the realtime layer (src/server/realtime.ts)
// alike. Centralizes what "a player leaves a room" actually means: drop
// their seat, hand off the host crown if they were holding it, and remove
// the room entirely once nobody is left in it.
// =====================================================================
import { db } from "./db";

export type LeaveRoomResult =
  | { roomDeleted: true }
  | { roomDeleted: false; newHostId: string | null };

export async function leaveRoomForUser(userId: string, roomId: string): Promise<LeaveRoomResult> {
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
    await db.room.update({ where: { id: roomId }, data: { hostId: newHostId } });
    return { roomDeleted: false, newHostId };
  }

  return { roomDeleted: false, newHostId: null };
}

// Every room a user currently sits in, for cleaning up on logout.
export async function roomIdsForUser(userId: string): Promise<string[]> {
  const memberships = await db.roomMember.findMany({ where: { userId }, select: { roomId: true } });
  return memberships.map((m) => m.roomId);
}

// Every userId currently seated in a room, straight from the membership
// table. This is the one and only definition of "who's in the room" that
// the ready-check protocol and the Start Game gate both use (see
// src/server/realtime.ts). It's deliberately the durable list of
// members, not whoever happens to have a live socket connected right
// now. A member whose tab is still loading, or who had a brief network
// drop, still counts; only an actual departure (explicit leave, logout,
// or the disconnect grace timer expiring) removes them from this list.
export async function roomMemberIds(roomId: string): Promise<string[]> {
  const members = await db.roomMember.findMany({ where: { roomId }, select: { userId: true } });
  return members.map((m) => m.userId);
}
