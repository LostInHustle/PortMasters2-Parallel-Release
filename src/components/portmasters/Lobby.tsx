"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, type ChatMessage, type PublicUser, type RoomSummary } from "@/lib/api";
import { useRealtime } from "@/lib/use-realtime";
import { Avatar, OnlineDot, Pill } from "./shared";
import { ChatPanel } from "./ChatPanel";
import { CaptainLegacyCard } from "./CaptainLegacyCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Anchor,
  LogOut,
  Plus,
  Ship,
  Star,
  Users,
  KeyRound,
  Loader2,
  ArrowRight,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { cn, normalizeRoomName } from "@/lib/utils";
import { APP_NAME } from "@/lib/game/constants";
import { DEFAULT_LEGACY_SUMMARY, renownProgress, type CaptainLegacySummary } from "@/lib/game/legacy";

export function Lobby({
  me,
  onEnterRoom,
  onLogout,
}: {
  me: PublicUser;
  onEnterRoom: (room: RoomSummary) => void;
  onLogout: () => void;
}) {
  const { socket, connected, authed, onlineUsers } = useRealtime(me);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [legacy, setLegacy] = useState(DEFAULT_LEGACY_SUMMARY);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [newName, setNewName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // DM state
  const [dmTarget, setDmTarget] = useState<PublicUser | null>(null);
  const [dmHistory, setDmHistory] = useState<ChatMessage[]>([]);
  const [dmLoading, setDmLoading] = useState(false);

  const refreshRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const { rooms } = await api.listRooms();
      setRooms(rooms);
    } catch {
      /* ignore */
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    refreshRooms();
    const t = setInterval(refreshRooms, 8000);
    return () => clearInterval(t);
  }, [refreshRooms]);

  // A captain's Renown only ever changes when a voyage concludes (see
  // maybeConcludeVoyage in src/server/realtime.ts), which never happens
  // while sitting in the lobby, so a plain fetch on mount is enough; no
  // polling needed like the room list above.
  useEffect(() => {
    let alive = true;
    api.getLegacy().then(({ legacy }) => { if (alive) setLegacy(legacy); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Renown for every other captain currently shown in "Captains Online"
  // below, fetched as one batch rather than one request per captain (see
  // POST /api/legacy/batch). Keyed on the *set* of online ids, not the
  // onlineUsers array itself, since that array gets a new reference on
  // every presence:update broadcast (anyone, anywhere, connecting or
  // switching rooms), most of which don't actually add or remove anyone
  // from this list.
  const [otherLegacies, setOtherLegacies] = useState<Record<string, CaptainLegacySummary>>({});
  const onlineIdsKey = useMemo(() => onlineUsers.map((u) => u.id).sort().join(","), [onlineUsers]);
  useEffect(() => {
    const ids = onlineIdsKey ? onlineIdsKey.split(",") : [];
    if (ids.length === 0) return;
    let alive = true;
    api.getLegaciesFor(ids).then(({ legacies }) => { if (alive) setOtherLegacies(legacies); }).catch(() => {});
    return () => { alive = false; };
  }, [onlineIdsKey]);

  async function createRoom() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { room } = await api.createRoom({ name: newName.trim(), isPublic });
      setNewName("");
      onEnterRoom(room);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create room");
    } finally {
      setBusy(false);
    }
  }

  async function joinByCode() {
    if (joinCode.trim().length !== 6) {
      setError("Room codes are 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { room } = await api.joinRoomByCode(joinCode.trim().toUpperCase());
      setJoinCode("");
      onEnterRoom(room);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join room");
    } finally {
      setBusy(false);
    }
  }

  async function enterRoom(room: RoomSummary) {
    setJoining(room.id);
    try {
      // Ensure membership (idempotent) then enter.
      const { room: joined } = await api.joinRoomById(room.id);
      onEnterRoom(joined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enter room");
    } finally {
      setJoining(null);
    }
  }

  async function openDm(user: PublicUser) {
    if (user.id === me.id) return;
    setDmTarget(user);
    setDmLoading(true);
    setDmHistory([]);
    try {
      const { messages } = await api.getDmHistory(user.id);
      setDmHistory(messages);
    } catch {
      /* ignore */
    } finally {
      setDmLoading(false);
    }
  }

  // Re-fetch DM history when switching targets (initial seed for ChatPanel).
  useEffect(() => {
    if (!dmTarget) return;
    let alive = true;
    setDmLoading(true);
    api.getDmHistory(dmTarget.id).then(({ messages }) => {
      if (alive) {
        setDmHistory(messages);
        setDmLoading(false);
      }
    }).catch(() => alive && setDmLoading(false));
    return () => {
      alive = false;
    };
  }, [dmTarget?.id]);

  const totalOnline = onlineUsers.length;

  return (
    <div className="pm-canvas min-h-screen w-full">
      {/* Top bar */}
      <header className="sticky top-0 z-30 px-4 sm:px-6 py-3">
        <div className="pm-glass rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <div className="pm-grad-primary h-9 w-9 rounded-xl flex items-center justify-center shrink-0">
              <Anchor className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold leading-tight tracking-tight text-sm">
                <span className="pm-text-sea">{APP_NAME}</span>
                <span className="text-muted-foreground font-normal text-xs ml-2">Online</span>
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight">Lords of the Silk Road</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Pill tone="emerald" className="hidden sm:inline-flex">
              <OnlineDot online={connected && authed} /> {connected && authed ? "Online" : "Connecting…"}
            </Pill>
            <Pill tone="sea" className="hidden sm:inline-flex">
              <Users className="h-3 w-3" /> {totalOnline} sailing
            </Pill>
            <button onClick={() => setLegacyOpen(true)} className="pm-pressable">
              <Pill tone="gold">
                <Star className="h-3 w-3" /> Renown {renownProgress(legacy.renownXP).level}
              </Pill>
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-black/5 dark:border-white/10">
              <Avatar hue={me.avatarHue} name={me.displayName} size={32} ring />
              <div className="hidden sm:block leading-tight">
                <div className="text-sm font-medium">{me.displayName}</div>
                <div className="text-[10px] text-muted-foreground">@{me.username}</div>
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={onLogout} title="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="px-4 sm:px-6 pb-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 mt-2">
          {/* Rooms */}
          <section className="space-y-4">
            <div className="pm-glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Ship className="h-5 w-5 text-teal-600 dark:text-teal-400" /> Open Harbors
                  </h2>
                  <p className="text-xs text-muted-foreground">Create a room or join one to set sail together.</p>
                </div>
                <Button variant="ghost" size="sm" className="rounded-full" onClick={refreshRooms} disabled={loadingRooms}>
                  <RefreshCw className={cn("h-4 w-4", loadingRooms && "animate-spin")} />
                </Button>
              </div>

              {/* Create */}
              <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-3.5 mb-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <Plus className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  <span className="text-sm font-medium">Chart a new harbor</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Room name</Label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Silk Run · Voyage 1"
                      maxLength={40}
                      className="h-10"
                      onKeyDown={(e) => e.key === "Enter" && createRoom()}
                    />
                  </div>
                  <div className="flex items-center gap-2 h-10 px-3 rounded-lg bg-background/60">
                    <Switch checked={isPublic} onCheckedChange={setIsPublic} id="pub" />
                    <Label htmlFor="pub" className="text-xs cursor-pointer">Public</Label>
                  </div>
                  <Button
                    onClick={createRoom}
                    disabled={busy || !newName.trim()}
                    className="h-10 pm-grad-primary text-white rounded-lg"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Create</>}
                  </Button>
                </div>
              </div>

              {/* Join by code */}
              <div className="flex items-end gap-2 mb-4">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Join by code</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                      placeholder="ABCDEF"
                      className="h-10 pl-9 tracking-[0.3em] font-mono uppercase"
                      onKeyDown={(e) => e.key === "Enter" && joinByCode()}
                    />
                  </div>
                </div>
                <Button
                  onClick={joinByCode}
                  disabled={busy || joinCode.trim().length !== 6}
                  variant="secondary"
                  className="h-10 rounded-lg"
                >
                  Join
                </Button>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-300 text-xs px-3 py-2 mb-3"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Room list */}
              <div className="space-y-2">
                {loadingRooms && rooms.length === 0 ? (
                  <div className="py-10 flex items-center justify-center text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Scanning the horizon…
                  </div>
                ) : rooms.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    No harbors open yet. Be the first to chart one above.
                  </div>
                ) : (
                  rooms.map((room) => {
                    const isMember = room.members.some((m) => m.id === me.id);
                    const locked = room.started && !isMember;
                    return (
                    <motion.div
                      key={room.id}
                      layout
                      className="group pm-glass rounded-xl p-3.5 flex items-center gap-3 hover:shadow-md transition-shadow"
                    >
                      <div className="pm-grad-primary h-10 w-10 rounded-lg flex items-center justify-center shrink-0">
                        <Ship className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{normalizeRoomName(room.name)}</span>
                          {room.host.id === me.id && <Pill tone="gold">Host</Pill>}
                          {!room.isPublic && <Pill tone="amber">Private</Pill>}
                          {room.started && <Pill tone="sea">⛵ Sailing</Pill>}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span>Hosted by {room.host.displayName}</span>
                          <span>·</span>
                          <span className="font-mono">{room.code}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> {room.memberCount}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => enterRoom(room)}
                        disabled={joining === room.id || locked}
                        title={locked ? "This voyage has already set sail" : undefined}
                        className="rounded-lg pm-grad-primary text-white"
                      >
                        {joining === room.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : locked ? (
                          "Locked"
                        ) : (
                          <>Enter <ArrowRight className="h-4 w-4 ml-1" /></>
                        )}
                      </Button>
                    </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          {/* Online + DMs */}
          <aside className="space-y-4">
            <div className="pm-glass rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Captains Online
                </h3>
                <Pill tone="emerald"><OnlineDot online size={8} /> {totalOnline}</Pill>
              </div>
              <ScrollArea className="h-56 pr-2">
                {onlineUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    {connected ? "No other captains online yet." : "Connecting to the harbor…"}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {onlineUsers.map((u) => {
                      const isMe = u.id === me.id;
                      const otherLegacy = otherLegacies[u.id];
                      return (
                        <button
                          key={u.id}
                          onClick={() => !isMe && openDm(u)}
                          disabled={isMe}
                          className={cn(
                            "w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors",
                            isMe ? "opacity-60 cursor-default" : "hover:bg-black/5 dark:hover:bg-white/5",
                          )}
                        >
                          <div className="relative">
                            <Avatar hue={u.avatarHue} name={u.displayName} size={30} />
                            <OnlineDot online size={8} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {u.displayName} {isMe && <span className="text-[10px] text-muted-foreground">(you)</span>}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {u.roomId ? "In a harbor" : "In the lobby"}
                            </div>
                          </div>
                          {otherLegacy && (
                            <Pill tone="gold" className="shrink-0">
                              <Star className="h-3 w-3" /> {renownProgress(otherLegacy.renownXP).level}
                            </Pill>
                          )}
                          {!isMe && <MessageCircle className="h-4 w-4 text-muted-foreground/60" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* DM panel */}
            <div className="pm-glass rounded-2xl overflow-hidden flex flex-col" style={{ height: 360 }}>
              <div className="px-4 py-3 border-b border-black/5 dark:border-white/10 flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium">
                  {dmTarget ? `Direct · ${dmTarget.displayName}` : "Direct Messages"}
                </span>
              </div>
              {dmTarget ? (
                dmLoading ? (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
                  </div>
                ) : (
                  <ChatPanel socket={socket} me={me} mode="dm" other={dmTarget} initialMessages={dmHistory} />
                )
              ) : (
                <div className="flex-1 flex items-center justify-center text-center px-6">
                  <p className="text-xs text-muted-foreground/80 leading-relaxed">
                    Pick a captain from the list above to start a private conversation.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      <Dialog open={legacyOpen} onOpenChange={setLegacyOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Star className="h-5 w-5 text-amber-500" />Captain's Legacy</DialogTitle>
            <DialogDescription>Renown carries across every voyage this account ever sails, in any harbor.</DialogDescription>
          </DialogHeader>
          <CaptainLegacyCard legacy={legacy} />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Every Renown level grants a small Gold bonus at the start of your next fresh voyage. It grows from the Reputation you bank on the way to Round 8, so it only ever goes up, even on a voyage that ends in bankruptcy.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
