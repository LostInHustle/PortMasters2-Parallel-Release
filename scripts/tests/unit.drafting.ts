// =====================================================================
// Unit tests for the boon and module draft flows in
// src/lib/game/engine.ts: swapBoonChoices, swapModuleChoices,
// handleModuleSelect and finalizeModuleSwap.
//
// effects.audit.ts already proves what each individual boon and module
// DOES once equipped. What had no coverage at all is the drafting
// machinery around that: the once-per-round swap limits, the Gold cost on
// the boon side versus the free reroll on the module side, and the two
// branch module-select flow (install straight into a free slot, versus
// routing through module_swap when every slot is full).
//
// The pool bookkeeping in that second flow is the subtle part and is
// tested closely below. A direct install drops the picked module from the
// pool immediately because the pick is final, while a pick that still
// needs a slot freed leaves the pool alone until finalizeModuleSwap
// confirms it, so that backing out with "Back to Draft" still shows every
// original choice. Getting those two backwards would either duplicate a
// module or silently lose one from the draft.
//
// Run with: npx tsx scripts/tests/unit.drafting.ts
// =====================================================================
import { suite, test, assert, assertEqual, summary } from "./harness";
import {
  createInitialGameState,
  type GameState,
} from "../../src/lib/game/types";
import {
  swapBoonChoices,
  swapModuleChoices,
  handleModuleSelect,
  finalizeModuleSwap,
  startBoonDrafting,
  startModuleDrafting,
} from "../../src/lib/game/engine";
import { MODULES_TIER0 } from "../../src/lib/game/constants";

const mod = (id: string) => MODULES_TIER0.find((m) => m.id === id)!;

function drafting(): GameState {
  const g = createInitialGameState();
  const logs: string[] = [];
  startBoonDrafting(g, logs);
  return g;
}

suite("swapBoonChoices");

test("a swap costs 10 Gold and hands back a fresh set of choices", () => {
  const g = drafting();
  const logs: string[] = [];
  const before = g.money;
  assert(g.boonChoices.length > 0, "setup: drafting should have dealt boons");

  swapBoonChoices(g, logs);
  assertEqual(g.money, before - 10, "a boon swap should cost 10 Gold");
  assert(g.boonChoices.length > 0, "a fresh set of boons should be dealt");
  assert(g.boonSwapUsed, "the once-per-round flag should be set");
});

test("only one swap per round, and the second attempt costs nothing", () => {
  const g = drafting();
  const logs: string[] = [];
  swapBoonChoices(g, logs);
  const afterFirst = g.money;

  swapBoonChoices(g, logs);
  assertEqual(
    g.money,
    afterFirst,
    "a second swap in the same round must not charge again",
  );
});

test("a captain who cannot afford the fee keeps their Gold and their choices", () => {
  const g = drafting();
  const logs: string[] = [];
  g.money = 9;
  const choicesBefore = g.boonChoices.map((b) => b.id).join(",");

  swapBoonChoices(g, logs);
  assertEqual(g.money, 9, "an unaffordable swap must not charge");
  assert(!g.boonSwapUsed, "and must not burn the once-per-round swap");
  assertEqual(
    g.boonChoices.map((b) => b.id).join(","),
    choicesBefore,
    "the original choices must remain on the table",
  );
});

test("the swap allowance resets when a new round's drafting begins", () => {
  const g = drafting();
  const logs: string[] = [];
  swapBoonChoices(g, logs);
  assert(g.boonSwapUsed, "setup: the swap should be spent");

  startBoonDrafting(g, logs);
  assert(
    !g.boonSwapUsed,
    "a new round's drafting should restore the swap allowance",
  );
});

suite("swapModuleChoices");

test("rerolling the module pool is free, unlike the boon swap", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.shipLevel = 1;
  startModuleDrafting(g);
  const before = g.money;

  swapModuleChoices(g, logs);
  assertEqual(g.money, before, "a module reroll must not cost Gold");
  assert(g.moduleSwapUsed, "the once-per-round flag should be set");
  assert(
    (g._draftChoices?.length ?? 0) > 0,
    "a fresh pool should have been rolled",
  );
});

test("refuses to reroll before any modules have been drafted", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g._draftChoices = undefined;

  swapModuleChoices(g, logs);
  assert(
    !g.moduleSwapUsed,
    "with nothing drafted yet there is nothing to swap, so the allowance stays",
  );
});

test("only one reroll per round", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.shipLevel = 1;
  startModuleDrafting(g);
  swapModuleChoices(g, logs);

  const poolAfterFirst = (g._draftChoices ?? []).map((m) => m.id).join(",");
  swapModuleChoices(g, logs);
  assertEqual(
    (g._draftChoices ?? []).map((m) => m.id).join(","),
    poolAfterFirst,
    "a second reroll in the same round must leave the pool alone",
  );
});

suite("handleModuleSelect :: a free slot installs immediately");

