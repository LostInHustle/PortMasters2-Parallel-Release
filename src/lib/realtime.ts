// =====================================================================
// PortMasters 2 Parallel Release: realtime client (Socket.IO singleton)
//
// The realtime layer is attached to the same Next.js server, so this
// connects to the current origin with Socket.IO's default path, no
// separate URL or port to configure. The session cookie rides on the
// handshake like on any other request, which is how the server knows
// who is connecting (see authenticate in src/server/realtime.ts).
// =====================================================================
"use client";

import { io, type Socket } from "socket.io-client";
import type { PublicUser } from "./publicUser";

export type OnlineUser = PublicUser & { roomId: string | null };

export type GameStatusUpdate = {
  roomId: string;
  user: PublicUser;
  round: number;
  phase: number | string;
  phaseLabel: string;
  gold: number;
  reputation: number;
  shipLevel: number;
  gameOver: boolean;
  at: number;
};

// One row per captain who was seated in the room when its voyage
// concluded (see maybeConcludeVoyage in src/server/realtime.ts), sorted
// by Reputation, highest first. Renown fields reflect that captain's
// CaptainLegacy account *after* this voyage's XP was applied, not before.
export type VoyageStanding = {
  userId: string;
  displayName: string;
  avatarHue: number;
  reputation: number;
  gold: number;
  crowned: boolean;
  bankrupt: boolean;
  renownLevel: number;
  renownTitle: string;
  xpGained: number;
  leveledUp: boolean;
  brokersFavorUnlocked: boolean;
  // Captain's Merit ids (see src/lib/game/merits.ts) newly earned by this
  // voyage's outcome, not the account's full collection; that full list
  // lives on CaptainLegacySummary.meritIds instead.
  newMerits: string[];
};

export type VoyageCompleteEvent = {
  roomId: string;
  winnerId: string | null;
  standings: VoyageStanding[];
};

// Fired when the server ends this session from its side, which today
// means a moderator banned the account or the admin deleted it. The page
// shell (src/app/page.tsx) registers the one handler, since it owns the
// signed in state that has to be torn down; every socket this module
// ever creates reports through it.
let revokedHandler: ((reason: string) => void) | null = null;

export function onSessionRevoked(handler: (reason: string) => void) {
  revokedHandler = handler;
  return () => {
    if (revokedHandler === handler) revokedHandler = null;
  };
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    socket.on("auth:revoked", (data: { reason?: string }) => {
      revokedHandler?.(
        data?.reason ?? "Your session was ended by the harbor staff.",
      );
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
