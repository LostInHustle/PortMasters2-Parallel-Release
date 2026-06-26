// GET /api/game/state?roomId=...: load my saved game state for a room
// PUT /api/game/state: save my game state for a room
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roomId = req.nextUrl.searchParams.get("roomId");
  if (!roomId) return NextResponse.json({ state: null });

  const state = await db.gameState.findUnique({
    where: { userId_roomId: { userId: user.id, roomId } },
  });

  // A brand new captain (no save yet) should drop into the voyage at
  // wherever the room currently is, not back at round 1. The room's
  // checkpoint is what the synchronized ready-check (src/server/realtime.ts)
  // keeps everyone else lined up against.
  let checkpoint: { currentRound: number; currentPhase: string } | null = null;
  if (!state) {
    const room = await db.room.findUnique({ where: { id: roomId }, select: { currentRound: true, currentPhase: true } });
    if (room) checkpoint = room;
  }

  return NextResponse.json({ state: state?.data ?? null, checkpoint });
}

const SaveSchema = z.object({
  roomId: z.string().min(1),
  data: z.record(z.string(), z.any()),
});

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { roomId, data } = parsed.data;

  // Must be a member of the room to save state there.
  const member = await db.roomMember.findUnique({
    where: { userId_roomId: { userId: user.id, roomId } },
  });
  if (!member) return NextResponse.json({ error: "Not a member of that room" }, { status: 403 });

  const json = JSON.stringify(data);
  const record = await db.gameState.upsert({
    where: { userId_roomId: { userId: user.id, roomId } },
    create: { userId: user.id, roomId, data: json },
    update: { data: json },
  });

  return NextResponse.json({ ok: true, updatedAt: record.updatedAt });
}
