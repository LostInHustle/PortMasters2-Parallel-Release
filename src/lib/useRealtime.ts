"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket, type OnlineUser } from "@/lib/realtime";
import type { PublicUser } from "@/lib/publicUser";

// App wide realtime connection and presence. The socket is a singleton;
// this hook attaches listeners for presence and auth and returns the live
// socket so components can subscribe to room, chat and game status events.
export function useRealtime(user: PublicUser | null) {
  // Lazily obtain the shared socket (singleton). Recomputed only when the
  // authenticated user changes.
  const socket = useMemo(() => (user ? getSocket() : null), [user]);
  const [connected, setConnected] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    if (!socket) {
      // Defer resets so we don't call setState synchronously inside the effect.
      Promise.resolve().then(() => {
        if (alive.current) {
          setConnected(false);
          setAuthed(false);
        }
      });
      return;
    }
    alive.current = true;

    // The server authenticates every fresh connection from its handshake
    // cookie on its own, so a connect needs no request from this side; the
    // auth:ok that follows is what flips `authed`.
    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      setConnected(false);
      setAuthed(false);
    };
    const onAuthOk = () => {
      if (alive.current) setAuthed(true);
    };
    const onPresence = (data: { users: OnlineUser[] }) => {
      if (alive.current) setOnlineUsers(data.users ?? []);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("auth:ok", onAuthOk);
    socket.on("presence:update", onPresence);

    // Mounted onto a socket that was already open (a screen change, not a
    // page load): the auth:ok for this connection has already come and
    // gone, so ask for a fresh one to learn where things stand. The
    // connected flag is synced on a microtask to keep the setState out of
    // the effect body itself.
    if (socket.connected) {
      Promise.resolve().then(() => {
        if (alive.current) setConnected(true);
      });
      socket.emit("auth");
    }

    return () => {
      alive.current = false;
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("auth:ok", onAuthOk);
      socket.off("presence:update", onPresence);
    };
  }, [socket]);

  return { socket, connected, authed, onlineUsers };
}
