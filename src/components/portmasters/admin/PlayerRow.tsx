"use client";

import { Ban, ShieldMinus, ShieldPlus, Trash2, Undo2 } from "lucide-react";
import type { SelfUser } from "@/lib/api";
import type { AdminPlayer } from "@/lib/admin/actions";
import { canModerate, type ModerationAction } from "@/lib/admin/rules";
import { Button } from "@/components/ui/button";
import { Avatar, OnlineDot, Pill } from "../shared";
import type { PendingAction } from "./PlayerActionDialog";

function joinedOn(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// One captain on the roster with exactly the actions this viewer may take
// on them. The buttons are filtered through the same canModerate the
// server enforces, so nothing shows up that would only fail on click.
export function PlayerRow({
  me,
  player,
  onAction,
}: {
  me: SelfUser;
  player: AdminPlayer;
  onAction: (action: PendingAction) => void;
}) {
  const allowed = (action: ModerationAction) =>
    canModerate({ id: me.id, role: me.role }, action, {
      id: player.id,
      role: player.role,
    }).ok;
  const isMe = player.id === me.id;

  return (
    <div className="pm-glass rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="relative shrink-0">
        <Avatar hue={player.avatarHue} name={player.displayName} size={40} />
        <OnlineDot
          online={player.online}
          size={9}
          className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{player.displayName}</span>
          <span className="text-xs text-muted-foreground">
            @{player.username}
          </span>
          {isMe && <Pill>you</Pill>}
          {player.role === "admin" && <Pill tone="rose">Admin</Pill>}
          {player.role === "moderator" && <Pill tone="amber">Moderator</Pill>}
          {player.bannedAt && <Pill tone="rose">Banned</Pill>}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
          <span>Renown {player.renownLevel}</span>
          <span>·</span>
          <span>
            {player.voyagesCompleted}{" "}
            {player.voyagesCompleted === 1 ? "voyage" : "voyages"}
          </span>
          <span>·</span>
          <span>Joined {joinedOn(player.createdAt)}</span>
          <span>·</span>
          <span>{player.online ? "Online now" : "Offline"}</span>
        </div>
        {player.bannedAt && player.banReason && (
          <div className="text-[11px] text-rose-600 dark:text-rose-300 mt-1 leading-relaxed">
            Ban reason: {player.banReason}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap sm:justify-end">
        {player.bannedAt
          ? allowed("unban") && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => onAction({ kind: "unban", player })}
              >
                <Undo2 className="h-3.5 w-3.5" /> Lift ban
              </Button>
            )
          : allowed("ban") && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg text-rose-600 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
                onClick={() => onAction({ kind: "ban", player })}
              >
                <Ban className="h-3.5 w-3.5" /> Ban
              </Button>
            )}
        {allowed("promote") && !player.bannedAt && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg"
            onClick={() => onAction({ kind: "promote", player })}
          >
            <ShieldPlus className="h-3.5 w-3.5" /> Make moderator
          </Button>
        )}
        {allowed("demote") && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg"
            onClick={() => onAction({ kind: "demote", player })}
          >
            <ShieldMinus className="h-3.5 w-3.5" /> Remove moderator
          </Button>
        )}
        {allowed("delete") && (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-lg text-rose-600 dark:text-rose-300 hover:bg-rose-500/10"
            onClick={() => onAction({ kind: "delete", player })}
            title="Delete this account"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
