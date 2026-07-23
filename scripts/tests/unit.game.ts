// =====================================================================
// Unit tests: pure functions in src/lib/game — difficulty selectors,
// content pools, price/VAT/transport math, legacy XP curve, and merit
// qualification. No GameState simulation here (see integration.voyage.ts
// for that); every assertion targets one function in isolation.
// Run with: npx tsx scripts/tests/unit.game.ts
// =====================================================================
import {
  suite,
  test,
  assert,
  assertEqual,
  assertClose,
  assertArrayEqual,
  summary,
} from "./harness";
import {
  DIFFICULTIES,
  normalizeDifficulty,
  roundsFor,
  unlockedTierFor,
  marketCountsFor,
  charterOpensOn,
  pirateChanceFor,
  mandateIndexFor,
} from "../../src/lib/game/difficulty";
import {
  unlockedResources,
  unlockedProducts,
  unlockedPorts,
  unlockedBoons,
  unlockedModules,
  unlockedWorkerTypes,
  unlockedResourceDraw,
  isCharterGood,
} from "../../src/lib/game/pools";
import {
  RESOURCES_TIER0,
  RESOURCES_TIER1,
  RESOURCES_TIER2,
  WAGES,
  MERCHANT_RATINGS,
  WORD_ON_THE_DOCKS_THRESHOLD,
  WORD_ON_THE_DOCKS_REWARD,
  TIDEWATCH_SURGE_THRESHOLD,
} from "../../src/lib/game/constants";
import {
  calcTransportCost,
  explainTransportCost,
  calcVAT,
  explainVAT,
  calcIncomeTax,
  getHireCost,
  brokersFavorCommission,
  explainCardPrice,
  merchantRatingForScore,
  hasModule,
  tallyPurchasesByResource,
  applyHarborPulse,
  applyTidewatchSurge,
  claimWordOnTheDocksReward,
  completeOrder,
} from "../../src/lib/game/engine";
import {
  createInitialGameState,
  type GameState,
  type OrderCard,
  type ResourceCard,
} from "../../src/lib/game/types";
import {
  xpRequiredForLevel,
  levelForRenownXP,
  renownStartingGoldBonus,
  parseStatsByDifficulty,
  recordVoyageInStats,
} from "../../src/lib/game/legacy";
import { qualifyingMerits } from "../../src/lib/game/merits";
import { computeHarborPulse, PULSE_CAP } from "../../src/lib/game/harborPulse";

function freshState(
  difficulty: "fair_winds" | "open_waters" | "monsoon" = "fair_winds",
): GameState {
  return createInitialGameState(0, 1, 0, difficulty);
}

// ---------- Difficulty selectors ----------
suite("difficulty selectors");

test("normalizeDifficulty falls back to fair_winds on garbage input", () => {
  assertEqual(normalizeDifficulty("nonsense"), "fair_winds", "unknown string");
  assertEqual(normalizeDifficulty(undefined), "fair_winds", "undefined");
  assertEqual(normalizeDifficulty(null), "fair_winds", "null");
  assertEqual(normalizeDifficulty(42), "fair_winds", "number");
  assertEqual(
    normalizeDifficulty("monsoon"),
    "monsoon",
    "valid value passes through",
  );
});

test("roundsFor matches each tier's configured voyage length", () => {
  assertEqual(roundsFor("fair_winds"), 8, "fair_winds");
  assertEqual(roundsFor("open_waters"), 12, "open_waters");
  assertEqual(roundsFor("monsoon"), 16, "monsoon");
});

test("unlockedTierFor: fair_winds never leaves tier 0", () => {
  for (const round of [1, 4, 8, 100]) {
    assertEqual(unlockedTierFor("fair_winds", round), 0, `round ${round}`);
  }
});

test("unlockedTierFor: open_waters opens tier 1 at round 4, tier 2 at round 8", () => {
  assertEqual(unlockedTierFor("open_waters", 1), 0, "round 1");
  assertEqual(unlockedTierFor("open_waters", 3), 0, "round 3");
  assertEqual(unlockedTierFor("open_waters", 4), 1, "round 4 (charter opens)");
  assertEqual(unlockedTierFor("open_waters", 7), 1, "round 7");
  assertEqual(unlockedTierFor("open_waters", 8), 2, "round 8 (charter opens)");
  assertEqual(unlockedTierFor("open_waters", 12), 2, "round 12");
});

test("unlockedTierFor: monsoon opens tier 1 at round 6, tier 2 at round 11", () => {
  assertEqual(unlockedTierFor("monsoon", 5), 0, "round 5");
  assertEqual(unlockedTierFor("monsoon", 6), 1, "round 6 (charter opens)");
  assertEqual(unlockedTierFor("monsoon", 10), 1, "round 10");
  assertEqual(unlockedTierFor("monsoon", 11), 2, "round 11 (charter opens)");
  assertEqual(unlockedTierFor("monsoon", 16), 2, "round 16");
});

test("marketCountsFor: fair_winds is a flat 6/6 board all voyage", () => {
  for (const round of [1, 4, 8]) {
    const c = marketCountsFor("fair_winds", round);
    assertEqual(c.purchase, 6, `purchase round ${round}`);
    assertEqual(c.order, 6, `order round ${round}`);
  }
});

