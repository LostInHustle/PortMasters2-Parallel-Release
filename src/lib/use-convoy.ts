"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

export type VentureContributor = {
  userId: string;
  name: string;
  amount: number;
};

export type ConvoyVenture = {
  id: string;
  posterId: string;
  posterName: string;
  targetGold: number;
  deadlineRound: number;
  payoutMultiplier: number;
  status: string;
  total: number;
  contributions: VentureContributor[];
};

export type VentureSettlement = { userId: string; name: string; amount: number };

/**
 * [MANIFEST 04: Convoy Ventures] The shared, multi round board of open
 * ventures: a thin relay around the venture:* socket events (see
 * src/server/realtime.ts), kept separate from GameState the same way
 * useBarter and useAid are, since an open venture is real room-wide state
 * no single client's deterministic engine can compute on its own. Unlike
 * barter and aid, this one is backed by a real database table server side
 * (a venture can outlive a single phase, even a single round), but the
 * client side shape here is deliberately identical to those two: a list,
 * a post, an action, and a callback for when something involving me
 * resolves. The actual Gold effect (escrow on contribute, credit on
 * settlement) is the caller's job via the engine functions in
 * src/lib/game/engine.ts.
 *
 * `onContributed` fires once, only on the client that just contributed,
 * telling it exactly how much of its requested amount actually landed (a
 * venture can be topped up by someone else microseconds earlier, so less
 * may have been needed than was asked to give). `onSettled` fires on every
 * client in the room whenever any venture resolves; the caller filters the
 * settlements list for its own userId to find out whether it was involved
 * at all.
 */
export function useConvoy(
  socket: Socket | null,
  roomId: string,
  onContributed: (ventureId: string, accepted: number) => void,
  onSettled: (
    ventureId: string,
    filled: boolean,
    settlements: VentureSettlement[],
  ) => void,
) {
  const [ventures, setVentures] = useState<ConvoyVenture[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onContributedRef = useRef(onContributed);
  useEffect(() => {
    onContributedRef.current = onContributed;
  }, [onContributed]);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    if (!socket) return;

    const onUpdate = (data: { roomId: string; ventures: ConvoyVenture[] }) => {
      if (data.roomId !== roomId) return;
      setVentures(data.ventures);
    };
    const onContributedEvent = (data: {
      roomId: string;
      ventureId: string;
      accepted: number;
    }) => {
      if (data.roomId !== roomId) return;
      onContributedRef.current(data.ventureId, data.accepted);
    };
    const onSettledEvent = (data: {
      roomId: string;
      ventureId: string;
      filled: boolean;
      settlements: VentureSettlement[];
    }) => {
      if (data.roomId !== roomId) return;
      onSettledRef.current(data.ventureId, data.filled, data.settlements);
    };
    const onPostError = (data: { roomId: string; error: string }) => {
      if (data.roomId !== roomId) return;
      setError(data.error);
    };

    socket.on("venture:update", onUpdate);
    socket.on("venture:contributed", onContributedEvent);
    socket.on("venture:settled", onSettledEvent);
    socket.on("venture:error", onPostError);
    socket.emit("venture:state:request", { roomId });

    return () => {
      socket.off("venture:update", onUpdate);
      socket.off("venture:contributed", onContributedEvent);
      socket.off("venture:settled", onSettledEvent);
      socket.off("venture:error", onPostError);
    };
  }, [socket, roomId]);

  const post = useCallback(
    (targetGold: number, deadlineRound: number) => {
      if (!socket) return;
      socket.emit("venture:post", { roomId, targetGold, deadlineRound });
    },
    [socket, roomId],
  );

  const contribute = useCallback(
    (ventureId: string, amount: number) => {
      if (!socket) return;
      setError(null);
      socket.emit("venture:contribute", { roomId, ventureId, amount });
    },
    [socket, roomId],
  );

  return {
    ventures,
    error,
    clearError: () => setError(null),
    post,
    contribute,
  };
}
