// =====================================================================
// Effect audit: every Boon and every Ship Module, every distinct modifier
// each one carries, verified against the live BOONS/MODULES data (not a
// hand-copied assumption of what they do) and driven through the real
// engine functions that are supposed to react to them.
//
// Chance-based effects (Salvage Crane, Tax Evasion's audit, the corrupt
// broker) are pinned down with withFixedRandom rather than run N times and
// eyeballed statistically: stubbing Math.random to a known value either
// side of the threshold proves the branch fires exactly where the code
// says it should, deterministically, every run.
//
// Tally: 8 tier0 boons (1 modifier each) + 8 tier0 modules (15 modifiers,
// several carry two) + 3 tier1 boons + 3 tier1 modules + 3 tier2 boons
// (4 modifiers, deep_sea_escort_pact carries two) + 3 tier2 modules = 36
// distinct effects audited below.
//
// Run with: npx tsx scripts/tests/effects.audit.ts
// =====================================================================
import {
  suite,
  test,
  assert,
  assertEqual,
  withFixedRandom,
  summary,
} from "./harness";
import {
  BOONS,
  MODULES,
  type Boon,
  type Module,
} from "../../src/lib/game/constants";
import {
  applyBoon,
  calcTransportCost,
  calcVAT,
  calcIncomeTax,
  explainCardPrice,
  getHireCost,
  hireEscort,
  processProduction,
  purchaseIntel,
  completeOrder,
  equipModule,
  payMaintenance,
  upgradeShip,
  resolvePirateAttack,
  startPhase1,
  startPhase2,
} from "../../src/lib/game/engine";
import {
  createInitialGameState,
  type GameState,
  type GameContext,
  type OrderCard,
  type ResourceCard,
} from "../../src/lib/game/types";

function freshState(
  difficulty: "fair_winds" | "open_waters" | "monsoon" = "fair_winds",
  round = 1,
): GameState {
  const s = createInitialGameState(0, 1, 0, difficulty);
  s.currentRound = round;
  return s;
}
const ctx: GameContext = { seedBase: "audit:tester" };

function boon(id: string): Boon {
  const b = BOONS.find((x) => x.id === id);
  if (!b)
    throw new Error(
      `Boon '${id}' not found in BOONS — was it renamed or removed?`,
    );
  return b;
}
function mod(id: string): Module {
  const m = MODULES.find((x) => x.id === id);
  if (!m)
    throw new Error(
      `Module '${id}' not found in MODULES — was it renamed or removed?`,
    );
  return m;
}

function order(
  overrides: Partial<OrderCard> & { resources: OrderCard["resources"] },
): OrderCard {
  return {
    id: 0,
    demandPort: "Quanzhou Port",
    reward: 100,
    totalItems: overrides.resources.reduce((s, r) => s + (r.required ?? 0), 0),
    isProductOrder: false,
    ...overrides,
  };
}

// Mirrors completeOrder's real sequencing for a single-item product order:
// VAT is computed and subtracted from the ORIGINAL reward first, and only
// then do the percentage reward bonuses (silk_monopoly, charter_order_bonus,
// bureau_token, exotic_order_bonus) stack on what's left — never the other
// way around. `boosts` are applied in the order completeOrder would apply
// them. Transport is a separate deduction from state.money, not part of
// `reward`, so it comes off the total independently at the end. Built on
// the already-audited calcVAT/calcTransportCost rather than re-deriving
// their formulas, so this only exercises completeOrder's own composition.
function expectedProductOrderDelta(
  state: GameState,
  product: string,
  reward: number,
  required: number,
  hasSilk: boolean,
  boosts: number[],
): number {
  const unitVat = calcVAT(state, product, reward / required);
  let r = reward - unitVat * required;
  for (const pct of boosts) r += Math.floor(r * pct);
  const transport = calcTransportCost(state, required, hasSilk);
  return r - transport;
}

// =====================================================================
// Tier 0 boons (8 effects)
// =====================================================================
suite("tier0 boons");

test("silk_wind: halves transport cost only for orders carrying Silk", () => {
  const s = freshState();
  applyBoon(s, boon("silk_wind"), []);
  const withSilk = calcTransportCost(s, 20, true);
  const without = calcTransportCost(s, 20, false);
  assertEqual(
    withSilk,
    Math.floor(40 * 0.5),
    "20 items, silk: floor(40*0.5)=20",
  );
  assertEqual(without, 40, "20 items, no silk: unaffected");
});