test("marketCountsFor: open_waters widens 6 -> 8 -> 10 on schedule", () => {
  assertEqual(marketCountsFor("open_waters", 1).purchase, 6, "round 1");
  assertEqual(marketCountsFor("open_waters", 4).purchase, 8, "round 4");
  assertEqual(marketCountsFor("open_waters", 8).purchase, 10, "round 8");
  assertEqual(marketCountsFor("open_waters", 12).purchase, 10, "round 12");
  // order board grows in lockstep with the purchase board
  assertEqual(marketCountsFor("open_waters", 8).order, 10, "order round 8");
});

test("marketCountsFor: monsoon widens 6 -> 8 -> 11 on schedule", () => {
  assertEqual(marketCountsFor("monsoon", 1).purchase, 6, "round 1");
  assertEqual(marketCountsFor("monsoon", 6).purchase, 8, "round 6");
  assertEqual(marketCountsFor("monsoon", 11).purchase, 11, "round 11");
  assertEqual(marketCountsFor("monsoon", 16).purchase, 11, "round 16");
});

test("charterOpensOn fires exactly on tierUnlock rounds, nowhere else", () => {
  assert(!charterOpensOn("fair_winds", 4), "fair_winds never charters");
  assert(charterOpensOn("open_waters", 4), "open_waters round 4");
  assert(charterOpensOn("open_waters", 8), "open_waters round 8");
  assert(!charterOpensOn("open_waters", 5), "open_waters round 5 (no charter)");
  assert(charterOpensOn("monsoon", 6), "monsoon round 6");
  assert(charterOpensOn("monsoon", 11), "monsoon round 11");
});

test("pirateChanceFor: fair_winds is a flat 20% all voyage", () => {
  for (const round of [1, 4, 8]) {
    assertEqual(pirateChanceFor("fair_winds", round, 8), 0.2, `round ${round}`);
  }
});

test("pirateChanceFor: open_waters steps up past the midpoint (round 6 of 12)", () => {
  assertEqual(pirateChanceFor("open_waters", 1, 12), 0.22, "round 1");
  assertEqual(
    pirateChanceFor("open_waters", 6, 12),
    0.22,
    "round 6 (still first half)",
  );
  assertEqual(
    pirateChanceFor("open_waters", 7, 12),
    0.3,
    "round 7 (past midpoint)",
  );
  assertEqual(pirateChanceFor("open_waters", 12, 12), 0.3, "round 12");
});

test("pirateChanceFor: monsoon steps up past the midpoint (round 8 of 16)", () => {
  assertEqual(
    pirateChanceFor("monsoon", 8, 16),
    0.28,
    "round 8 (still first half)",
  );
  assertEqual(
    pirateChanceFor("monsoon", 9, 16),
    0.38,
    "round 9 (past midpoint)",
  );
});

test("mandateIndexFor matches each tier's schedule exactly", () => {
  assertEqual(
    mandateIndexFor("fair_winds", 4),
    undefined,
    "fair_winds never mandates",
  );
  assertEqual(
    mandateIndexFor("open_waters", 4),
    0,
    "open_waters round 4 -> small",
  );
  assertEqual(
    mandateIndexFor("open_waters", 8),
    1,
    "open_waters round 8 -> medium",
  );
  assertEqual(
    mandateIndexFor("open_waters", 12),
    2,
    "open_waters round 12 -> large",
  );
  assertEqual(
    mandateIndexFor("open_waters", 5),
    undefined,
    "open_waters round 5 -> none",
  );
  assertEqual(mandateIndexFor("monsoon", 6), 1, "monsoon round 6 -> medium");
  assertEqual(mandateIndexFor("monsoon", 12), 2, "monsoon round 12 -> large");
  assertEqual(mandateIndexFor("monsoon", 16), 2, "monsoon round 16 -> large");
});

// ---------- Content pools ----------
suite("content pools");

test("unlockedResources: fair_winds only ever sees the founding trio", () => {
  for (const round of [1, 4, 8]) {
    assertArrayEqual(
      unlockedResources("fair_winds", round),
      [...RESOURCES_TIER0],
      `round ${round}`,
    );
  }
});

test("unlockedResources: open_waters accumulates tier1 then tier2", () => {
  assertArrayEqual(
    unlockedResources("open_waters", 1),
    [...RESOURCES_TIER0],
    "round 1: tier0 only",
  );
  assertArrayEqual(
    unlockedResources("open_waters", 4),
    [...RESOURCES_TIER0, ...RESOURCES_TIER1],
    "round 4: tier0+1",
  );
  assertArrayEqual(
    unlockedResources("open_waters", 8),
    [...RESOURCES_TIER0, ...RESOURCES_TIER1, ...RESOURCES_TIER2],
    "round 8: tier0+1+2",
  );
});

