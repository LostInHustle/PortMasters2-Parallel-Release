"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Socket } from "socket.io-client";
import type { PublicUser } from "@/lib/api";
import { useRoomRoster } from "@/lib/useRoomRoster";
import { Avatar, OnlineDot, Pill } from "./shared";
import { cn } from "@/lib/utils";
import {
  Ship,
  Coins,
  Trophy,
  Crown,
  SkullIcon,
  VolumeX,
  Volume2,
} from "lucide-react";

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
  // Roster, per captain status, and the host's mute list all come from the
  // shared hook, which FleetTicker uses too; only the system notice feed
  // below is this panel's own, since nothing else renders it.
  const { members, statuses, mutedUserIds } = useRoomRoster(
    socket,
    roomId,
    initialMembers,
  );
  const [systemNotes, setSystemNotes] = useState<string[]>([]);
  // Named viewerIsHost, not isHost, so it never shadows the per row "is this
  // row the host" check further down.
  const viewerIsHost = me.id === hostId;

  // The room channel itself is joined (and rejoined on every reconnect)
  // from GameRoom.tsx, since that needs to happen exactly once per
  // connection regardless of which panels happen to be mounted.
  useEffect(() => {
    if (!socket) return;
    const onSystem = (data: { roomId: string; content: string }) => {
      if (data.roomId !== roomId) return;
      setSystemNotes((prev) => [...prev.slice(-12), data.content]);
    };
    socket.on("room:system", onSystem);
    return () => {
      // IMPORTANT: detach the listener only. Do not emit "room:leave" here.
      // That event does exist and is genuinely used, but only from
      // handleLeave in GameRoom.tsx, for a deliberate departure. This cleanup
      // runs on any unmount (a tab switch, a rerender under a different
      // key), when the captain has not left at all, and dropping the channel
      // then would silently break every later room scoped event (ready votes,
      // status broadcasts, barter, aid) with no error and no recovery short
      // of a full reload. Switching rooms needs nothing here either: the
      // server's own "room:join" leaves the previous channel for you.
      socket.off("room:system", onSystem);
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

  const latestNote = systemNotes[systemNotes.length - 1];

  return (
    <div className="pm-glass flex h-full flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Ship className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Harbor
          Roster
        </h3>
        <Pill tone="sea">
          {members.length} captain{members.length !== 1 ? "s" : ""}
        </Pill>
      </div>

      <div className="pm-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {sorted.map((m) => {
          const st = statuses[m.id];
          const isMe = m.id === me.id;
          const isHost = m.id === hostId;
          const isBankrupt = st?.phase === "bankruptcy";
          const isMuted = mutedUserIds.has(m.id);
          return (
            <motion.div
              key={m.id}
              layout
              role="button"
              tabIndex={0}
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => onSelectPlayer(m.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectPlayer(m.id);
                }
              }}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-xl border p-2 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]",
                isMe
                  ? "border-teal-500/30 bg-teal-500/[0.06]"
                  : "border-black/5 bg-background/40 dark:border-white/10",
              )}
            >
              <div className="relative shrink-0">
                <Avatar hue={m.avatarHue} name={m.displayName} size={32} ring />
                <OnlineDot
                  online
                  size={9}
                  className="absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-background"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">
                    {m.displayName}
                  </span>
                  {isHost && (
                    <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  )}
                  {isMe && (
                    <Pill tone="sea" className="!py-0">
                      you
                    </Pill>
                  )}
                  {isMuted && (
                    <Pill tone="rose" className="!py-0">
                      <VolumeX className="h-2.5 w-2.5" /> muted
                    </Pill>
                  )}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {st ? `R${st.round} · ${st.phaseLabel}` : "loading…"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
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
                {/* [MANIFEST 14: Harbor Watch] Host only, never on my own
                    row: the host can mute anyone else, never themselves. */}
                {viewerIsHost && !isMe && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      socket?.emit(isMuted ? "chat:unmute" : "chat:mute", {
                        roomId,
                        targetUserId: m.id,
                      });
                    }}
                    title={
                      isMuted ? "Unmute this captain" : "Mute this captain"
                    }
                    className="rounded-lg p-1 text-muted-foreground hover:bg-black/[0.05] dark:hover:bg-white/10"
                  >
                    {isMuted ? (
                      <Volume2 className="h-3.5 w-3.5" />
                    ) : (
                      <VolumeX className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
        {members.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No captains in this harbor yet.
          </div>
        )}
      </div>

      {/* A reserved footer, always the same height. The old conditional
          notice block changed the roster's height mid game and made every
          row above it shift while a captain was reading. */}
      <div className="flex h-9 shrink-0 items-center border-t border-black/5 px-4 dark:border-white/10">
        <div className="min-w-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={latestNote ? systemNotes.length : "quiet"}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.14 }}
              className="truncate text-[10px] italic text-muted-foreground"
              title={latestNote}
            >
              {latestNote ?? "All quiet in the harbor"}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
