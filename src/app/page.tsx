"use client";

import { useEffect, useState } from "react";
import { api, type PublicUser, type RoomDetail } from "@/lib/api";
import { disconnectSocket, setAuthToken } from "@/lib/realtime";
import { AuthScreen } from "@/components/portmasters/AuthScreen";
import { Lobby } from "@/components/portmasters/Lobby";
import { GameRoom } from "@/components/portmasters/GameRoom";
import { Anchor } from "lucide-react";

type Status = "loading" | "auth" | "lobby" | "game";

export default function Home() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [room, setRoom] = useState<RoomDetail | null>(null);

  // Restore session on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { user: u, token } = await api.me();
        if (!alive) return;
        if (u) {
          setAuthToken(token);
          setUser(u);
          setStatus("lobby");
        } else {
          setStatus("auth");
        }
      } catch {
        if (alive) setStatus("auth");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    // Tear down the realtime connection too, otherwise the old session
    // lingers as "online" (and still occupying any room) until it happens
    // to drop on its own.
    disconnectSocket();
    setAuthToken(null);
    setUser(null);
    setStatus("auth");
    setRoom(null);
  }

  if (status === "loading") {
    return (
      <div className="pm-canvas min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="pm-grad-primary h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg">
            <Anchor className="h-6 w-6 text-white" />
          </div>
          <span className="text-sm">Reading the tide tables…</span>
        </div>
      </div>
    );
  }

  if (status === "auth" || !user) {
    return (
      <AuthScreen
        onAuthed={(u, token) => {
          setAuthToken(token);
          setUser(u);
          setStatus("lobby");
        }}
      />
    );
  }

  if (status === "lobby") {
    return (
      <Lobby
        me={user}
        onEnterRoom={(r) => {
          // Fetch full room detail (members + chat) before entering.
          api
            .getRoom(r.id)
            .then(({ room: detail }) => {
              setRoom(detail);
              setStatus("game");
            })
            .catch(() => {
              // Fall back to the summary if detail fetch fails.
              setRoom({ ...r, isMember: true } as RoomDetail);
              setStatus("game");
            });
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (status === "game" && room) {
    return (
      <GameRoom
        me={user}
        room={room}
        onLeave={() => {
          setRoom(null);
          setStatus("lobby");
        }}
      />
    );
  }

  // Fallback to lobby.
  return <Lobby me={user} onEnterRoom={() => {}} onLogout={handleLogout} />;
}