test("unlockedPorts/Products/Boons/Modules grow in lockstep with the same tier schedule", () => {
  const roundsAndTiers: [string, number, number][] = [
    ["open_waters", 1, 0],
    ["open_waters", 4, 1],
    ["open_waters", 8, 2],
  ];
  for (const [diff, round, tier] of roundsAndTiers) {
    const expectedPortCount = tier === 0 ? 5 : tier === 1 ? 7 : 9;
    const expectedBoonCount = tier === 0 ? 8 : tier === 1 ? 11 : 14;
    const expectedModuleCount = tier === 0 ? 8 : tier === 1 ? 11 : 14;
    assertEqual(
      unlockedPorts(diff, round).length,
      expectedPortCount,
      `${diff} r${round} ports`,
    );
    assertEqual(
      unlockedBoons(diff, round).length,
      expectedBoonCount,
      `${diff} r${round} boons`,
    );
    assertEqual(
      unlockedModules(diff, round).length,
      expectedModuleCount,
      `${diff} r${round} modules`,
    );
  }
});

test("unlockedWorkerTypes: gains coppersmith+potter at tier1, perfumer+jeweler at tier2", () => {
  assertEqual(
    unlockedWorkerTypes("fair_winds", 8).length,
    3,
    "fair_winds always 3",
  );
  assertEqual(
    unlockedWorkerTypes("open_waters", 1).length,
    3,
    "open_waters round 1",
  );
  assertEqual(
    unlockedWorkerTypes("open_waters", 4).length,
    5,
    "open_waters round 4 (+coppersmith,potter)",
  );
  assertEqual(
    unlockedWorkerTypes("open_waters", 8).length,
    7,
    "open_waters round 8 (+perfumer,jeweler)",
  );
  const tier1Ids = unlockedWorkerTypes("open_waters", 4).map((w) => w.id);
  assert(tier1Ids.includes("coppersmith"), "coppersmith present at tier1");
  assert(tier1Ids.includes("potter"), "potter present at tier1");
  assert(!tier1Ids.includes("perfumer"), "perfumer absent before tier2");
});

test("unlockedResourceDraw sums to 1.0 at every tier", () => {
  const cases: [string, number][] = [
    ["fair_winds", 1],
    ["open_waters", 4],
    ["open_waters", 8],
    ["monsoon", 6],
    ["monsoon", 11],
  ];
  for (const [diff, round] of cases) {
    const { probs } = unlockedResourceDraw(diff, round);
    const total = probs.reduce((s, p) => s + p, 0);
    assertClose(total, 1.0, 1e-9, `${diff} r${round} draw table sums to 1`);
  }
});

test("unlockedResourceDraw: Fair Winds keeps the exact legacy 0.40/0.35/0.25 table", () => {
  const { items, probs } = unlockedResourceDraw("fair_winds", 8);
  const byItem = Object.fromEntries(items.map((it, i) => [it, probs[i]]));
  assertClose(byItem["Hemp"], 0.4, 1e-9, "Hemp");
  assertClose(byItem["Silk"], 0.35, 1e-9, "Silk");
  assertClose(byItem["Tea"], 0.25, 1e-9, "Tea");
});

test("isCharterGood: tier1/tier2 goods are charter goods, founding trade is not", () => {
  for (const g of [
    "Porcelain Clay",
    "Copper Ore",
    "Bronze Mirror",
    "Celadon Ware",
    "Spices",
    "Pearls",
    "Foreign Balm",
    "Pearl String",
  ]) {
    assert(isCharterGood(g), `${g} should be a charter good`);
  }
  for (const g of [
    "Hemp",
    "Silk",
    "Tea",
    "Linen Clothes",
    "Cotton Clothes",
    "Brocade",
    "Sachet",
  ]) {
    assert(!isCharterGood(g), `${g} should NOT be a charter good`);
  }
});

// ---------- Price / VAT / transport math ----------
suite("price and tax math");

test("calcTransportCost: base formula, ship level discount, floor at 5 (no modules)", () => {
  const s = freshState();
  assertEqual(calcTransportCost(s, 5), 10, "5 items, no ship level: 5*2=10");
  s.shipLevel = 3;
  assertEqual(
    calcTransportCost(s, 5),
    5,
    "5 items, ship level 3: max(5, 10-15)=5",
  );
});

test("calcTransportCost: bulk_hauler subtracts 1 per item, overdrive_engine subtracts flat 5", () => {
  const s = freshState();
  s.equippedModules = [
    { id: "bulk_hauler", name: "Bulk Hauler Rigging", icon: "🏗️", desc: "" },
  ];
  // 10 items: base 20, bulk_hauler -10 -> 10
  assertEqual(calcTransportCost(s, 10), 10, "bulk_hauler: 20 - 10 items = 10");

  const s2 = freshState();
  s2.equippedModules = [
    { id: "overdrive_engine", name: "Overdrive Engine", icon: "⚙️", desc: "" },
  ];
  assertEqual(calcTransportCost(s2, 10), 15, "overdrive_engine: 20 - 5 = 15");
});

test("calcTransportCost: silk_monopoly zeroes freight only when the order carries Silk", () => {
  const s = freshState();
  s.equippedModules = [
    { id: "silk_monopoly", name: "Silk Road Monopoly", icon: "👘", desc: "" },
  ];
  assertEqual(
    calcTransportCost(s, 10, true),
    0,
    "hasSilk=true -> free freight",
  );
  assertEqual(
    calcTransportCost(s, 10, false),
    20,
    "hasSilk=false -> unaffected",
  );
});

