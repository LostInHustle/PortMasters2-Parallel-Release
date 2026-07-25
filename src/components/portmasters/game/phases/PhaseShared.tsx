"use client";

import { Button } from "@/components/ui/button";
import type { PublicUser } from "@/lib/api";
import type { usePhaseSync } from "@/lib/use-phase-sync";
import type { useBarter } from "@/lib/use-barter";
import type { useAid } from "@/lib/use-aid";
import type { useBacking } from "@/lib/use-backing";
import { cn } from "@/lib/utils";
import { ReadyBar } from "../ReadyBar";

// Shared types and components used across multiple phase screens (see the
// phases/ folder). Split out of GamePhasePanel.tsx, which used to hold every
// phase's component in one 2500+ line file.
export type PhaseSync = ReturnType<typeof usePhaseSync>;
export type Barter = ReturnType<typeof useBarter>;
export type Aid = ReturnType<typeof useAid>;
export type Backing = ReturnType<typeof useBacking>;

// ---------- Shared "ready" footer ----------
// Every phase component takes its data as explicit props rather than
// closing over a parent's scope, and lives as a module level export rather
// than a nested function component. Nested function components used to be
// declared inside GamePhasePanel's body, which meant React saw a brand-new
// component type for e.g. BarterPhase on every re-render of GamePhasePanel
// (any player's move replaces the `game` object, see use-game-session.ts's
// APPLY reducer). A new type forces React to unmount and remount the whole
// subtree, silently resetting any local useState in whatever phase is
// currently showing back to its initial value, this is what caused the
// barter form to snap back to Hemp mid-selection during a live multiplayer
// session. Module-level components have a stable identity across renders,
// so React just re-renders them in place and their local state survives.
// That guarantee only depends on staying a top-level export, not on which
// file it lives in, which is what makes splitting this file safe.
export function ReadyFooter({
  phaseSync,
  members,
  idleLabel,
  onConfirm,
  idleClassName,
}: {
  phaseSync: PhaseSync;
  members: PublicUser[];
  idleLabel: string;
  onConfirm: () => void;
  idleClassName?: string;
}) {
  if (phaseSync.waiting) {
    return (
      <div className="text-center mt-5 space-y-3">
        <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
          ⏳ Waiting for the rest of the crew…
        </div>
        <ReadyBar
          ready={phaseSync.ready}
          members={members}
          className="justify-center"
        />
        <Button
          variant="secondary"
          className="rounded-xl"
          onClick={phaseSync.cancelReady}
        >
          ↩️ Not ready yet
        </Button>
      </div>
    );
  }
  return (
    <div className="text-center mt-5">
      <Button
        className={cn("rounded-xl px-6", idleClassName)}
        onClick={onConfirm}
      >
        {idleLabel}
      </Button>
    </div>
  );
}
