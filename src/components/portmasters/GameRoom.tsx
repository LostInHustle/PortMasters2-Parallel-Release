"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  api,
  type ChatMessage,
  type PublicUser,
  type RoomDetail,
} from "@/lib/api";
import type { VoyageCompleteEvent } from "@/lib/realtime";
import type { CaptainLegacySummary } from "@/lib/game/legacy";
import { BROKERS_FAVOR_UNLOCK_LEVEL } from "@/lib/game/constants";
import { meritById } from "@/lib/game/merits";
import { useRealtime } from "@/lib/use-realtime";
import { useGameSession } from "@/lib/use-game-session";
import { usePhaseSync } from "@/lib/use-phase-sync";
import {
  usePlayerDetail,
  type PlayerDetailData,
} from "@/lib/use-player-detail";
import { useBarter, type BarterOffer } from "@/lib/use-barter";
import { useAid, type GrantedLoan, type RepaidLoan } from "@/lib/use-aid";
import { useNotificationCenter } from "@/lib/use-notifications";
import { PlayerDetailModal } from "./game/GameModals";
import { GameStatusPanel } from "./game/GameStatusPanel";
import { GamePhasePanel } from "./game/GamePhasePanel";
import { GameControlPanel } from "./game/GameControlPanel";
import { GameLogPanel } from "./game/GameLogPanel";
import {
  GuideModal,
  TipsModal,
  RumorBoardModal,
  TutorialModal,
  RestartConfirmModal,
  NotificationHistoryModal,
} from "./game/GameModals";
import { MembersPanel } from "./MembersPanel";
import { ChatPanel } from "./ChatPanel";
import { Avatar, MeritIcon, OnlineDot, Pill } from "./shared";
import { NotificationCenter } from "./NotificationCenter";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Anchor,
  DoorOpen,
  Copy,
  Users,
  MessageCircle,
  Ship,
  LifeBuoy,
  Bell,
} from "lucide-react";
import { normalizeRoomName } from "@/lib/utils";
import {
  acceptBarterOffer,
  grantLoan,
  nextPhase,
  purchaseIntel,
  receiveLoan,
  receiveRepayment,
  repayLoan,
  settleBarterTrade,
} from "@/lib/game/engine";

