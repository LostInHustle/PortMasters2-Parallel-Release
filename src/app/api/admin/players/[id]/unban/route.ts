// POST /api/admin/players/[id]/unban
import { NextRequest, NextResponse } from "next/server";
import { moderationFailure, requireStaff } from "@/lib/admin/guard";
import { unbanPlayer } from "@/lib/admin/actions";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireStaff();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  try {
    const target = await unbanPlayer(user, id);
    return NextResponse.json({ ok: true, target });
  } catch (err) {
    return moderationFailure(err);
  }
}
