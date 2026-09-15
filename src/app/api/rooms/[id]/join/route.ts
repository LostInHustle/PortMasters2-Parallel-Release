// POST /api/rooms/[id]/join: join a room by its id (joining by code is
// POST /api/rooms/join). Both share joinRoom in src/lib/rooms.ts.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/apiAuth";
import { joinRoom, ROOM_SUMMARY_INCLUDE } from "@/lib/rooms";

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
    include: ROOM_SUMMARY_INCLUDE,
  });
  if (!room)
    return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const joined = await joinRoom(user.id, room);
  if (!joined.ok)
    return NextResponse.json({ error: joined.error }, { status: 403 });
  return NextResponse.json({ room: joined.room });
}