test("explainTransportCost mirrors calcTransportCost's final cost across module combos", () => {
  const combos: string[][] = [
    [],
    ["bulk_hauler"],
    ["overdrive_engine"],
    ["bulk_hauler", "overdrive_engine"],
    ["silk_monopoly"],
  ];
  for (const ids of combos) {
    const s = freshState();
    s.shipLevel = 2;
    s.equippedModules = ids.map((id) => ({ id, name: id, icon: "", desc: "" }));
    for (const hasSilk of [true, false]) {
      const a = calcTransportCost(s, 12, hasSilk);
      const b = explainTransportCost(s, 12, hasSilk).final;
      assertEqual(b, a, `modules=[${ids}] hasSilk=${hasSilk}`);
    }
  }
});

test("calcVAT: no VAT when the margin is zero or negative", () => {
  const s = freshState();
  // Sachet: materials Silk×1 (avg 8) + Tea×2 (avg 12) = 32, worker wage 20 -> break-even at 52
  assertEqual(calcVAT(s, "Sachet", 52), 0, "exactly break-even");
  assertEqual(calcVAT(s, "Sachet", 40), 0, "below break-even");
});

test("calcVAT: 5% of the margin above material + wage cost, floored", () => {
  const s = freshState();
  // taxable = 152 - 32 - 20 = 100 -> vat = floor(100*0.05) = 5
  assertEqual(calcVAT(s, "Sachet", 152), 5, "5% of a 100 Gold margin");
});

test("calcVAT: vat_discount and tax_evasion module stack multiplicatively, each floored in turn", () => {
  const s = freshState();
  s.modifierFlags = { vat_discount: 0.5 };
  // vat = floor(100*0.05) = 5; discount -> floor(5*0.5) = 2
  assertEqual(calcVAT(s, "Sachet", 152), 2, "vat_discount 0.5 halves 5 -> 2");

  const s2 = freshState();
  s2.equippedModules = [
    { id: "tax_evasion", name: "Tax Evasion Ledger", icon: "📕", desc: "" },
  ];
  assertEqual(calcVAT(s2, "Sachet", 152), 2, "tax_evasion halves 5 -> 2");

  const s3 = freshState();
  s3.modifierFlags = { vat_discount: 0.5 };
  s3.equippedModules = [
    { id: "tax_evasion", name: "Tax Evasion Ledger", icon: "📕", desc: "" },
  ];
  // 5 -> floor(5*0.5)=2 -> floor(2*0.5)=1
  assertEqual(calcVAT(s3, "Sachet", 152), 1, "both stack: 5 -> 2 -> 1");
});

test("explainVAT mirrors calcVAT's final figure", () => {
  const s = freshState();
  s.modifierFlags = { vat_discount: 0.5 };
  s.equippedModules = [
    { id: "tax_evasion", name: "Tax Evasion Ledger", icon: "📕", desc: "" },
  ];
  assertEqual(
    explainVAT(s, "Sachet", 152).final,
    calcVAT(s, "Sachet", 152),
    "breakdown matches calc",
  );
});

test("calcIncomeTax: 10% default rate, smugglers_hold +20%, tax_evasion -50%, no tax on loss", () => {
  const s = freshState();
  assertEqual(calcIncomeTax(s, 100), 10, "default 10%");
  assertEqual(calcIncomeTax(s, -50), 0, "no tax on a loss");
  const s2 = freshState();
  s2.equippedModules = [
    { id: "smugglers_hold", name: "Smuggler's Hold", icon: "🏴‍☠️", desc: "" },
  ];
  assertEqual(calcIncomeTax(s2, 100), 12, "smugglers_hold: floor(10*1.2)=12");
  const s3 = freshState();
  s3.equippedModules = [
    { id: "tax_evasion", name: "Tax Evasion Ledger", icon: "📕", desc: "" },
  ];
  assertEqual(calcIncomeTax(s3, 100), 5, "tax_evasion: floor(10*0.5)=5");
});

test("getHireCost: hire_discount and artisans_workshop surcharge apply to every wage lookup", () => {
  const s = freshState();
  assertEqual(
    getHireCost(s, "weaver"),
    WAGES.weaver,
    "no modifiers: base wage",
  );
  const s2 = freshState();
  s2.modifierFlags = { hire_discount: 0.5 };
  assertEqual(
    getHireCost(s2, "weaver"),
    Math.floor(WAGES.weaver * 0.5),
    "50% hire discount",
  );
  const s3 = freshState();
  s3.equippedModules = [
    {
      id: "artisans_workshop",
      name: "Artisan's Workshop",
      icon: "🛠️",
      desc: "",
    },
  ];
  assertEqual(
    getHireCost(s3, "weaver"),
    Math.floor(WAGES.weaver * 1.2),
    "artisans_workshop +20%",
  );
});

