"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Anchor,
  ArrowLeft,
  Ban,
  Loader2,
  LogOut,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Trash2,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, type SelfUser } from "@/lib/api";
import type { AdminPlayer, ModerationLogEntry } from "@/lib/admin/actions";
import {
  bulkEligibility,
  canModerate,
  isStaff,
  type BulkAction,
  type Role,
} from "@/lib/admin/rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Avatar, Pill } from "../shared";
import { PlayerRow } from "./PlayerRow";
import { ModerationLog } from "./ModerationLog";
import { PlayerActionDialog, type PendingAction } from "./PlayerActionDialog";
import { BulkActionDialog } from "./BulkActionDialog";

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
  // which happens to a moderator the admin dismissed while their console
  // was still open. The admin seat itself never moves, so it never fires
  // for the admin.
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

  // The selection is kept as a map of id to the captain as last seen, so it
  // survives a page change or a search and the bulk dialog can still name
  // everyone in it.
  const [selected, setSelected] = useState<Map<string, AdminPlayer>>(
    () => new Map(),
  );
  const [bulk, setBulk] = useState<BulkAction | null>(null);

  // A 403 from any console route means this account's authority changed
  // while the console was open; ask the server rather than guessing from
  // the message.
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
      // Anyone still selected is refreshed to what the server just said,
      // and anyone gone (deleted) drops out of the selection.
      setSelected((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        for (const p of res.players) if (next.has(p.id)) next.set(p.id, p);
        return next;
      });
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

  const toggle = useCallback(
    (id: string) => {
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(id)) next.delete(id);
        else {
          const p = players.find((x) => x.id === id);
          if (p) next.set(id, p);
        }
        return next;
      });
    },
    [players],
  );

  const actor = useMemo(() => ({ id: me.id, role: me.role }), [me.id, me.role]);
  const selectableOnPage = useMemo(
    () =>
      players.filter(
        (p) => canModerate(actor, "ban", { id: p.id, role: p.role }).ok,
      ),
    [players, actor],
  );
  const allOnPageSelected =
    selectableOnPage.length > 0 &&
    selectableOnPage.every((p) => selected.has(p.id));

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allOnPageSelected)
        for (const p of selectableOnPage) next.delete(p.id);
      else for (const p of selectableOnPage) next.set(p.id, p);
      return next;
    });
  }

  const selection = useMemo(() => [...selected.values()], [selected]);
  const reach = (action: BulkAction) =>
    bulkEligibility(actor, action, selection).eligible.length;

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
                    ? "You can ban, appoint moderators, and delete accounts, one at a time or as a selection."
                    : "You can ban and unban captains, one at a time or as a selection. The admin handles roles and deletions."}
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

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by captain name or display name"
                className="h-10 pl-9"
              />
            </div>

            <div className="flex items-center justify-between gap-3 mb-3 min-h-9">
              <label
                className={cn(
                  "flex items-center gap-2 text-xs text-muted-foreground select-none",
                  selectableOnPage.length
                    ? "cursor-pointer"
                    : "opacity-40 cursor-not-allowed",
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-teal-600"
                  checked={allOnPageSelected}
                  disabled={selectableOnPage.length === 0}
                  onChange={toggleAllOnPage}
                  aria-label="Select every captain on this page"
                />
                {allOnPageSelected
                  ? "Clear this page"
                  : "Select everyone on this page"}
              </label>
              {selection.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <Pill tone="sea">{selection.length} selected</Pill>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg text-rose-600 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
                    disabled={reach("ban") === 0}
                    onClick={() => setBulk("ban")}
                  >
                    <Ban className="h-3.5 w-3.5" /> Ban
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg"
                    disabled={reach("unban") === 0}
                    onClick={() => setBulk("unban")}
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Lift bans
                  </Button>
                  {me.role === "admin" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg text-rose-600 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
                      disabled={reach("delete") === 0}
                      onClick={() => setBulk("delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-lg"
                    onClick={() => setSelected(new Map())}
                    title="Clear the selection"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
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
                    selected={selected.has(p.id)}
                    onToggle={toggle}
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
            <ModerationLog
              entries={entries}
              loading={loadingLog}
              canClear={me.role === "admin"}
              onCleared={loadLog}
            />
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

      {bulk && (
        <BulkActionDialog
          key={bulk}
          me={me}
          action={bulk}
          players={selection}
          onClose={() => setBulk(null)}
          onDone={() => {
            setBulk(null);
            setSelected(new Map());
            refresh();
          }}
          onForbidden={recheckRole}
        />
      )}
    </div>
  );
}
