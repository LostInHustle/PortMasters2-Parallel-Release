// GET /api/admin/log: the most recent moderation actions, newest first.
// DELETE /api/admin/log: admin only. Clears the log and leaves a single
// entry behind saying who cleared it and how many entries went.
import { NextResponse } from "next/server";
import {
  moderationFailure,
  requireAdmin,
  requireStaff,
} from "@/lib/admin/guard";
import { clearModerationLog, listModerationLog } from "@/lib/admin/actions";

export async function GET() {
  const user = await requireStaff();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ entries: await listModerationLog() });
}

export async function DELETE() {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json({ removed: await clearModerationLog(user) });
  } catch (err) {
    return moderationFailure(err);
  }
}