export function GameRoom({
  me,
  room,
  onLeave,
}: {
  me: PublicUser;
  room:
    | RoomDetail
    | (PublicUser & {
        id: string;
        code: string;
        name: string;
        isPublic: boolean;
        host: PublicUser;
        memberCount: number;
        members: Array<PublicUser & { joinedAt: string }>;
      });
  onLeave: () => void;
}) {
  const { socket, connected, authed, onlineUsers } = useRealtime(me);
  const { state, act, ctx, flush, startingGoldBonus } = useGameSession(
    room.id,
    socket,
    true,
    me.id,
  );
  const phaseSync = usePhaseSync(
    room.id,
    socket,
    state.game,
    act,
    authed,
    me.id,
    startingGoldBonus,
  );

  // A trade involving me just closed, on either side: as the one who
  // clicked Trade (pay the requested item, receive the offered one), or
  // as the original poster (receive the requested item, the offered
  // side was already escrowed away the moment the offer was posted).
  const onBarterFulfilled = useCallback(
    (offer: BarterOffer, accepterId: string) => {
      if (accepterId === me.id) {
        act((g, l) =>
          acceptBarterOffer(
            g,
            offer.requestItem,
            offer.requestAmount,
            offer.offerItem,
            offer.offerAmount,
            l,
          ),
        );
      } else if (offer.fromUserId === me.id) {
        act((g, l) =>
          settleBarterTrade(g, offer.requestItem, offer.requestAmount, l),
        );
      }
    },
    [act, me.id],
  );
  const barter = useBarter(socket, room.id, me.id, onBarterFulfilled);

  // A loan involving me just resolved, on either side: as the helper
  // (debit my Gold, the request I funded is now gone) or as the borrower
  // (credit my Gold, record the debt). Mirrors onBarterFulfilled above.
  const onAidGranted = useCallback(
    (loan: GrantedLoan, role: "borrower" | "helper") => {
      if (role === "borrower") {
        act((g, l) =>
          receiveLoan(
            g,
            {
              id: loan.requestId,
              fromUserId: loan.helperId,
              fromName: loan.helperName,
              amount: loan.amount,
            },
            l,
          ),
        );
      } else {
        act((g, l) =>
          grantLoan(
            g,
            {
              id: loan.requestId,
              borrowerId: loan.borrowerId,
              borrowerName: loan.borrowerName,
              amount: loan.amount,
            },
            l,
          ),
        );
      }
    },
    [act],
  );
  // I'm the lender, being repaid: either a captain paying me back early,
  // or a forced settlement at the end of Round 8 (see the
  // _pendingDebtSettlements effect below), identical from this side.
  const onAidRepaid = useCallback(
    (loan: RepaidLoan) => {
      act((g, l) =>
        receiveRepayment(g, loan.debtId, loan.amount, loan.fromName, l),
      );
    },
    [act],
  );
  const aid = useAid(socket, room.id, me.id, onAidGranted, onAidRepaid);

  // Joins this room's Socket.IO channel, re-run every time `authed` goes
  // back to true, not just on mount. The socket is a singleton (see
  // use-realtime.ts) that survives across reconnects, but the server
  // gives every reconnect a brand new connection with no room recorded
  // against it. Without re-joining here, a captain whose connection so
  // much as blips keeps looking connected, but every room-scoped event
  // they send afterward (ready votes, status, barter, aid) is silently
  // dropped server-side: the room ends up with everyone "ready" and no
  // way to actually advance, with no error to explain why. authed (from
  // useRealtime) flips false then back to true on every reconnect, which
  // is exactly the signal this needs, rather than the raw socket
  // "connect" event firing before authentication has actually completed.
  useEffect(() => {
    if (!socket || !authed) return;
    socket.emit("room:join", { roomId: room.id });
  }, [socket, authed, room.id]);

  // Fires once, the moment every captain still seated in the room has
  // reached either the endgame screen or bankruptcy (see
  // maybeConcludeVoyage in src/server/realtime.ts): who was crowned Sea
  // Master, and everyone's final standing. Re-fetches my own Captain's
  // Legacy right after, since that's the one place its Renown XP,
  // level, and Sea Master crown count actually change. Cleared on
  // "room:restarted" so a fresh voyage's Endgame screen doesn't show the
  // previous one's standings while waiting on the new one to conclude.
  const [voyageResult, setVoyageResult] = useState<VoyageCompleteEvent | null>(
    null,
  );
  const [myLegacy, setMyLegacy] = useState<CaptainLegacySummary | null>(null);
  useEffect(() => {
    if (!socket) return;
    const onVoyageComplete = (data: VoyageCompleteEvent) => {
      if (data.roomId !== room.id) return;
      setVoyageResult(data);
      api
        .getLegacy()
        .then(({ legacy }) => setMyLegacy(legacy))
        .catch(() => {});
      const mine = data.standings.find((s) => s.userId === me.id);
      if (mine?.crowned) {
        toast.success("Crowned Sea Master!", {
          description: `Highest Reputation in the harbor this voyage: ${mine.reputation}.`,
        });
      }
      if (mine?.brokersFavorUnlocked) {
        toast.success("🤝 Broker's Favor unlocked!", {
          description: `Renown Level ${BROKERS_FAVOR_UNLOCK_LEVEL} reached. The Broker owes you one, starting next voyage.`,
        });
      }
      for (const meritId of mine?.newMerits ?? []) {
        const merit = meritById(meritId);
        if (!merit) continue;
        toast.success(`Captain's Merit earned: ${merit.name}`, {
          description: merit.desc,
          icon: <MeritIcon id={merit.id} className="h-4 w-4" />,
        });
      }
    };
    const onRestarted = (data: { roomId: string }) => {
      if (data.roomId !== room.id) return;
      setVoyageResult(null);
    };
    socket.on("room:voyage_complete", onVoyageComplete);
    socket.on("room:restarted", onRestarted);
    return () => {
      socket.off("room:voyage_complete", onVoyageComplete);
      socket.off("room:restarted", onRestarted);
    };
  }, [socket, room.id, me.id]);

  // settleOutstandingDebts (engine.ts) runs deep inside the endRound
  // mutation, with no way to call socket.emit itself, so it leaves the
  // settlements it made on this transient field for this effect to relay
  // and clear, the same way _draftChoices/_newModule signal the React
  // layer for other once-per-round actions.
  useEffect(() => {
    const pending = state.game._pendingDebtSettlements;
    if (!pending || pending.length === 0) return;
    for (const s of pending) aid.repay(s.lenderId, s.amount, s.debtId);
    act((g) => {
      g._pendingDebtSettlements = [];
    });
  }, [state.game._pendingDebtSettlements, aid.repay, act]);

  const handleRepayLoan = useCallback(
    (debtId: string) => {
      const debt = state.game.debts.find((d) => d.id === debtId);
      if (!debt) return;
      act((g, l) => repayLoan(g, debtId, l));
      aid.repay(debt.counterpartyId, debt.amount, debtId);
    },
    [act, aid.repay, state.game.debts],
  );

  const notifications = useNotificationCenter();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const myDetail = useCallback(
    (): PlayerDetailData => ({
      money: state.game.money,
      score: state.game.score,
      shipLevel: state.game.shipLevel,
      round: state.game.currentRound,
      phase: state.game.phase,
      gameOver: state.game.gameOver,
      inventory: state.game.inventory,
      weavers: state.game.weavers,
      masterWeavers: state.game.masterWeavers,
      sachetMakers: state.game.sachetMakers,
      equippedModules: state.game.equippedModules,
      logs: state.logs.slice(-30),
    }),
    [state.game, state.logs],
  );
  const playerDetail = usePlayerDetail(socket, room.id, myDetail);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const [guideOpen, setGuideOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [rumorOpen, setRumorOpen] = useState(false);
  const [tutOpen, setTutOpen] = useState(false);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);

  const [roomMessages, setRoomMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<
    Array<PublicUser & { joinedAt?: string }>
  >(room.members ?? []);

  // The host can change (the original one left before the voyage even
  // started, say), so this is kept live from the room:members broadcast
  // rather than frozen at whatever it was when this component mounted.
  // The member list is also kept live here so the DM candidate list and
  // player detail modal always see the current roster, not just the
  // snapshot that arrived via REST on mount.
  const [hostId, setHostId] = useState<string>((room as any).host?.id ?? me.id);
  useEffect(() => {
    if (!socket) return;
    const onMembers = (data: {
      roomId: string;
      members?: Array<PublicUser & { joinedAt?: string }>;
      hostId: string | null;
    }) => {
      if (data.roomId !== room.id) return;
      if (data.hostId) setHostId(data.hostId);
      if (data.members) setMembers(data.members);
    };
    socket.on("room:members", onMembers);
    return () => {
      socket.off("room:members", onMembers);
    };
  }, [socket, room.id]);
  const isHost = hostId === me.id;

  // DM state
  const [dmTarget, setDmTarget] = useState<PublicUser | null>(null);
  const [dmHistory, setDmHistory] = useState<ChatMessage[]>([]);

  // Which chat tab is showing, lifted out of the Tabs component itself so
  // a notification click can jump the user straight to the right one.
  const [chatTab, setChatTab] = useState<"room" | "dm">("room");

  // Load room detail (members + chat history) on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { room: detail, messages } = await api.getRoom(room.id);
        if (!alive) return;
        setRoomMessages(messages);
        setMembers(detail.members);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [room.id]);

  // Pop up a 15-second notification for every action's worth of new ledger
  // entries, grouped together. A single action like ending a round can
  // write out half a dozen lines at once, and that should read as one
  // event, not a flood of separate popups. It mirrors into the ledger
  // itself at the same time since state.logs already holds the full
  // history. Rendered as separate stacked lines (not one string joined
  // with "\n") since a toast's default CSS collapses literal newlines.
  const lastLogCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!state.loaded) return;
    const prevCount = lastLogCountRef.current;
    lastLogCountRef.current = state.logs.length;
    if (prevCount === null) return; // first observation after load: history, not a new action
    if (state.logs.length <= prevCount) return; // reset/restart, nothing new to announce
    const newLines = state.logs
      .slice(prevCount)
      .filter((l) => l.trim().length > 0);
    if (newLines.length === 0) return;
    notifications.push({
      icon: "📜",
      title: "Captain's Ledger",
      lines: newLines,
    });
  }, [state.logs, state.loaded, notifications.push]);

  // Every room/DM message pops up as its own 15-second notification too,
  // regardless of which chat tab is currently open, so it's never missed.
  // Clicking it jumps straight to the conversation it came from.
  useEffect(() => {
    if (!socket) return;
    const onRoomMsg = (data: { roomId: string; message: ChatMessage }) => {
      if (data.roomId !== room.id || data.message.sender.id === me.id) return;
      notifications.push({
        icon: "⚓",
        title: `${data.message.sender.displayName} · Harbor`,
        lines: [data.message.content],
        onActivate: () => setChatTab("room"),
      });
    };
    const onDm = (message: ChatMessage) => {
      if (message.sender.id === me.id) return;
      notifications.push({
        icon: "✉️",
        title: `${message.sender.displayName} · Direct`,
        lines: [message.content],
        onActivate: () => {
          setChatTab("dm");
          openDm(message.sender);
        },
      });
    };
    socket.on("chat:room", onRoomMsg);
    socket.on("chat:dm", onDm);
    return () => {
      socket.off("chat:room", onRoomMsg);
      socket.off("chat:dm", onDm);
    };
  }, [socket, room.id, me.id, notifications.push]);

  // First-time tutorial hint.
  useEffect(() => {
    const seen =
      typeof window !== "undefined"
        ? localStorage.getItem("portmasters_tutorial_seen")
        : null;
    if (!seen && state.loaded && state.game.phase === 0) {
      const t = setTimeout(() => setTutOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [state.loaded, state.game.phase]);

  const handleSave = useCallback(async () => {
    try {
      await api.saveGameState(room.id, state.game);
      toast.success("Progress saved", {
        description: "Your voyage is recorded on the server.",
      });
    } catch {
      toast.error("Save failed", {
        description: "Could not reach the harbour master.",
      });
    }
  }, [room.id, state.game]);

  const handleNext = useCallback(() => {
    phaseSync.markReady((g, l) => nextPhase(g, ctx, l));
  }, [phaseSync, ctx]);

  const handleSetSail = useCallback(() => {
    phaseSync.startGame();
  }, [phaseSync]);

  const handleRestart = useCallback(() => {
    if (!isHost) {
      toast.error("Only the host can restart the voyage");
      return;
    }
    setRestartConfirmOpen(true);
  }, [isHost]);

  const confirmRestart = useCallback(() => {
    phaseSync.restartVoyage();
  }, [phaseSync]);

  // Keyboard shortcuts (preserved from original).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleSave();
      } else if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        handleNext();
      } else if (e.ctrlKey && e.key === "r") {
        e.preventDefault();
        handleRestart();
      } else if (e.key === "F1") {
        e.preventDefault();
        setGuideOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, handleNext, handleRestart]);

  async function handleLeave() {
    try {
      await flush();
    } catch {
      /* ignore */
    }
    try {
      await api.leaveRoom(room.id);
    } catch {
      /* ignore */
    }
    onLeave();
  }

  // Renown (Captain's Legacy) is server side, account wide data, unlike
  // the rest of the detail popup (cargo, workers, log), which is relayed
  // peer to peer and only available while that captain's own client is
  // connected and responsive. Fetched fresh on every click rather than
  // cached indefinitely, same as playerDetail.requestDetail below, so a
  // captain who just finished another voyage elsewhere shows their
  // current standing.
  const [otherLegacy, setOtherLegacy] = useState<
    Record<string, CaptainLegacySummary>
  >({});
  const handleSelectPlayer = useCallback(
    (userId: string) => {
      setSelectedPlayerId(userId);
      playerDetail.requestDetail(userId);
      api
        .getLegacyFor(userId)
        .then(({ legacy }) =>
          setOtherLegacy((prev) => ({ ...prev, [userId]: legacy })),
        )
        .catch(() => {});
    },
    [playerDetail],
  );

  async function openDm(user: PublicUser) {
    if (user.id === me.id) return;
    setDmTarget(user);
    try {
      const { messages } = await api.getDmHistory(user.id);
      setDmHistory(messages);
    } catch {
      setDmHistory([]);
    }
  }

  function copyCode() {
    navigator.clipboard?.writeText(room.code).then(
      () => toast.success("Room code copied", { description: room.code }),
      () => {},
    );
  }

  const onlineInLobby = onlineUsers.filter((u) => u.id !== me.id);

  if (!state.loaded) {
    return (
      <div className="pm-canvas min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground flex items-center gap-2">
          <Ship className="h-5 w-5 animate-pulse text-teal-500" /> Weighing
          anchor…
        </div>
      </div>
    );
  }

  return (
    <div className="pm-canvas min-h-screen w-full flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 px-3 sm:px-5 py-3">
        <div className="pm-glass rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <div className="pm-grad-primary h-9 w-9 rounded-xl flex items-center justify-center shrink-0">
              <Anchor className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-bold leading-tight truncate">
                  {normalizeRoomName(room.name)}
                </h1>
                <Pill tone="sea" className="shrink-0">
                  <Users className="h-3 w-3" /> {members.length}
                </Pill>
              </div>
              <button
                onClick={copyCode}
                className="pm-pressable text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <span className="font-mono tracking-widest">{room.code}</span>
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone="emerald" className="hidden sm:inline-flex">
              <OnlineDot online={connected && authed} size={8} />{" "}
              {connected && authed ? "Live" : "Linking…"}
            </Pill>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-lg relative"
              onClick={() => {
                setNotificationsOpen((v) => !v);
                notifications.markAllRead();
              }}
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              {notifications.unreadCount > 0 && (
                <Pill
                  tone="rose"
                  className="absolute -top-1 -right-1 !px-1 !py-0 min-w-[16px] h-4 justify-center text-[10px]"
                >
                  {notifications.unreadCount > 9
                    ? "9+"
                    : notifications.unreadCount}
                </Pill>
              )}
            </Button>
            <div className="flex items-center gap-2 pl-2 border-l border-black/5 dark:border-white/10">
              <Avatar hue={me.avatarHue} name={me.displayName} size={30} ring />
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg"
                onClick={handleLeave}
              >
                <DoorOpen className="h-4 w-4 mr-1.5" /> Leave
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <main className="flex-1 px-3 sm:px-5 pb-4 max-w-[1600px] w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[clamp(220px,22vw,300px)_minmax(0,1fr)_clamp(260px,26vw,360px)] gap-3">
          {/* Left: status + log */}
          <div className="space-y-3 order-2 lg:order-1">
            <div className="pm-glass rounded-2xl p-3">
              <GameStatusPanel
                game={state.game}
                onRepayLoan={handleRepayLoan}
              />
            </div>
            <GameLogPanel logs={state.logs} />
          </div>

          {/* Center: phase + controls */}
          <div className="space-y-3 order-1 lg:order-2 min-w-0">
            <GamePhasePanel
              game={state.game}
              ctx={ctx}
              act={act}
              members={members}
              myUserId={me.id}
              isHost={isHost}
              phaseSync={phaseSync}
              barter={barter}
              aid={aid}
              voyageResult={voyageResult}
              myLegacy={myLegacy}
              onRestart={handleRestart}
              onShowRumors={() => setRumorOpen(true)}
              onShowGuide={() => setGuideOpen(true)}
              onShowTips={() => setTipsOpen(true)}
              onShowTutorial={() => setTutOpen(true)}
            />
            <GameControlPanel
              game={state.game}
              saving={state.saving}
              isHost={isHost}
              onSetSail={handleSetSail}
              onNextPhase={handleNext}
              onGuide={() => setGuideOpen(true)}
              onSave={handleSave}
              onRestart={handleRestart}
              waiting={phaseSync.waiting}
              readyCount={phaseSync.readyCount}
              requiredCount={phaseSync.requiredCount}
              onCancelReady={phaseSync.cancelReady}
            />
            <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground/70">
              <kbd className="rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5">
                Ctrl+S
              </kbd>{" "}
              Save
              <kbd className="rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5">
                Ctrl+N
              </kbd>{" "}
              Next Phase
              <kbd className="rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5">
                Ctrl+R
              </kbd>{" "}
              Restart
              <kbd className="rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5">
                F1
              </kbd>{" "}
              Guide
            </div>
          </div>

          {/* Right: roster + chat */}
          <div className="order-3 space-y-3 min-w-0">
            <div className="h-[320px]">
              <MembersPanel
                socket={socket}
                roomId={room.id}
                me={me}
                initialMembers={members}
                hostId={hostId}
                onSelectPlayer={handleSelectPlayer}
              />
            </div>
            <div
              className="pm-glass rounded-2xl overflow-hidden flex flex-col"
              style={{ height: 380 }}
            >
              <Tabs
                value={chatTab}
                onValueChange={(v) => setChatTab(v as "room" | "dm")}
                className="flex flex-col h-full"
              >
                <TabsList className="grid grid-cols-2 m-2 mb-0">
                  <TabsTrigger value="room">
                    <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> Harbor
                  </TabsTrigger>
                  <TabsTrigger value="dm">
                    <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> Direct
                  </TabsTrigger>
                </TabsList>
                <TabsContent
                  value="room"
                  className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
                >
                  <ChatPanel
                    socket={socket}
                    me={me}
                    mode="room"
                    roomId={room.id}
                    initialMessages={roomMessages}
                  />
                </TabsContent>
                <TabsContent
                  value="dm"
                  className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
                >
                  <DmTab
                    socket={socket}
                    me={me}
                    target={dmTarget}
                    history={dmHistory}
                    candidates={[
                      ...members.map((m) => ({ ...m, roomId: room.id })),
                      ...onlineInLobby,
                    ]}
                    onPick={openDm}
                    onClear={() => setDmTarget(null)}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </main>

      <GuideModal
        open={guideOpen}
        onOpenChange={setGuideOpen}
        difficulty={state.game.difficulty}
      />
      <TipsModal
        open={tipsOpen}
        onOpenChange={setTipsOpen}
        difficulty={state.game.difficulty}
      />
      <RumorBoardModal
        open={rumorOpen}
        onOpenChange={setRumorOpen}
        game={state.game}
        onBuy={() => act((g, l) => purchaseIntel(g, l))}
      />
      <TutorialModal
        open={tutOpen}
        onOpenChange={setTutOpen}
        difficulty={state.game.difficulty}
      />
      <RestartConfirmModal
        open={restartConfirmOpen}
        onOpenChange={setRestartConfirmOpen}
        onConfirm={confirmRestart}
      />
      <NotificationHistoryModal
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        items={notifications.items}
      />
      <NotificationCenter
        current={notifications.current}
        dismiss={notifications.dismissCurrent}
      />
      <PlayerDetailModal
        open={selectedPlayerId !== null}
        onOpenChange={(v) => {
          if (!v) setSelectedPlayerId(null);
        }}
        player={
          selectedPlayerId
            ? (members.find((m) => m.id === selectedPlayerId) ?? null)
            : null
        }
        isMe={selectedPlayerId === me.id}
        detail={
          selectedPlayerId ? playerDetail.detail[selectedPlayerId] : undefined
        }
        loading={
          selectedPlayerId
            ? Boolean(playerDetail.loading[selectedPlayerId])
            : false
        }
        legacy={selectedPlayerId ? otherLegacy[selectedPlayerId] : undefined}
      />

      {/* Floating help when bankrupt / endgame */}
      {(state.game.phase === "bankruptcy" ||
        state.game.phase === "endgame") && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setTipsOpen(true)}
          className="fixed bottom-5 right-5 pm-grad-amber text-white rounded-full h-12 w-12 flex items-center justify-center shadow-lg z-40"
          title="Strategy tips"
        >
          <LifeBuoy className="h-5 w-5" />
        </motion.button>
      )}
    </div>
  );
}

