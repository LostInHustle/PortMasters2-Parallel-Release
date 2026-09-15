// =====================================================================
// PortMasters 2 Parallel Release: auth and session primitives
// Node's built in scrypt for password hashing (no extra dependency) and
// random session tokens stored in the database. Shared by the API routes
// (through src/lib/apiAuth.ts) and the socket server, so a rule enforced
// here, like a ban, holds on both doors at once.
// =====================================================================
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "./db";

export const SESSION_COOKIE_NAME = "pm_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
export const sessionCookieMaxAge = SESSION_TTL_MS / 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const target = Buffer.from(hash, "hex");
  if (test.length !== target.length) return false;
  return timingSafeEqual(test, target);
}

export async function createSession(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

// The full user row for a live session, or null. A session that has
// expired, or that belongs to a captain banned since it was issued, is
// deleted on the spot: a ban already revokes every session it can find,
// this just closes the window for one created in the same instant.
export async function getUserFromToken(token: string | undefined | null) {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now() || session.user.bannedAt) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}
