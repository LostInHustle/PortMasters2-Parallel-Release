"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Socket } from "socket.io-client";
import type { GameStatusUpdate, RoomMemberLive } from "@/lib/realtime";
import type { PublicUser } from "@/lib/api";
import { Avatar, OnlineDot, Pill } from "./shared";
import { cn } from "@/lib/utils";
import { Ship, Coins, Trophy, Crown, SkullIcon } from "lucide-react";

type StatusMap = Record<string, GameStatusUpdate>;

/**
 * Live roster of room members, collapsed down to what matters at a glance:
 * gold, reputation, and whether they're still in the run. Click a row to
 * open the full detail popup (cargo, workers, log) in GameModals.tsx.
 */
export function MembersPanel({
  socket,
  roomId,
  me,
  initialMembers,
  hostId,
  onSelectPlayer,
}: {
  socket: Socket | null;
  roomId: string;
  me: PublicUser;
  initialMembers: (PublicUser & { joinedAt?: string })[];
  hostId: string;
  onSelectPlayer: (userId: string) => void;
}) {
  const [members, setMembers] = useState<RoomMemberLive[]>(initialMembers);
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [systemNotes, setSystemNotes] = useState<string[]>([]);

  // The room channel itself is joined (and re-joined on every reconnect)
  // from GameRoom.tsx, since that needs to happen exactly once per
  // connection regardless of which panels happen to be mounted. This
  // effect only attaches this panel's own listeners and leaves the
  // channel on unmount.
  useEffect(() => {
    if (!socket) return;

    const onMembers = (data: { roomId: string; members: RoomMemberLive[] }) => {
      if (data.roomId !== roomId) return;
      // Defensive dedupe by id. The server now collapses a captain's many
      // sockets to one roster row, but a stale duplicate must never reach
      // the render below: it would collide on React's `key={m.id}`, whose
      // reconciliation is undefined and leaves a ghost row stuck on an old
      // status next to the live one.
      const seen = new Set<string>();
      const filtered = data.members.filter((m) =>
        seen.has(m.id) ? false : (seen.add(m.id), true),
      );
      setMembers(filtered);
      // Prune status entries for captains who are no longer in the room.
      // Over a long session the status map can accumulate departed members
      // whose last-known gold/reputation is now meaningless, and if a new
      // captain later joins with the same user id (impossible in practice
      // but defensive), the stale status would briefly flash before the
      // first live heartbeat overwrites it.
      const memberIds = new Set(filtered.map((m) => m.id));
      setStatuses((prev) => {
        let changed = false;
        const next: StatusMap = {};
        for (const [id, st] of Object.entries(prev)) {
          if (memberIds.has(id)) {
            next[id] = st;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };
    const onStatus = (u: GameStatusUpdate) => {
      if (u.roomId !== roomId) return;
      setStatuses((prev) => ({ ...prev, [u.user.id]: u }));
    };
    const onSystem = (data: { roomId: string; content: string }) => {
      if (data.roomId !== roomId) return;
      setSystemNotes((prev) => [...prev.slice(-12), data.content]);
    };
    socket.on("room:members", onMembers);
    socket.on("game:status", onStatus);
    socket.on("room:system", onSystem);

    return () => {
      socket.off("room:members", onMembers);
      socket.off("game:status", onStatus);
      socket.off("room:system", onSystem);
      // IMPORTANT: do NOT emit "room:leave" here.  This cleanup runs when
      // the MembersPanel unmounts (tab switch, re-render with a different
      // key, etc.), not when the user actually leaves the room.  Emitting
      // room:leave would drop the user from the server-side room channel,
      // silently breaking every subsequent room-scoped event (ready votes,
      // status broadcasts, barter, aid) with no error and no way to recover
      // short of a full page reload.
    };
  }, [socket, roomId]);

  // Sort: me first, then by reputation desc, then gold desc.
  const sorted = [...members].sort((a, b) => {
    if (a.id === me.id) return -1;
    if (b.id === me.id) return 1;
    const ra = statuses[a.id]?.reputation ?? -1;
    const rb = statuses[b.id]?.reputation ?? -1;
    if (rb !== ra) return rb - ra;
    return (statuses[b.id]?.gold ?? 0) - (statuses[a.id]?.gold ?? 0);
  });

  return (
    <div className="pm-glass rounded-2xl flex flex-col overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Ship className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Harbor
          Roster
        </h3>
        <Pill tone="sea">
          {members.length} captain{members.length !== 1 ? "s" : ""}
        </Pill>
      </div>

      <div className="pm-scroll flex-1 min-h-0 overflow-y-auto p-2.5 space-y-1.5">
        {sorted.map((m) => {
          const st = statuses[m.id];
          const isMe = m.id === me.id;
          const isHost = m.id === hostId;
          const isBankrupt = st?.phase === "bankruptcy";
          return (
            <motion.button
              key={m.id}
              layout
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => onSelectPlayer(m.id)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-xl p-2 border text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]",
                isMe
                  ? "border-teal-500/30 bg-teal-500/[0.06]"
                  : "border-black/5 dark:border-white/10 bg-background/40",
              )}
            >
              <div className="relative shrink-0">
                <Avatar hue={m.avatarHue} name={m.displayName} size={32} ring />
                <OnlineDot
                  online
                  size={9}
                  className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background rounded-full"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">
                    {m.displayName}
                  </span>
                  {isHost && (
                    <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  )}
                  {isMe && (
                    <Pill tone="sea" className="!py-0">
                      you
                    </Pill>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {st ? `R${st.round} · ${st.phaseLabel}` : "loading…"}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isBankrupt ? (
                  <Pill tone="rose">
                    <SkullIcon className="h-3 w-3" /> Bankrupt
                  </Pill>
                ) : (
                  <>
                    <Pill tone="emerald">
                      <Coins className="h-3 w-3" /> {st ? st.gold : "…"}
                    </Pill>
                    <Pill tone="gold">
                      <Trophy className="h-3 w-3" /> {st ? st.reputation : "…"}
                    </Pill>
                  </>
                )}
              </div>
            </motion.button>
          );
        })}
        {members.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-6">
            No captains in this harbor yet.
          </div>
        )}
      </div>

      {/* System notices */}
      {systemNotes.length > 0 && (
        <div className="border-t border-black/5 dark:border-white/10 px-3 py-2 max-h-16 overflow-y-auto pm-scroll">
          <AnimatePresence initial={false}>
            {systemNotes.slice(-2).map((n, i) => (
              <motion.div
                key={systemNotes.length - 2 + i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[10px] text-muted-foreground italic"
              >
                {n}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
