// GET /api/rooms/[id]: room detail (members, recent room chat)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, publicUser } from "@/lib/api-auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const room = await db.room.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, username: true, displayName: true, avatarHue: true } } } },
      host: { select: { id: true, username: true, displayName: true, avatarHue: true } },
      messages: {
        where: { recipientId: null },
        orderBy: { createdAt: "asc" },
        take: 100,
        include: { sender: { select: { id: true, username: true, displayName: true, avatarHue: true } } },
      },
    },
  });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const isMember = room.members.some((m) => m.userId === user.id);

  return NextResponse.json({
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      started: room.started,
      createdAt: room.createdAt,
      host: publicUser(room.host),
      memberCount: room.members.length,
      members: room.members.map((m) => ({ ...publicUser(m.user), joinedAt: m.joinedAt })),
      isMember,
    },
    messages: room.messages.map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      sender: publicUser(m.sender),
    })),
  });
}
