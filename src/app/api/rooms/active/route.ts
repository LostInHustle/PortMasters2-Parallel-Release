// GET /api/rooms/active: the room the current captain is still seated in,
// if any, so a page load can put them back where they actually are.
//
// Why this exists. Room membership is durable (the RoomMember table) and is
// already the authority the realtime layer trusts: activeRosterSet in
// src/server/realtime.ts builds each checkpoint's required roster straight
// from it. The client, however, held the active room in React state only
// (see src/app/page.tsx), so any reload dropped a captain into the Lobby
// while the server still counted them as seated and still waited on their
// ready vote. That stalled every other captain in the harbor at the current
// checkpoint until the reloaded captain happened to find and rejoin their
// own room by hand, which needs the code and is not possible at all for a
// private room whose code they never noted.
//
// Reading membership back from the database rather than persisting a room id
// on the client keeps one source of truth. A captain who deliberately leaves
// has no membership row, so they correctly land in the Lobby; a captain who
// merely refreshed does, so they land back aboard.
//
// This returns the room only, deliberately without chat history, even though
// GET /api/rooms/[id] bundles both: GameRoom.tsx refetches detail and recent
// messages itself the moment it mounts, so shipping them here too would put
// up to a hundred rows on every single page load for a caller that throws
// them away.
import { NextResponse } from "next/server";
import { db, PUBLIC_USER_SELECT } from "@/lib/db";
import { getCurrentUser, publicUser } from "@/lib/api-auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Nothing stops a captain holding seats in more than one room (RoomMember
  // is unique per user and room, not per user), so pick the seat they took
  // most recently: that is the voyage they were actually sailing.
  const membership = await db.roomMember.findFirst({
    where: { userId: user.id },
    orderBy: { joinedAt: "desc" },
    select: { roomId: true },
  });
  if (!membership) return NextResponse.json({ room: null });

  const room = await db.room.findUnique({
    where: { id: membership.roomId },
    include: {
      members: {
        include: {
          user: {
            select: PUBLIC_USER_SELECT,
          },
        },
      },
      host: {
        select: PUBLIC_USER_SELECT,
      },
    },
  });
  // A membership row whose room is gone should not happen (the relation
  // cascades on delete), but report "no active room" rather than a 404: the
  // caller's only real question is whether to restore or show the Lobby.
  if (!room) return NextResponse.json({ room: null });

  return NextResponse.json({
    room: {
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
      isMember: true,
    },
  });
}
