// DELETE /api/admin/players/[id]: remove an account for good.
import { NextRequest, NextResponse } from "next/server";
import { moderationFailure, requireAdmin } from "@/lib/admin/guard";
import { deletePlayer } from "@/lib/admin/actions";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  try {
    const target = await deletePlayer(user, id);
    return NextResponse.json({ ok: true, target });
  } catch (err) {
    return moderationFailure(err);
  }
}
