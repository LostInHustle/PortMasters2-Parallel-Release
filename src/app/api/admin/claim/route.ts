// POST /api/admin/claim: present the ADMIN_KEY and take the admin seat.
//
// The key lives only in the server environment (see the README's admin
// console section); nothing in the repository or the database ever holds
// it. The first account to present it becomes the one admin, permanently:
// once the seat is taken this route refuses everyone, key or no key, the
// admin included (see claimAdminSeat). Wrong guesses are throttled per
// account, because a signed in captain typing keys at this form is the
// only brute force this console can face.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSignedIn } from "@/lib/admin/guard";
import {
  adminKeyConfigured,
  adminKeyMatches,
  claimAdminSeat,
} from "@/lib/admin/actions";
import { KeyAttemptThrottle } from "@/lib/admin/rules";

const Schema = z.object({ key: z.string().min(1).max(512) });

const attempts = new KeyAttemptThrottle();

const SEAT_TAKEN_MESSAGE =
  "The admin seat is already taken. There is only ever one admin, and the key cannot move it or claim it again.";

export async function POST(req: NextRequest) {
  const user = await requireSignedIn();
  if (user instanceof NextResponse) return user;

  if (!adminKeyConfigured()) {
    return NextResponse.json(
      {
        error:
          "The admin console is switched off on this server: no ADMIN_KEY is configured.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter the admin key." },
      { status: 400 },
    );
  }

  const gate = attempts.check(user.id);
  if (!gate.allowed) {
    const minutes = Math.max(1, Math.ceil(gate.retryAfterMs / 60_000));
    return NextResponse.json(
      {
        error: `Too many wrong keys. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      },
      { status: 429 },
    );
  }

  if (!adminKeyMatches(parsed.data.key)) {
    attempts.recordFailure(user.id);
    return NextResponse.json(
      { error: "That is not the admin key." },
      { status: 403 },
    );
  }
  attempts.clear(user.id);

  if ((await claimAdminSeat(user)) === "taken") {
    return NextResponse.json({ error: SEAT_TAKEN_MESSAGE }, { status: 409 });
  }
  return NextResponse.json({ role: "admin" });
}