test("brokersFavorCommission: zero reward has zero commission; net payout is bounded below the cap", () => {
  assertEqual(brokersFavorCommission(0), 0, "zero reward");
  const cap = 200;
  for (const reward of [50, 200, 1000, 100000]) {
    const commission = brokersFavorCommission(reward);
    const net = reward - commission;
    // At extreme rewards (>~7300 here) Math.exp underflows far enough that
    // 1 - Math.exp(-reward/cap) rounds to exactly 1.0 in double precision, so
    // net payout saturates at exactly the cap rather than approaching it from
    // strictly below. No real Broker's Favor order gets anywhere near that
    // reward, so <= (not <) is the correct bound here.
    assert(
      net <= cap,
      `net payout ${net} must never exceed the ${cap} Gold cap (reward=${reward})`,
    );
    assert(
      commission >= 0,
      `commission must never be negative (reward=${reward})`,
    );
  }
  // Monotonic: a bigger ask never nets the captain less than a smaller one.
  let prevNet = -1;
  for (const reward of [10, 50, 100, 300, 1000, 5000]) {
    const net = reward - brokersFavorCommission(reward);
    assert(
      net >= prevNet,
      `net payout should be non-decreasing in reward (reward=${reward})`,
    );
    prevNet = net;
  }
});

test("explainCardPrice: kiln_cellar discounts Porcelain Clay/Copper Ore by 2g/unit", () => {
  const s = freshState();
  s.equippedModules = [
    { id: "kiln_cellar", name: "Kiln Cellar", icon: "🔥", desc: "" },
  ];
  const card = {
    id: 0,
    port: "Fuzhou Port",
    resources: [{ type: "Porcelain Clay", quantity: 3, price: 10 }],
    totalCost: 30,
    isProductCard: false,
  };
  assertEqual(explainCardPrice(s, card).final, 24, "30 - (3 units * 2g) = 24");
});

test("explainCardPrice: foreign_quarter_pass discounts Spices/Pearls by 3g/unit", () => {
  const s = freshState();
  s.equippedModules = [
    {
      id: "foreign_quarter_pass",
      name: "Foreign Quarter Pass",
      icon: "🪪",
      desc: "",
    },
  ];
  const card = {
    id: 0,
    port: "Srivijaya Port",
    resources: [{ type: "Pearls", quantity: 2, price: 20 }],
    totalCost: 40,
    isProductCard: false,
  };
  assertEqual(explainCardPrice(s, card).final, 34, "40 - (2 units * 3g) = 34");
});

test("hasModule reflects equippedModules membership exactly", () => {
  const s = freshState();
  assert(!hasModule(s, "kiln_cellar"), "not equipped yet");
  s.equippedModules = [
    { id: "kiln_cellar", name: "Kiln Cellar", icon: "🔥", desc: "" },
  ];
  assert(hasModule(s, "kiln_cellar"), "now equipped");
  assert(!hasModule(s, "bureau_token"), "different module still absent");
});

test("merchantRatingForScore picks the highest threshold the score clears", () => {
  assertEqual(merchantRatingForScore(0).label, "Novice Merchant", "score 0");
  assertEqual(
    merchantRatingForScore(49).label,
    "Novice Merchant",
    "score 49 (just under Qualified)",
  );
  assertEqual(merchantRatingForScore(50).label, "Qualified Trader", "score 50");
  assertEqual(
    merchantRatingForScore(300).label,
    "King of Silk Road",
    "score 300",
  );
  assertEqual(
    merchantRatingForScore(9999).label,
    "King of Silk Road",
    "way above top threshold",
  );
  assertEqual(
    merchantRatingForScore(-5).label,
    MERCHANT_RATINGS[MERCHANT_RATINGS.length - 1].label,
    "negative score floors to lowest tier",
  );
});

// ---------- Legacy / Renown ----------
suite("legacy and renown");

test("xpRequiredForLevel follows the documented triangular curve", () => {
  assertEqual(xpRequiredForLevel(1), 0, "level 1");
  assertEqual(xpRequiredForLevel(2), 100, "level 2");
  assertEqual(xpRequiredForLevel(3), 300, "level 3");
  assertEqual(xpRequiredForLevel(4), 600, "level 4");
  assertEqual(xpRequiredForLevel(5), 1000, "level 5");
});

test("levelForRenownXP inverts xpRequiredForLevel at every boundary", () => {
  assertEqual(levelForRenownXP(0), 1, "0 xp");
  assertEqual(levelForRenownXP(99), 1, "just under level 2");
  assertEqual(levelForRenownXP(100), 2, "exactly level 2's threshold");
  assertEqual(levelForRenownXP(299), 2, "just under level 3");
  assertEqual(levelForRenownXP(300), 3, "exactly level 3's threshold");
});

test("renownStartingGoldBonus: +3/level above 1, capped at 60", () => {
  assertEqual(renownStartingGoldBonus(1), 0, "level 1: no bonus");
  assertEqual(renownStartingGoldBonus(2), 3, "level 2");
  assertEqual(renownStartingGoldBonus(21), 60, "level 21: cap reached");
  assertEqual(renownStartingGoldBonus(50), 60, "level 50: still capped");
});

