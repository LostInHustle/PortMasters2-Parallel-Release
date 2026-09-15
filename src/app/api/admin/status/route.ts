// GET /api/admin/status: what the console should show this captain.
// Any signed in account may ask, since the answer is what decides between
// the claim form (an ordinary player, with the key to hand or not) and the
// console proper (a moderator or the admin).
import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/admin/guard";
import { adminKeyConfigured } from "@/lib/admin/actions";

export async function GET() {
  const user = await requireSignedIn();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({
    role: user.role,
    configured: adminKeyConfigured(),
  });
}
