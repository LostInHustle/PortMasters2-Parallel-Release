"use client";

import { useState } from "react";
import { Eraser, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ModerationLogEntry } from "@/lib/admin/actions";
import type { LoggedAction } from "@/lib/admin/rules";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scrollArea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const VERB: Record<LoggedAction, string> = {
  ban: "banned",
  unban: "lifted the ban on",
  delete: "deleted the account of",
  promote: "made a moderator of",
  demote: "removed the moderator badge from",
  claim: "took the admin seat",
  clear_log: "cleared the moderation log",
};

const TONE: Record<LoggedAction, string> = {
  ban: "bg-rose-500",
  unban: "bg-emerald-500",
  delete: "bg-rose-700",
  promote: "bg-amber-500",
  demote: "bg-zinc-400",
  claim: "bg-teal-500",
  clear_log: "bg-zinc-500",
};

// A claim and a log clear are the entries whose actor and target are the
// same account, so naming the target again would only read as a stutter.
const SELF_TARGETED: ReadonlySet<LoggedAction> = new Set([
  "claim",
  "clear_log",
]);

function when(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ModerationLog({
  entries,
  loading,
  canClear,
  onCleared,
}: {
  entries: ModerationLogEntry[];
  loading: boolean;
  // Only the admin may clear the log; the button simply is not there for a
  // moderator, matching the door the server keeps on DELETE /api/admin/log.
  canClear: boolean;
  onCleared: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function clear() {
    setClearing(true);
    try {
      const { removed } = await api.admin.clearLog();
      toast.success("Moderation log cleared", {
        description: `${removed} ${removed === 1 ? "entry" : "entries"} removed. The clear itself is now the log's first entry.`,
      });
      setConfirming(false);
      onCleared();
    } catch (err) {
      toast.error("Could not clear the log", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      {canClear && entries.length > 0 && (
        <div className="flex justify-end mb-2">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg text-muted-foreground"
            onClick={() => setConfirming(true)}
          >
            <Eraser className="h-3.5 w-3.5" /> Clear log
          </Button>
        </div>
      )}

      {loading && entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Opening the ledger…
        </div>
      ) : entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <p className="text-xs text-muted-foreground/80 leading-relaxed">
            Nothing recorded yet. Every ban, role change and deletion will show
            up here, newest first.
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1 pr-2">
          <ol className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2 text-xs leading-relaxed"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 rounded-full shrink-0",
                      TONE[e.action] ?? "bg-zinc-400",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <span className="font-medium">{e.actorName}</span>{" "}
                    {VERB[e.action] ?? e.action}
                    {!SELF_TARGETED.has(e.action) && (
                      <>
                        {" "}
                        <span className="font-medium">{e.targetName}</span>
                      </>
                    )}
                    {e.reason && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {e.reason}
                      </span>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {when(e.createdAt)}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </ScrollArea>
      )}

      <Dialog
        open={confirming}
        onOpenChange={(open) => !open && !clearing && setConfirming(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear the moderation log?</DialogTitle>
            <DialogDescription>
              Every entry is removed. One new entry is written in its place
              recording that you cleared it and how many entries went, so the
              clear itself always stays on record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={clearing}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={clear} disabled={clearing}>
              {clearing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Clear log"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
