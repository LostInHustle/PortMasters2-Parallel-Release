// =====================================================================
// PortMasters 2 Parallel Release: Captain's Merits
// One-time, account-wide achievement badges, a third strand of persistent
// progression alongside Renown (see legacy.ts) and Daily Check-In (see
// checkin.ts). Pure functions only (no React, no Prisma), so both the
// client (the trophy row in CaptainLegacyCard) and the server (the voyage
// conclusion check in src/server/realtime.ts, the only place a merit is
// ever granted) share the exact same rules for what counts.
//
// Unlike Renown XP and Check-In rewards, a merit carries no gameplay
// power of its own, purely bragging rights, so this list can grow freely
// without ever touching the voyage economy.
// =====================================================================
import { MERCHANT_RATINGS } from "./constants";
import { RENOWN_TITLES } from "./legacy";

const topRating = MERCHANT_RATINGS[0];
const topTitle = RENOWN_TITLES[RENOWN_TITLES.length - 1];

export type MeritId =
  | "first_voyage"
  | "first_crown"
  | "king_of_silk_road"
  | "renown_legend"
  | "iron_hull"
  | "century_club";

export type MeritDef = { id: MeritId; name: string; icon: string; desc: string };

// minLevel/minScore below intentionally read from RENOWN_TITLES and
// MERCHANT_RATINGS rather than repeating the numbers, so a future tier
// added to either ladder can't silently leave this list one step behind.
export const MERITS: MeritDef[] = [
  { id: "first_voyage", name: "First Landfall", icon: "⚓", desc: "Complete your first voyage." },
  { id: "first_crown", name: "Sea Master", icon: "👑", desc: "Get crowned Sea Master for the first time." },
  { id: "king_of_silk_road", name: topRating.label, icon: topRating.icon, desc: `End a single voyage with ${topRating.minScore}+ Reputation.` },
  { id: "renown_legend", name: topTitle.title, icon: "🌟", desc: `Reach Renown Level ${topTitle.minLevel}.` },
  { id: "iron_hull", name: "Iron Hull", icon: "🛡️", desc: "Complete three voyages in a row without going bankrupt." },
  { id: "century_club", name: "Century Club", icon: "💯", desc: "Complete ten voyages." },
];

export function meritById(id: string): MeritDef | undefined {
  return MERITS.find((m) => m.id === id);
}

// Everything the voyage conclusion check needs to decide which merits a
// captain qualifies for, gathered into one plain object so the rule set
// itself stays a pure function (see maybeConcludeVoyage in
// src/server/realtime.ts for where each field comes from). All the
// "new" fields already include this voyage's own contribution, since the
// caller has usually just computed them anyway for Renown.
export type MeritEvalInput = {
  newVoyagesCompleted: number;
  crowned: boolean;
  priorSeaMasterCrowns: number;
  reputation: number;
  newRenownLevel: number;
  consecutiveSolventVoyages: number;
};

const IRON_HULL_STREAK = 3;
const CENTURY_CLUB_VOYAGES = 10;

// Every merit this outcome currently qualifies for, not just the ones
// newly crossed this voyage. The caller diffs the result against
// whatever merit ids the account already has on file to find what's
// actually new, the same shape renownProgress and checkInStatus already
// use elsewhere: derive the full current status from plain state, let
// the caller work out the delta.
export function qualifyingMerits(input: MeritEvalInput): MeritId[] {
  const earned: MeritId[] = [];
  if (input.newVoyagesCompleted >= 1) earned.push("first_voyage");
  if (input.crowned || input.priorSeaMasterCrowns > 0) earned.push("first_crown");
  if (input.reputation >= topRating.minScore) earned.push("king_of_silk_road");
  if (input.newRenownLevel >= topTitle.minLevel) earned.push("renown_legend");
  if (input.consecutiveSolventVoyages >= IRON_HULL_STREAK) earned.push("iron_hull");
  if (input.newVoyagesCompleted >= CENTURY_CLUB_VOYAGES) earned.push("century_club");
  return earned;
}
