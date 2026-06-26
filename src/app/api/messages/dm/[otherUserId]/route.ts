// GET /api/messages/dm/[otherUserId]: direct message history with another user
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, publicUser } from "@/lib/api-auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ otherUserId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { otherUserId } = await params;

  if (otherUserId === user.id) {
    return NextResponse.json({ messages: [], other: publicUser(user) });
  }

  const other = await db.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, username: true, displayName: true, avatarHue: true },
  });
  if (!other) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const msgs = await db.message.findMany({
    where: {
      OR: [
        { senderId: user.id, recipientId: otherUserId },
        { senderId: otherUserId, recipientId: user.id },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      sender: { select: { id: true, username: true, displayName: true, avatarHue: true } },
    },
  });

  return NextResponse.json({
    other: publicUser(other),
    messages: msgs.map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      sender: publicUser(m.sender),
      mine: m.senderId === user.id,
    })),
  });
}
