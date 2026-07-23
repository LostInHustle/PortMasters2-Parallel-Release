// =====================================================================
// PortMasters 2 Parallel Release: realtime layer (Socket.IO)
// Attached directly to the same HTTP server as the Next.js app (see
// server.ts), so it shares the app's origin and port, no CORS and no
// second process to run.
//
// Responsibilities:
//   Session token authentication against the shared database
//   Online presence (unique per user, multiple tabs allowed)
//   Room channels (join, leave, member roster, system notices)
//   Cleaning up a player's seat once they're truly gone (grace timer below)
//   Live game status broadcast (round, phase, gold, reputation)
//   Starting the voyage: host only, and only once the harbor has two
//   captains in it (see "room:start" below)
//   Phase/round ready-checks after that, so a room advances together
//   instead of each captain racing ahead on their own clock
//   Relaying on-demand player detail requests (cargo, workers, logs) so
//   the roster can show a quick summary without broadcasting it constantly
//   Room chat (persisted) and one to one direct messages (persisted)
//   The Bartering phase's open-offer board: the one place this file is
//   briefly authoritative over real state instead of just a vote/relay
// =====================================================================
import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { db } from "../lib/db";
import { leaveRoomForUser, roomMemberIds } from "../lib/rooms";
import {
  levelForRenownXP,
  parseStatsByDifficulty,
  recordVoyageInStats,
  renownTitleForLevel,
} from "../lib/game/legacy";
import {
  BROKERS_FAVOR_UNLOCK_LEVEL,
  TIDEWATCH_SURGE_THRESHOLD,
  WORD_ON_THE_DOCKS_REWARD,
  WORD_ON_THE_DOCKS_THRESHOLD,
} from "../lib/game/constants";
import { meritById, qualifyingMerits } from "../lib/game/merits";
import {
  normalizeDifficulty,
  renownMultiplierFor,
} from "../lib/game/difficulty";
import { computeHarborPulse } from "../lib/game/harborPulse";

// ---------- Types ----------
type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
};

type SocketState = {
  userId: string;
  user: PublicUser;
  roomId: string | null;
  authed: boolean;
};

