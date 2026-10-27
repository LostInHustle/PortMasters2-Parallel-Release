// GET /api/messages/lobby: recent messages from the harbor wide lobby chat
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/apiAuth";
import { PUBLIC_USER_SELECT, publicUser } from "@/lib/publicUser";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A lobby message is the one row with neither a room nor a recipient.
  const msgs = await db.message.findMany({
    where: { roomId: null, recipientId: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { sender: { select: PUBLIC_USER_SELECT } },
  });

  return NextResponse.json({
    messages: msgs.reverse().map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      sender: publicUser(m.sender),
      mine: m.senderId === user.id,
    })),
  });
}