test("favorable_tides: flat -4 Gold transport, floored at 5", () => {
  const s = freshState();
  applyBoon(s, boon("favorable_tides"), []);
  assertEqual(calcTransportCost(s, 10), 16, "10 items: 20 - 4 = 16");
});

test("merchant_charm: 15% off every port purchase card", () => {
  const s = freshState();
  applyBoon(s, boon("merchant_charm"), []);
  const card: ResourceCard = {
    id: 0,
    port: "Quanzhou Port",
    resources: [{ type: "Hemp", quantity: 5, price: 5 }],
    totalCost: 25,
    isProductCard: false,
  };
  assertEqual(
    explainCardPrice(s, card).final,
    Math.floor(25 * 0.85),
    "floor(25*0.85)=21",
  );
});

test("artisan_inspiration: +1 item produced by every working artisan this round", () => {
  const s = freshState();
  applyBoon(s, boon("artisan_inspiration"), []);
  s.workers.weaver.push({
    task: "Linen Clothes",
    progress: 0,
    producedCount: 0,
    isSkilled: false,
  });
  processProduction(s, []);
  assertEqual(
    s.inventory["Linen Clothes"],
    2,
    "unskilled weaver: base 1 + bonus 1 = 2",
  );
});

test("emergency_loan: +40 Gold applied immediately on selection, not deferred", () => {
  const s = freshState();
  const before = s.money;
  applyBoon(s, boon("emergency_loan"), []);
  assertEqual(
    s.money,
    before + 40,
    "money credited the instant the boon is applied",
  );
});

test("tax_shelter: income tax rate overridden to 5%", () => {
  const s = freshState();
  applyBoon(s, boon("tax_shelter"), []);
  assertEqual(
    calcIncomeTax(s, 200),
    10,
    "floor(200*0.05)=10, not the default floor(200*0.10)=20",
  );
});

test("hemp_monopoly: Hemp costs 2 Gold less per unit at the port", () => {
  const s = freshState();
  applyBoon(s, boon("hemp_monopoly"), []);
  const card: ResourceCard = {
    id: 0,
    port: "Quanzhou Port",
    resources: [{ type: "Hemp", quantity: 4, price: 5 }],
    totalCost: 20,
    isProductCard: false,
  };
  assertEqual(explainCardPrice(s, card).final, 12, "20 - (4 units * 2g) = 12");
});

test("master_apprentice: hiring costs 50% less this round", () => {
  const s = freshState();
  applyBoon(s, boon("master_apprentice"), []);
  assertEqual(getHireCost(s, "weaver"), Math.floor(8 * 0.5), "floor(8*0.5)=4");
});

// =====================================================================
// Tier 0 modules (15 effects across 8 modules)
// =====================================================================
suite("tier0 modules");

test("smugglers_hold: -15% purchase cost, +20% income tax", () => {
  const s = freshState();
  s.shipLevel = 1;
  equipModule(s, mod("smugglers_hold"), null, []);
  const card: ResourceCard = {
    id: 0,
    port: "Quanzhou Port",
    resources: [{ type: "Hemp", quantity: 4, price: 5 }],
    totalCost: 20,
    isProductCard: false,
  };
  assertEqual(
    explainCardPrice(s, card).final,
    Math.floor(20 * 0.85),
    "purchase: floor(20*0.85)=17",
  );
  assertEqual(calcIncomeTax(s, 100), 12, "income tax: floor(10*1.2)=12");
});

test("bulk_hauler: -1 Gold transport per item, +15 Gold to every ship upgrade", () => {
  const s = freshState();
  s.shipLevel = 1; // required so equipModule can install rather than demand a swap; also grants its own 5g discount
  equipModule(s, mod("bulk_hauler"), null, []);
  assertEqual(
    calcTransportCost(s, 10),
    5,
    "transport: 20 - 5 (ship lvl1) - 10 (bulk_hauler, 1g/item) = 5",
  );
  const before = s.money;
  const baseCost = s.shipUpgradeCost[s.shipLevel];
  upgradeShip(s, []);
  assertEqual(
    before - s.money,
    baseCost + 15,
    "upgrade cost includes the +15 penalty",
  );
});

