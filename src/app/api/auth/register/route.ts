// POST /api/auth/register
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, createSession, sessionCookieMaxAge } from "@/lib/auth";
import { sessionCookie, publicUser, hueFromString } from "@/lib/api-auth";

const Schema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username may only contain letters, numbers and underscores",
    ),
  password: z.string().min(6).max(72),
  displayName: z.string().min(1).max(24).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { username, password, displayName } = parsed.data;
  const name = (displayName ?? username).trim();

  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json(
      { error: "That captain name is already registered" },
      { status: 409 },
    );
  }

  const user = await db.user.create({
    data: {
      username,
      passwordHash: hashPassword(password),
      displayName: name,
      avatarHue: hueFromString(username),
    },
  });

  const { token, expiresAt } = await createSession(user.id);
  // Also handed back in the body (not just the httpOnly cookie) so the browser can
  // present it to a realtime service hosted on a different domain than this API.
  const res = NextResponse.json({ user: publicUser(user), expiresAt, token });
  res.headers.set("Set-Cookie", sessionCookie(token, sessionCookieMaxAge));
  return res;
}
