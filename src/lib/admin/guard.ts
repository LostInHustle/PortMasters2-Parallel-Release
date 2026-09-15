// =====================================================================
// PortMasters 2 Parallel Release: admin route guards
// The two questions every console route asks first, answered once here:
// is anyone signed in, and do they hold enough authority for this door.
// Returns either the captain or the response to send instead, so a route
// reads as a straight line. Route handlers only (this reaches for
// next/headers through apiAuth).
// =====================================================================
import { NextResponse } from "next/server";
import { getCurrentUser, type AuthUser } from "../apiAuth";
import { ModerationError } from "./actions";
import { isStaff } from "./rules";

export async function requireSignedIn(): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return user;
}

export async function requireStaff(): Promise<AuthUser | NextResponse> {
  const user = await requireSignedIn();
  if (user instanceof NextResponse) return user;
  if (!isStaff(user.role)) {
    return NextResponse.json(
      { error: "This door is for moderators and the admin." },
      { status: 403 },
    );
  }
  return user;
}

export async function requireAdmin(): Promise<AuthUser | NextResponse> {
  const user = await requireStaff();
  if (user instanceof NextResponse) return user;
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Only the admin can do that." },
      { status: 403 },
    );
  }
  return user;
}

// A ModerationError already knows its status and carries a message meant
// for the person at the console; anything else is a genuine failure.
export function moderationFailure(err: unknown): NextResponse {
  if (err instanceof ModerationError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[admin] action failed", err);
  return NextResponse.json(
    { error: "Something went wrong on the server. Please try again." },
    { status: 500 },
  );
}