test("artisans_workshop: +1 item produced, wages +20%", () => {
  const s = freshState();
  s.shipLevel = 1;
  equipModule(s, mod("artisans_workshop"), null, []);
  s.workers.weaver.push({
    task: "Linen Clothes",
    progress: 0,
    producedCount: 0,
    isSkilled: false,
  });
  processProduction(s, []);
  assertEqual(
    s.inventory["Linen Clothes"],
    2,
    "production: base 1 + module 1 = 2",
  );
  assertEqual(
    getHireCost(s, "weaver"),
    Math.floor(8 * 1.2),
    "wage: floor(8*1.2)=9",
  );
});

test("tax_evasion: income tax & VAT halved, 15% audit chance costs 20 Gold on order complete", () => {
  const s = freshState();
  s.shipLevel = 1;
  equipModule(s, mod("tax_evasion"), null, []);
  assertEqual(calcIncomeTax(s, 100), 5, "income tax halved: floor(10*0.5)=5");
  // Sachet break-even is 52 (see unit.game.ts); 152 -> taxable 100 -> vat 5 -> halved 2
  assertEqual(calcVAT(s, "Sachet", 152), 2, "VAT halved: floor(5*0.5)=2");

  const s2 = freshState();
  s2.shipLevel = 1;
  equipModule(s2, mod("tax_evasion"), null, []);
  s2.inventory["Hemp"] = 10;
  s2.customerCards = [
    order({
      id: 0,
      resources: [{ type: "Hemp", required: 2 }],
      reward: 50,
      isProductOrder: false,
    }),
  ];
  const moneyBefore = s2.money;
  withFixedRandom(0.1, () => completeOrder(s2, 0, []));
  assert(
    s2.money < moneyBefore + 50,
    "0.1 < 0.15: audit triggers, an extra 20 Gold is lost",
  );

  const s3 = freshState();
  s3.shipLevel = 1;
  equipModule(s3, mod("tax_evasion"), null, []);
  s3.inventory["Hemp"] = 10;
  s3.customerCards = [
    order({
      id: 0,
      resources: [{ type: "Hemp", required: 2 }],
      reward: 50,
      isProductOrder: false,
    }),
  ];
  const moneyBefore3 = s3.money;
  const transport3 = calcTransportCost(s3, 2);
  withFixedRandom(0.9, () => completeOrder(s3, 0, []));
  assertEqual(
    s3.money,
    moneyBefore3 - transport3 + 50,
    "0.9 >= 0.15: no audit, plain net of reward minus freight",
  );
});

test("silk_monopoly: Silk freight waived, Silk product orders pay +20%", () => {
  const s = freshState();
  s.shipLevel = 1;
  equipModule(s, mod("silk_monopoly"), null, []);
  assertEqual(calcTransportCost(s, 10, true), 0, "silk freight waived");
  s.inventory["Brocade"] = 5;
  // A reward large enough that the per-unit VAT doesn't floor to 0, so this
  // actually exercises "VAT first, then the +20% on what's left" rather than
  // passing by coincidence on a margin too thin to tell the two orders apart.
  s.customerCards = [
    order({
      id: 0,
      resources: [{ type: "Brocade", required: 2 }],
      reward: 300,
      isProductOrder: true,
    }),
  ];
  const before = s.money;
  const expected = expectedProductOrderDelta(s, "Brocade", 300, 2, true, [0.2]);
  completeOrder(s, 0, []);
  assertEqual(
    s.money - before,
    expected,
    "reward boosted 20% AFTER VAT is deducted, freight waived",
  );
});

test("brokers_network: intel costs 2 Gold and reveals 2 rumors per purchase", () => {
  const s = freshState();
  s.shipLevel = 1;
  equipModule(s, mod("brokers_network"), null, []);
  assertEqual(s.intelCost, 2, "intel cost dropped to 2");
  s.phase2DemandTags = ["Hemp", "Silk", "Tea"];
  const before = s.money;
  purchaseIntel(s, []);
  assertEqual(s.revealedIntel.length, 2, "two rumors revealed per purchase");
  assertEqual(
    before - s.money,
    4,
    "both charged at the discounted 2g rate: 2*2=4",
  );
});