test("parseStatsByDifficulty / recordVoyageInStats round-trip and degrade gracefully", () => {
  assertEqual(
    Object.keys(parseStatsByDifficulty(null)).length,
    0,
    "null -> empty",
  );
  assertEqual(
    Object.keys(parseStatsByDifficulty("not json")).length,
    0,
    "malformed -> empty",
  );
  assertEqual(
    Object.keys(parseStatsByDifficulty("[1,2,3]")).length,
    0,
    "array -> empty",
  );

  let stats = parseStatsByDifficulty("{}");
  stats = recordVoyageInStats(stats, "monsoon", {
    crowned: true,
    reputation: 250,
  });
  assertEqual(stats.monsoon.crowns, 1, "first monsoon crown recorded");
  assertEqual(stats.monsoon.bestScore, 250, "best score recorded");
  stats = recordVoyageInStats(stats, "monsoon", {
    crowned: false,
    reputation: 400,
  });
  assertEqual(stats.monsoon.crowns, 1, "uncrowned voyage doesn't add a crown");
  assertEqual(stats.monsoon.bestScore, 400, "best score still tracks the max");
});

// ---------- Merits ----------
suite("difficulty-scoped merits");

test("open_water_captain requires open_waters and no bankruptcy", () => {
  const base = {
    newVoyagesCompleted: 1,
    crowned: false,
    priorSeaMasterCrowns: 0,
    reputation: 10,
    newRenownLevel: 1,
    consecutiveSolventVoyages: 1,
  };
  assert(
    qualifyingMerits({
      ...base,
      difficulty: "open_waters",
      bankrupt: false,
    }).includes("open_water_captain"),
    "solvent open_waters voyage qualifies",
  );
  assert(
    !qualifyingMerits({
      ...base,
      difficulty: "open_waters",
      bankrupt: true,
    }).includes("open_water_captain"),
    "bankrupt open_waters voyage does not qualify",
  );
  assert(
    !qualifyingMerits({
      ...base,
      difficulty: "fair_winds",
      bankrupt: false,
    }).includes("open_water_captain"),
    "fair_winds never qualifies",
  );
});

test("storm_sovereign requires a monsoon crown; eye_of_the_storm requires monsoon + 200 reputation", () => {
  const base = {
    newVoyagesCompleted: 1,
    priorSeaMasterCrowns: 0,
    newRenownLevel: 1,
    consecutiveSolventVoyages: 1,
    bankrupt: false,
  };
  assert(
    qualifyingMerits({
      ...base,
      difficulty: "monsoon",
      crowned: true,
      reputation: 10,
    }).includes("storm_sovereign"),
    "crowned monsoon voyage qualifies for storm_sovereign",
  );
  assert(
    !qualifyingMerits({
      ...base,
      difficulty: "monsoon",
      crowned: false,
      reputation: 10,
    }).includes("storm_sovereign"),
    "uncrowned monsoon voyage does not",
  );
  assert(
    qualifyingMerits({
      ...base,
      difficulty: "monsoon",
      crowned: false,
      reputation: 200,
    }).includes("eye_of_the_storm"),
    "200+ reputation on monsoon qualifies regardless of crown",
  );
  assert(
    !qualifyingMerits({
      ...base,
      difficulty: "open_waters",
      crowned: true,
      reputation: 200,
    }).includes("eye_of_the_storm"),
    "eye_of_the_storm is monsoon-only",
  );
});

// ---------- Sanity on the config table itself ----------
suite("difficulty config integrity");

test("every difficulty's mandate schedule only references valid MANDATE_TEMPLATES indices", () => {
  for (const [key, cfg] of Object.entries(DIFFICULTIES)) {
    for (const [round, idx] of Object.entries(cfg.mandates)) {
      assert(
        idx >= 0 && idx <= 2,
        `${key} round ${round}: mandate index ${idx} out of range`,
      );
    }
  }
});

test("every difficulty's tierUnlock rounds fall within its own voyage length", () => {
  for (const [key, cfg] of Object.entries(DIFFICULTIES)) {
    for (const [tier, round] of Object.entries(cfg.tierUnlock)) {
      assert(
        round <= cfg.rounds,
        `${key} tier ${tier} unlocks at round ${round}, past its ${cfg.rounds}-round voyage`,
      );
    }
  }
});

// ---------- Harbor systems (Manifests 01-03) ----------
// Pure-function coverage for the three room-wide harbor systems merged via
// PR #12: The Harbor Pulse (price nudge), Word on the Docks (first-to-3
// race), and Tidewatch Alerts (combined-reputation surge). Each system's
// authoritative "who won" or "did the room cross the line" arbitration
// lives server-side in src/server/realtime.ts (roomPulseTallies,
// roomDocksWinners, roomSurges), which needs a live socket connection to
// exercise and is out of scope for this framework-free script; what's
// tested here is every piece of it that's a pure function reachable
// without one: the pricing formula itself (computeHarborPulse, hoisted out
// of realtime.ts into src/lib/game/harborPulse.ts for exactly this reason,
// the same move pools.ts made for difficulty.ts) and every exported engine
// function these systems added or touched.
suite("harbor systems (Manifests 01-03)");

function orderCard(
  overrides: Partial<OrderCard> & { resources: OrderCard["resources"] },
): OrderCard {
  return {
    id: 0,
    demandPort: "Quanzhou Port",
    reward: 50,
    totalItems: overrides.resources.reduce((s, r) => s + (r.required ?? 0), 0),
    isProductOrder: false,
    ...overrides,
  };
}

