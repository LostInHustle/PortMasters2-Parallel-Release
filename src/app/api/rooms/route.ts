// GET /api/rooms: list public rooms (with member counts)
// POST /api/rooms: create a room
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, generateRoomCode, publicUser } from "@/lib/api-auth";
import { normalizeRoomName } from "@/lib/utils";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rooms = await db.room.findMany({
    where: { isPublic: true },
    include: {
      members: {
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
      },
      host: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarHue: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    rooms: rooms.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      isPublic: r.isPublic,
      started: r.started,
      createdAt: r.createdAt,
      host: publicUser(r.host),
      memberCount: r.members.length,
      members: r.members.map((m) => ({
        ...publicUser(m.user),
        joinedAt: m.joinedAt,
      })),
    })),
  });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(40),
  isPublic: z.boolean().optional().default(true),
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

  // Ensure host isn't already in another room as host of a duplicate; allow multiple.
  const room = await db.room.create({
    data: {
      code: generateRoomCode(),
      name: normalizeRoomName(name),
      hostId: user.id,
      isPublic,
      members: { create: [{ userId: user.id }] },
    },
    include: {
      members: {
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
      },
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
      members: room.members.map((m) => ({
        ...publicUser(m.user),
        joinedAt: m.joinedAt,
      })),
    },
  });
}
