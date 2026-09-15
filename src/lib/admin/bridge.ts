// =====================================================================
// PortMasters 2 Parallel Release: the API's one handle on the socket server
// A ban or a deletion has to reach a captain who is connected right now,
// not just the next time they sign in. The realtime layer is the only
// thing that can drop their sockets and tidy their seat, and it registers
// these hooks the moment it attaches (see src/server/realtime.ts).
//
// Why globalThis rather than a plain module export: the API routes are
// compiled by Next into their own module graph, while realtime.ts is
// loaded by the custom server through tsx. Same process, two copies of
// every module, so a module level variable set on one side is invisible
// to the other. globalThis is the one object both graphs share, the same
// trick src/lib/db.ts already uses to keep a single Prisma client.
// =====================================================================

export type RealtimeModeration = {
  // Drops every socket the captain holds, clears their seat in any room
  // they were in, and tells that room why. `notice` is the system line
  // the room sees; the captain themselves gets it as the auth:revoked
  // reason so their screen can explain what just happened.
  ejectUser(userId: string, notice: string): void;
  onlineUserIds(): string[];
};

const KEY = "__portmastersRealtimeModeration";

type Holder = { [KEY]?: RealtimeModeration };

export function registerRealtimeModeration(hooks: RealtimeModeration): void {
  (globalThis as Holder)[KEY] = hooks;
}

// Null only when the socket server has not attached, which in the real
// app never happens (server.ts attaches it before listening). Callers
// treat it as "nobody to eject", never as an error.
export function realtimeModeration(): RealtimeModeration | null {
  return (globalThis as Holder)[KEY] ?? null;
}
