// GET /api/auth/me: current authenticated user
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/api-auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 200 });
  // The session cookie is httpOnly, so client code cannot read it directly.
  // We hand the same token back here so the browser can present it to the
  // realtime service when that service lives on a different domain (for
  // example the frontend on Vercel and the realtime service on Railway),
  // since a cookie set by one domain is never sent to another.
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value ?? null;
  return NextResponse.json({ user, token });
}