// ----- The Harbor Pulse: computeHarborPulse -----

test("computeHarborPulse: no tally (round 1, or nobody reported) is neutral", () => {
  assertEqual(
    Object.keys(computeHarborPulse(undefined)).length,
    0,
    "undefined tally -> {}",
  );
  assertEqual(
    Object.keys(computeHarborPulse({})).length,
    0,
    "empty tally -> {}",
  );
});

test("computeHarborPulse: an item bought at exactly an even 1/3 share is untouched", () => {
  const pulse = computeHarborPulse({ Hemp: 10, Silk: 10, Tea: 10 });
  assertClose(pulse.Hemp, 0, 1e-9, "Hemp at baseline share");
  assertClose(pulse.Silk, 0, 1e-9, "Silk at baseline share");
  assertClose(pulse.Tea, 0, 1e-9, "Tea at baseline share");
});

test("computeHarborPulse: an item the room leaned into gets a positive nudge, clamped to PULSE_CAP", () => {
  // Hemp alone: share = 1.0, unclamped nudge = (1 - 1/3) * 0.6 = 0.4, far past
  // the 0.12 cap, so the clamp is what this test is actually pinning down.
  const pulse = computeHarborPulse({ Hemp: 100 });
  assertClose(pulse.Hemp, PULSE_CAP, 1e-9, "clamped to +PULSE_CAP");
});

test("computeHarborPulse: a reported-but-untouched item still gets a negative nudge, clamped to -PULSE_CAP", () => {
  // Silk/Tea split the room's buying and Hemp gets none of it: share = 0,
  // unclamped nudge = (0 - 1/3) * 0.6 = -0.2, past the cap on the low side.
  // (Filtering a genuinely zero-quantity entry out of the tally entirely is
  // addPulseReport's job, not this pure function's — see the next test.)
  const pulse = computeHarborPulse({ Hemp: 0, Silk: 50, Tea: 50 });
  assertClose(pulse.Hemp, -PULSE_CAP, 1e-9, "clamped to -PULSE_CAP");
});

test("computeHarborPulse: an underrepresented but present item still clamps at -PULSE_CAP", () => {
  const pulse = computeHarborPulse({ Hemp: 1, Silk: 495, Tea: 495 });
  assertClose(pulse.Hemp, -PULSE_CAP, 1e-9, "clamped to -PULSE_CAP");
});

test("computeHarborPulse: a total of zero (all reported quantities non-positive) is neutral", () => {
  // addPulseReport already filters non-positive quantities before they ever
  // reach this function, but the pure function is defensive on its own
  // terms too: this pins that defensiveness down independently of the
  // caller that currently guarantees it.
  const pulse = computeHarborPulse({ Hemp: 0 });
  assertEqual(Object.keys(pulse).length, 0, "zero total -> {}");
});

// ----- The Harbor Pulse: tallyPurchasesByResource -----

test("tallyPurchasesByResource: sums only purchased, non-product resource cards", () => {
  const s = freshState();
  s.resourceCards = [
    {
      id: 0,
      port: "Quanzhou Port",
      resources: [{ type: "Hemp", quantity: 2, price: 4 }],
      totalCost: 8,
      isProductCard: false,
    },
    {
      id: 1,
      port: "Hangzhou Port",
      resources: [{ type: "Silk", quantity: 1, price: 8 }],
      totalCost: 8,
      isProductCard: false,
    },
    // Purchased but a finished-good card: the pulse is about raw goods, so
    // this must never contribute, even though it's in purchasedCards below.
    {
      id: 2,
      port: "Guangzhou Port",
      resources: [{ type: "Sachet", quantity: 1, price: 100 }],
      totalCost: 100,
      isProductCard: true,
    },
    // On the board but never bought: must not contribute either.
    {
      id: 3,
      port: "Quanzhou Port",
      resources: [{ type: "Hemp", quantity: 5, price: 4 }],
      totalCost: 20,
      isProductCard: false,
    },
  ] as ResourceCard[];
  s.purchasedCards = [0, 1, 2];
  const tally = tallyPurchasesByResource(s);
  assertEqual(tally.Hemp, 2, "only the purchased Hemp card counts");
  assertEqual(tally.Silk, 1, "purchased Silk card counts");
  assertEqual(
    tally.Sachet,
    undefined,
    "product cards never enter the pulse tally",
  );
});

test("tallyPurchasesByResource: sums multiple purchased cards of the same resource", () => {
  const s = freshState();
  s.resourceCards = [
    {
      id: 0,
      port: "Quanzhou Port",
      resources: [{ type: "Hemp", quantity: 2, price: 4 }],
      totalCost: 8,
      isProductCard: false,
    },
    {
      id: 1,
      port: "Ningbo Port",
      resources: [{ type: "Hemp", quantity: 3, price: 5 }],
      totalCost: 15,
      isProductCard: false,
    },
  ] as ResourceCard[];
  s.purchasedCards = [0, 1];
  assertEqual(tallyPurchasesByResource(s).Hemp, 5, "2 + 3 across two cards");
});