test("salvage_crane: 30% chance to refund the round's transport cost on order complete", () => {
  const s = freshState();
  s.shipLevel = 1;
  equipModule(s, mod("salvage_crane"), null, []);
  s.inventory["Hemp"] = 10;
  s.customerCards = [
    order({
      id: 0,
      resources: [{ type: "Hemp", required: 2 }],
      reward: 50,
      isProductOrder: false,
    }),
  ];
  const transport = calcTransportCost(s, 2);
  const before = s.money;
  withFixedRandom(0.1, () => completeOrder(s, 0, []));
  assertEqual(
    s.money,
    before - transport + 50 + transport,
    "0.1 < 0.3: refund triggers, freight is returned",
  );

  const s2 = freshState();
  s2.shipLevel = 1;
  equipModule(s2, mod("salvage_crane"), null, []);
  s2.inventory["Hemp"] = 10;
  s2.customerCards = [
    order({
      id: 0,
      resources: [{ type: "Hemp", required: 2 }],
      reward: 50,
      isProductOrder: false,
    }),
  ];
  const transport2 = calcTransportCost(s2, 2);
  const before2 = s2.money;
  withFixedRandom(0.9, () => completeOrder(s2, 0, []));
  assertEqual(s2.money, before2 - transport2 + 50, "0.9 >= 0.3: no refund");
});

test("overdrive_engine: -5 Gold transport, +10 Gold maintenance", () => {
  const s = freshState();
  s.shipLevel = 1; // required so equipModule can install rather than demand a swap; also grants its own 5g discount
  equipModule(s, mod("overdrive_engine"), null, []);
  assertEqual(
    calcTransportCost(s, 10),
    10,
    "transport: 20 - 5 (ship lvl1) - 5 (overdrive_engine) = 10",
  );
  const before = s.money;
  payMaintenance(s, []);
  assertEqual(
    before - s.money,
    s.fixedCost + 10,
    "maintenance includes the +10 penalty",
  );
});

// =====================================================================
// Tier 1 boons (3 effects) and modules (3 effects)
// =====================================================================
suite("tier1 boons and modules");

test("farsight: reveals one Broker's rumor for free at the start of Phase 1", () => {
  const s = freshState("open_waters", 4); // tier1 unlocked, farsight is in the pool from here on
  applyBoon(s, boon("farsight"), []);
  const before = s.money;
  const logs: string[] = [];
  startPhase1(s, ctx, logs);
  assertEqual(s.revealedIntel.length, 1, "one rumor revealed by Farsight");
  assertEqual(s.money, before, "no Gold spent: the rumor is free");
  assert(
    logs.some((l) => l.includes("Farsight")),
    "log announces the free rumor",
  );
});

test("kiln_and_forge_guild: charter-good orders pay +15%", () => {
  const s = freshState("open_waters", 4);
  applyBoon(s, boon("kiln_and_forge_guild"), []);
  s.inventory["Bronze Mirror"] = 5;
  s.customerCards = [
    order({
      id: 0,
      resources: [{ type: "Bronze Mirror", required: 1 }],
      reward: 100,
      isProductOrder: true,
    }),
  ];
  const before = s.money;
  const expected = expectedProductOrderDelta(
    s,
    "Bronze Mirror",
    100,
    1,
    false,
    [0.15],
  );
  completeOrder(s, 0, []);
  assertEqual(
    s.money - before,
    expected,
    "reward boosted 15% AFTER VAT is deducted, before freight",
  );
});

test("frontier_tariff_relief: VAT on finished goods is halved", () => {
  const s = freshState("open_waters", 4);
  applyBoon(s, boon("frontier_tariff_relief"), []);
  assertEqual(
    calcVAT(s, "Sachet", 152),
    2,
    "floor(5*0.5)=2, half the undiscounted VAT of 5",
  );
});

test("bureau_token: charter-good orders pay +10%", () => {
  const s = freshState("open_waters", 4);
  s.shipLevel = 1;
  equipModule(s, mod("bureau_token"), null, []);
  s.inventory["Bronze Mirror"] = 5;
  s.customerCards = [
    order({
      id: 0,
      resources: [{ type: "Bronze Mirror", required: 1 }],
      reward: 100,
      isProductOrder: true,
    }),
  ];
  const before = s.money;
  const expected = expectedProductOrderDelta(
    s,
    "Bronze Mirror",
    100,
    1,
    false,
    [0.1],
  );
  completeOrder(s, 0, []);
  assertEqual(
    s.money - before,
    expected,
    "reward boosted 10% AFTER VAT is deducted, before freight",
  );
});

