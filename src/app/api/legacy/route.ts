// GET /api/legacy: the current user's persistent Captain's Legacy summary
// (Renown level and XP, lifetime voyages, Sea Master crowns, best score).
// Written only by the voyage conclusion check in src/server/realtime.ts
// and by POST /api/checkin; this route is read only.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/apiAuth";
import { legacySummaryFromRow } from "@/lib/game/legacy";
import { checkInStatus, utcDayKey } from "@/lib/game/checkin";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const legacy = await db.captainLegacy.findUnique({
    where: { userId: user.id },
  });
  const merits = await db.captainMerit.findMany({
    where: { userId: user.id },
    select: { meritId: true },
  });

  // The current user's daily check in state rides along here so the lobby
  // renders the widget without a second request. Other players' legacy
  // routes (batch, [userId]) stay read only summaries with no check in.
  const checkIn = checkInStatus(
    {
      checkInCount: legacy?.checkInCount ?? 0,
      lastCheckInDate: legacy?.lastCheckInDate ?? null,
    },
    utcDayKey(),
  );

  return NextResponse.json({
    legacy: legacySummaryFromRow(
      legacy,
      merits.map((m) => m.meritId),
    ),
    checkIn,
  });
}
