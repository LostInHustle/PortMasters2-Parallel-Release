// POST /api/rooms/[id]/join: join by room id (or by code through /api/rooms/join)
// POST /api/rooms/join: join by code (handled below as an alias)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, publicUser } from "@/lib/api-auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const room = await db.room.findUnique({
    where: { id },
    include: {
      members: true,
      host: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarHue: true,
        },
      },
    },
  });
  if (!room)
    return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const alreadyMember = room.members.some((m) => m.userId === user.id);
  // The voyage locks once it starts: someone who hadn't already joined
  // can't slip in mid-game, but a returning member (a brief disconnect,
  // a refresh) is always welcome back to their own seat.
  if (!alreadyMember && room.started) {
    return NextResponse.json(
      {
        error:
          "This voyage has already set sail. Ask the host to open a new room.",
      },
      { status: 403 },
    );
  }

  // Upsert membership.
  await db.roomMember.upsert({
    where: { userId_roomId: { userId: user.id, roomId: room.id } },
    create: { userId: user.id, roomId: room.id },
    update: {},
  });

  const members = await db.roomMember.findMany({
    where: { roomId: room.id },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarHue: true,
        },
      },
    },
  });

  return NextResponse.json({
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      createdAt: room.createdAt,
      started: room.started,
      difficulty: room.difficulty,
      host: publicUser(room.host),
      memberCount: members.length,
      members: members.map((m) => ({
        ...publicUser(m.user),
        joinedAt: m.joinedAt,
      })),
    },
  });
}
