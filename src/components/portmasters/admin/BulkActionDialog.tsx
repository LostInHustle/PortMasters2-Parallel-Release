"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, type SelfUser } from "@/lib/api";
import type { AdminPlayer, BulkOutcome } from "@/lib/admin/actions";
import {
  BAN_REASON_MAX_LENGTH,
  bulkEligibility,
  type BulkAction,
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

const COPY: Record<
  BulkAction,
  { title: string; description: string; confirm: string; destructive: boolean }
> = {
  ban: {
    title: "Ban the selected captains?",
    description:
      "Each of them is signed out everywhere at once, dropped from any harbor they are sailing in, and cannot sign in again until the ban is lifted. They will all see the one reason you give here.",
    confirm: "Ban",
    destructive: true,
  },
  unban: {
    title: "Lift the selected bans?",
    description:
      "They can sign in again straight away. Their Renown, merits and accounts are exactly as they left them.",
    confirm: "Lift bans",
    destructive: false,
  },
  delete: {
    title: "Delete the selected accounts for good?",
    description:
      "This cannot be undone. Their Renown, merits, chat messages and saved voyages are removed. Any harbor one of them hosts is handed to the next captain in it, or closed if it was empty.",
    confirm: "Delete",
    destructive: true,
  },
};

function names(players: { displayName: string }[], max = 6): string {
  const shown = players.slice(0, max).map((p) => p.displayName);
  const rest = players.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ");
}

// The same preview the server will produce, run here first: the selection
// is split into the captains this action can reach and the ones it will
// skip, with the reason beside each, so the person confirming knows what
// they are confirming. Mounted fresh per action (the console keys it), so
// nothing typed for one batch lingers into the next.
export function BulkActionDialog({
  me,
  action,
  players,
  onClose,
  onDone,
  onForbidden,
}: {
  me: SelfUser;
  action: BulkAction;
  players: AdminPlayer[];
  onClose: () => void;
  onDone: () => void;
  onForbidden: () => void;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = COPY[action];
  const { eligible, skipped } = bulkEligibility(
    { id: me.id, role: me.role },
    action,
    players,
  );
  const count = eligible.length;
  const needsReason = action === "ban";
  const needsTypedCount = action === "delete";
  const reasonOk =
    reason.trim().length > 0 && reason.length <= BAN_REASON_MAX_LENGTH;
  const canConfirm =
    !busy &&
    count > 0 &&
    (!needsReason || reasonOk) &&
    (!needsTypedCount || typed.trim() === String(count));

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const outcome: BulkOutcome = await api.admin.bulk(
        action,
        eligible.map((p) => p.id),
        needsReason ? reason.trim() : undefined,
      );
      const verb =
        action === "ban"
          ? "banned"
          : action === "unban"
            ? "unbanned"
            : "deleted";
      toast.success(
        `${outcome.done.length} ${outcome.done.length === 1 ? "captain" : "captains"} ${verb}`,
        outcome.skipped.length
          ? {
              description: `Skipped ${outcome.skipped.length}: ${outcome.skipped
                .map((s) => `${s.displayName ?? s.id} (${s.reason})`)
                .join("; ")}`,
            }
          : undefined,
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
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2 leading-relaxed">
            <span className="font-medium">
              {count} {count === 1 ? "captain" : "captains"}
            </span>{" "}
            <span className="text-muted-foreground">
              {count > 0
                ? `will be reached: ${names(eligible)}.`
                : "can be reached by this action."}
            </span>
          </div>
          {skipped.length > 0 && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
              <span className="font-medium">Skipped {skipped.length}:</span>{" "}
              {skipped
                .map(
                  (s) =>
                    `${s.target.displayName} (${s.reason.replace(/\.$/, "")})`,
                )
                .join("; ")}
              .
            </div>
          )}
        </div>

        {needsReason && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-medium">
                Reason for all of them
              </Label>
              <span className="text-[10px] text-muted-foreground">
                {reason.length}/{BAN_REASON_MAX_LENGTH}
              </span>
            </div>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={BAN_REASON_MAX_LENGTH}
              placeholder="e.g. Coordinated harassment in room chat"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && canConfirm && confirm()}
            />
          </div>
        )}

        {needsTypedCount && count > 0 && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Type <span className="font-mono">{count}</span> to confirm the
              number of accounts
            </Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={String(count)}
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
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `${copy.confirm} ${count}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
