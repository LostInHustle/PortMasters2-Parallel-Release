"use client";

import type { Socket } from "socket.io-client";
import type { PublicUser } from "@/lib/api";
import { useRoomRoster } from "@/lib/useRoomRoster";
import { Avatar } from "./shared";
import { cn } from "@/lib/utils";
import { Coins, Trophy, SkullIcon } from "lucide-react";

/**
 * [MANIFEST 18: Fleet Ticker] A glance at the whole harbor without opening
 * anyone's detail popup. MembersPanel already shows the same round, phase,
 * gold, and reputation for every captain, but it sits in the right column
 * of the desktop layout and, on any screen under the lg breakpoint, stacks
 * to the very bottom of the page behind the phase panel and the roster's
 * own scroll. This strip sits directly under the header instead, full
 * width, on every screen size, so the room's state is visible without
 * scrolling past anything. The live roster comes from useRoomRoster, the
 * same hook MembersPanel uses, rather than threading a second copy of that
 * state down from GameRoom.
 *
 * It renders even with a single captain. The old early return made the
 * whole layout jump down the moment a second player joined.
 */
export function FleetTicker({
  socket,
  roomId,
  me,
  initialMembers,
}: {
  socket: Socket | null;
  roomId: string;
  me: PublicUser;
  initialMembers: (PublicUser & { joinedAt?: string })[];
}) {
  const { members, statuses } = useRoomRoster(socket, roomId, initialMembers);

  // Me first, then the same reputation and gold ordering MembersPanel uses,
  // so a captain finds their own chip in the same spot in both places.
  const sorted = [...members].sort((a, b) => {
    if (a.id === me.id) return -1;
    if (b.id === me.id) return 1;
    const ra = statuses[a.id]?.reputation ?? -1;
    const rb = statuses[b.id]?.reputation ?? -1;
    if (rb !== ra) return rb - ra;
    return (statuses[b.id]?.gold ?? 0) - (statuses[a.id]?.gold ?? 0);
  });

  return (
    <div className="pm-glass flex h-11 shrink-0 items-center overflow-hidden rounded-2xl px-3">
      <div className="pm-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {sorted.map((m) => {
          const st = statuses[m.id];
          const isMe = m.id === me.id;
          const isBankrupt = st?.phase === "bankruptcy";
          return (
            <div
              key={m.id}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-xl border px-2 py-1",
                isMe
                  ? "border-teal-500/30 bg-teal-500/[0.06]"
                  : "border-black/5 bg-background/40 dark:border-white/10",
              )}
            >
              <Avatar hue={m.avatarHue} name={m.displayName} size={20} />
              <span className="max-w-[84px] truncate text-[11px] font-medium">
                {isMe ? "You" : m.displayName}
              </span>
              {isBankrupt ? (
                <span className="flex items-center gap-1 text-[10px] text-rose-600 dark:text-rose-400">
                  <SkullIcon className="h-3 w-3" /> Bankrupt
                </span>
              ) : (
                <>
                  <span className="max-w-[96px] truncate text-[10px] text-muted-foreground">
                    {st ? st.phaseLabel : "Reading the tide…"}
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                    <Coins className="h-3 w-3" /> {st ? st.gold : "…"}
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                    <Trophy className="h-3 w-3" /> {st ? st.reputation : "…"}
                  </span>
                </>
              )}
            </div>
          );
        })}
        {sorted.length <= 1 && (
          <span className="truncate pl-1 text-[10px] italic text-muted-foreground/70">
            Waiting for the next captain to come aboard
          </span>
        )}
      </div>
    </div>
  );
}
