// =====================================================================
// A minimal authenticated REST client for the E2E scenario suite. Mirrors
// src/lib/api.ts's shape but stays a standalone Node script (no Next.js
// runtime, no browser fetch cookie jar) so it can register captains, seed
// rooms, and write crafted GameState saves directly over HTTP against a
// live instance of the app, the same endpoints the real client uses.
// =====================================================================
import type { GameState } from "../../../src/lib/game/types";
import type { Difficulty } from "../../../src/lib/game/difficulty";
import { SESSION_COOKIE_NAME } from "../../../src/lib/auth";

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
  difficulty: Difficulty;
};

export class TestClient {
  private token: string | null = null;
  user: PublicUser | null = null;

  constructor(private baseUrl: string) {}

  // Exposed so a Playwright BrowserContext can be handed the exact cookie
  // this client is authenticated with, putting a real browser tab into the
  // same session a scenario set up over plain HTTP.
  get sessionToken(): string {
    if (!this.token) throw new Error("Not authenticated yet");
    return this.token;
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { skipAuth?: boolean },
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (this.token && !init?.skipAuth) {
      headers["Cookie"] = `${SESSION_COOKIE_NAME}=${this.token}`;
    }
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const m = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      if (m) this.token = m[1];
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new Error(
        `${init?.method ?? "GET"} ${path} -> ${res.status}: ${data?.error ?? text}`,
      );
    }
    return data as T;
  }

  async register(
    username: string,
    password: string,
    displayName?: string,
  ): Promise<PublicUser> {
    const { user } = await this.request<{ user: PublicUser }>(
      "/api/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ username, password, displayName }),
      },
    );
    this.user = user;
    return user;
  }

  async login(username: string, password: string): Promise<PublicUser> {
    const { user } = await this.request<{ user: PublicUser }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) },
    );
    this.user = user;
    return user;
  }

  createRoom(body: {
    name: string;
    isPublic?: boolean;
    difficulty?: Difficulty;
  }): Promise<{ room: RoomSummary }> {
    return this.request("/api/rooms", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  joinRoomByCode(code: string): Promise<{ room: RoomSummary }> {
    return this.request("/api/rooms/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  getActiveRoom(): Promise<{ room: RoomSummary | null }> {
    return this.request("/api/rooms/active");
  }

  putGameState(roomId: string, data: GameState): Promise<{ ok: true }> {
    return this.request("/api/game/state", {
      method: "PUT",
      body: JSON.stringify({ roomId, data }),
    });
  }

  getGameState(
    roomId: string,
  ): Promise<{ state: string | null; checkpoint: unknown }> {
    return this.request(`/api/game/state?roomId=${roomId}`);
  }
}

// A username unique enough that two scenarios (or two runs) never collide,
// without needing a counter threaded through every caller. Usernames are
// capped at 20 chars server-side (see the register route's Zod schema),
// so the prefix is trimmed rather than the uniqueness suffix.
export function uniqueUsername(prefix: string): string {
  const suffix =
    (Date.now() % 1e8).toString(36) + Math.random().toString(36).slice(2, 6);
  return `${prefix.slice(0, 20 - suffix.length)}${suffix}`;
}
