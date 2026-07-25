"use client";

import { Button } from "@/components/ui/button";
import { COLORS, ICONS, RECIPES, WAGES } from "@/lib/game/constants";
import {
  assignTask,
  fireWorker,
  getHireCost,
  hireWorker,
  startPhase2,
} from "@/lib/game/engine";
import {
  unlockedProducts,
  unlockedResources,
  unlockedWorkerTypes,
} from "@/lib/game/pools";
import type { GameContext, GameState, Worker } from "@/lib/game/types";
import type { PublicUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Term } from "../../Term";
import { ItemIcon } from "../../shared";
import { ReadyFooter, type PhaseSync } from "./PhaseShared";

function WorkerList({
  type,
  list,
  name,
  tasks,
  act,
}: {
  type: string;
  list: Worker[];
  name: string;
  tasks: string[];
  act: (fn: (g: GameState, logs: string[]) => void) => void;
}) {
  if (!list.length) return null;
  const icon = type === "weaver" ? "👩‍🔧" : type === "master" ? "👩‍🎨" : "🌸";
  return (
    <div className="my-3">
      <div className="text-xs font-semibold text-teal-700 dark:text-teal-300">
        {icon} {name}s: {list.length}
      </div>
      {list.map((w, i) => (
        <div
          key={i}
          className="flex items-center justify-between bg-background/60 rounded-md px-3 py-1.5 my-1 text-xs border border-black/5 dark:border-white/10"
        >
          <span>
            {name} {i + 1}:{" "}
            {w.task
              ? `Working on: ${w.task}${w.isSkilled ? " (Skilled)" : ""}`
              : `Idle${w.isSkilled ? " ⭐ Skilled" : ""}`}
          </span>
          {!w.task && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 px-2 text-[10px] rounded"
              onClick={() => act((g, l) => fireWorker(g, type, i, l))}
            >
              Dismiss ({WAGES[type]}💰)
            </Button>
          )}
        </div>
      ))}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {tasks.map((t) => {
          const recipe = RECIPES[t];
          const mats = Object.entries(recipe.materials)
            .map(([m, a]) => `${ICONS[m]}${m}×${a}`)
            .join("+");
          return (
            <Button
              key={t}
              size="sm"
              variant="secondary"
              className="h-7 px-2.5 text-[10px] rounded"
              onClick={() => act((g, l) => assignTask(g, type, t, l))}
            >
              Make {t} (Need {mats})
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function WorkerMgmt({
  game,
  ctx,
  act,
  phaseSync,
  members,
}: {
  game: GameState;
  ctx: GameContext;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  // Driven by the roster rather than three hardcoded artisans, so the
  // Coppersmith and Potter a charter brings are hirable, payable, and
  // assignable the moment they unlock, with no further edits here. Each
  // type's craftable goods are derived from the recipes that name it, which
  // is also what keeps the Master's inherited weaver goods correct.
  const openProducts = unlockedProducts(game.difficulty, game.currentRound);
  const roster = unlockedWorkerTypes(game.difficulty, game.currentRound).map(
    (w) => {
      const list = game.workers[w.id] ?? [];
      const cost = getHireCost(game, w.id);
      return {
        ...w,
        list,
        cost,
        due: list.length * cost,
        tasks: openProducts.filter((p) => {
          const owner = RECIPES[p]?.worker_type;
          return owner === w.id || (w.id === "master" && owner === "weaver");
        }),
      };
    },
  );
  const totalWages = roster.reduce((sum, r) => sum + r.due, 0);
  const nW = roster.reduce((sum, r) => sum + r.list.length, 0);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-2xl font-bold text-center mb-1">
        👥 Artisan Management
      </div>
      <p className="text-center text-sm text-muted-foreground mb-4">
        💰 Current Funds: {game.money} Gold | 📦 See Inventory on the left
      </p>

      <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 p-3.5 mb-4 text-xs">
        <strong>⏱️ Production Cycle: What Happens When</strong>
        <div className="grid grid-cols-4 gap-1.5 mt-2 text-center">
          <div className="pm-grad-emerald text-white rounded-md py-1.5">
            <div>📋 Now</div>
            <div className="text-[9px] opacity-90">
              Assign task
              <br />
              consume materials
            </div>
          </div>
          <div className="pm-grad-primary text-white rounded-md py-1.5">
            <div>🤝 Phase 2</div>
            <div className="text-[9px] opacity-90">Trade orders</div>
          </div>
          <div className="pm-grad-amber text-white rounded-md py-1.5">
            <div>✅ Phase 3</div>
            <div className="text-[9px] opacity-90">
              Items produced
              <br />+ wages paid
            </div>
          </div>
          <div className="bg-fuchsia-600 text-white rounded-md py-1.5">
            <div>🚢 Phase 4</div>
            <div className="text-[9px] opacity-90">Shipyard</div>
          </div>
        </div>
        <div className="mt-2 text-emerald-700 dark:text-emerald-300">
          💡 Materials consumed <strong>now</strong>. Finished goods and wage
          deductions happen at <strong>Phase 3</strong>, not instantly.
        </div>
      </div>

      <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-4 mb-4">
        <h3 className="text-center font-semibold mb-2">📦 Current Inventory</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <strong className="text-xs text-teal-700 dark:text-teal-300">
              Raw Materials:
            </strong>
            {unlockedResources(game.difficulty, game.currentRound).map((r) => (
              <div key={r} className="flex items-center text-[11px] py-0.5">
                <ItemIcon item={r} className="mr-1.5 h-3.5 w-3.5" />
                <span className="flex-1" style={{ color: COLORS[r] }}>
                  {r}
                </span>
                <b style={{ color: COLORS[r] }}>{game.inventory[r] || 0}</b>
              </div>
            ))}
          </div>
          <div>
            <strong className="text-xs text-teal-700 dark:text-teal-300">
              Finished Goods:
            </strong>
            {openProducts.map((r) => (
              <div key={r} className="flex items-center text-[11px] py-0.5">
                <ItemIcon item={r} className="mr-1.5 h-3.5 w-3.5" />
                <span className="flex-1" style={{ color: COLORS[r] }}>
                  {r}
                </span>
                <b style={{ color: COLORS[r] }}>{game.inventory[r] || 0}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {nW > 0 && (
        <div className="rounded-xl bg-orange-500/[0.06] border border-orange-500/20 p-3.5 mb-4">
          <h3 className="text-center font-semibold mb-2 text-orange-700 dark:text-orange-300">
            💰 Pending Payroll: Deducted at Phase 3
          </h3>
          <div className="text-xs space-y-0.5">
            {roster
              .filter((r) => r.due > 0)
              .map((r) => (
                <div key={r.id} className="flex justify-between">
                  <span>
                    {r.icon} {r.list.length}× {r.label} @ {r.cost}g
                  </span>
                  <b>{r.due} Gold</b>
                </div>
              ))}
            <div className="flex justify-between border-t border-orange-500/20 pt-1 mt-1 font-bold">
              <span>💸 Total Wages Due</span>
              <span className="text-rose-600 dark:text-rose-400">
                {totalWages} Gold
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-amber-500/[0.05] border border-teal-500/15 p-4 mb-4">
        <h3 className="text-center font-semibold mb-2">🔨 Hire Workers</h3>
        <div className="text-xs space-y-1 mb-3">
          {roster.map((r) => (
            <div key={r.id}>
              <strong>
                {r.icon} <Term term={r.label}>{r.label}</Term>
              </strong>
              :{" "}
              {r.tasks
                .map((t) => {
                  const mats = Object.entries(RECIPES[t]?.materials ?? {})
                    .map(([m, a]) => `${a} ${m}`)
                    .join("+");
                  return `${t}(${mats})`;
                })
                .join(" or ")}
              ,{" "}
              <span className="text-orange-600 dark:text-orange-400">
                {WAGES[r.id]} Gold/round
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {roster.map((r, i) => (
            <Button
              key={r.id}
              size="sm"
              variant={i % 3 === 1 ? "secondary" : undefined}
              className={cn(
                "rounded-lg",
                i % 3 === 0 && "pm-grad-emerald text-white",
                i % 3 === 2 && "pm-grad-amber text-white",
              )}
              onClick={() => act((g, l) => hireWorker(g, r.id, l))}
            >
              {r.icon} Hire {r.label} ({r.cost}💰/round)
            </Button>
          ))}
        </div>
      </div>

      {nW > 0 ? (
        <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-4 mb-4">
          <h3 className="text-center font-semibold mb-2">
            👥 Worker Status & Tasks
          </h3>
          {roster.map((r) => (
            <WorkerList
              key={r.id}
              type={r.id}
              list={r.list}
              name={r.label}
              tasks={r.tasks}
              act={act}
            />
          ))}
        </div>
      ) : null}

      <ReadyFooter
        phaseSync={phaseSync}
        members={members}
        idleLabel="✅ Complete Management, Set Sail"
        onConfirm={() => phaseSync.markReady((g, l) => startPhase2(g, ctx, l))}
      />
    </div>
  );
}