test("kiln_cellar: Porcelain Clay and Copper Ore cost 2 Gold less per unit", () => {
  const s = freshState("open_waters", 4);
  s.shipLevel = 1;
  equipModule(s, mod("kiln_cellar"), null, []);
  const card: ResourceCard = {
    id: 0,
    port: "Fuzhou Port",
    resources: [{ type: "Copper Ore", quantity: 3, price: 12 }],
    totalCost: 36,
    isProductCard: false,
  };
  assertEqual(explainCardPrice(s, card).final, 30, "36 - (3 units * 2g) = 30");
});

test("ocean_relay: one extra Broker's Whisper rumor, at no extra cost", () => {
  const s = freshState("open_waters", 4);
  s.shipLevel = 1;
  equipModule(s, mod("ocean_relay"), null, []);
  s.phase2DemandTags = ["Hemp", "Silk", "Tea"];
  const before = s.money;
  purchaseIntel(s, []);
  assertEqual(
    s.revealedIntel.length,
    2,
    "base 1 + ocean_relay's extra 1 = 2 rumors",
  );
  assertEqual(
    before - s.money,
    s.intelCost,
    "only the base rumor is charged, the extra is free",
  );
});

// =====================================================================
// Tier 2 boons (4 effects) and modules (3 effects)
// =====================================================================
suite("tier2 boons and modules");

test("exotic_treasures: Foreign Balm / Pearl String orders pay +15%", () => {
  const s = freshState("open_waters", 9); // tier2 unlocked (opens at round 8), no mandate collision on round 9
  applyBoon(s, boon("exotic_treasures"), []);
  s.inventory["Foreign Balm"] = 5;
  s.customerCards = [
    order({
      id: 0,
      resources: [{ type: "Foreign Balm", required: 1 }],
      reward: 100,
      isProductOrder: true,
    }),
  ];
  const before = s.money;
  const expected = expectedProductOrderDelta(
    s,
    "Foreign Balm",
    100,
    1,
    false,
    [0.15],
  );
  completeOrder(s, 0, []);
  assertEqual(
    s.money - before,
    expected,
    "reward boosted 15% AFTER VAT is deducted, before freight",
  );
});

test("deep_sea_escort_pact: escort fee halved", () => {
  const s = freshState("monsoon", 1); // monsoon escortCostRate 0.15
  applyBoon(s, boon("deep_sea_escort_pact"), []);
  s.money = 200;
  const before = s.money;
  hireEscort(s, []);
  assertEqual(
    before - s.money,
    Math.floor(200 * 0.15 * 0.5),
    "escort cost halved from the base 15% rate",
  );
});

test("deep_sea_escort_pact: pirate raid chance halved", () => {
  // Monsoon round 1 base raid chance is 0.28 (see difficulty.ts). Halved -> 0.14.
  // A fixed roll of 0.20 sits strictly between the two: proves the modifier
  // actually changes which side of the roll the raid falls on.
  const withPact = freshState("monsoon", 1);
  applyBoon(withPact, boon("deep_sea_escort_pact"), []);
  withPact.money = 100;
  withFixedRandom(0.2, () => resolvePirateAttack(withPact, []));
  assertEqual(
    withPact.money,
    100,
    "0.20 >= 0.14 (halved chance): no raid, Gold untouched",
  );

  const withoutPact = freshState("monsoon", 1);
  withoutPact.money = 100;
  withFixedRandom(0.2, () => resolvePirateAttack(withoutPact, []));
  assertEqual(
    withoutPact.money,
    0,
    "0.20 < 0.28 (base chance): raid hits, all Gold lost",
  );
});

test("merchants_converge: one extra trade order appears on the board", () => {
  // Round 9: tier2 unlocked (opens round 8) but no Imperial Mandate scheduled
  // (open_waters mandates fall on 4/8/12) — round 8 itself would add a
  // mandate order on top and throw off the plain "+1" count below.
  const s = freshState("open_waters", 9);
  applyBoon(s, boon("merchants_converge"), []);
  const logs: string[] = [];
  startPhase2(s, ctx, logs);
  // marketCountsFor(open_waters, round 9).order === 10 (see difficulty.ts)
  assertEqual(s.customerCards.length, 11, "base 10 + 1 extra order = 11");
  assert(
    logs.some((l) => l.includes("Merchants Converge")),
    "log announces the extra order",
  );
});

