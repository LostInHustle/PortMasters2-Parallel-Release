// POST /api/admin/players/bulk { action, ids, reason? }: the same ban,
// unban or delete as the single captain routes, applied to a selection.
// Never all or nothing: every target is judged on its own and the reply
// says exactly who was reached and who was skipped, with the reason.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  moderationFailure,
  requireAdmin,
  requireStaff,
} from "@/lib/admin/guard";
import { applyToMany } from "@/lib/admin/actions";
import {
  BAN_REASON_MAX_LENGTH,
  BULK_LIMIT,
  normalizeBanReason,
} from "@/lib/admin/rules";

const Schema = z.object({
  action: z.enum(["ban", "unban", "delete"]),
  ids: z.array(z.string().min(1)).min(1).max(BULK_LIMIT),
  reason: z.unknown().optional(),
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
      {
        error: `Pick an action and between 1 and ${BULK_LIMIT} captains.`,
      },
      { status: 400 },
    );
  }
  const { action, ids } = parsed.data;

  // Deletion is the admin's alone; bans are for any staff. Same doors as
  // the single captain routes.
  const user =
    action === "delete" ? await requireAdmin() : await requireStaff();
  if (user instanceof NextResponse) return user;

  const reason =
    action === "ban" ? normalizeBanReason(parsed.data.reason) : undefined;
  if (action === "ban" && !reason) {
    return NextResponse.json(
      {
        error: `Give one reason for the bans, up to ${BAN_REASON_MAX_LENGTH} characters. Every banned captain will see it.`,
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await applyToMany(user, action, ids, reason ?? undefined),
    );
  } catch (err) {
    return moderationFailure(err);
  }
}
