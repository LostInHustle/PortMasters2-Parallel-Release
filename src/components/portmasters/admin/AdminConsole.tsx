"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Anchor,
  ArrowLeft,
  Loader2,
  LogOut,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api, type SelfUser } from "@/lib/api";
import type { AdminPlayer, ModerationLogEntry } from "@/lib/admin/actions";
import { isStaff, type Role } from "@/lib/admin/rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Avatar, Pill } from "../shared";
import { PlayerRow } from "./PlayerRow";
import { ModerationLog } from "./ModerationLog";
import { PlayerActionDialog, type PendingAction } from "./PlayerActionDialog";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 250;

export function roleLabel(role: Role): string {
  return role === "admin"
    ? "Admin"
    : role === "moderator"
      ? "Moderator"
      : "Captain";
}

export function AdminConsole({
  me,
  onSignOut,
  onRoleChanged,
}: {
  me: SelfUser;
  onSignOut: () => void;
  // Called if the server says this account no longer holds a staff role,
  // which happens when someone else presents the key and takes the seat.
  onRoleChanged: (role: Role) => void;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [entries, setEntries] = useState<ModerationLogEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(true);
  const [pending, setPending] = useState<PendingAction | null>(null);

  // A 403 from any console route means the seat moved out from under this
  // account; re-ask the server rather than guessing from the message.
  const recheckRole = useCallback(async () => {
    try {
      const status = await api.admin.status();
      if (!isStaff(status.role)) onRoleChanged(status.role);
    } catch {
      /* the next action will ask again */
    }
  }, [onRoleChanged]);

  const loadPlayers = useCallback(async () => {
    setLoadingPlayers(true);
    try {
      const res = await api.admin.players(search, page);
      setPlayers(res.players);
      setTotal(res.total);
    } catch (err) {
      toast.error("Could not load the roster", {
        description: err instanceof Error ? err.message : undefined,
      });
      void recheckRole();
    } finally {
      setLoadingPlayers(false);
    }
  }, [search, page, recheckRole]);

  const loadLog = useCallback(async () => {
    setLoadingLog(true);
    try {
      const res = await api.admin.log();
      setEntries(res.entries);
    } catch {
      /* the roster error already said the office is unreachable */
    } finally {
      setLoadingLog(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    // Kicked off on a timer so the first setLoadingPlayers(true) is not a
    // synchronous setState inside the effect body.
    const t = setTimeout(loadPlayers, 0);
    return () => clearTimeout(t);
  }, [loadPlayers]);

  useEffect(() => {
    const t = setTimeout(loadLog, 0);
    return () => clearTimeout(t);
  }, [loadLog]);

  const refresh = useCallback(() => {
    void loadPlayers();
    void loadLog();
  }, [loadPlayers, loadLog]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="pm-canvas min-h-screen w-full">
      <header className="sticky top-0 z-30 px-4 sm:px-6 py-3">
        <div className="pm-glass rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <div className="pm-grad-primary h-9 w-9 rounded-xl flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold leading-tight tracking-tight text-sm">
                Harbor Office
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Bans, roles and the moderation log
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="pm-pressable">
              <Pill tone="sea">
                <ArrowLeft className="h-3 w-3" />{" "}
                <span className="hidden sm:inline">Back to the harbor</span>
                <span className="sm:hidden">Harbor</span>
              </Pill>
            </Link>
            <div className="flex items-center gap-2 pl-2 border-l border-black/5 dark:border-white/10">
              <Avatar hue={me.avatarHue} name={me.displayName} size={32} ring />
              <div className="hidden sm:block leading-tight">
                <div className="text-sm font-medium">{me.displayName}</div>
                <div className="text-[10px] text-muted-foreground">
                  {roleLabel(me.role)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={onSignOut}
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 pb-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 mt-2">
          <section className="pm-glass rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-teal-600 dark:text-teal-400" />{" "}
                  Captains
                </h2>
                <p className="text-xs text-muted-foreground">
                  {total === 1
                    ? "One registered account."
                    : `${total} registered accounts.`}{" "}
                  {me.role === "admin"
                    ? "You can ban, appoint moderators, and delete accounts."
                    : "You can ban and unban captains. The admin handles roles and deletions."}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={refresh}
                disabled={loadingPlayers}
                title="Refresh"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loadingPlayers && "animate-spin")}
                />
              </Button>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by captain name or display name"
                className="h-10 pl-9"
              />
            </div>

            <div className="space-y-2">
              {loadingPlayers && players.length === 0 ? (
                <div className="py-10 flex items-center justify-center text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Reading the
                  crew manifest…
                </div>
              ) : players.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {search
                    ? "No captain matches that search."
                    : "No accounts registered yet."}
                </div>
              ) : (
                players.map((p) => (
                  <PlayerRow
                    key={p.id}
                    me={me}
                    player={p}
                    onAction={setPending}
                  />
                ))
              )}
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                <span>
                  Page {page} of {pageCount}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loadingPlayers}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount || loadingPlayers}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </section>

          <aside className="pm-glass rounded-2xl p-4 flex flex-col min-h-[420px] lg:max-h-[calc(100vh-7rem)] lg:sticky lg:top-20">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-amber-600 dark:text-amber-400" />{" "}
                Moderation log
              </h3>
              <Pill tone="amber">{entries.length}</Pill>
            </div>
            <ModerationLog entries={entries} loading={loadingLog} />
          </aside>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground/80 flex items-center justify-center gap-1.5">
          <Anchor className="h-3 w-3" /> Every action here is written to the log
          with your name on it.
        </p>
      </main>

      {pending && (
        <PlayerActionDialog
          key={`${pending.kind}:${pending.player.id}`}
          pending={pending}
          onClose={() => setPending(null)}
          onDone={() => {
            setPending(null);
            refresh();
          }}
          onForbidden={recheckRole}
        />
      )}
    </div>
  );
}
