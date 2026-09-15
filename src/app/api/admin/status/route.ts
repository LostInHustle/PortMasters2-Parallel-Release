// GET /api/admin/status: what the console should show this captain.
// Any signed in account may ask, since the answer is what decides between
// the console proper (a moderator or the admin), the claim form (nobody
// holds the seat yet), and a closed door (the seat is taken, or the server
// has no key at all).
import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/admin/guard";
import { adminKeyConfigured, adminSeatTaken } from "@/lib/admin/actions";

export async function GET() {
  const user = await requireSignedIn();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({
    role: user.role,
    configured: adminKeyConfigured(),
    seatTaken: await adminSeatTaken(),
  });
}
