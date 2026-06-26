// POST /api/rooms/[id]/leave: leave a room
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/api-auth";
import { leaveRoomForUser } from "@/lib/rooms";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  await leaveRoomForUser(user.id, id);

  return NextResponse.json({ ok: true });
}
