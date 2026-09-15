"use client";

import { Loader2 } from "lucide-react";
import type { ModerationLogEntry } from "@/lib/admin/actions";
import type { LoggedAction } from "@/lib/admin/rules";
import { ScrollArea } from "@/components/ui/scrollArea";
import { cn } from "@/lib/utils";

const VERB: Record<LoggedAction, string> = {
  ban: "banned",
  unban: "lifted the ban on",
  delete: "deleted the account of",
  promote: "made a moderator of",
  demote: "removed the moderator badge from",
  claim: "took the admin seat",
};

const TONE: Record<LoggedAction, string> = {
  ban: "bg-rose-500",
  unban: "bg-emerald-500",
  delete: "bg-rose-700",
  promote: "bg-amber-500",
  demote: "bg-zinc-400",
  claim: "bg-teal-500",
};

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
}: {
  entries: ModerationLogEntry[];
  loading: boolean;
}) {
  if (loading && entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Opening the ledger…
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6">
        <p className="text-xs text-muted-foreground/80 leading-relaxed">
          Nothing recorded yet. Every ban, role change and deletion will show up
          here, newest first.
        </p>
      </div>
    );
  }
  return (
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
                {/* A claim is the one entry whose actor and target are the
                    same account, so naming the target again would only
                    read as a stutter. */}
                {e.action !== "claim" && (
                  <>
                    {" "}
                    <span className="font-medium">{e.targetName}</span>
                  </>
                )}
                {e.reason && (
                  <span className="text-muted-foreground"> · {e.reason}</span>
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
  );
}
