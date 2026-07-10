// =====================================================================
// PortMasters 2 Parallel Release: realtime client (Socket.IO singleton and hooks)
//
// The realtime layer is attached to the same Next.js server, so this
// connects to the current origin with Socket.IO's default path, no
// separate URL or port to configure.
// =====================================================================
"use client";

import { io, type Socket } from "socket.io-client";
import type { PublicUser } from "./api";

// The session cookie is httpOnly, so the page fetches this token once after
// signing in (see api.me/login/register) and hands it here so it can be
// presented explicitly over the socket.
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export type OnlineUser = PublicUser & { roomId: string | null };

export type RoomMemberLive = PublicUser;

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
};

export type VoyageCompleteEvent = {
  roomId: string;
  winnerId: string | null;
  standings: VoyageStanding[];
};

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
