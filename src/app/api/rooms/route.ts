// GET /api/rooms: list public rooms (with member counts)
// POST /api/rooms: create a room
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/apiAuth";
import {
  generateRoomCode,
  ROOM_SUMMARY_INCLUDE,
  roomSummary,
} from "@/lib/rooms";
import { normalizeRoomName } from "@/lib/utils";
import { normalizeDifficulty } from "@/lib/game/difficulty";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rooms = await db.room.findMany({
    where: { isPublic: true },
    include: ROOM_SUMMARY_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ rooms: rooms.map(roomSummary) });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(40),
  isPublic: z.boolean().optional().default(true),
  // Any unknown value is coerced to the entry tier by normalizeDifficulty.
  difficulty: z.string().optional(),
});

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
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { name, isPublic } = parsed.data;

  const room = await db.room.create({
    data: {
      code: generateRoomCode(),
      name: normalizeRoomName(name),
      hostId: user.id,
      isPublic,
      difficulty: normalizeDifficulty(parsed.data.difficulty),
      members: { create: [{ userId: user.id }] },
    },
    include: ROOM_SUMMARY_INCLUDE,
  });

  return NextResponse.json({ room: roomSummary(room) });
}
