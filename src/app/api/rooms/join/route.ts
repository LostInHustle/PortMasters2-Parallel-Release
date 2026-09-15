// POST /api/rooms/join: join a room by its six character code
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/apiAuth";
import { joinRoom, ROOM_CODE_LENGTH, ROOM_SUMMARY_INCLUDE } from "@/lib/rooms";

const Schema = z.object({ code: z.string().length(ROOM_CODE_LENGTH) });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `A ${ROOM_CODE_LENGTH} character room code is required` },
      { status: 400 },
    );
  }

  const room = await db.room.findUnique({
    where: { code: parsed.data.code.toUpperCase() },
    include: ROOM_SUMMARY_INCLUDE,
  });
  if (!room)
    return NextResponse.json(
      { error: "No room exists with that code" },
      { status: 404 },
    );

  const joined = await joinRoom(user.id, room);
  if (!joined.ok)
    return NextResponse.json({ error: joined.error }, { status: 403 });
  return NextResponse.json({ room: joined.room });
}
