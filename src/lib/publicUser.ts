// =====================================================================
// PortMasters 2 Parallel Release: the public face of a captain
// The exact user columns that are safe to hand to another captain, as a
// type, as a Prisma `select` fragment, and as the projection that trims a
// full row down to them. Every route and socket handler that includes a
// user alongside something else (a room's members, a chat message's
// sender, a room's host) needs precisely this set.
//
// This module imports nothing, on purpose. The API routes, the custom
// socket server in src/server/realtime.ts, the browser client in api.ts
// and the E2E scripts all reach for it, and some of those cannot import
// each other: realtime.ts runs outside any request and must not pull in
// next/headers, and client code must never pull in the database.
// =====================================================================

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
};

export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarHue: true,
} as const;

export function publicUser(u: PublicUser): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarHue: u.avatarHue,
  };
}

// A stable avatar hue for a brand new account, derived from the username
// so the same name always gets the same colour.
export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
