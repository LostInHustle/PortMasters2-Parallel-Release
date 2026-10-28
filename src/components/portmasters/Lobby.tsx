"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  api,
  type ChatMessage,
  type PublicUser,
  type RoomSummary,
  type SelfUser,
} from "@/lib/api";
import { isStaff } from "@/lib/admin/rules";
import { useRealtime } from "@/lib/useRealtime";
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  difficultyConfig,
  type Difficulty,
} from "@/lib/game/difficulty";
import {
  Avatar,
  HarborCrest,
  OnlineDot,
  PanelHeading,
  Pill,
  SectionLabel,
} from "./shared";
import { ChatPanel } from "./ChatPanel";
import { CaptainLegacyCard } from "./CaptainLegacyCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scrollArea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  LogOut,
  Plus,
  Ship,
  Star,
  Users,
  KeyRound,
  Loader2,
  ArrowRight,
  ArrowLeftRight,
  MessageCircle,
  RefreshCw,
  Gift,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn, normalizeRoomName } from "@/lib/utils";
import { APP_NAME } from "@/lib/game/constants";
import {
  DEFAULT_LEGACY_SUMMARY,
  renownProgress,
  type CaptainLegacySummary,
} from "@/lib/game/legacy";
import { checkInStatus, type CheckInStatus } from "@/lib/game/checkin";

