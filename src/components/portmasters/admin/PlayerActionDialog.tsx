"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AdminPlayer } from "@/lib/admin/actions";
import {
  BAN_REASON_MAX_LENGTH,
  type ModerationAction,
} from "@/lib/admin/rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PendingAction = { kind: ModerationAction; player: AdminPlayer };

const COPY: Record<
  ModerationAction,
  { title: string; description: string; confirm: string; destructive: boolean }
> = {
  ban: {
    title: "Ban this captain?",
    description:
      "They are signed out everywhere at once, dropped from any harbor they are sailing in, and cannot sign in again until the ban is lifted. They will see the reason you give here.",
    confirm: "Ban",
    destructive: true,
  },
  unban: {
    title: "Lift the ban?",
    description:
      "They can sign in again straight away. Their Renown, merits and account are exactly as they left them.",
    confirm: "Lift ban",
    destructive: false,
  },
  promote: {
    title: "Make this captain a moderator?",
    description:
      "Moderators can open this office and ban or unban ordinary captains. They cannot touch other moderators, the admin, roles, or delete accounts.",
    confirm: "Make moderator",
    destructive: false,
  },
  demote: {
    title: "Remove the moderator badge?",
    description:
      "They go back to being an ordinary captain and lose access to this office. Nothing else about the account changes.",
    confirm: "Remove moderator",
    destructive: false,
  },
  delete: {
    title: "Delete this account for good?",
    description:
      "This cannot be undone. Their Renown, merits, chat messages and saved voyages are removed. Any harbor they host is handed to the next captain in it, or closed if it was empty.",
    confirm: "Delete account",
    destructive: true,
  },
};

// Mounted fresh for every action (the console keys it on the action and
// the captain), so a reason typed for one ban never lingers into the next.
export function PlayerActionDialog({
  pending,
  onClose,
  onDone,
  onForbidden,
}: {
  pending: PendingAction;
  onClose: () => void;
  onDone: () => void;
  // The server refused on grounds of authority, which usually means this
  // account's own role changed while the console was open.
  onForbidden: () => void;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { kind, player } = pending;
  const copy = COPY[kind];
  const needsReason = kind === "ban";
  const needsTypedName = kind === "delete";
  const reasonOk =
    reason.trim().length > 0 && reason.length <= BAN_REASON_MAX_LENGTH;
  const canConfirm =
    !busy &&
    (!needsReason || reasonOk) &&
    (!needsTypedName || typed.trim() === player.username);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      if (kind === "ban") await api.admin.ban(player.id, reason.trim());
      else if (kind === "unban") await api.admin.unban(player.id);
      else if (kind === "promote")
        await api.admin.setRole(player.id, "moderator");
      else if (kind === "demote") await api.admin.setRole(player.id, "player");
      else await api.admin.remove(player.id);
      toast.success(
        kind === "ban"
          ? `${player.displayName} has been banned`
          : kind === "unban"
            ? `${player.displayName}'s ban was lifted`
            : kind === "promote"
              ? `${player.displayName} is now a moderator`
              : kind === "demote"
                ? `${player.displayName} is a captain again`
                : `${player.displayName}'s account was deleted`,
      );
      onDone();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      if (/only the admin|moderators and the admin|this door/i.test(message)) {
        onForbidden();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">
              {player.displayName}
            </span>{" "}
            <span className="text-muted-foreground">@{player.username}</span>
            <br />
            {copy.description}
          </DialogDescription>
        </DialogHeader>

        {needsReason && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-medium">Reason</Label>
              <span className="text-[10px] text-muted-foreground">
                {reason.length}/{BAN_REASON_MAX_LENGTH}
              </span>
            </div>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={BAN_REASON_MAX_LENGTH}
              placeholder="e.g. Harassing other captains in room chat"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && canConfirm && confirm()}
            />
          </div>
        )}

        {needsTypedName && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Type <span className="font-mono">{player.username}</span> to
              confirm
            </Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={player.username}
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && canConfirm && confirm()}
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-300 text-xs px-3 py-2">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={copy.destructive ? "destructive" : "default"}
            onClick={confirm}
            disabled={!canConfirm}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
