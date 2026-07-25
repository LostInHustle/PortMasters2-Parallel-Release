"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { GameContext, GameState } from "@/lib/game/types";
import type { PublicUser } from "@/lib/api";
import type { VoyageCompleteEvent } from "@/lib/realtime";
import type { CaptainLegacySummary } from "@/lib/game/legacy";
import type { Aid, Backing, Barter, PhaseSync } from "./phases/PhaseShared";
import { Welcome } from "./phases/Welcome";
import { BoonDraft } from "./phases/BoonDraft";
import { Purchase } from "./phases/Purchase";
import { BarterPhase } from "./phases/BarterPhase";
import { WorkerMgmt } from "./phases/WorkerMgmt";
import { Orders } from "./phases/Orders";
import { Settlement } from "./phases/Settlement";
import { Shipyard, ModuleDraft, ModuleSwap } from "./phases/Shipyard";
import { Bankruptcy } from "./phases/Bankruptcy";
import { Endgame } from "./phases/Endgame";

// The dispatcher for every phase screen. Each phase used to be a nested
// function component declared directly in this file (a 2500+ line single
// file holding all twenty of them); they're now one module per phase under
// ./phases, each still a module-level export for the same reason they were
// pulled out of GamePhasePanel's own body in the first place: a stable
// component identity across renders, so React re-renders a phase in place
// on every game state update instead of unmounting and remounting the whole
// subtree (which used to reset local useState mid-interaction, see
// PhaseShared.tsx's ReadyFooter comment for the original incident).
type Props = {
  game: GameState;
  ctx: GameContext;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  members: PublicUser[];
  myUserId: string;
  isHost: boolean;
  phaseSync: PhaseSync;
  barter: Barter;
  aid: Aid;
  backing: Backing;
  voyageResult: VoyageCompleteEvent | null;
  myLegacy: CaptainLegacySummary | null;
  onRestart: () => void;
  onShowRumors: () => void;
  onShowGuide: () => void;
  onShowTips: () => void;
  onShowTutorial: () => void;
};

export function GamePhasePanel({
  game,
  ctx,
  act,
  members,
  myUserId,
  isHost,
  phaseSync,
  barter,
  aid,
  backing,
  voyageResult,
  myLegacy,
  onRestart,
  onShowRumors,
  onShowTutorial,
}: Props) {
  return (
    <div className="pm-glass rounded-2xl p-4 sm:p-5 min-h-[520px]">
      <AnimatePresence mode="sync">
        <motion.div
          key={String(game.phase) + ":" + game.currentRound}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1.0] }}
        >
          {renderPhase()}
        </motion.div>
      </AnimatePresence>
    </div>
  );

  function renderPhase() {
    const p = game.phase;
    if (p === 0)
      return (
        <Welcome
          phaseSync={phaseSync}
          members={members}
          isHost={isHost}
          onShowTutorial={onShowTutorial}
        />
      );
    if (p === 5)
      return (
        <BoonDraft
          game={game}
          ctx={ctx}
          act={act}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === 1)
      return (
        <Purchase
          game={game}
          act={act}
          phaseSync={phaseSync}
          members={members}
          onShowRumors={onShowRumors}
        />
      );
    if (p === "barter")
      return (
        <BarterPhase
          game={game}
          act={act}
          barter={barter}
          myUserId={myUserId}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === "worker_mgmt")
      return (
        <WorkerMgmt
          game={game}
          ctx={ctx}
          act={act}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === 2)
      return (
        <Orders game={game} act={act} phaseSync={phaseSync} members={members} />
      );
    if (p === 3)
      return (
        <Settlement
          game={game}
          act={act}
          aid={aid}
          backing={backing}
          myUserId={myUserId}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === 4)
      return (
        <Shipyard
          game={game}
          act={act}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === "bankruptcy") return <Bankruptcy game={game} />;
    if (p === "endgame")
      return (
        <Endgame
          game={game}
          isHost={isHost}
          onRestart={onRestart}
          voyageResult={voyageResult}
          myLegacy={myLegacy}
          myUserId={myUserId}
        />
      );
    if (p === "module_draft") return <ModuleDraft game={game} act={act} />;
    if (p === "module_swap") return <ModuleSwap game={game} act={act} />;
    return null;
  }
}
