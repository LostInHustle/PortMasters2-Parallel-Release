// =====================================================================
// PortMasters 2 Parallel Release: REST API helpers (typed fetch wrappers)
// =====================================================================
import type { CaptainLegacySummary } from "@/lib/game/legacy";
import type { CheckInStatus } from "@/lib/game/checkin";

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
};

export type RoomSummary = {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  started: boolean;
  createdAt: string;
  host: PublicUser;
  memberCount: number;
  members: Array<PublicUser & { joinedAt: string }>;
};

export type RoomDetail = RoomSummary & { isMember: boolean };

export type ChatMessage = {
  id: string;
  content: string;
  createdAt: string;
  sender: PublicUser;
  mine?: boolean;
  recipient?: PublicUser;
};

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      ...init,
    });
  } catch {
    throw new Error("Cannot reach the server. It may be temporarily offline.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.error || `Server error (${res.status}). Please try again later.`;
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  // Auth
  me: () => jfetch<{ user: PublicUser | null; token: string | null }>("/api/auth/me"),
  register: (body: { username: string; password: string; displayName?: string }) =>
    jfetch<{ user: PublicUser; expiresAt: string; token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body: { username: string; password: string }) =>
    jfetch<{ user: PublicUser; expiresAt: string; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: () => jfetch<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  // Rooms
  listRooms: () => jfetch<{ rooms: RoomSummary[] }>("/api/rooms"),
  createRoom: (body: { name: string; isPublic?: boolean }) =>
    jfetch<{ room: RoomSummary }>("/api/rooms", { method: "POST", body: JSON.stringify(body) }),
  getRoom: (id: string) => jfetch<{ room: RoomDetail; messages: ChatMessage[] }>(`/api/rooms/${id}`),
  joinRoomById: (id: string) =>
    jfetch<{ room: RoomSummary }>(`/api/rooms/${id}/join`, { method: "POST" }),
  joinRoomByCode: (code: string) =>
    jfetch<{ room: RoomSummary }>("/api/rooms/join", { method: "POST", body: JSON.stringify({ code }) }),
  leaveRoom: (id: string) => jfetch<{ ok: true }>(`/api/rooms/${id}/leave`, { method: "POST" }),

  // Game state
  getGameState: (roomId: string) =>
    jfetch<{ state: string | null; checkpoint: { currentRound: number; currentPhase: string } | null }>(
      `/api/game/state?roomId=${roomId}`,
    ),
  saveGameState: (roomId: string, data: unknown) =>
    jfetch<{ ok: true; updatedAt: string }>("/api/game/state", {
      method: "PUT",
      body: JSON.stringify({ roomId, data }),
    }),

  // DMs
  getDmHistory: (otherUserId: string) =>
    jfetch<{ other: PublicUser; messages: ChatMessage[] }>(`/api/messages/dm/${otherUserId}`),

  // Captain's Legacy (persistent Renown, across every voyage the account has played).
  // The current user's own legacy also carries their Daily Check-In status.
  getLegacy: () => jfetch<{ legacy: CaptainLegacySummary; checkIn: CheckInStatus }>("/api/legacy"),
  getLegacyFor: (userId: string) => jfetch<{ legacy: CaptainLegacySummary }>(`/api/legacy/${userId}`),
  getLegaciesFor: (userIds: string[]) =>
    jfetch<{ legacies: Record<string, CaptainLegacySummary> }>("/api/legacy/batch", {
      method: "POST",
      body: JSON.stringify({ userIds }),
    }),

  // Daily Check-In: claim today's reward. Returns claimed:false (not an
  // error) when today was already claimed, so the caller can just re-render.
  checkIn: () =>
    jfetch<{
      claimed: boolean;
      day?: number;
      xpGained?: number;
      leveledUp?: boolean;
      legacy: CaptainLegacySummary;
      checkIn: CheckInStatus;
    }>("/api/check-in", { method: "POST" }),
};