export function attachRealtime(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ---------- In-memory presence ----------
  const sockets = new Map<string, SocketState>(); // socketId -> state
  // userId -> Set<socketId>  (a user may have multiple tabs)
  const userSockets = new Map<string, Set<string>>();

  function publicUser(u: {
    id: string;
    username: string;
    displayName: string;
    avatarHue: number;
  }): PublicUser {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarHue: u.avatarHue,
    };
  }

  function onlineUsers(): Array<PublicUser & { roomId: string | null }> {
    const seen = new Map<string, PublicUser & { roomId: string | null }>();
    for (const s of sockets.values()) {
      if (!seen.has(s.userId))
        seen.set(s.userId, { ...s.user, roomId: s.roomId });
    }
    return Array.from(seen.values());
  }

  function broadcastPresence() {
    io.emit("presence:update", { users: onlineUsers() });
  }

  // One row per *user*, never per socket. A captain can hold several
  // sockets at once, legitimately (two browser tabs) or transiently (a
  // reconnect's brand-new socket while the dropped one is still inside
  // pingTimeout and so still sitting in `sockets` with its roomId set).
  // The roster has to collapse all of them down to a single seat. This
  // mirrors how onlineUsers() already dedupes presence by userId; without
  // the same dedupe here, any network that recycles idle WebSockets (a
  // hosting edge proxy is the common one) makes the same captain appear
  // two or three times, each frozen on a different game:status, exactly
  // the "duplicate me with different statuses" symptom.
  function roomMembers(roomId: string) {
    const byUser = new Map<string, PublicUser & { socketId: string }>();
    // Reverse-iterate so the newest socket (inserted last) wins the dedup.
    // When a hosting edge proxy recycles an idle WebSocket, the stale one
    // hangs around in `sockets` until pingTimeout fires, if it wins the
    // dedup, every other captain sees a frozen status for that user.  By
    // walking newest-first, the freshly-reconnected (or even just more
    // recently active) socket always claims the roster slot.
    for (const [sid, s] of Array.from(sockets.entries()).reverse()) {
      if (s.roomId === roomId && !byUser.has(s.userId)) {
        byUser.set(s.userId, { ...s.user, socketId: sid });
      }
    }
    return Array.from(byUser.values());
  }

  // Includes the room's current host so a reassigned host (the original
  // one left before anyone else did) sees the Start Game control without
  // needing to refresh. Read fresh from the database every time rather
  // than cached, since host changes are rare and this only fires on
  // join/leave/disconnect, never on the hot game-action path.
  async function emitRoomMembers(roomId: string) {
    const members = roomMembers(roomId).map(({ socketId: _sid, ...u }) => u);
    const room = await db.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    io.to(`room:${roomId}`).emit("room:members", {
      roomId,
      members,
      hostId: room?.hostId ?? null,
    });
  }

  // Last-known game status per (room, user) so late joiners can hydrate the
  // roster immediately instead of seeing "loading…" until the next broadcast.
  const roomStatuses = new Map<string, Map<string, any>>();

  function rememberStatus(roomId: string, payload: any) {
    let m = roomStatuses.get(roomId);
    if (!m) {
      m = new Map();
      roomStatuses.set(roomId, m);
    }
    m.set(payload.user.id, payload);
  }

  function sendStatusBatchTo(roomId: string, socketId: string) {
    const m = roomStatuses.get(roomId);
    if (!m) return;
    for (const st of m.values()) {
      io.to(socketId).emit("game:status", st);
    }
  }

  // Drop a user's cached status when they leave a room (or disconnect), so a
  // later joiner doesn't get hydrated with stale phase/gold/reputation for
  // someone who isn't actually there anymore. Also reclaims empty room entries.
  function forgetStatus(roomId: string, userId: string) {
    const m = roomStatuses.get(roomId);
    if (!m) return;
    m.delete(userId);
    if (m.size === 0) roomStatuses.delete(roomId);
  }

  // Like forgetStatus, but only actually forgets when the user has no live
  // sockets left at all.  A socket disconnect (or a transport blip that
  // looks like one to the server) shouldn't erase the one piece of data the
  // roster uses to show live gold/reputation/phase, not while another tab
  // or a just-reconnected socket is still around to keep it current.
  function forgetStatusIfLastSocket(roomId: string, userId: string) {
    const set = userSockets.get(userId);
    if (!set || set.size === 0) forgetStatus(roomId, userId);
  }

  // ---------- Abandoned-room cleanup ----------
  // A player who closes their tab (crash, lost connection, refresh) never
  // sends an explicit "leave", so without this their seat would stay
  // occupied forever and the room would never empty out. Closing the tab
  // schedules a grace timer instead of leaving immediately, so a refresh or
  // a brief network drop doesn't cost them their seat, only a sustained
  // absence does. Keyed by "roomId:userId" since a user can only hold one
  // pending departure per room at a time.
  const departureTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const DEPARTURE_GRACE_MS = 30_000;

  // Returns whether a pending departure was actually found and canceled,
  // which room:join below uses to tell a genuine first join (or a switch
  // from another room) apart from a captain whose connection merely
  // blipped and is rejoining the same room moments later.
  function cancelDeparture(roomId: string, userId: string): boolean {
    const key = `${roomId}:${userId}`;
    const t = departureTimers.get(key);
    if (t) {
      clearTimeout(t);
      departureTimers.delete(key);
      return true;
    }
    return false;
  }

  function scheduleDeparture(
    roomId: string,
    userId: string,
    displayName: string,
  ) {
    const key = `${roomId}:${userId}`;
    cancelDeparture(roomId, userId);
    const t = setTimeout(async () => {
      departureTimers.delete(key);
      // They may have reconnected to a different room, or signed back in,
      // in the time it took the timer to fire, so only act if they're
      // still gone from this one.
      if (userSockets.get(userId)?.size) return;
      removeUserBarterOffers(roomId, userId);
      removeUserAidRequest(roomId, userId);
      const result = await leaveRoomForUser(userId, roomId).catch(() => null);
      if (!result) return;
      if (result.roomDeleted) {
        // The room was deleted because this was its last member.  Tear
        // down every in-memory structure for it so a future room (with a
        // different id) doesn't inherit stale checkpoint / status /
        // barter / aid data from a room that no longer exists.
        roomCheckpoints.delete(roomId);
        roomStatuses.delete(roomId);
        roomBarterOffers.delete(roomId);
        roomAidRequests.delete(roomId);
        roomPulseTallies.delete(roomId);
        roomDocksWinners.delete(roomId);
        roomSurges.delete(roomId);
        concludedRooms.delete(roomId);
      } else {
        io.to(`room:${roomId}`).emit("room:system", {
          roomId,
          content: `${displayName}'s voyage has ended; they are no longer a member of this harbor`,
        });
        emitRoomMembers(roomId);
        // The captain who just left might have been the only one still
        // out at sea; everyone else could already be sitting at their
        // endgame screen waiting on exactly this.
        await maybeConcludeVoyage(roomId);
      }
    }, DEPARTURE_GRACE_MS);
    departureTimers.set(key, t);
  }

  // ---------- Phase/round ready-check ----------
  // The room's shared checkpoint: the round + phase every captain is
  // expected to be at. Phase is kept as a string here purely for
  // comparison. This file never runs game rules, it only counts who has
  // said "ready" for the checkpoint it already knows about and tells the
  // room to go once everyone active has. Each client independently runs
  // its own (identical, deterministic) transition in src/lib/game/engine.ts
  // when it gets the "go", which is how they all land on the same next
  // phase without this server needing to know what that phase is.
  type Checkpoint = {
    round: number;
    phase: string;
    readyUserIds: Set<string>;
    advancing: boolean;
  };
  const roomCheckpoints = new Map<string, Checkpoint>();

  // Guards "room:start" against firing twice for the same room if the
  // host double-clicks or has two tabs open. There's no horizontal
  // scaling here (one process, see docs/deployment.md), so this in-memory
  // set is all the locking a single "is this room already starting?"
  // check needs.
  const startingRooms = new Set<string>();

  // Same guard, for "room:restart" below.
  const restartingRooms = new Set<string>();

  // Order of the phases that make up one synchronized lap of a round. Only
  // these eight are gated; sub-states like module drafting/swapping, and
  // terminal ones like bankruptcy/endgame, are personal and never become a
  // room checkpoint.
  const CHECKPOINT_PHASE_ORDER = [
    "0",
    "5",
    "1",
    "barter",
    "worker_mgmt",
    "2",
    "3",
    "4",
  ];
  function checkpointRank(round: number, phase: string): number | null {
    const idx = CHECKPOINT_PHASE_ORDER.indexOf(phase);
    if (idx === -1) return null;
    return round * CHECKPOINT_PHASE_ORDER.length + idx;
  }

  async function getCheckpoint(roomId: string): Promise<Checkpoint> {
    let cp = roomCheckpoints.get(roomId);
    if (cp) return cp;
    const room = await db.room.findUnique({
      where: { id: roomId },
      select: { currentRound: true, currentPhase: true },
    });
    cp = {
      round: room?.currentRound ?? 1,
      phase: room?.currentPhase ?? "0",
      readyUserIds: new Set(),
      advancing: false,
    };
    roomCheckpoints.set(roomId, cp);
    return cp;
  }

  // Every member of the room (straight from the membership table) minus
  // anyone with nothing left to ready up for (bankrupt or already at the
  // endgame screen). This is also what lets the rest of a room keep
  // advancing once a captain goes bankrupt.
  //
  // This is deliberately based on durable room membership, not on who
  // currently has a live socket connected. An earlier version used
  // connected sockets for this, which meant a slow page load or a brief
  // network drop could shrink the roster down to whoever happened to be
  // online at that exact moment, and that lone connected player's ready
  // click would satisfy "everyone's ready" by itself and race the room
  // forward without the others. Membership only changes on an actual
  // departure (explicit leave, logout, or the disconnect grace timer
  // above expiring), so a member who is just slow to load still correctly
  // counts as someone the room needs to wait for.
  async function activeRosterSet(roomId: string): Promise<Set<string>> {
    const statuses = roomStatuses.get(roomId);
    const memberIds = await roomMemberIds(roomId);
    const out = new Set<string>();
    for (const id of memberIds) {
      const ph = statuses?.get(id)?.phase;
      if (ph !== "bankruptcy" && ph !== "endgame") out.add(id);
    }
    return out;
  }

  async function readyStatePayload(roomId: string, cp: Checkpoint) {
    const roster = Array.from(await activeRosterSet(roomId));
    return {
      roomId,
      round: cp.round,
      phase: cp.phase,
      readyUserIds: Array.from(cp.readyUserIds).filter((id) =>
        roster.includes(id),
      ),
      requiredUserIds: roster,
    };
  }

  async function broadcastReadyState(roomId: string, cp: Checkpoint) {
    io.to(`room:${roomId}`).emit(
      "phase:ready_update",
      await readyStatePayload(roomId, cp),
    );
  }

  // Once every active member has signaled ready for the checkpoint they're
  // all sitting at, tell the room to go. "advancing" guards against firing
  // twice while everyone's clients are still catching up to the new phase.
  async function maybeAdvance(roomId: string, cp: Checkpoint) {
    if (cp.advancing) return;
    const roster = await activeRosterSet(roomId);
    if (roster.size === 0) return;
    for (const id of roster) {
      if (!cp.readyUserIds.has(id)) return;
    }
    cp.advancing = true;
    // [MANIFEST 01: The Harbor Pulse] cp.phase is still "5" here, the
    // checkpoint everyone just readied out of; whoever's pendingFn runs next
    // is startPhase1 for cp.round. That makes this the one moment to hand
    // over last round's finished tally, computed once and read by every
    // client's genResourceCard before this round's cards are ever rolled.
    const harborPulse =
      cp.phase === "5"
        ? computeHarborPulse(roomPulseTallies.get(roomId)?.get(cp.round - 1))
        : undefined;
    io.to(`room:${roomId}`).emit("phase:advance", {
      roomId,
      round: cp.round,
      phase: cp.phase,
      ...(harborPulse ? { harborPulse } : {}),
    });
  }

  // ---------- Voyage conclusion & Captain's Legacy ----------
  // Fires once per room, the moment every current member has reported
  // reaching either "endgame" or "bankruptcy": the whole harbor's voyage
  // is over for everyone still seated in it, the same "who's actually
  // still sailing" definition activeRosterSet uses above, just inverted.
  // Whoever reached "endgame" (not bankrupt) with the highest reported
  // Reputation is crowned Sea Master, the title this game has always
  // promised the tutorial and README without any code that actually
  // awarded it. This is also the one place a CaptainLegacy row ever gets
  // written: Reputation earned this voyage becomes Renown XP on every
  // finisher's account, persisting across every future voyage they ever
  // sail, unlike Gold, cargo, and ship level, which a restart (see
  // "room:restart" below) wipes on purpose. concludedRooms guards against
  // firing twice for the same voyage; "room:restart" clears it so a
  // room that plays again can conclude, and be crowned, again.
  const concludedRooms = new Set<string>();

  async function maybeConcludeVoyage(roomId: string) {
    if (concludedRooms.has(roomId)) return;
    const memberIds = await roomMemberIds(roomId);
    if (memberIds.length === 0) return;
    const statuses = roomStatuses.get(roomId);
    if (!statuses) return;

    const finished: {
      userId: string;
      user: PublicUser;
      reputation: number;
      gold: number;
      phase: string;
    }[] = [];
    for (const id of memberIds) {
      const st = statuses.get(id);
      const phase = st ? String(st.phase) : "";
      if (phase !== "endgame" && phase !== "bankruptcy") return; // someone is still out at sea
      finished.push({
        userId: id,
        user: st.user,
        reputation: st.reputation ?? 0,
        gold: st.gold ?? 0,
        phase,
      });
    }

    // Guard set right after the roster check passes, before any `await`
    // below, so a second game:status arriving while the first captain's
    // legacy write is still in flight can't slip through and process the
    // same conclusion twice.
    concludedRooms.add(roomId);

    // The room's difficulty scales how much Reputation banks as Renown XP, so a
    // harder voyage advances the permanent Captain's Legacy faster. Fair Winds
    // is 1.0, leaving the entry tier exactly as it was.
    const roomForDifficulty = await db.room.findUnique({
      where: { id: roomId },
      select: { difficulty: true },
    });
    const roomDifficulty = normalizeDifficulty(roomForDifficulty?.difficulty);
    const renownMultiplier = renownMultiplierFor(roomDifficulty);

    const crownable = finished.filter((f) => f.phase === "endgame");
    const winnerId = crownable.length
      ? crownable.reduce((best, f) =>
          f.reputation > best.reputation ? f : best,
        ).userId
      : null;

    const standings: {
      userId: string;
      displayName: string;
      avatarHue: number;
      reputation: number;
      gold: number;
      crowned: boolean;
      bankrupt: boolean;
      renownLevel: number;
      renownTitle: string;
      xpGained: number;
      leveledUp: boolean;
      brokersFavorUnlocked: boolean;
      newMerits: string[];
    }[] = [];

    for (const f of finished) {
      const xpGained = Math.round(Math.max(0, f.reputation) * renownMultiplier);
      const crowned = f.userId === winnerId;
      const bankrupt = f.phase === "bankruptcy";
      const prior = await db.captainLegacy.findUnique({
        where: { userId: f.userId },
      });
      const priorLevel = prior?.renownLevel ?? 1;
      const newXP = (prior?.renownXP ?? 0) + xpGained;
      const newLevel = levelForRenownXP(newXP);
      const leveledUp = newLevel > priorLevel;
      // A big Reputation haul can jump several levels in one voyage, so this
      // checks the whole span crossed rather than newLevel === the unlock
      // level, which would miss a captain who skipped past it entirely.
      const brokersFavorUnlocked =
        priorLevel < BROKERS_FAVOR_UNLOCK_LEVEL &&
        newLevel >= BROKERS_FAVOR_UNLOCK_LEVEL;
      const newBestScore = Math.max(prior?.bestScore ?? 0, f.reputation);
      const newVoyagesCompleted = (prior?.voyagesCompleted ?? 0) + 1;
      // Resets on any bankruptcy rather than only incrementing on a clean
      // finish, so a single defaulted voyage costs the whole streak, the
      // same "start over" feel as the streak-shaped systems this project
      // already has (a missed pirate roll undoing an escort-free run).
      const newConsecutiveSolventVoyages = bankrupt
        ? 0
        : (prior?.consecutiveSolventVoyages ?? 0) + 1;
      // The per tier breakdown behind the all-tier totals above, so a crown or
      // a high score can be attributed to the waters it was earned on (see
      // statsByDifficulty in prisma/schema.prisma).
      const newStatsByDifficulty = recordVoyageInStats(
        parseStatsByDifficulty(prior?.statsByDifficulty),
        roomDifficulty,
        { crowned, reputation: f.reputation },
      );
      await db.captainLegacy.upsert({
        where: { userId: f.userId },
        create: {
          userId: f.userId,
          renownXP: newXP,
          renownLevel: newLevel,
          voyagesCompleted: 1,
          seaMasterCrowns: crowned ? 1 : 0,
          bestScore: newBestScore,
          consecutiveSolventVoyages: newConsecutiveSolventVoyages,
          statsByDifficulty: JSON.stringify(newStatsByDifficulty),
        },
        update: {
          renownXP: newXP,
          renownLevel: newLevel,
          voyagesCompleted: { increment: 1 },
          ...(crowned ? { seaMasterCrowns: { increment: 1 } } : {}),
          bestScore: newBestScore,
          consecutiveSolventVoyages: newConsecutiveSolventVoyages,
          statsByDifficulty: JSON.stringify(newStatsByDifficulty),
        },
      });

      // Captain's Merits (see src/lib/game/merits.ts): qualifyingMerits
      // returns everything this account currently qualifies for, not just
      // what's new, so the existing rows on file are what turn that into
      // a delta. skipDuplicates is a second line of defense alongside the
      // @@unique constraint, not load bearing on its own.
      const existingMerits = await db.captainMerit.findMany({
        where: { userId: f.userId },
        select: { meritId: true },
      });
      const existingMeritIds = new Set(existingMerits.map((m) => m.meritId));
      const qualifying = qualifyingMerits({
        newVoyagesCompleted,
        crowned,
        priorSeaMasterCrowns: prior?.seaMasterCrowns ?? 0,
        reputation: f.reputation,
        newRenownLevel: newLevel,
        consecutiveSolventVoyages: newConsecutiveSolventVoyages,
        difficulty: roomDifficulty,
        bankrupt,
      });
      const newMerits = qualifying.filter((id) => !existingMeritIds.has(id));
      // One upsert per merit rather than a single createMany: SQLite's
      // Prisma client (unlike Postgres/MySQL) doesn't support
      // skipDuplicates, and there are never more than a handful of merits
      // to grant in one voyage, so the per-row round trip costs nothing
      // worth avoiding in exchange for a write that can't ever throw on
      // the @@unique constraint racing with itself.
      for (const meritId of newMerits) {
        await db.captainMerit.upsert({
          where: { userId_meritId: { userId: f.userId, meritId } },
          create: { userId: f.userId, meritId },
          update: {},
        });
      }

      standings.push({
        userId: f.userId,
        displayName: f.user.displayName,
        avatarHue: f.user.avatarHue,
        reputation: f.reputation,
        gold: f.gold,
        crowned,
        bankrupt,
        renownLevel: newLevel,
        renownTitle: renownTitleForLevel(newLevel),
        xpGained,
        leveledUp,
        brokersFavorUnlocked,
        newMerits,
      });
      if (leveledUp) {
        io.to(`room:${roomId}`).emit("room:system", {
          roomId,
          content: `${f.user.displayName} reached Renown Level ${newLevel}: ${renownTitleForLevel(newLevel)}!`,
        });
      }
      for (const meritId of newMerits) {
        const merit = meritById(meritId);
        if (!merit) continue;
        io.to(`room:${roomId}`).emit("room:system", {
          roomId,
          content: `${f.user.displayName} earned the Captain's Merit: ${merit.name}!`,
        });
      }
    }
    standings.sort((a, b) => b.reputation - a.reputation);

    io.to(`room:${roomId}`).emit("room:voyage_complete", {
      roomId,
      winnerId,
      standings,
    });
  }

  // ---------- Bartering ----------
  // The one piece of real cross-player state this file owns. Everything
  // else here is either a vote count or a relay; an open barter offer is
  // an actual object two different captains' inventories need to agree
  // happened, so unlike the rest of this file, this server is briefly
  // authoritative over it. It still doesn't know what's in anyone's
  // inventory or wallet though: posting and accepting are validated
  // against each captain's own local state on their own client (see
  // src/lib/game/engine.ts), this just makes sure only one captain can
  // ever claim a given offer. Ephemeral by design, same as the checkpoint
  // and status maps above: a server restart loses in-flight offers, which
  // is exactly as durable as the ready-vote state already is.
  type BarterOffer = {
    id: string;
    fromUserId: string;
    fromName: string;
    offerItem: string;
    offerAmount: number;
    requestItem: string;
    requestAmount: number;
  };
  const roomBarterOffers = new Map<string, BarterOffer[]>();

  function barterList(roomId: string): BarterOffer[] {
    return roomBarterOffers.get(roomId) ?? [];
  }

  function broadcastBarter(roomId: string) {
    io.to(`room:${roomId}`).emit("barter:update", {
      roomId,
      offers: barterList(roomId),
    });
  }

  // Drops every open offer for a room (phase moved on, or the room
  // restarted) and tells everyone still in it the board is now empty.
  function clearBarter(roomId: string) {
    if (!roomBarterOffers.has(roomId)) return;
    roomBarterOffers.delete(roomId);
    broadcastBarter(roomId);
  }

  // Drops just one departed captain's own offers, so nobody can accept a
  // dangling offer from someone who isn't in the room (or online) anymore.
  function removeUserBarterOffers(roomId: string, userId: string) {
    const list = roomBarterOffers.get(roomId);
    if (!list) return;
    const next = list.filter((o) => o.fromUserId !== userId);
    if (next.length === list.length) return;
    if (next.length) roomBarterOffers.set(roomId, next);
    else roomBarterOffers.delete(roomId);
    broadcastBarter(roomId);
  }

  // ---------- Financial aid ----------
  // A captain short on Gold for this round's wages or maintenance can ask
  // the rest of the harbor for a loan before being forced into a bankrupt
  // payment. Structurally the same problem as a barter offer (real
  // cross-player state two clients need to agree happened), so this is
  // deliberately built the same way: this server only keeps one captain
  // from claiming the same request twice, it never sees anyone's actual
  // Gold total. Whether the helper can really afford to lend is decided
  // on their own client against their own GameState, same as a barter
  // offer's affordability (see grantLoan in src/lib/game/engine.ts).
  type AidRequest = {
    id: string;
    fromUserId: string;
    fromName: string;
    amount: number;
    round: number;
  };
  const roomAidRequests = new Map<string, AidRequest[]>();

  function aidList(roomId: string): AidRequest[] {
    return roomAidRequests.get(roomId) ?? [];
  }

  function broadcastAid(roomId: string) {
    io.to(`room:${roomId}`).emit("aid:update", {
      roomId,
      requests: aidList(roomId),
    });
  }

  function clearAid(roomId: string) {
    if (!roomAidRequests.has(roomId)) return;
    roomAidRequests.delete(roomId);
    broadcastAid(roomId);
  }

  // Drops just one departed captain's own open request, so nobody can
  // fund a request from someone who isn't in the room (or online) anymore.
  function removeUserAidRequest(roomId: string, userId: string) {
    const list = roomAidRequests.get(roomId);
    if (!list) return;
    const next = list.filter((r) => r.fromUserId !== userId);
    if (next.length === list.length) return;
    if (next.length) roomAidRequests.set(roomId, next);
    else roomAidRequests.delete(roomId);
    broadcastAid(roomId);
  }

  // ---------- The Harbor Pulse ----------
  // [MANIFEST 01] Every client already knows what it bought this round; this
  // just adds up everyone's reports so the next round's market can lean
  // toward or away from whatever the room actually did, instead of every
  // captain's price roll staying completely blind to the rest of the harbor.
  // Keyed by room, then by round, since a report can arrive for the round
  // that's just ending while a slower captain is still mid-report for the
  // one before it. Reports for a round are only ever read once, the moment
  // the room advances into the next round's Phase 1 (see maybeAdvance
  // below), and are never written to the database: losing this on a server
  // restart just means one round rolls with a neutral market, which is the
  // same as round 1 every voyage already looks like.
  const roomPulseTallies = new Map<
    string,
    Map<number, Record<string, number>>
  >();

  function addPulseReport(
    roomId: string,
    round: number,
    tally: Record<string, number>,
  ) {
    let byRound = roomPulseTallies.get(roomId);
    if (!byRound) {
      byRound = new Map();
      roomPulseTallies.set(roomId, byRound);
    }
    const existing = byRound.get(round) ?? {};
    for (const [item, qty] of Object.entries(tally)) {
      if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0)
        continue;
      existing[item] = (existing[item] ?? 0) + qty;
    }
    byRound.set(round, existing);
  }

  // ---------- Word on the Docks ----------
  // [MANIFEST 02] A spontaneous, room wide race layered alongside the
  // scheduled Imperial Mandates (see difficulty.ts), which stay untouched.
  // Whoever's own client is first to report crossing the completed-orders
  // threshold wins; this server's only job is deciding who was first, the
  // same "first report wins" arbitration the barter board already uses for
  // who gets to accept a given offer. One winner per room per voyage, so
  // this is keyed by room, not by round, and cleared on restart below.
  const roomDocksWinners = new Map<string, { userId: string; name: string }>();

  // ---------- Tidewatch Alerts ----------
  // [MANIFEST 03] Never a difficulty dial: voyage length, tier content, and
  // card count baseline all stay entirely the host's choice (see
  // difficulty.ts). This only reads Reputation every captain is already
  // reporting through the ordinary game:status heartbeat (see rememberStatus
  // above) and, once the room's combined total clears
  // TIDEWATCH_SURGE_THRESHOLD, flips a one direction, one time flag for the
  // room. roomSurges tracks which rooms have already triggered this voyage,
  // so a status report arriving after the flip is a harmless no-op, not a
  // repeat trigger.
  const roomSurges = new Set<string>();

  function combinedReputation(roomId: string): number {
    const statuses = roomStatuses.get(roomId);
    if (!statuses) return 0;
    let total = 0;
    for (const st of statuses.values()) total += st.reputation ?? 0;
    return total;
  }

  // ---------- Helpers ----------
  async function validateToken(token: string): Promise<PublicUser | null> {
    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    return publicUser(session.user);
  }

  // Parse the pm_session cookie from a raw cookie header.
  function readSessionCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(";")) {
      const [k, ...rest] = part.trim().split("=");
      if (k === "pm_session") return decodeURIComponent(rest.join("="));
    }
    return null;
  }

  // Authenticate a socket from its handshake cookie (auto) or an explicit token.
  async function authenticate(socket: any, explicitToken?: string) {
    const token =
      explicitToken ?? readSessionCookie(socket.handshake?.headers?.cookie);
    if (!token) {
      socket.emit("auth:fail", { error: "Missing session" });
      return null;
    }
    const user = await validateToken(token);
    if (!user) {
      socket.emit("auth:fail", { error: "Invalid or expired session" });
      return null;
    }
    const state = sockets.get(socket.id);
    if (!state) return null;
    // If re-authenticating a different user, clean up old presence first.
    if (state.authed && state.userId && state.userId !== user.id) {
      const oldSet = userSockets.get(state.userId);
      if (oldSet) {
        oldSet.delete(socket.id);
        if (oldSet.size === 0) userSockets.delete(state.userId);
      }
      if (state.roomId) {
        socket.leave(`room:${state.roomId}`);
        forgetStatusIfLastSocket(state.roomId, state.userId);
        emitRoomMembers(state.roomId);
      }
    }
    state.userId = user.id;
    state.user = user;
    state.authed = true;
    let set = userSockets.get(user.id);
    if (!set) {
      set = new Set();
      userSockets.set(user.id, set);
    }
    set.add(socket.id);
    socket.emit("auth:ok", { user });
    socket.emit("presence:update", { users: onlineUsers() });
    broadcastPresence();
    return user;
  }

  // ---------- Connection handling ----------
  io.on("connection", (socket) => {
    sockets.set(socket.id, {
      userId: "",
      user: { id: "", username: "", displayName: "", avatarHue: 0 },
      roomId: null,
      authed: false,
    });

    // Auto-authenticate from the handshake cookie (sent with credentials).
    authenticate(socket);

    socket.on("auth", async (payload: { token?: string } | undefined) => {
      await authenticate(socket, payload?.token);
    });

    const requireAuth = (): SocketState | null => {
      const s = sockets.get(socket.id);
      if (!s || !s.authed) {
        socket.emit("auth:fail", { error: "Authenticate first" });
        return null;
      }
      return s;
    };

    socket.on("room:join", async (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId;
      if (!roomId) return;

      // Verify membership in DB.
      const member = await db.roomMember.findUnique({
        where: { userId_roomId: { userId: s.userId, roomId } },
      });
      if (!member) {
        socket.emit("room:error", {
          roomId,
          error: "Not a member of that room",
        });
        return;
      }

      // Leave previous room channel if any.
      if (s.roomId) {
        socket.leave(`room:${s.roomId}`);
        // Guarded: the user may have another tab still sitting in the old
        // room, and that tab's heartbeat is the only thing keeping the
        // roster status live for them there.
        forgetStatusIfLastSocket(s.roomId, s.userId);
        io.to(`room:${s.roomId}`).emit("room:system", {
          roomId: s.roomId,
          content: `${s.user.displayName} set sail for another port`,
        });
        emitRoomMembers(s.roomId);
      }

      // They're back, so don't let a grace timer started by an earlier
      // disconnect remove their seat out from under them. Also tells a
      // genuine first join apart from a reconnect rejoining the same
      // room: a captain whose connection blipped never really "left," so
      // skip the system notice that would otherwise misleadingly repeat
      // every time their connection hiccups.
      const wasReconnecting = cancelDeparture(roomId, s.userId);

      s.roomId = roomId;
      socket.join(`room:${roomId}`);
      if (!wasReconnecting) {
        io.to(`room:${roomId}`).emit("room:system", {
          roomId,
          content: `${s.user.displayName} entered the harbor`,
        });
      }
      emitRoomMembers(roomId);
      // Hydrate the joiner with everyone's last-known game status, the
      // room's current synchronized checkpoint + who's already readied
      // up, and the live Bartering/aid boards. This is also what makes
      // room:join safe (and necessary) to call again on every reconnect,
      // not just the first time: a socket that drops and reconnects gets
      // a brand new id and starts with no room at all server-side, so
      // without re-joining, every subsequent room-scoped event from that
      // captain (ready votes, status, barter, aid) would silently fail
      // the `roomId !== s.roomId` checks those handlers rely on, with no
      // error and no way to recover short of a full page reload.
      sendStatusBatchTo(roomId, socket.id);
      const cp = await getCheckpoint(roomId);
      io.to(socket.id).emit(
        "phase:ready_update",
        await readyStatePayload(roomId, cp),
      );
      io.to(socket.id).emit("barter:update", {
        roomId,
        offers: barterList(roomId),
      });
      io.to(socket.id).emit("aid:update", {
        roomId,
        requests: aidList(roomId),
      });
      broadcastPresence();
    });

    socket.on("room:leave", (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId) return;
      socket.leave(`room:${roomId}`);
      if (s.roomId === roomId) s.roomId = null;
      forgetStatus(roomId, s.userId);
      removeUserBarterOffers(roomId, s.userId);
      removeUserAidRequest(roomId, s.userId);
      io.to(`room:${roomId}`).emit("room:system", {
        roomId,
        content: `${s.user.displayName} left the harbor`,
      });
      emitRoomMembers(roomId);
      broadcastPresence();
    });

    socket.on(
      "game:status",
      async (payload: {
        roomId?: string;
        round?: number;
        phase?: number | string;
        phaseLabel?: string;
        gold?: number;
        reputation?: number;
        shipLevel?: number;
        gameOver?: boolean;
      }) => {
        const s = requireAuth();
        if (!s) return;
        if (!s.roomId) return;
        const roomId = payload?.roomId ?? s.roomId;
        if (roomId !== s.roomId) return;

        // Only the newest socket for a user is allowed to update the room's
        // status cache and broadcast.  A stale socket that hasn't been cleaned
        // up yet (Railway edge proxy recycling, pingTimeout not yet fired)
        // would otherwise keep spraying frozen phase/gold/reputation data
        // across the room, making the same captain flicker between two
        // different statuses on everyone else's roster, the exact "duplicate
        // me with different statuses" symptom.
        {
          let newest = false;
          for (const [sid, st] of Array.from(sockets.entries()).reverse()) {
            if (st.userId === s.userId) {
              newest = sid === socket.id;
              break;
            }
          }
          if (!newest) return;
        }

        const broadcast = {
          roomId,
          user: s.user,
          round: payload?.round ?? 0,
          phase: payload?.phase ?? 0,
          phaseLabel: payload?.phaseLabel ?? "",
          gold: payload?.gold ?? 0,
          reputation: payload?.reputation ?? 0,
          shipLevel: payload?.shipLevel ?? 0,
          gameOver: Boolean(payload?.gameOver),
          at: Date.now(),
        };
        rememberStatus(roomId, broadcast);
        io.to(`room:${roomId}`).emit("game:status", broadcast);

        // [MANIFEST 03: Tidewatch Alerts] Checked on every status report,
        // right after this one's Reputation is folded into the room's
        // remembered totals above, so the sum is always current. Fires at
        // most once per room per voyage; roomSurges is what makes every
        // later report, from anyone, a harmless no-op instead of a repeat
        // trigger.
        if (
          !roomSurges.has(roomId) &&
          combinedReputation(roomId) >= TIDEWATCH_SURGE_THRESHOLD
        ) {
          roomSurges.add(roomId);
          io.to(`room:${roomId}`).emit("tidewatch:surge", { roomId });
          io.to(`room:${roomId}`).emit("room:system", {
            roomId,
            content:
              "🌊 Tidewatch Alert: the harbor takes notice of a bustling crew! One more cargo lot joins every captain's Port Purchase board, for the rest of this voyage.",
          });
        }

        // Move the room's synchronized checkpoint forward if this report puts
        // someone further along than where the room currently is, and recheck
        // readiness. A status change can shrink the active roster (e.g.
        // someone just went bankrupt), which can be the only thing blocking
        // the rest of the room from advancing.
        //
        // Gated on the room's own "started" column, read fresh rather than
        // off any in-memory copy, because a stale report can otherwise
        // resurrect a checkpoint a host just reset. A captain's client keeps
        // a status broadcast in flight on a 120ms debounce and an 8s
        // heartbeat (see use-game-session.ts); if either is already on the
        // wire the instant a host hits "Restart Voyage", it lands at the
        // server moments after "started" flips back to false and, without
        // this check, immediately advances the checkpoint right back to
        // whatever phase that stale report claims, persisting "started:
        // false, currentPhase: <mid-game>" forever. The very next captain to
        // join that room then gets snapped straight into that orphaned phase
        // with a blank, never-initialized game state (see snapToCheckpoint
        // in engine.ts), instead of the fresh lobby it should be.
        const room = await db.room.findUnique({
          where: { id: roomId },
          select: { started: true },
        });
        const cp = await getCheckpoint(roomId);
        const phaseStr = String(broadcast.phase);
        const newRank = checkpointRank(broadcast.round, phaseStr);
        const curRank = checkpointRank(cp.round, cp.phase);
        if (
          room?.started &&
          newRank !== null &&
          (curRank === null || newRank > curRank)
        ) {
          cp.round = broadcast.round;
          cp.phase = phaseStr;
          cp.readyUserIds.clear();
          cp.advancing = false;
          await db.room
            .update({
              where: { id: roomId },
              data: { currentRound: cp.round, currentPhase: cp.phase },
            })
            .catch(() => {});
          // The room has moved off the Bartering checkpoint (or, on a fresh
          // join, was never on it to begin with), either way any offers
          // left over from it are now stale and should disappear for
          // whoever's left looking at that board.
          if (cp.phase !== "barter") clearBarter(roomId);
          // Same reasoning for any open aid request: Phase 3 is the only
          // checkpoint it's ever relevant at.
          if (cp.phase !== "3") clearAid(roomId);
        }
        await broadcastReadyState(roomId, cp);
        await maybeAdvance(roomId, cp);
        // gameOver only ever becomes true at "bankruptcy" or "endgame" (see
        // GameState.gameOver in src/lib/game/types.ts), the two phases this
        // report could have just moved someone into, so this is the one
        // handler that can ever be the report that completes a room.
        if (broadcast.gameOver) await maybeConcludeVoyage(roomId);
      },
    );

    socket.on(
      "phase:ready",
      async (payload: {
        roomId?: string;
        round?: number;
        phase?: string | number;
      }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        if (!roomId || roomId !== s.roomId) return;
        const cp = await getCheckpoint(roomId);
        // Phase 0 is the pre-game lobby. It only ever moves forward through
        // the host's "room:start" (see below), never through a per-player
        // ready vote, so a solitary host (or whoever happens to be the only
        // one connected at that instant) can't accidentally start the
        // voyage alone.
        if (cp.phase === "0") return;
        if (
          payload?.round !== cp.round ||
          String(payload?.phase) !== cp.phase
        ) {
          // The client is voting on a stale checkpoint.  Instead of
          // silently dropping the vote (which leaves them stuck at
          // "Waiting…" forever on a tunnelled connection where the
          // earlier phase:advance was eaten by a proxy), send them the
          // authoritative ready state right now so their self-healing /
          // desync-catch-up in usePhaseSync can get them back in sync.
          io.to(socket.id).emit(
            "phase:ready_update",
            await readyStatePayload(roomId, cp),
          );
          return;
        }
        cp.readyUserIds.add(s.userId);
        await broadcastReadyState(roomId, cp);
        await maybeAdvance(roomId, cp);
      },
    );

    socket.on("phase:unready", async (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      const cp = await getCheckpoint(roomId);
      cp.readyUserIds.delete(s.userId);
      await broadcastReadyState(roomId, cp);
    });

    // [MANIFEST 01: The Harbor Pulse] Fired once per captain per round, the
    // moment their own client is about to leave Phase 1 for good (see
    // use-phase-sync.ts), carrying what they personally bought. Purely
    // additive and read only once, by maybeAdvance above when the next
    // round's Phase 1 begins, so there is nothing here for a late or
    // duplicate report to corrupt: the worst a stale or repeated report can
    // do is nudge the pulse by one captain's draw a little further than
    // intended, never break it.
    socket.on(
      "harbor:pulse:report",
      (payload: {
        roomId?: string;
        round?: number;
        tally?: Record<string, number>;
      }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        if (!roomId || roomId !== s.roomId) return;
        if (typeof payload?.round !== "number" || !payload.tally) return;
        addPulseReport(roomId, payload.round, payload.tally);
      },
    );

    // [MANIFEST 02: Word on the Docks] Fired by a captain's own client the
    // instant their local totalOrdersCompleted crosses the threshold (see
    // completeOrder in engine.ts). First claim in for a room wins; every
    // later claim, including one from the same captain if this ever fired
    // twice, is silently ignored, the same "first report wins, everything
    // else is a no-op" shape maybeAdvance already uses for the ready check.
    socket.on("docks:claim", (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      if (roomDocksWinners.has(roomId)) return;
      roomDocksWinners.set(roomId, {
        userId: s.userId,
        name: s.user.displayName,
      });
      io.to(`room:${roomId}`).emit("docks:won", {
        roomId,
        winnerId: s.userId,
        winnerName: s.user.displayName,
        reward: WORD_ON_THE_DOCKS_REWARD,
      });
      io.to(`room:${roomId}`).emit("room:system", {
        roomId,
        content: `📣 Word on the Docks: ${s.user.displayName} was first to complete ${WORD_ON_THE_DOCKS_THRESHOLD} trade orders this voyage, and pockets ${WORD_ON_THE_DOCKS_REWARD} Gold for it!`,
      });
    });

    // ---------- Bartering ----------
    // A fresh snapshot of the room's open offers, independent of the
    // broadcasts below, lets the Bartering phase panel ask for the
    // current board the moment it mounts, mirroring "phase:state:request".
    socket.on("barter:state:request", (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      socket.emit("barter:update", { roomId, offers: barterList(roomId) });
    });

    // Structural validation only (integers, ≥1, the two sides differ).
    // Whether the poster can actually afford to offer that much is decided
    // on their own client against their own GameState before this ever
    // fires, see postBarterOffer in src/lib/game/engine.ts, since this
    // server has no visibility into anyone's inventory or gold.
    socket.on(
      "barter:post",
      (payload: {
        roomId?: string;
        tempId?: string;
        offerItem?: string;
        offerAmount?: number;
        requestItem?: string;
        requestAmount?: number;
      }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        if (!roomId || roomId !== s.roomId) return;
        const { offerItem, offerAmount, requestItem, requestAmount } =
          payload ?? {};
        if (
          typeof offerItem !== "string" ||
          !offerItem ||
          typeof requestItem !== "string" ||
          !requestItem ||
          offerItem === requestItem ||
          !Number.isInteger(offerAmount) ||
          (offerAmount as number) < 1 ||
          !Number.isInteger(requestAmount) ||
          (requestAmount as number) < 1
        ) {
          socket.emit("barter:error", {
            roomId,
            tempId: payload?.tempId,
            error: "Invalid barter offer",
          });
          return;
        }
        const offer: BarterOffer = {
          id: `${roomId}:${s.userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          fromUserId: s.userId,
          fromName: s.user.displayName,
          offerItem,
          offerAmount: offerAmount as number,
          requestItem,
          requestAmount: requestAmount as number,
        };
        roomBarterOffers.set(roomId, [...barterList(roomId), offer]);
        socket.emit("barter:posted", {
          roomId,
          tempId: payload?.tempId,
          offer,
        });
        broadcastBarter(roomId);
      },
    );

    socket.on(
      "barter:cancel",
      (payload: { roomId?: string; offerId?: string }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        if (!roomId || roomId !== s.roomId || !payload?.offerId) return;
        const list = barterList(roomId);
        const next = list.filter(
          (o) => !(o.id === payload.offerId && o.fromUserId === s.userId),
        );
        if (next.length === list.length) return; // not found, or not theirs to cancel
        if (next.length) roomBarterOffers.set(roomId, next);
        else roomBarterOffers.delete(roomId);
        broadcastBarter(roomId);
      },
    );

    // First accept to reach the server wins: the offer is deleted from the
    // room's list immediately (this handler runs to completion before the
    // next one does, so there's no real concurrency to race), so a second,
    // near-simultaneous accept for the same offer simply finds it already
    // gone.
    socket.on(
      "barter:accept",
      (payload: { roomId?: string; offerId?: string }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        if (!roomId || roomId !== s.roomId || !payload?.offerId) return;
        const list = barterList(roomId);
        const offer = list.find((o) => o.id === payload.offerId);
        if (!offer) {
          socket.emit("barter:accept:fail", {
            roomId,
            offerId: payload.offerId,
            reason: "That offer is no longer available.",
          });
          return;
        }
        if (offer.fromUserId === s.userId) {
          socket.emit("barter:accept:fail", {
            roomId,
            offerId: payload.offerId,
            reason: "You can't accept your own offer.",
          });
          return;
        }
        const next = list.filter((o) => o.id !== offer.id);
        if (next.length) roomBarterOffers.set(roomId, next);
        else roomBarterOffers.delete(roomId);
        broadcastBarter(roomId);
        const fulfilled = {
          roomId,
          offer,
          accepterId: s.userId,
          accepterName: s.user.displayName,
        };
        socket.emit("barter:fulfilled", fulfilled);
        const posterSockets = userSockets.get(offer.fromUserId);
        if (posterSockets) {
          for (const sid of posterSockets)
            io.to(sid).emit("barter:fulfilled", fulfilled);
        }
      },
    );

    // ---------- Financial aid ----------
    socket.on("aid:state:request", (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      socket.emit("aid:update", { roomId, requests: aidList(roomId) });
    });

    // Structural validation only (a positive integer). Whether the
    // requester actually needs this much, and whether a helper can really
    // afford to fund it, are both decided on each client's own GameState;
    // this server has no visibility into anyone's Gold. One open request
    // per captain: posting a new one replaces whatever they had open.
    socket.on("aid:post", (payload: { roomId?: string; amount?: number }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      const amount = payload?.amount;
      if (!Number.isInteger(amount) || (amount as number) < 1) {
        socket.emit("aid:error", { roomId, error: "Invalid aid request" });
        return;
      }
      const cp = roomCheckpoints.get(roomId);
      const request: AidRequest = {
        id: `${roomId}:${s.userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        fromUserId: s.userId,
        fromName: s.user.displayName,
        amount: amount as number,
        round: cp?.round ?? 1,
      };
      const others = aidList(roomId).filter((r) => r.fromUserId !== s.userId);
      roomAidRequests.set(roomId, [...others, request]);
      broadcastAid(roomId);
    });

    socket.on("aid:cancel", (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      removeUserAidRequest(roomId, s.userId);
    });

    // First help to reach the server wins: the request is removed from
    // the room's list immediately, so a second, near-simultaneous offer
    // to fund the same request simply finds it already gone, the same
    // race-safety as barter:accept above.
    socket.on(
      "aid:help",
      (payload: { roomId?: string; requestId?: string }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        if (!roomId || roomId !== s.roomId || !payload?.requestId) return;
        const list = aidList(roomId);
        const request = list.find((r) => r.id === payload.requestId);
        if (!request) {
          socket.emit("aid:help:fail", {
            roomId,
            requestId: payload.requestId,
            reason: "That request is no longer open.",
          });
          return;
        }
        if (request.fromUserId === s.userId) {
          socket.emit("aid:help:fail", {
            roomId,
            requestId: payload.requestId,
            reason: "You can't fund your own request.",
          });
          return;
        }
        const next = list.filter((r) => r.id !== request.id);
        if (next.length) roomAidRequests.set(roomId, next);
        else roomAidRequests.delete(roomId);
        broadcastAid(roomId);
        const granted = {
          roomId,
          requestId: request.id,
          borrowerId: request.fromUserId,
          borrowerName: request.fromName,
          helperId: s.userId,
          helperName: s.user.displayName,
          amount: request.amount,
          round: request.round,
        };
        socket.emit("aid:granted", granted);
        const borrowerSockets = userSockets.get(request.fromUserId);
        if (borrowerSockets) {
          for (const sid of borrowerSockets)
            io.to(sid).emit("aid:granted", granted);
        }
      },
    );

    // A direct relay between two known captains settling one specific
    // loan, the same shape as a direct message: no room-wide state to
    // keep here, just forward to every socket the lender currently has
    // open so their own client can credit itself. Covers both a
    // voluntary repayment and the forced one at Round 8's end (see
    // settleOutstandingDebts in src/lib/game/engine.ts) since, from the
    // lender's side, receiving the Gold back looks identical either way.
    socket.on(
      "aid:repay",
      (payload: {
        roomId?: string;
        lenderId?: string;
        amount?: number;
        debtId?: string;
      }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        const lenderId = payload?.lenderId;
        const amount = payload?.amount;
        const debtId = payload?.debtId;
        if (
          !roomId ||
          roomId !== s.roomId ||
          !lenderId ||
          !debtId ||
          !Number.isInteger(amount) ||
          (amount as number) < 1
        )
          return;
        const lenderSockets = userSockets.get(lenderId);
        if (!lenderSockets) return;
        const repaid = {
          roomId,
          debtId,
          amount,
          fromUserId: s.userId,
          fromName: s.user.displayName,
        };
        for (const sid of lenderSockets) io.to(sid).emit("aid:repaid", repaid);
      },
    );

    // ---------- On-demand player detail (cargo, workers, logs) ----------
    // Kept out of the constant game:status heartbeat on purpose. Most of
    // the room never needs this, only whoever just opened that one
    // captain's detail popup, so it's a direct request/response relay
    // instead of something broadcast to everyone all the time.
    socket.on(
      "player:detail:request",
      (payload: { roomId?: string; targetUserId?: string }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        const targetUserId = payload?.targetUserId;
        if (!roomId || !targetUserId || roomId !== s.roomId) return;
        const targetSockets = userSockets.get(targetUserId);
        if (!targetSockets || targetSockets.size === 0) {
          socket.emit("player:detail:response", {
            roomId,
            targetUserId,
            data: null,
          });
          return;
        }
        for (const sid of targetSockets) {
          io.to(sid).emit("player:detail:request", {
            roomId,
            targetUserId,
            requesterId: s.userId,
          });
        }
      },
    );

    socket.on(
      "player:detail:response",
      (payload: {
        roomId?: string;
        targetUserId?: string;
        requesterId?: string;
        data?: unknown;
      }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId;
        const requesterId = payload?.requesterId;
        // Only the player being asked about may answer for themselves.
        if (!roomId || !requesterId || payload?.targetUserId !== s.userId)
          return;
        const reqSockets = userSockets.get(requesterId);
        if (!reqSockets) return;
        for (const sid of reqSockets) {
          io.to(sid).emit("player:detail:response", {
            roomId,
            targetUserId: s.userId,
            data: payload?.data ?? null,
          });
        }
      },
    );

    socket.on(
      "chat:room",
      async (payload: { roomId?: string; content?: string }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        const content = (payload?.content ?? "").trim();
        if (!roomId || !content) return;
        if (content.length > 1000) return;

        const msg = await db.message.create({
          data: { roomId, senderId: s.userId, recipientId: null, content },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarHue: true,
              },
            },
          },
        });
        io.to(`room:${roomId}`).emit("chat:room", {
          roomId,
          message: {
            id: msg.id,
            content: msg.content,
            createdAt: msg.createdAt,
            sender: publicUser(msg.sender),
          },
        });
      },
    );

    socket.on(
      "chat:dm",
      async (payload: { recipientId?: string; content?: string }) => {
        const s = requireAuth();
        if (!s) return;
        const recipientId = payload?.recipientId;
        const content = (payload?.content ?? "").trim();
        if (!recipientId || !content || recipientId === s.userId) return;
        if (content.length > 1000) return;

        const msg = await db.message.create({
          data: { roomId: null, senderId: s.userId, recipientId, content },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarHue: true,
              },
            },
            recipient: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarHue: true,
              },
            },
          },
        });

        const messagePayload = {
          id: msg.id,
          content: msg.content,
          createdAt: msg.createdAt,
          sender: publicUser(msg.sender),
          recipient: publicUser(msg.recipient!),
          mine: false,
        };

        // Echo back to sender (as "mine: true").
        socket.emit("chat:dm", { ...messagePayload, mine: true });

        // Deliver to all of the recipient's sockets.
        const recSet = userSockets.get(recipientId);
        if (recSet) {
          for (const sid of recSet) {
            io.to(sid).emit("chat:dm", messagePayload);
          }
        }
      },
    );

    socket.on("presence:request", () => {
      const s = requireAuth();
      if (!s) return;
      socket.emit("presence:update", { users: onlineUsers() });
    });

    // A fresh snapshot of the room's checkpoint + ready state, independent
    // of "room:join". This lets a component mount its own listener first
    // and then ask, instead of racing the join reply broadcast elsewhere.
    socket.on("phase:state:request", async (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      const cp = await getCheckpoint(roomId);
      socket.emit("phase:ready_update", await readyStatePayload(roomId, cp));
    });

    // ---------- Starting the voyage ----------
    // The one transition that isn't a per-player ready vote: only the
    // host can fire it, and only once the harbor has at least two
    // captains in it. Everyone else is told to go via "room:started"
    // rather than the generic "phase:advance" used by the other six
    // transitions, since nobody but the host called anything to trigger
    // this. There's no per-client "pending action" to resume, every
    // client just runs the same startBoonDrafting() unconditionally.
    socket.on("room:start", async (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      if (startingRooms.has(roomId)) return;

      const room = await db.room.findUnique({
        where: { id: roomId },
        select: { hostId: true, started: true },
      });
      if (!room) return;
      if (room.started) {
        socket.emit("room:error", {
          roomId,
          error: "This voyage has already set sail.",
        });
        return;
      }
      if (room.hostId !== s.userId) {
        socket.emit("room:error", {
          roomId,
          error: "Only the host can start the voyage.",
        });
        return;
      }
      const roster = await roomMemberIds(roomId);
      if (roster.length < 2) {
        socket.emit("room:error", {
          roomId,
          error: "Need at least 2 captains in the harbor to set sail.",
        });
        return;
      }

      startingRooms.add(roomId);
      try {
        await db.room.update({
          where: { id: roomId },
          data: { started: true, currentRound: 1, currentPhase: "5" },
        });
        const cp = await getCheckpoint(roomId);
        cp.round = 1;
        cp.phase = "5";
        cp.readyUserIds.clear();
        cp.advancing = false;
        io.to(`room:${roomId}`).emit("room:started", { roomId });
        await broadcastReadyState(roomId, cp);
      } finally {
        startingRooms.delete(roomId);
      }
    });

    // ---------- Restarting the voyage ----------
    // Host-only, same as starting it. Unlike "room:start" this is allowed
    // whether the room has set sail or not, since a harbor that never left
    // port still benefits from a clean slate. The part that actually fixes
    // the bug this exists for: flipping "started" back to false is what
    // lets the join routes (src/app/api/rooms/[id]/join,
    // src/app/api/rooms/join) let new captains back in. Without this, that
    // flag only ever moves one direction and a room that has set sail once
    // is locked out of new joins forever, restart button or not.
    //
    // A restart wipes every member's persisted GameState, not just the
    // host's, and tells every connected client to reset its own local copy
    // too. Each captain runs the same deterministic engine off the room's
    // seed, so a restart that only reset the caller (the old behavior,
    // calling restartGame() locally with no server round-trip at all) just
    // desynced that one captain from everyone else's round/phase with no
    // way back, since phase 0 never participates in the ready-check vote.
    socket.on("room:restart", async (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      if (restartingRooms.has(roomId)) return;

      const room = await db.room.findUnique({
        where: { id: roomId },
        select: { hostId: true },
      });
      if (!room) return;
      if (room.hostId !== s.userId) {
        socket.emit("room:error", {
          roomId,
          error: "Only the host can restart the voyage.",
        });
        return;
      }

      restartingRooms.add(roomId);
      try {
        // Bumping voyageEpoch is what makes a restart a brand-new voyage:
        // every captain folds it into their deterministic seed (see
        // src/lib/use-game-session.ts and the engine's seed strings), so the
        // whole harbor rerolls fresh market, orders, and Broker intel.
        const restarted = await db.room.update({
          where: { id: roomId },
          data: {
            started: false,
            currentRound: 1,
            currentPhase: "0",
            voyageEpoch: { increment: 1 },
          },
        });
        await db.gameState.deleteMany({ where: { roomId } });

        roomCheckpoints.delete(roomId);
        roomStatuses.delete(roomId);
        clearBarter(roomId);
        clearAid(roomId);
        // A restart resets currentRound back to 1, so any tally still held
        // under the old voyage's round numbers would otherwise leak into the
        // new voyage's identically numbered rounds.
        roomPulseTallies.delete(roomId);
        // A brand new voyage means a brand new race to be first to three
        // completed orders, so the old one's winner (if any) can't linger
        // and silently block every claim in the new voyage.
        roomDocksWinners.delete(roomId);
        // A brand new voyage starts with nobody's Reputation counted yet, so
        // the room can earn its own Tidewatch surge all over again rather
        // than inheriting the last voyage's already-tripped flag.
        roomSurges.delete(roomId);
        // A restarted room can sail, and conclude, all over again.
        concludedRooms.delete(roomId);

        io.to(`room:${roomId}`).emit("room:restarted", {
          roomId,
          voyageEpoch: restarted.voyageEpoch,
          difficulty: restarted.difficulty,
        });
        const cp = await getCheckpoint(roomId);
        await broadcastReadyState(roomId, cp);
      } finally {
        restartingRooms.delete(roomId);
      }
    });

    socket.on("disconnect", () => {
      const s = sockets.get(socket.id);
      sockets.delete(socket.id);
      if (s && s.authed && s.userId) {
        const set = userSockets.get(s.userId);
        if (set) {
          set.delete(socket.id);
          if (set.size === 0) userSockets.delete(s.userId);
        }
        if (s.roomId) {
          // Don't erase the live status cache unless every socket the user
          // owns is gone; a parallel tab or a freshly-reconnected socket
          // that hasn't emitted game:status yet otherwise leaves a
          // "loading…" gap on every other captain's roster.
          forgetStatusIfLastSocket(s.roomId, s.userId);
          io.to(`room:${s.roomId}`).emit("room:system", {
            roomId: s.roomId,
            content: `${s.user.displayName} has gone ashore`,
          });
          emitRoomMembers(s.roomId);
          // Only once their last socket is gone. A refresh or a second tab
          // closing shouldn't start the clock on losing their seat.
          if (!set || set.size === 0)
            scheduleDeparture(s.roomId, s.userId, s.user.displayName);
        }
        broadcastPresence();
      }
    });

    socket.on("error", (err) => {
      console.error("[realtime] socket error", socket.id, err);
    });
  });

  // ---------- Boot-time membership reconciliation ----------
  // Every map above (sockets, userSockets, departureTimers, roomCheckpoints,
  // roomStatuses) starts this function call empty on every process boot,
  // but Room/RoomMember in the database persist across it. Without this, a
  // captain who was seated in a room the moment the process went down (a
  // dev hot-reload, a Railway redeploy, a crash) keeps that seat forever:
  // there is no live socket left to ever fire the "disconnect" event that
  // would normally arm their departure grace timer, so activeRosterSet()
  // (what the ready-check protocol waits on) requires a ready signal from
  // them that can now never arrive, and the whole room is stuck on
  // whatever checkpoint it was at, permanently, for everyone left in it.
  // It also never empties out and self-deletes, which is the main reason
  // disposable rooms from past sessions pile up indefinitely.
  //
  // The fix mirrors the disconnect grace period below exactly: arm the
  // same departure timer for every current member of every room as soon
  // as the process comes up, instead of only when a live socket reports
  // going away. A captain whose browser tab is still genuinely open
  // reconnects within a couple of seconds (the client re-auths and
  // re-emits "room:join" automatically, see the `authed` effect in
  // GameRoom.tsx), which cancels this the same way an ordinary
  // reconnect-after-a-blip already does. Anyone who doesn't reconnect
  // within the window is exactly as gone as a normal disconnect would
  // make them, and is reaped the same way.
  async function reconcileMembershipAfterBoot() {
    const members = await db.roomMember.findMany({
      select: {
        roomId: true,
        userId: true,
        user: { select: { displayName: true } },
      },
    });
    for (const m of members) {
      scheduleDeparture(m.roomId, m.userId, m.user.displayName);
    }
  }
  reconcileMembershipAfterBoot().catch((err) => {
    console.error("[realtime] boot reconciliation failed", err);
  });

  return io;
}