test("picking with a slot free equips the module and closes the draft", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.shipLevel = 1;
  g._draftChoices = [mod("smugglers_hold"), mod("bulk_hauler")];

  handleModuleSelect(g, 0, logs);
  assertEqual(g.equippedModules.length, 1, "the module should be installed");
  assertEqual(
    g.equippedModules[0].id,
    "smugglers_hold",
    "and it should be the one that was picked",
  );
  assertEqual(g.phase, 4, "the draft should hand back to the shipyard");
});

test("a finalised pick leaves the pool, so it cannot be taken twice", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.shipLevel = 2;
  g._draftChoices = [mod("smugglers_hold"), mod("bulk_hauler")];

  handleModuleSelect(g, 0, logs);
  assert(
    !(g._draftChoices ?? []).some((m) => m.id === "smugglers_hold"),
    "a directly installed module should be removed from the pool",
  );
  assert(
    (g._draftChoices ?? []).some((m) => m.id === "bulk_hauler"),
    "but the choices not taken should remain",
  );
});

test("an index that is not in the pool is ignored rather than throwing", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.shipLevel = 1;
  g._draftChoices = [mod("smugglers_hold")];

  handleModuleSelect(g, 7, logs);
  assertEqual(g.equippedModules.length, 0, "nothing should be installed");
  assertEqual(g.phase, 0, "and the phase should be left alone");
});

test("installing carries the module's own ship penalties with it", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.shipLevel = 1;
  g._draftChoices = [mod("bulk_hauler")];

  handleModuleSelect(g, 0, logs);
  assertEqual(
    g.shipUpgradePenalty,
    15,
    "Bulk Hauler Rigging should add its upgrade penalty on install",
  );
});

suite("handleModuleSelect :: a full ship routes through module_swap");

test("picking with every slot full defers to the swap screen", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.shipLevel = 1;
  g.equippedModules = [mod("tax_evasion")];
  g._draftChoices = [mod("smugglers_hold"), mod("bulk_hauler")];

  handleModuleSelect(g, 0, logs);
  assertEqual(
    g.phase,
    "module_swap",
    "a full ship should route to the slot-choosing screen",
  );
  assertEqual(
    g._newModule?.id,
    "smugglers_hold",
    "the pending pick should be remembered",
  );
  assertEqual(
    g.equippedModules.length,
    1,
    "nothing should be installed until a slot is actually chosen",
  );
});

test("a pending pick stays in the pool so backing out loses nothing", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.shipLevel = 1;
  g.equippedModules = [mod("tax_evasion")];
  g._draftChoices = [mod("smugglers_hold"), mod("bulk_hauler")];

  handleModuleSelect(g, 0, logs);
  assert(
    (g._draftChoices ?? []).some((m) => m.id === "smugglers_hold"),
    "an unconfirmed pick must remain on offer, since the captain may back out",
  );
});

suite("finalizeModuleSwap");

test("confirming a slot installs the pending module over the old one", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.shipLevel = 1;
  g.equippedModules = [mod("tax_evasion")];
  g._draftChoices = [mod("smugglers_hold")];
  handleModuleSelect(g, 0, logs);

  finalizeModuleSwap(g, 0, logs);
  assertEqual(g.equippedModules.length, 1, "the ship should still hold one");
  assertEqual(
    g.equippedModules[0].id,
    "smugglers_hold",
    "and it should now be the newly chosen module",
  );
  assertEqual(g.phase, 4, "the flow should hand back to the shipyard");
  assertEqual(g._newModule, undefined, "the pending pick should be cleared");
});

test("a confirmed swap finally removes the module from the pool", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.shipLevel = 1;
  g.equippedModules = [mod("tax_evasion")];
  g._draftChoices = [mod("smugglers_hold"), mod("bulk_hauler")];
  handleModuleSelect(g, 0, logs);

  finalizeModuleSwap(g, 0, logs);
  assert(
    !(g._draftChoices ?? []).some((m) => m.id === "smugglers_hold"),
    "once confirmed, the pick should leave the pool",
  );
  assert(
    (g._draftChoices ?? []).some((m) => m.id === "bulk_hauler"),
    "the untaken choice should survive",
  );
});

test("swapping out a module reverses the penalty it was carrying", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.shipLevel = 1;
  g._draftChoices = [mod("bulk_hauler")];
  handleModuleSelect(g, 0, logs);
  assertEqual(g.shipUpgradePenalty, 15, "setup: the penalty is applied");

  g._draftChoices = [mod("smugglers_hold")];
  handleModuleSelect(g, 0, logs);
  finalizeModuleSwap(g, 0, logs);
  assertEqual(
    g.shipUpgradePenalty,
    0,
    "removing Bulk Hauler Rigging should take its penalty away with it",
  );
});

test("finalising with no pending pick is a no-op", () => {
  const g = createInitialGameState();
  const logs: string[] = [];
  g.shipLevel = 1;
  g.equippedModules = [mod("tax_evasion")];
  g._newModule = undefined;

  finalizeModuleSwap(g, 0, logs);
  assertEqual(
    g.equippedModules[0].id,
    "tax_evasion",
    "the equipped module must not be disturbed",
  );
  assertEqual(g.phase, 0, "and the phase should be left alone");
});

const ok = summary();
process.exit(ok ? 0 : 1);
