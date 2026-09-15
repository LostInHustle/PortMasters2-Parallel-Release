// =====================================================================
// PortMasters 2 Parallel Release: request auth helper for API routes
// Reads the session cookie and returns the signed in captain, or null.
// Imports next/headers, so this is for route handlers only; the socket
// server in src/server/realtime.ts reads the cookie off the handshake
// itself and goes straight to getUserFromToken.
// =====================================================================
import { cookies } from "next/headers";
import { getUserFromToken, SESSION_COOKIE_NAME } from "./auth";
import { normalizeRole, type Role } from "./admin/rules";
import { publicUser, type PublicUser } from "./publicUser";

// The signed in captain's own view of themselves: the public fields plus
// the role, which is only ever shown to its owner and the admin console,
// never to other captains.
export type AuthUser = PublicUser & { role: Role };

export function authUser(user: PublicUser & { role: string }): AuthUser {
  return { ...publicUser(user), role: normalizeRole(user.role) };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const user = await getUserFromToken(store.get(SESSION_COOKIE_NAME)?.value);
  return user ? authUser(user) : null;
}

export function sessionCookie(token: string, maxAgeSec: number) {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