function DmTab({
  socket,
  me,
  target,
  history,
  candidates,
  onPick,
  onClear,
}: {
  socket: any;
  me: PublicUser;
  target: PublicUser | null;
  history: ChatMessage[];
  candidates: Array<PublicUser & { roomId?: string | null }>;
  onPick: (u: PublicUser) => void;
  onClear: () => void;
}) {
  // Deduplicate candidates by id, exclude self.
  const seen = new Map<string, PublicUser & { roomId?: string | null }>();
  for (const c of candidates)
    if (c.id !== me.id && !seen.has(c.id)) seen.set(c.id, c);
  const list = Array.from(seen.values());

  if (target) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-3 py-2 border-b border-black/5 dark:border-white/10 flex items-center gap-2">
          <Avatar hue={target.avatarHue} name={target.displayName} size={24} />
          <span className="text-xs font-medium truncate">
            {target.displayName}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-[11px]"
            onClick={onClear}
          >
            Switch
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <ChatPanel
            socket={socket}
            me={me}
            mode="dm"
            other={target}
            initialMessages={history}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-black/5 dark:border-white/10 text-[11px] text-muted-foreground">
        Pick a captain to message privately
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {list.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-6 px-4">
              No other captains available right now. They'll appear here once
              they're online.
            </p>
          ) : (
            list.map((u) => (
              <button
                key={u.id}
                onClick={() => onPick(u)}
                className="pm-pressable w-full flex items-center gap-2.5 p-2 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Avatar hue={u.avatarHue} name={u.displayName} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {u.displayName}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    @{u.username}
                  </div>
                </div>
                <MessageCircle className="h-4 w-4 text-muted-foreground/60" />
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
