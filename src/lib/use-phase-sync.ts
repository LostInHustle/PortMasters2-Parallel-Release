"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { GameState } from "@/lib/game/types";
import { restartGame, startBoonDrafting } from "@/lib/game/engine";

export type ReadyState = {
  round: number;
  phase: string;
  readyUserIds: string[];
  requiredUserIds: string[];
};

/**
 * Gates the six recurring "everyone advances together" phase transitions
 * (locking in a boon, finishing buying/trading/maintenance/shipyard)
 * behind a room-wide ready check. Calling `markReady` no longer runs the
 * transition immediately. It tells the server "I'm done here," and the
 * actual engine call only fires once every other room member has done
 * the same, via the `phase:advance` broadcast. Each client runs the exact
 * same deterministic transition locally, so everyone lands on the same
 * next phase without the server needing to know any game rules.
 *
 * Starting the voyage itself (phase 0, the lobby) is not part of that
 * vote. It is a one-time, host-only action gated on the room having at
 * least two members, handled by `startGame` below and answered with a
 * dedicated `room:started` broadcast rather than `phase:advance`, since
 * nobody but the host called anything and there is no per-client pending
 * action to resume. Every client just runs startBoonDrafting() the
 * moment they hear it.
 */
export function usePhaseSync(
  roomId: string,
  socket: Socket | null,
  game: GameState,
  act: (fn: (g: GameState, logs: string[]) => void) => void,
  authed: boolean,
) {
  const [waiting, setWaiting] = useState(false);
  const [ready, setReady] = useState<ReadyState | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const pendingFn = useRef<((g: GameState, logs: string[]) => void) | null>(null);

  // Keep the latest game snapshot available to the listeners below
  // without re-subscribing them on every change.
  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (!socket) return;

    const onReadyUpdate = (data: ReadyState & { roomId: string }) => {
      if (data.roomId !== roomId) return;
      setReady(data);
    };
    const onAdvance = (data: { roomId: string; round: number; phase: string }) => {
      if (data.roomId !== roomId) return;
      const g = gameRef.current;
      if (data.round !== g.currentRound || String(g.phase) !== data.phase) return;
      const fn = pendingFn.current;
      pendingFn.current = null;
      setWaiting(false);
      if (fn) act(fn);
    };
    const onStarted = (data: { roomId: string }) => {
      if (data.roomId !== roomId) return;
      const g = gameRef.current;
      // Only the captains still sitting in the lobby need to act on this;
      // anyone who has already moved on (a late reconnect, say) ignores it.
      if (g.currentRound !== 1 || String(g.phase) !== "0") return;
      act((state, logs) => startBoonDrafting(state, logs));
    };
    const onError = (data: { roomId: string; error: string }) => {
      if (data.roomId === roomId) setStartError(data.error);
    };
    // The host's "restart the voyage" went through. Every captain still in
    // the room, not just whoever clicked it, drops back to a fresh run, and
    // any ready vote in flight no longer means anything.
    const onRestarted = (data: { roomId: string }) => {
      if (data.roomId !== roomId) return;
      pendingFn.current = null;
      setWaiting(false);
      setStartError(null);
      act((state, logs) => restartGame(state, logs));
    };

    socket.on("phase:ready_update", onReadyUpdate);
    socket.on("phase:advance", onAdvance);
    socket.on("room:started", onStarted);
    socket.on("room:restarted", onRestarted);
    socket.on("room:error", onError);

    // Only request phase state once the socket is authenticated, otherwise
    // the server silently drops the request (requireAuth returns null) and
    // the ready state never initialises.  Same race fix as GameRoom's
    // room:join effect: without this, a fast mount + slow auth path means
    // the client never hears who's readied up.
    if (authed) {
      socket.emit("phase:state:request", { roomId });
    }

    return () => {
      socket.off("phase:ready_update", onReadyUpdate);
      socket.off("phase:advance", onAdvance);
      socket.off("room:started", onStarted);
      socket.off("room:restarted", onRestarted);
      socket.off("room:error", onError);
    };
  }, [socket, roomId, act, authed]);

  // Once authed flips to true, fire the deferred phase:state:request so the
  // client gets the room's current checkpoint + ready set.  This covers the
  // case where the effect above mounted before authentication completed.
  useEffect(() => {
    if (!socket || !authed) return;
    socket.emit("phase:state:request", { roomId });
  }, [socket, authed, roomId]);

  const markReady = useCallback(
    (fn: (g: GameState, logs: string[]) => void) => {
      if (!socket) return;
      pendingFn.current = fn;
      setWaiting(true);
      socket.emit("phase:ready", { roomId, round: game.currentRound, phase: game.phase });
    },
    [socket, roomId, game.currentRound, game.phase],
  );

  const cancelReady = useCallback(() => {
    if (!socket) return;
    pendingFn.current = null;
    setWaiting(false);
    socket.emit("phase:unready", { roomId });
  }, [socket, roomId]);

  const startGame = useCallback(() => {
    if (!socket) return;
    setStartError(null);
    socket.emit("room:start", { roomId });
  }, [socket, roomId]);

  // Host-only: reopens the room (so new captains can join again) and
  // resets every member's voyage, not just the caller's. The server is
  // the source of truth for the "started" flag; this only asks it to flip
  // it back. See the "room:restart" handler in src/server/realtime.ts.
  const restartVoyage = useCallback(() => {
    if (!socket) return;
    socket.emit("room:restart", { roomId });
  }, [socket, roomId]);

  const readyCount = ready?.readyUserIds.length ?? 0;
  const requiredCount = ready?.requiredUserIds.length ?? 0;

  return { waiting, ready, readyCount, requiredCount, markReady, cancelReady, startGame, restartVoyage, startError };
}
