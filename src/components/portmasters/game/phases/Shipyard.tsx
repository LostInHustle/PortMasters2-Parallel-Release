"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  finalizeModuleSwap,
  handleModuleSelect,
  skipUpgrade,
  startModuleDrafting,
  swapModuleChoices,
  upgradeShip,
} from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/lib/api";
import { Term } from "../../Term";
import { ReadyBar } from "../ReadyBar";
import type { PhaseSync } from "./PhaseShared";

export function Shipyard({
  game,
  act,
  phaseSync,
  members,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  const canUpgrade = game.shipLevel < 3;
  const upgCost = canUpgrade
    ? game.shipUpgradeCost[game.shipLevel] + game.shipUpgradePenalty
    : 0;
  const affordable = game.money >= upgCost;
  const canDraft = game.shipLevel > 0;
  const slotsFull =
    game.equippedModules.length >= game.shipLevel && game.shipLevel > 0;
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-2xl font-bold text-center mb-4">
        🚢 Shipyard & Module Rigging
      </div>
      <div className="rounded-xl border-2 border-teal-500/20 bg-teal-500/[0.04] p-5 my-4">
        <div className="text-base font-bold text-teal-700 dark:text-teal-300">
          🚢 Ship Level: {game.shipLevel} | ⚓ Discount: {game.shipLevel * 5}{" "}
          Gold
        </div>
        <div className="text-sm text-teal-600 dark:text-teal-400 mt-1.5">
          🔌 Module Slots: {game.equippedModules.length} / {game.shipLevel}
        </div>
        {game.equippedModules.length ? (
          <div className="mt-3 space-y-1">
            {game.equippedModules.map((m) => (
              <div key={m.id} className="text-xs">
                {m.icon}{" "}
                <strong>
                  <Term term={m.name}>{m.name}</Term>
                </strong>
                : {m.desc}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground mt-2">
            No modules installed. Upgrade ship to unlock slots!
          </div>
        )}
      </div>
      {phaseSync.waiting ? (
        <div className="text-center space-y-3">
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
      ) : (
        <div className="flex flex-col gap-2">
          {canUpgrade && (
            <Button
              size="lg"
              variant={affordable ? "default" : "secondary"}
              className={cn(
                "rounded-xl",
                affordable && "pm-grad-primary text-white",
              )}
              disabled={!affordable}
              onClick={() => act((g, l) => upgradeShip(g, l))}
            >
              ⚓ Upgrade Ship (Lvl {game.shipLevel + 1}), Cost {upgCost} Gold |
              +1 Slot, +5 Discount
            </Button>
          )}
          <Button
            size="lg"
            variant={canDraft ? "default" : "secondary"}
            className={cn(
              "rounded-xl",
              canDraft && "pm-grad-gold text-amber-950",
            )}
            disabled={!canDraft}
            onClick={() =>
              act((g) => {
                startModuleDrafting(g);
              })
            }
          >
            {slotsFull
              ? "🔄 Draft & Swap Module (Slots Full)"
              : "🔧 Draft & Install Module"}
          </Button>
          <Button
            size="lg"
            className="pm-grad-emerald text-white rounded-xl"
            onClick={() => phaseSync.markReady((g, l) => skipUpgrade(g, l))}
          >
            ⏭️ Continue Voyage
          </Button>
        </div>
      )}
    </div>
  );
}

export function ModuleDraft({
  game,
  act,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
}) {
  const picks = game._draftChoices ?? [];
  const canSwap = !game.moduleSwapUsed && picks.length > 0;
  return (
    <div className="max-w-4xl mx-auto text-center">
      <div className="text-2xl font-bold mb-1">🔧 Module Drafting</div>
      <p className="text-sm text-muted-foreground mb-4">
        Choose a module to install or swap.
      </p>
      {picks.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-8">
          You've already drafted your module choices for this voyage. New
          options arrive next voyage.
        </div>
      ) : (
        <>
          <div className="flex justify-center mb-4">
            <Button
              size="sm"
              variant="secondary"
              className="rounded-lg"
              disabled={!canSwap}
              onClick={() => act((g, l) => swapModuleChoices(g, l))}
            >
              {game.moduleSwapUsed
                ? "✅ Choices Swapped This Voyage"
                : "🎲 Swap Choices (1 use/voyage)"}
            </Button>
          </div>
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.06 } },
            }}
          >
            {picks.map((m, i) => (
              <motion.div
                key={m.id}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.22, ease: "easeOut" },
                  },
                }}
                whileHover={{ y: -6 }}
                className="pm-glass rounded-2xl p-5 flex flex-col items-center text-center border border-teal-500/20"
              >
                <div className="text-5xl mb-2">{m.icon}</div>
                <div className="font-semibold mb-2">
                  <Term term={m.name}>{m.name}</Term>
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">
                  {m.desc}
                </div>
                <Button
                  className="pm-grad-gold text-amber-950 font-semibold rounded-xl w-full"
                  onClick={() => act((g, l) => handleModuleSelect(g, i, l))}
                >
                  {game.equippedModules.length < game.shipLevel
                    ? "✅ Install"
                    : "🔄 Swap"}
                </Button>
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
      <div className="mt-5">
        <Button
          variant="secondary"
          className="rounded-xl"
          onClick={() =>
            act((g, _l) => {
              g.phase = 4;
            })
          }
        >
          ⬅️ Back to Shipyard
        </Button>
      </div>
    </div>
  );
}

export function ModuleSwap({
  game,
  act,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
}) {
  const newMod = game._newModule;
  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="text-2xl font-bold mb-1 text-rose-600 dark:text-rose-400">
        🔄 Select Module to Replace
      </div>
      {newMod && (
        <p className="text-sm text-muted-foreground mb-4">
          New: {newMod.icon} {newMod.name}: {newMod.desc}
        </p>
      )}
      <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-4 my-4 space-y-2 text-left">
        {game.equippedModules.map((m, i) => (
          <div
            key={m.id}
            className="flex justify-between items-center bg-background/60 rounded-md p-2.5 border border-black/5 dark:border-white/10"
          >
            <div>
              <strong>
                {m.icon} <Term term={m.name}>{m.name}</Term>
              </strong>
              <div className="text-[11px] text-muted-foreground">{m.desc}</div>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="rounded-lg"
              onClick={() => act((g, l) => finalizeModuleSwap(g, i, l))}
            >
              🗑️ Replace
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="secondary"
        className="rounded-xl"
        onClick={() =>
          act((g, _l) => {
            g.phase = "module_draft";
          })
        }
      >
        ⬅️ Back to Draft
      </Button>
    </div>
  );
}