export function Lobby({
  me,
  onEnterRoom,
  onLogout,
}: {
  me: SelfUser;
  onEnterRoom: (room: RoomSummary) => void;
  onLogout: () => void;
}) {
  const { socket, connected, authed, onlineUsers } = useRealtime(me);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [legacy, setLegacy] = useState(DEFAULT_LEGACY_SUMMARY);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [checkIn, setCheckIn] = useState<CheckInStatus>(() =>
    checkInStatus({ checkInCount: 0, lastCheckInDate: null }),
  );
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [newName, setNewName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  // The host picks one tier for the whole harbor (see src/lib/game/difficulty.ts).
  // It is fixed for the life of the room; a different tier means a new room.
  const [difficulty, setDifficulty] = useState<Difficulty>("fair_winds");
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // DM state
  const [dmTarget, setDmTarget] = useState<PublicUser | null>(null);
  const [dmHistory, setDmHistory] = useState<ChatMessage[]>([]);
  const [dmLoading, setDmLoading] = useState(false);

  // Harbor wide lobby chat, alongside the direct messages above.
  const [chatTab, setChatTab] = useState<"harbor" | "direct">("harbor");
  const [lobbyMessages, setLobbyMessages] = useState<ChatMessage[]>([]);
  const [lobbyLoading, setLobbyLoading] = useState(true);

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
    // Kicked off on a timer rather than called straight from the effect body,
    // so the first refresh's setLoadingRooms(true) isn't a synchronous setState
    // inside an effect (react-hooks/set-state-in-effect). Nothing changes
    // visually: loadingRooms already starts true, so that first set changed nothing
    // anyway, and the interval's later calls were never inside an effect body.
    const kickoff = setTimeout(refreshRooms, 0);
    const t = setInterval(refreshRooms, 8000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(t);
    };
  }, [refreshRooms]);

  // A captain's Renown only ever changes when a voyage concludes (see
  // maybeConcludeVoyage in src/server/realtime.ts), which never happens
  // while sitting in the lobby, so a plain fetch on mount is enough; no
  // polling needed like the room list above.
  useEffect(() => {
    let alive = true;
    api
      .getLegacy()
      .then(({ legacy, checkIn }) => {
        if (alive) {
          setLegacy(legacy);
          setCheckIn(checkIn);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Seed the lobby wide harbor chat with its recent history. Live messages
  // arrive over the socket from here on.
  useEffect(() => {
    let alive = true;
    api
      .getLobbyChat()
      .then(({ messages }) => {
        if (alive) setLobbyMessages(messages);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLobbyLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Claim today's Daily Check In. The server is the source of truth for the
  // day math and the guard against a second claim, so we just render whatever
  // state it returns, claimed or not, and surface the reward as a toast.
  const claimCheckIn = useCallback(async () => {
    setClaiming(true);
    try {
      const res = await api.checkIn();
      setLegacy(res.legacy);
      setCheckIn(res.checkIn);
      if (res.claimed) {
        toast.success(`Day ${res.day} claimed: +${res.xpGained} Renown XP`, {
          description: res.leveledUp
            ? "Renown level up! A bigger Gold bonus awaits at the start of your next voyage."
            : "Fair winds. Come back tomorrow for the next reward.",
        });
      } else {
        toast("Already checked in today", {
          description: "Come back tomorrow for the next reward.",
        });
      }
    } catch {
      toast.error("Check in failed", {
        description: "Could not reach the harbor master. Try again.",
      });
    } finally {
      setClaiming(false);
    }
  }, []);

  // Renown for every other captain currently shown in "Captains Online"
  // below, fetched as one batch rather than one request per captain (see
  // POST /api/legacy/batch). Keyed on the *set* of online ids, not the
  // onlineUsers array itself, since that array gets a new reference on
  // every presence:update broadcast (anyone, anywhere, connecting or
  // switching rooms), most of which don't actually add or remove anyone
  // from this list.
  const [otherLegacies, setOtherLegacies] = useState<
    Record<string, CaptainLegacySummary>
  >({});
  const onlineIdsKey = useMemo(
    () =>
      onlineUsers
        .map((u) => u.id)
        .sort()
        .join(","),
    [onlineUsers],
  );
  useEffect(() => {
    const ids = onlineIdsKey ? onlineIdsKey.split(",") : [];
    if (ids.length === 0) return;
    let alive = true;
    api
      .getLegaciesFor(ids)
      .then(({ legacies }) => {
        if (alive) setOtherLegacies(legacies);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [onlineIdsKey]);

  async function createRoom() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { room } = await api.createRoom({
        name: newName.trim(),
        isPublic,
        difficulty,
      });
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
    setChatTab("direct");
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

  // Refetch DM history when switching targets (initial seed for ChatPanel).
  useEffect(() => {
    if (!dmTarget) return;
    let alive = true;
    // No setDmLoading(true) here: the only thing that ever sets a target is
    // openDm, which raises the flag before this effect can run. Setting it
    // again synchronously in the effect body only cost a cascading render
    // (react-hooks/set-state-in-effect).
    api
      .getDmHistory(dmTarget.id)
      .then(({ messages }) => {
        if (alive) {
          setDmHistory(messages);
          setDmLoading(false);
        }
      })
      .catch(() => alive && setDmLoading(false));
    return () => {
      alive = false;
    };
  }, [dmTarget?.id]);

  const totalOnline = onlineUsers.length;
  const otherOnline = onlineUsers.filter((u) => u.id !== me.id);

  return (
    <div className="pm-canvas flex min-h-[100dvh] w-full flex-col lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
      {/* Top bar */}
      <header className="sticky top-0 z-30 shrink-0 px-4 py-3 sm:px-6 lg:static">
        <div className="pm-glass mx-auto flex h-[60px] w-full max-w-[1280px] items-center justify-between gap-3 rounded-2xl px-4">
          <div className="flex min-w-0 items-center gap-3">
            <HarborCrest className="h-9 w-9" />
            <div className="min-w-0">
              <h1 className="truncate text-sm leading-tight font-bold tracking-tight">
                <span className="pm-text-sea">{APP_NAME}</span>
                <span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">
                  Online
                </span>
              </h1>
              <p className="text-[11px] leading-tight text-muted-foreground">
                Lords of the Silk Road
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone="emerald" className="hidden sm:inline-flex">
              <OnlineDot online={connected && authed} />{" "}
              {connected && authed ? "Online" : "Connecting…"}
            </Pill>
            <Pill tone="sea" className="hidden md:inline-flex">
              <Users className="h-3 w-3" /> {totalOnline} sailing
            </Pill>
            <button
              onClick={() => setCheckInOpen(true)}
              className="pm-pressable relative"
              title="Daily Check In"
            >
              <Pill tone="amber">
                <Gift className="h-3 w-3" />{" "}
                <span className="hidden sm:inline">Check In</span>
              </Pill>
              {checkIn.canClaimToday && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-background" />
              )}
            </button>
            <button
              onClick={() => setLegacyOpen(true)}
              className="pm-pressable"
              title="Captain's Legacy"
            >
              <Pill tone="gold">
                <Star className="h-3 w-3" /> Renown{" "}
                {renownProgress(legacy.renownXP).level}
              </Pill>
            </button>
            {isStaff(me.role) && (
              <Link
                href="/admin"
                className="pm-pressable"
                title="Harbor Office"
              >
                <Pill tone="rose">
                  <ShieldCheck className="h-3 w-3" />{" "}
                  <span className="hidden md:inline">Harbor Office</span>
                </Pill>
              </Link>
            )}
            <div className="flex items-center gap-2 border-l border-black/5 pl-2 dark:border-white/10">
              <Avatar hue={me.avatarHue} name={me.displayName} size={32} ring />
              <div className="hidden leading-tight sm:block">
                <div className="text-sm font-medium">{me.displayName}</div>
                <div className="text-[10px] text-muted-foreground">
                  @{me.username}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={onLogout}
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto flex min-h-0 w-full max-w-[1280px] flex-1 flex-col px-4 pb-4 sm:px-6">
        <div className="mt-2 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden">
          {/* Rooms */}
          <section className="pm-glass flex min-h-0 flex-col rounded-2xl p-5 lg:h-full">
            <PanelHeading
              icon={Ship}
              title="Open Harbors"
              subtitle="Create a room or join one to set sail together."
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={refreshRooms}
                  disabled={loadingRooms}
                >
                  <RefreshCw
                    className={cn("h-4 w-4", loadingRooms && "animate-spin")}
                  />
                </Button>
              }
            />

            {/* Create */}
            <div className="mt-3.5 mb-3.5 rounded-xl bg-black/[0.03] p-3.5 dark:bg-white/[0.04]">
              <div className="mb-2.5 flex items-center gap-2">
                <Plus className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="text-sm font-medium">Chart a new harbor</span>
              </div>
              <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_auto_auto]">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Room name
                  </Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Silk Run · Voyage 1"
                    maxLength={40}
                    className="h-10"
                    onKeyDown={(e) => e.key === "Enter" && createRoom()}
                  />
                </div>
                <div className="flex h-10 items-center gap-2 rounded-lg bg-background/60 px-3">
                  <Switch
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                    id="pub"
                  />
                  <Label htmlFor="pub" className="cursor-pointer text-xs">
                    Public
                  </Label>
                </div>
                <Button
                  onClick={createRoom}
                  disabled={busy || !newName.trim()}
                  className="pm-grad-primary h-10 rounded-lg text-white"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="mr-1 h-4 w-4" /> Create
                    </>
                  )}
                </Button>
              </div>

              <div className="mt-3">
                <Label className="text-xs text-muted-foreground">Waters</Label>
                <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-full bg-background/60 p-1">
                  {DIFFICULTY_ORDER.map((key) => {
                    const cfg = DIFFICULTIES[key];
                    const active = difficulty === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDifficulty(key)}
                        aria-pressed={active}
                        className="relative cursor-pointer rounded-full px-2 py-1.5 text-xs font-medium"
                      >
                        {active && (
                          <motion.span
                            layoutId="difficultyThumb"
                            className="pm-grad-primary absolute inset-0 rounded-full"
                            transition={{
                              type: "spring",
                              stiffness: 380,
                              damping: 32,
                            }}
                          />
                        )}
                        <span
                          className={cn(
                            "relative z-10 flex items-center justify-center gap-1.5",
                            active ? "text-white" : "text-muted-foreground",
                          )}
                        >
                          <span>{cfg.icon}</span>
                          <span className="truncate">{cfg.badge}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  {DIFFICULTIES[difficulty].tagline}{" "}
                  <span className="text-foreground/70">
                    {DIFFICULTIES[difficulty].rounds} rounds.
                  </span>
                </p>
              </div>
            </div>

            {/* Join by code */}
            <div className="mb-4 flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Join by code
                </Label>
                <div className="relative">
                  <KeyRound className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={joinCode}
                    onChange={(e) =>
                      setJoinCode(e.target.value.toUpperCase().slice(0, 6))
                    }
                    placeholder="ABCDEF"
                    className="h-10 pl-9 font-mono tracking-[0.3em] uppercase"
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
                  className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <SectionLabel
              className="mb-2 shrink-0"
              trailing={
                <span className="text-[10px] text-muted-foreground">
                  {rooms.length} open
                </span>
              }
            >
              Harbors on the tide
            </SectionLabel>

            {/* Room list */}
            <div className="pm-scroll -mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-1">
              {loadingRooms && rooms.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning the
                  horizon…
                </div>
              ) : rooms.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No harbors open yet. Be the first to chart one above.
                </div>
              ) : (
                rooms.map((room) => {
                  const isMember = room.members.some((m) => m.id === me.id);
                  const locked = room.started && !isMember;
                  const roomTide = difficultyConfig(room.difficulty);
                  return (
                    <motion.div
                      key={room.id}
                      layout
                      className="group pm-glass flex items-center gap-3 rounded-xl p-3.5 transition-shadow hover:shadow-md"
                    >
                      <div className="pm-grad-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                        <Ship className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">
                            {normalizeRoomName(room.name)}
                          </span>
                          <Pill tone="sea">
                            {roomTide.icon} {roomTide.badge}
                          </Pill>
                          {room.host.id === me.id && (
                            <Pill tone="gold">Host</Pill>
                          )}
                          {!room.isPublic && <Pill tone="amber">Private</Pill>}
                          {room.started && <Pill tone="sea">⛵ Sailing</Pill>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
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
                        title={
                          locked
                            ? "This voyage has already set sail"
                            : undefined
                        }
                        className="shrink-0 rounded-lg pm-grad-primary text-white"
                      >
                        {joining === room.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : locked ? (
                          "Locked"
                        ) : (
                          <>
                            Enter <ArrowRight className="ml-1 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </motion.div>
                  );
                })
              )}
            </div>
          </section>

          {/* Online + chat channels */}
          <aside className="flex min-h-0 flex-col gap-4 lg:h-full">
            <div className="pm-glass flex h-[300px] shrink-0 flex-col rounded-2xl p-4 lg:h-[42%] lg:min-h-[210px] lg:max-h-[320px]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-teal-600 dark:text-teal-400" />{" "}
                  Captains Online
                </h3>
                <Pill tone="emerald">
                  <OnlineDot online size={8} /> {totalOnline}
                </Pill>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                {onlineUsers.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {connected
                      ? "No other captains online yet."
                      : "Connecting to the harbor…"}
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
                            "flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors",
                            isMe
                              ? "cursor-default opacity-60"
                              : "hover:bg-black/5 dark:hover:bg-white/5",
                          )}
                        >
                          <div className="relative">
                            <Avatar
                              hue={u.avatarHue}
                              name={u.displayName}
                              size={30}
                            />
                            <OnlineDot
                              online
                              size={8}
                              className="absolute -right-0.5 -bottom-0.5 ring-2 ring-background"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {u.displayName}{" "}
                              {isMe && (
                                <span className="text-[10px] text-muted-foreground">
                                  (you)
                                </span>
                              )}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {u.roomId ? "In a harbor" : "In the lobby"}
                            </div>
                          </div>
                          {otherLegacy && (
                            <Pill tone="gold" className="shrink-0">
                              <Star className="h-3 w-3" />{" "}
                              {renownProgress(otherLegacy.renownXP).level}
                            </Pill>
                          )}
                          {!isMe && (
                            <MessageCircle className="h-4 w-4 text-muted-foreground/60" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Harbor and direct channels */}
            <Tabs
              value={chatTab}
              onValueChange={(v) => setChatTab(v as "harbor" | "direct")}
              className="pm-glass flex h-[400px] shrink-0 flex-col overflow-hidden rounded-2xl lg:h-auto lg:min-h-0 lg:flex-1"
            >
              <TabsList className="m-2 mb-0 grid grid-cols-2">
                <TabsTrigger value="harbor">
                  <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Harbor
                </TabsTrigger>
                <TabsTrigger value="direct">
                  <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Direct
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="harbor"
                className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
              >
                {lobbyLoading ? (
                  <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <ChatPanel
                      socket={socket}
                      me={me}
                      mode="lobby"
                      initialMessages={lobbyMessages}
                      className="flex-1"
                    />
                  </div>
                )}
              </TabsContent>
              <TabsContent
                value="direct"
                className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
              >
                {dmTarget ? (
                  <>
                    <div className="flex shrink-0 items-center gap-2 border-b border-black/5 px-3 py-2 dark:border-white/10">
                      <Avatar
                        hue={dmTarget.avatarHue}
                        name={dmTarget.displayName}
                        size={24}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                        Direct · {dmTarget.displayName}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-lg px-2 text-[11px]"
                        onClick={() => setDmTarget(null)}
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" /> Change
                      </Button>
                    </div>
                    {dmLoading ? (
                      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                        Loading…
                      </div>
                    ) : (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <ChatPanel
                          socket={socket}
                          me={me}
                          mode="dm"
                          other={dmTarget}
                          initialMessages={dmHistory}
                          className="flex-1"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="border-b border-black/5 px-3 py-2 text-[11px] text-muted-foreground dark:border-white/10">
                      Pick a captain to message privately
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      {otherOnline.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                          No other captains available right now. They'll appear
                          here once they're online.
                        </p>
                      ) : (
                        <div className="space-y-1 p-2">
                          {otherOnline.map((u) => (
                            <button
                              key={u.id}
                              onClick={() => openDm(u)}
                              className="pm-pressable flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-black/5 dark:hover:bg-white/5"
                            >
                              <Avatar
                                hue={u.avatarHue}
                                name={u.displayName}
                                size={28}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">
                                  {u.displayName}
                                </div>
                                <div className="truncate text-[10px] text-muted-foreground">
                                  {u.roomId ? "In a harbor" : "In the lobby"}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </aside>
        </div>
      </main>

      <Dialog open={legacyOpen} onOpenChange={setLegacyOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500" />
              Captain's Legacy
            </DialogTitle>
            <DialogDescription>
              Renown carries across every voyage this account ever sails, in any
              harbor.
            </DialogDescription>
          </DialogHeader>
          <CaptainLegacyCard legacy={legacy} className="p-5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Every Renown level grants a small Gold bonus at the start of your
            next fresh voyage. It grows from the Reputation you bank on the way
            to the final round, so it only ever goes up, even on a voyage that
            ends in bankruptcy.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={checkInOpen} onOpenChange={setCheckInOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-violet-500" />
              Daily Check In
            </DialogTitle>
            <DialogDescription>
              Claim a Renown reward each day. The seven day cycle picks up where
              you left off, even after a missed day, and restarts once Day 7 is
              claimed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {checkIn.rewards.map((xp, i) => {
              const day = i + 1;
              const claimed = day <= checkIn.claimedThisCycle;
              const isCurrent = day === checkIn.currentDay;
              return (
                <div
                  key={day}
                  className={cn(
                    "rounded-lg border px-1 py-2 text-center",
                    claimed
                      ? "border-emerald-500/40 bg-emerald-500/[0.07] opacity-70"
                      : isCurrent
                        ? "border-violet-500/50 bg-violet-500/[0.09]"
                        : "border-black/10 dark:border-white/10 bg-background/40",
                  )}
                >
                  <div className="text-[10px] text-muted-foreground">
                    Day {day}
                  </div>
                  <div className="text-sm font-bold leading-tight">+{xp}</div>
                  <div className="text-[9px] text-muted-foreground">
                    {claimed ? "✓ XP" : "XP"}
                  </div>
                </div>
              );
            })}
          </div>
          <Button
            className="pm-grad-violet text-white font-semibold rounded-lg w-full hover:opacity-95"
            disabled={!checkIn.canClaimToday || claiming}
            onClick={claimCheckIn}
          >
            {claiming
              ? "Claiming…"
              : checkIn.canClaimToday
                ? `Claim Day ${checkIn.currentDay}: +${checkIn.rewards[checkIn.currentDay - 1]} Renown XP`
                : "Checked in today · back tomorrow"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