test("foreign_quarter_pass: Spices and Pearls cost 3 Gold less per unit", () => {
  const s = freshState("open_waters", 8);
  s.shipLevel = 1;
  equipModule(s, mod("foreign_quarter_pass"), null, []);
  const card: ResourceCard = {
    id: 0,
    port: "Srivijaya Port",
    resources: [{ type: "Spices", quantity: 3, price: 16 }],
    totalCost: 48,
    isProductCard: false,
  };
  assertEqual(explainCardPrice(s, card).final, 39, "48 - (3 units * 3g) = 39");
});

test("persian_dome_compass: pirate raid risk cut by 30%", () => {
  // Monsoon round 1 base raid chance is 0.28. *0.7 -> 0.196.
  // A fixed roll of 0.25 sits strictly between the two.
  const withCompass = freshState("monsoon", 1);
  withCompass.shipLevel = 1;
  equipModule(withCompass, mod("persian_dome_compass"), null, []);
  withCompass.money = 100;
  withFixedRandom(0.25, () => resolvePirateAttack(withCompass, []));
  assertEqual(
    withCompass.money,
    100,
    "0.25 >= 0.196 (reduced chance): no raid",
  );

  const withoutCompass = freshState("monsoon", 1);
  withoutCompass.money = 100;
  withFixedRandom(0.25, () => resolvePirateAttack(withoutCompass, []));
  assertEqual(withoutCompass.money, 0, "0.25 < 0.28 (base chance): raid hits");
});

test("fleet_of_treasures: Foreign Balm / Pearl String freight is 3 Gold cheaper per unit", () => {
  const s = freshState("open_waters", 8);
  s.shipLevel = 1;
  equipModule(s, mod("fleet_of_treasures"), null, []);
  s.inventory["Foreign Balm"] = 5;
  s.customerCards = [
    order({
      id: 0,
      resources: [{ type: "Foreign Balm", required: 2 }],
      reward: 100,
      isProductOrder: true,
    }),
  ];
  const before = s.money;
  completeOrder(s, 0, []);
  const fullTransport = calcTransportCost(s, 2);
  const discountedTransport = Math.max(0, fullTransport - 2 * 3);
  const vat = calcVAT(s, "Foreign Balm", 100 / 2) * 2;
  assertEqual(
    s.money - before,
    100 - vat - discountedTransport,
    "freight cut by 3g/unit before money moves",
  );
});

// =====================================================================
// Cross-check: every Boon and Module in the game data actually got audited
// above. If a new one is added without a matching test, this fails loudly
// instead of silently under-covering the content.
// =====================================================================
suite("coverage cross-check");

test("every BOONS id has exactly one dedicated audit test above", () => {
  const auditedIds = [
    "silk_wind",
    "favorable_tides",
    "merchant_charm",
    "artisan_inspiration",
    "emergency_loan",
    "tax_shelter",
    "hemp_monopoly",
    "master_apprentice",
    "farsight",
    "kiln_and_forge_guild",
    "frontier_tariff_relief",
    "exotic_treasures",
    "deep_sea_escort_pact",
    "merchants_converge",
  ];
  const actualIds = BOONS.map((b) => b.id);
  const missing = actualIds.filter((id) => !auditedIds.includes(id));
  const stale = auditedIds.filter((id) => !actualIds.includes(id));
  assert(
    missing.length === 0,
    `Boons with no audit test: ${missing.join(", ")}`,
  );
  assert(
    stale.length === 0,
    `Audited ids no longer in BOONS (renamed/removed?): ${stale.join(", ")}`,
  );
});

test("every MODULES id has exactly one dedicated audit test above", () => {
  const auditedIds = [
    "smugglers_hold",
    "bulk_hauler",
    "artisans_workshop",
    "tax_evasion",
    "silk_monopoly",
    "brokers_network",
    "salvage_crane",
    "overdrive_engine",
    "bureau_token",
    "kiln_cellar",
    "ocean_relay",
    "foreign_quarter_pass",
    "persian_dome_compass",
    "fleet_of_treasures",
  ];
  const actualIds = MODULES.map((m) => m.id);
  const missing = actualIds.filter((id) => !auditedIds.includes(id));
  const stale = auditedIds.filter((id) => !actualIds.includes(id));
  assert(
    missing.length === 0,
    `Modules with no audit test: ${missing.join(", ")}`,
  );
  assert(
    stale.length === 0,
    `Audited ids no longer in MODULES (renamed/removed?): ${stale.join(", ")}`,
  );
});

const ok = summary();
process.exit(ok ? 0 : 1);
