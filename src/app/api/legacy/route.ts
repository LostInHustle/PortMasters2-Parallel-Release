// GET /api/legacy: the current user's persistent Captain's Legacy summary
// (Renown level and XP, lifetime voyages, Sea Master crowns, best score).
// The only place this data is ever written is the voyage conclusion check
// in src/server/realtime.ts; this route is read only.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/api-auth";
import {
  DEFAULT_LEGACY_SUMMARY,
  parseStatsByDifficulty,
  type CaptainLegacySummary,
} from "@/lib/game/legacy";
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
  const summary: CaptainLegacySummary = legacy
    ? {
        renownLevel: legacy.renownLevel,
        renownXP: legacy.renownXP,
        voyagesCompleted: legacy.voyagesCompleted,
        seaMasterCrowns: legacy.seaMasterCrowns,
        bestScore: legacy.bestScore,
        meritIds: merits.map((m) => m.meritId),
        statsByDifficulty: parseStatsByDifficulty(legacy.statsByDifficulty),
      }
    : DEFAULT_LEGACY_SUMMARY;

  // The current user's Daily Check-In state rides along here so the lobby
  // renders the widget without a second request. Other players' legacy
  // routes (batch, [userId]) stay read-only summaries with no check-in.
  const checkIn = checkInStatus(
    {
      checkInCount: legacy?.checkInCount ?? 0,
      lastCheckInDate: legacy?.lastCheckInDate ?? null,
    },
    utcDayKey(),
  );

  return NextResponse.json({ legacy: summary, checkIn });
}
