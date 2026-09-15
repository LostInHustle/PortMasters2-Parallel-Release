// POST /api/admin/players/[id]/role { role: "moderator" | "player" }
// Promotes a player to moderator or steps a moderator back down. The admin
// seat itself is never assigned here; it only ever moves through
// POST /api/admin/claim.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { moderationFailure, requireAdmin } from "@/lib/admin/guard";
import { setModerator } from "@/lib/admin/actions";

const Schema = z.object({ role: z.enum(["moderator", "player"]) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Role must be moderator or player." },
      { status: 400 },
    );
  }

  try {
    const target = await setModerator(
      user,
      id,
      parsed.data.role === "moderator",
    );
    return NextResponse.json({ ok: true, target });
  } catch (err) {
    return moderationFailure(err);
  }
}
