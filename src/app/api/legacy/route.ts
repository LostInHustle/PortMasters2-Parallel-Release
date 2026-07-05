// GET /api/legacy: the current user's persistent Captain's Legacy summary
// (Renown level and XP, lifetime voyages, Sea Master crowns, best score).
// The only place this data is ever written is the voyage conclusion check
// in src/server/realtime.ts; this route is read only.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/api-auth";
import { DEFAULT_LEGACY_SUMMARY, type CaptainLegacySummary } from "@/lib/game/legacy";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const legacy = await db.captainLegacy.findUnique({ where: { userId: user.id } });
  const summary: CaptainLegacySummary = legacy
    ? {
        renownLevel: legacy.renownLevel,
        renownXP: legacy.renownXP,
        voyagesCompleted: legacy.voyagesCompleted,
        seaMasterCrowns: legacy.seaMasterCrowns,
        bestScore: legacy.bestScore,
      }
    : DEFAULT_LEGACY_SUMMARY;

  return NextResponse.json({ legacy: summary });
}