test("tallyPurchasesByResource: nothing purchased yields an empty tally", () => {
  const s = freshState();
  s.resourceCards = [
    {
      id: 0,
      port: "Quanzhou Port",
      resources: [{ type: "Hemp", quantity: 2, price: 4 }],
      totalCost: 8,
      isProductCard: false,
    },
  ] as ResourceCard[];
  s.purchasedCards = [];
  assertEqual(
    Object.keys(tallyPurchasesByResource(s)).length,
    0,
    "no purchases -> {}",
  );
});

// ----- The Harbor Pulse: applyHarborPulse -----

test("applyHarborPulse replaces state.harborPulse wholesale, not a merge", () => {
  const s = freshState();
  s.harborPulse = { Silk: 0.05 };
  applyHarborPulse(s, { Hemp: 0.1 });
  assertEqual(s.harborPulse.Hemp, 0.1, "new pulse value present");
  assertEqual(s.harborPulse.Silk, undefined, "prior round's pulse is gone");
});

// ----- Tidewatch Alerts: applyTidewatchSurge -----

test("applyTidewatchSurge: flips the flag once and logs exactly once", () => {
  const s = freshState();
  const logs: string[] = [];
  applyTidewatchSurge(s, logs);
  assertEqual(s.tidewatchSurge, true, "flag set");
  assertEqual(logs.length, 1, "exactly one log line");
  assert(logs[0].includes("Tidewatch"), "log names the system");
});

test("applyTidewatchSurge: idempotent once already flipped, never a repeat announcement", () => {
  const s = freshState();
  const logs: string[] = [];
  applyTidewatchSurge(s, logs);
  applyTidewatchSurge(s, logs);
  applyTidewatchSurge(s, logs);
  assertEqual(logs.length, 1, "still exactly one log line after 3 calls");
  assertEqual(s.tidewatchSurge, true, "flag stays true");
});

// ----- Word on the Docks: claimWordOnTheDocksReward -----

test("claimWordOnTheDocksReward: pays the reward exactly once per call and logs it", () => {
  const s = freshState();
  const before = s.money;
  const logs: string[] = [];
  claimWordOnTheDocksReward(s, logs);
  assertEqual(s.money, before + WORD_ON_THE_DOCKS_REWARD, "reward credited");
  assertEqual(logs.length, 1, "exactly one log line");
  assert(logs[0].includes("Word on the Docks"), "log names the system");
});

// ----- Word on the Docks: completeOrder's one-shot claim signal -----

test("completeOrder: _pendingDocksClaim is unset before the threshold, set exactly at it", () => {
  const s = freshState();
  s.inventory.Hemp = 100;
  s.customerCards = Array.from(
    { length: WORD_ON_THE_DOCKS_THRESHOLD },
    (_, i) => orderCard({ id: i, resources: [{ type: "Hemp", required: 1 }] }),
  );
  for (let i = 0; i < WORD_ON_THE_DOCKS_THRESHOLD - 1; i++) {
    completeOrder(s, i, []);
    assertEqual(
      s._pendingDocksClaim,
      undefined,
      `order ${i + 1}/${WORD_ON_THE_DOCKS_THRESHOLD}: not yet at the threshold`,
    );
  }
  completeOrder(s, WORD_ON_THE_DOCKS_THRESHOLD - 1, []);
  assertEqual(
    s._pendingDocksClaim?.total,
    WORD_ON_THE_DOCKS_THRESHOLD,
    "claim fires the instant the threshold is crossed",
  );
});

test("completeOrder: never re-fires _pendingDocksClaim past the threshold", () => {
  const s = freshState();
  s.inventory.Hemp = 100;
  s.customerCards = Array.from(
    { length: WORD_ON_THE_DOCKS_THRESHOLD + 1 },
    (_, i) => orderCard({ id: i, resources: [{ type: "Hemp", required: 1 }] }),
  );
  for (let i = 0; i < WORD_ON_THE_DOCKS_THRESHOLD; i++) completeOrder(s, i, []);
  assertEqual(
    s._pendingDocksClaim?.total,
    WORD_ON_THE_DOCKS_THRESHOLD,
    "sanity: fired at the threshold",
  );
  // Simulate GameRoom.tsx relaying and clearing the signal, the same
  // handshake the real client performs (see GameRoom.tsx's docks:claim
  // relay) before this captain's very next order completes.
  delete s._pendingDocksClaim;
  completeOrder(s, WORD_ON_THE_DOCKS_THRESHOLD, []);
  assertEqual(
    s._pendingDocksClaim,
    undefined,
    "the === guard is one-shot: a 4th completed order never re-sets the claim",
  );
});

// ----- Constant sanity: guards silent balance drift -----
// These numbers are load-bearing in guideText()/tipsText() copy and in the
// server's arbitration logic; a change here should be a deliberate design
// decision, not a typo that silently desyncs the rules text from the code.

test("harbor system constants match the documented design", () => {
  assertEqual(WORD_ON_THE_DOCKS_THRESHOLD, 3, "first to 3 completed orders");
  assertEqual(WORD_ON_THE_DOCKS_REWARD, 25, "25 Gold reward");
  assertEqual(TIDEWATCH_SURGE_THRESHOLD, 250, "combined Reputation past 250");
});

const ok = summary();
process.exit(ok ? 0 : 1);
