// GET /api/auth/me: the signed in captain, or null when nobody is
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/apiAuth";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}
