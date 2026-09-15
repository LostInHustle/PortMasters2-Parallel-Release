// GET /api/rooms/[id]: room detail (members, recent room chat)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/apiAuth";
import { PUBLIC_USER_SELECT, publicUser } from "@/lib/publicUser";
import { ROOM_SUMMARY_INCLUDE, roomSummary } from "@/lib/rooms";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const room = await db.room.findUnique({
    where: { id },
    include: {
      ...ROOM_SUMMARY_INCLUDE,
      messages: {
        where: { recipientId: null },
        orderBy: { createdAt: "asc" },
        take: 100,
        include: { sender: { select: PUBLIC_USER_SELECT } },
      },
    },
  });
  if (!room)
    return NextResponse.json({ error: "Room not found" }, { status: 404 });

  return NextResponse.json({
    room: {
      ...roomSummary(room),
      isMember: room.members.some((m) => m.userId === user.id),
    },
    messages: room.messages.map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      sender: publicUser(m.sender),
    })),
  });
}
