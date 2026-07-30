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

  // Restore session on mount, and with it whichever room this captain is
  // still seated in.
  //
  // The room used to live purely in the React state below, so a reload always
  // landed in the Lobby even mid voyage. That was not merely inconvenient:
  // membership is durable, and the realtime layer builds each checkpoint's
  // required roster from it (activeRosterSet in src/server/realtime.ts), so
  // the harbor went on waiting for a ready vote the reloaded captain had no
  // way to cast from the Lobby, freezing every other captain at that
  // checkpoint until the reloaded one found and rejoined their own room by
  // hand. Restoring from server side membership makes the client agree with
  // what the server already believes.
  //
  // Both requests authenticate off the same session cookie and neither needs
  // the other's result, so they go out together and page load stays as fast
  // as it was. A captain who genuinely left has no membership row and still
  // lands in the Lobby, exactly as before.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ user: u, token }, active] = await Promise.all([
          api.me(),
          // Never let this decide whether the app loads at all: an
          // unauthenticated caller gets a 401 here, and a failure of any
          // kind simply means "no room to restore".
          api.getActiveRoom().catch(() => ({ room: null })),
        ]);
        if (!alive) return;
        if (!u) {
          setStatus("auth");
          return;
        }
        setAuthToken(token);
        setUser(u);
        if (active.room) {
          setRoom(active.room);
          setStatus("game");
        } else {
          setStatus("lobby");
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
