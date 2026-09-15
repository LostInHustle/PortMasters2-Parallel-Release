// POST /api/admin/players/[id]/ban { reason }
import { NextRequest, NextResponse } from "next/server";
import { moderationFailure, requireStaff } from "@/lib/admin/guard";
import { banPlayer } from "@/lib/admin/actions";
import { BAN_REASON_MAX_LENGTH, normalizeBanReason } from "@/lib/admin/rules";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireStaff();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  let body: { reason?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Treated the same as a missing reason below.
  }
  const reason = normalizeBanReason(body?.reason);
  if (!reason) {
    return NextResponse.json(
      {
        error: `Give a reason for the ban, up to ${BAN_REASON_MAX_LENGTH} characters. The captain will see it when they try to sign in.`,
      },
      { status: 400 },
    );
  }

  try {
    const target = await banPlayer(user, id, reason);
    return NextResponse.json({ ok: true, target });
  } catch (err) {
    return moderationFailure(err);
  }
}
