// =====================================================================
// PortMasters 2 Parallel Release: REST API helpers (typed fetch wrappers)
// =====================================================================
import type { CaptainLegacySummary } from "@/lib/game/legacy";
import type { CheckInStatus } from "@/lib/game/checkin";
import type { Difficulty } from "@/lib/game/difficulty";
import type { PublicUser } from "@/lib/publicUser";
import type { AdminPlayer, ModerationLogEntry } from "@/lib/admin/actions";
import type { Role } from "@/lib/admin/rules";

export type { PublicUser } from "@/lib/publicUser";

// The signed in captain's own record: what other captains see, plus the
// role only they and the admin console are ever told about.
export type SelfUser = PublicUser & { role: Role };

export type RoomSummary = {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  started: boolean;
  difficulty: Difficulty;
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
    const msg =
      data?.error || `Server error (${res.status}). Please try again later.`;
    throw new Error(msg);
  }
  return data as T;
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return jfetch<T>(url, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const api = {
  // Auth
  me: () => jfetch<{ user: SelfUser | null }>("/api/auth/me"),
  register: (body: {
    username: string;
    password: string;
    displayName?: string;
  }) => post<{ user: SelfUser; expiresAt: string }>("/api/auth/register", body),
  login: (body: { username: string; password: string }) =>
    post<{ user: SelfUser; expiresAt: string }>("/api/auth/login", body),
  logout: () => post<{ ok: true }>("/api/auth/logout"),

  // Rooms
  listRooms: () => jfetch<{ rooms: RoomSummary[] }>("/api/rooms"),
  createRoom: (body: {
    name: string;
    isPublic?: boolean;
    difficulty?: Difficulty;
  }) => post<{ room: RoomSummary }>("/api/rooms", body),
  getRoom: (id: string) =>
    jfetch<{ room: RoomDetail; messages: ChatMessage[] }>(`/api/rooms/${id}`),
  // The room this captain is still seated in, or null. Used on page load to
  // put a captain who merely reloaded back aboard instead of stranding them
  // in the Lobby while the harbor waits on their ready vote; see
  // src/app/api/rooms/active/route.ts for why membership, not client state,
  // is the thing asked.
  getActiveRoom: () => jfetch<{ room: RoomDetail | null }>("/api/rooms/active"),
  joinRoomById: (id: string) =>
    post<{ room: RoomSummary }>(`/api/rooms/${id}/join`),
  joinRoomByCode: (code: string) =>
    post<{ room: RoomSummary }>("/api/rooms/join", { code }),
  leaveRoom: (id: string) => post<{ ok: true }>(`/api/rooms/${id}/leave`),

  // Game state
  getGameState: (roomId: string) =>
    jfetch<{
      state: string | null;
      checkpoint: {
        currentRound: number;
        currentPhase: string;
        voyageEpoch: number;
      } | null;
      difficulty: Difficulty;
    }>(`/api/game/state?roomId=${roomId}`),
  saveGameState: (roomId: string, data: unknown) =>
    jfetch<{ ok: true; updatedAt: string }>("/api/game/state", {
      method: "PUT",
      body: JSON.stringify({ roomId, data }),
    }),

  // DMs
  getDmHistory: (otherUserId: string) =>
    jfetch<{ other: PublicUser; messages: ChatMessage[] }>(
      `/api/messages/dm/${otherUserId}`,
    ),

  // Captain's Legacy (persistent Renown, across every voyage the account has played).
  // The current user's own legacy also carries their daily check in status.
  getLegacy: () =>
    jfetch<{ legacy: CaptainLegacySummary; checkIn: CheckInStatus }>(
      "/api/legacy",
    ),
  getLegacyFor: (userId: string) =>
    jfetch<{ legacy: CaptainLegacySummary }>(`/api/legacy/${userId}`),
  getLegaciesFor: (userIds: string[]) =>
    post<{ legacies: Record<string, CaptainLegacySummary> }>(
      "/api/legacy/batch",
      { userIds },
    ),

  // Daily check in: claim today's reward. Returns claimed:false (not an
  // error) when today was already claimed, so the caller can just rerender.
  checkIn: () =>
    post<{
      claimed: boolean;
      day?: number;
      xpGained?: number;
      leveledUp?: boolean;
      legacy: CaptainLegacySummary;
      checkIn: CheckInStatus;
    }>("/api/checkin"),

  // Admin console (see src/lib/admin and the README's admin section).
  admin: {
    status: () =>
      jfetch<{ role: Role; configured: boolean }>("/api/admin/status"),
    claim: (key: string) =>
      post<{ role: "admin"; previousAdmin: string | null }>(
        "/api/admin/claim",
        { key },
      ),
    players: (query: string, page: number) =>
      jfetch<{ players: AdminPlayer[]; total: number; page: number }>(
        `/api/admin/players?q=${encodeURIComponent(query)}&page=${page}`,
      ),
    ban: (id: string, reason: string) =>
      post<{ ok: true }>(`/api/admin/players/${id}/ban`, { reason }),
    unban: (id: string) => post<{ ok: true }>(`/api/admin/players/${id}/unban`),
    setRole: (id: string, role: "moderator" | "player") =>
      post<{ ok: true }>(`/api/admin/players/${id}/role`, { role }),
    remove: (id: string) =>
      jfetch<{ ok: true }>(`/api/admin/players/${id}`, { method: "DELETE" }),
    log: () => jfetch<{ entries: ModerationLogEntry[] }>("/api/admin/log"),
  },
};
