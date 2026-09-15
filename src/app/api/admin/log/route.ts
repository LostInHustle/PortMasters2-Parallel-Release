// GET /api/admin/log: the most recent moderation actions, newest first.
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin/guard";
import { listModerationLog } from "@/lib/admin/actions";

export async function GET() {
  const user = await requireStaff();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ entries: await listModerationLog() });
}
