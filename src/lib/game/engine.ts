// =====================================================================
// PortMasters 2 Parallel Release: Lords of the Silk Road game engine
//
// Ported faithfully from the original single-player build. All wording,
// log messages, balance, and phase flow are preserved verbatim.
//
// [ONLINE EXTENSION] The only behavioural addition is a seedable PRNG
// (mulberry32) used for the *shared* session economy. Port market
// cards, trade orders, and the Broker's intel pool are now generated
// deterministically from (roomId + round). Every captain in the same
// room, on the same voyage, sees the identical market and identical
// orders, so shared sessions stay highly synchronized. Each captain's
// gold, reputation, inventory, workers, and personal luck (Salvage
// Crane refunds, Tax-Evasion audits, boon offerings) remain their own.
// =====================================================================
import {
  AID_REPUTATION_PER_GOLD,
  APP_NAME,
  BOONS,
  COMMODITIES,
  ESCORT_COST_RATE,
  ICONS,
  MODULES,
  PIRATE_ATTACK_CHANCE,
  PORTS,
  PRODUCT_PRICES,
  PRODUCTS,
  RECIPES,
  RESOURCE_PROBS,
  RESOURCES,
  WAGES,
  type Boon,
  type Module,
} from "./constants";
import { createRng, pick, randInt, weightedPick, type Rng } from "./rng";
import { createInitialGameState, type GameContext, type GameState, type OrderCard, type ResourceCard } from "./types";

// ---------- Helpers ----------
export function hasModule(state: GameState, id: string): boolean {
  return state.equippedModules.some((m) => m.id === id);
}

// "Gold" is folded in as just another tradeable item type for bartering
// (see BARTER_ITEMS in ./constants), so anything that reads or writes an
// amount by item name goes through these two rather than reaching into
// state.money / state.inventory directly.
export function getOwnedAmount(state: GameState, item: string): number {
  return item === "Gold" ? state.money : state.inventory[item] || 0;
}

function addOwnedAmount(state: GameState, item: string, delta: number) {
  if (item === "Gold") state.money += delta;
  else state.inventory[item] = (state.inventory[item] || 0) + delta;
}

// ---------- Calculations (preserved verbatim) ----------
export function calcTransportCost(state: GameState, totalItems: number, hasSilk = false): number {
  let base = totalItems * 2;
  let discount = state.shipLevel * 5;
  if (state.modifierFlags.transport_flat_discount) discount += state.modifierFlags.transport_flat_discount;
  let cost = Math.max(5, base - discount);
  if (hasSilk && state.modifierFlags.transport_silk_discount)
    cost = Math.max(5, Math.floor(cost * state.modifierFlags.transport_silk_discount));
  if (hasModule(state, "bulk_hauler")) cost = Math.max(0, cost - totalItems);
  if (hasModule(state, "overdrive_engine")) cost = Math.max(0, cost - 5);
  if (hasModule(state, "silk_monopoly") && hasSilk) cost = 0;
  return Math.max(0, cost);
}

// A separate, display-only mirror of calcTransportCost above. Kept as its
// own function rather than having calcTransportCost delegate to it, so the
// balance-critical "preserved verbatim" math above never has to change to
// accommodate a tooltip.
export function explainTransportCost(state: GameState, totalItems: number, hasSilk = false): PriceBreakdown {
  const steps: PriceStep[] = [];
  const base = totalItems * 2;
  let cost = base;

  const shipDiscount = state.shipLevel * 5;
  if (shipDiscount > 0) {
    const next = Math.max(5, cost - shipDiscount);
    steps.push({ label: `Ship Level ${state.shipLevel} discount`, delta: next - cost });
    cost = next;
  }
  if (state.modifierFlags.transport_flat_discount) {
    const next = Math.max(5, cost - state.modifierFlags.transport_flat_discount);
    steps.push({ label: `${boonNameForModifierKey("transport_flat_discount")} (-${state.modifierFlags.transport_flat_discount}g)`, delta: next - cost });
    cost = next;
  }
  if (hasSilk && state.modifierFlags.transport_silk_discount) {
    const next = Math.max(5, Math.floor(cost * state.modifierFlags.transport_silk_discount));
    steps.push({ label: `${boonNameForModifierKey("transport_silk_discount")} on Silk goods`, delta: next - cost });
    cost = next;
  }
  if (hasModule(state, "bulk_hauler")) {
    const next = Math.max(0, cost - totalItems);
    steps.push({ label: "Bulk Hauler Rigging module", delta: next - cost });
    cost = next;
  }
  if (hasModule(state, "overdrive_engine")) {
    const next = Math.max(0, cost - 5);
    steps.push({ label: "Overdrive Engine module", delta: next - cost });
    cost = next;
  }
  if (hasModule(state, "silk_monopoly") && hasSilk) {
    steps.push({ label: "Silk Road Monopoly module (Silk freight waived)", delta: -cost });
    cost = 0;
  }
  return { base, steps, final: Math.max(0, cost) };
}

export function calcVAT(state: GameState, product: string, sellingPrice: number): number {
  const recipe = RECIPES[product];
  let matCost = 0;
  for (const [m, a] of Object.entries(recipe.materials)) {
    matCost += ((COMMODITIES[m].basePrice[0] + COMMODITIES[m].basePrice[1]) / 2) * a;
  }
  const workerCost = WAGES[recipe.worker_type];
  const taxable = sellingPrice - matCost - workerCost;
  if (taxable > 0) {
    let vat = Math.floor(taxable * 0.05);
    if (hasModule(state, "tax_evasion")) vat = Math.floor(vat * 0.5);
    return vat;
  }
  return 0;
}

// Display-only mirror of calcVAT above, same reasoning as
// explainTransportCost: the tooltip gets its own copy of the math instead
// of touching the function the actual sale relies on.
export function explainVAT(state: GameState, product: string, sellingPrice: number): PriceBreakdown {
  const recipe = RECIPES[product];
  let matCost = 0;
  for (const [m, a] of Object.entries(recipe.materials)) {
    matCost += ((COMMODITIES[m].basePrice[0] + COMMODITIES[m].basePrice[1]) / 2) * a;
  }
  const workerCost = WAGES[recipe.worker_type];
  const taxable = sellingPrice - matCost - workerCost;
  const steps: PriceStep[] = [
    { label: "Average material cost", delta: -matCost },
    { label: `${recipe.worker_type === "weaver" ? "Weaver" : recipe.worker_type === "master" ? "Master Weaver" : "Sachet Maker"} wage`, delta: -workerCost },
  ];
  if (taxable <= 0) return { base: sellingPrice, steps, final: 0 };
  let vat = Math.floor(taxable * 0.05);
  steps.push({ label: "5% VAT on the margin", delta: -vat });
  if (hasModule(state, "tax_evasion")) {
    const next = Math.floor(vat * 0.5);
    steps.push({ label: "Tax Evasion Ledger module (-50%)", delta: next - vat });
    vat = next;
  }
  return { base: sellingPrice, steps, final: vat };
}

export function calcIncomeTax(state: GameState, preTax: number): number {
  if (preTax <= 0) return 0;
  const rate = state.modifierFlags.income_tax_override || 0.1;
  let tax = Math.floor(preTax * rate);
  if (hasModule(state, "smugglers_hold")) tax = Math.floor(tax * 1.2);
  if (hasModule(state, "tax_evasion")) tax = Math.floor(tax * 0.5);
  return tax;
}

// At most one boon's modifiers are ever active at a time (selecting a new
// one replaces state.modifierFlags wholesale, see applyBoon), so finding
// whichever boon owns a given modifier key reliably names the source of a
// price adjustment for the breakdown below.
function boonNameForModifierKey(key: string): string {
  return BOONS.find((b) => key in b.modifiers)?.name ?? "Active boon";
}

export type PriceStep = { label: string; delta: number };
export type PriceBreakdown = { base: number; steps: PriceStep[]; final: number };

// The same math as getCardFinalCost, but reported as a step-by-step
// breakdown so the buying-phase tooltip can show exactly where a price
// came from: base cost, then whatever boon or module touched it.
export function explainCardPrice(state: GameState, card: ResourceCard): PriceBreakdown {
  const steps: PriceStep[] = [];
  let cost = card.totalCost;

  if (state.modifierFlags.purchase_discount) {
    const next = Math.floor(cost * (1 - state.modifierFlags.purchase_discount));
    steps.push({ label: `${boonNameForModifierKey("purchase_discount")} (-${Math.round(state.modifierFlags.purchase_discount * 100)}%)`, delta: next - cost });
    cost = next;
  }
  if (state.modifierFlags.hemp_price_reduction) {
    const reduction = card.resources.reduce((sum, r) => (r.type === "Hemp" ? sum + r.quantity! * state.modifierFlags.hemp_price_reduction : sum), 0);
    if (reduction > 0) {
      steps.push({ label: `${boonNameForModifierKey("hemp_price_reduction")} (-${state.modifierFlags.hemp_price_reduction}g/Hemp)`, delta: -reduction });
      cost -= reduction;
    }
  }
  if (hasModule(state, "smugglers_hold")) {
    const next = Math.floor(cost * 0.85);
    steps.push({ label: "Smuggler's Hold module (-15%)", delta: next - cost });
    cost = next;
  }

  const final = Math.max(0, cost);
  if (final !== cost) steps.push({ label: "Floor at 0 Gold", delta: final - cost });
  return { base: card.totalCost, steps, final };
}

export function getCardFinalCost(state: GameState, card: ResourceCard): number {
  return explainCardPrice(state, card).final;
}

export type ExpectedPrice = { min: number; max: number; isProduct: boolean; modifiers: string[] };

// A general "what does this typically cost" estimate for a raw material
// or product, independent of any specific market card. Used for the
// hover preview during the buying phase (Phase 1) so a captain can size
// up the whole market, including goods that didn't happen to roll onto
// one of this round's five cards. Ports nudge a raw material's roll by
// 1 Gold up or down depending on whether the port specializes in it
// (see genResourceCard), which is why the range carries a margin note
// instead of trying to fold that into the numbers themselves.
export function explainExpectedPrice(state: GameState, itemType: string): ExpectedPrice {
  const isResource = (RESOURCES as readonly string[]).includes(itemType);
  let [min, max] = isResource ? COMMODITIES[itemType].basePrice : PRODUCT_PRICES[itemType];
  const modifiers: string[] = [];

  if (isResource) {
    if (state.modifierFlags.purchase_discount) {
      const factor = 1 - state.modifierFlags.purchase_discount;
      min = Math.floor(min * factor);
      max = Math.floor(max * factor);
      modifiers.push(`${boonNameForModifierKey("purchase_discount")} (-${Math.round(state.modifierFlags.purchase_discount * 100)}%)`);
    }
    if (itemType === "Hemp" && state.modifierFlags.hemp_price_reduction) {
      min = Math.max(0, min - state.modifierFlags.hemp_price_reduction);
      max = Math.max(0, max - state.modifierFlags.hemp_price_reduction);
      modifiers.push(`${boonNameForModifierKey("hemp_price_reduction")} (-${state.modifierFlags.hemp_price_reduction}g/unit)`);
    }
    if (hasModule(state, "smugglers_hold")) {
      min = Math.floor(min * 0.85);
      max = Math.floor(max * 0.85);
      modifiers.push("Smuggler's Hold module (-15%)");
    }
  }

  return { min, max, isProduct: !isResource, modifiers };
}

export function getHireCost(state: GameState, type: string): number {
  let wage = WAGES[type];
  if (state.modifierFlags.hire_discount) wage = Math.floor(wage * (1 - state.modifierFlags.hire_discount));
  return wage;
}

// ---------- Order / Card generation ----------
// [ONLINE] These use a seeded RNG so the market is identical for every
// captain in the same room on the same voyage.
function genRawOrder(rng: Rng, filter: string | null = null): Omit<OrderCard, "id"> {
  const num = randInt(rng, 1, 3);
  const resources: { type: string; required: number }[] = [];
  const available = [...RESOURCES];
  const port = pick(rng, PORTS as readonly string[]);
  let total = 0;
  if (filter && (RESOURCES as readonly string[]).includes(filter)) {
    const req = randInt(rng, 2, 5);
    total += req;
    resources.push({ type: filter, required: req });
  } else {
    for (let i = 0; i < num; i++) {
      if (!available.length) break;
      const r = pick(rng, available);
      available.splice(available.indexOf(r), 1);
      const req = randInt(rng, 2, 5);
      total += req;
      resources.push({ type: r, required: req });
    }
  }
  const base = resources.reduce((s, r) => s + r.required * 5, 0);
  return { demandPort: port, resources, reward: base + randInt(rng, 10, 25), totalItems: total, isProductOrder: false };
}

function genProductOrder(rng: Rng, filter: string | null = null): Omit<OrderCard, "id"> {
  const product = filter && (PRODUCTS as readonly string[]).includes(filter) ? filter : pick(rng, PRODUCTS as readonly string[]);
  const req = randInt(rng, 1, 3);
  const port = pick(rng, PORTS as readonly string[]);
  const basePrice = randInt(rng, PRODUCT_PRICES[product][0], PRODUCT_PRICES[product][1]);
  return { demandPort: port, resources: [{ type: product, required: req }], reward: basePrice * req, totalItems: req, isProductOrder: true };
}

function genMixedOrder(state: GameState, rng: Rng): Omit<OrderCard, "id"> {
  if (state.revealedIntel.length && !state.intelOrderUsed) {
    const intel = pick(rng, state.revealedIntel);
    state.intelOrderUsed = true;
    if ((RESOURCES as readonly string[]).includes(intel.item)) return genRawOrder(rng, intel.item);
    if ((PRODUCTS as readonly string[]).includes(intel.item)) return genProductOrder(rng, intel.item);
  }
  return rng() < 0.5 ? genRawOrder(rng) : genProductOrder(rng);
}

function genProductPurchaseCard(rng: Rng): Omit<ResourceCard, "id"> {
  const product = pick(rng, PRODUCTS as readonly string[]);
  const qty = randInt(rng, 1, 2);
  const port = pick(rng, PORTS as readonly string[]);
  const recipe = RECIPES[product];
  let matCost = 0;
  const details: string[] = [];
  for (const [m, a] of Object.entries(recipe.materials)) {
    const avg = (COMMODITIES[m].basePrice[0] + COMMODITIES[m].basePrice[1]) / 2;
    matCost += avg * a;
    details.push(`${m}×${a}`);
  }
  const markup = 1.4 + rng() * 0.4;
  let unitPrice = Math.floor(matCost * markup);
  const [min, max] = PRODUCT_PRICES[product];
  unitPrice = Math.max(min, Math.min(unitPrice, max));
  return {
    port,
    resources: [{ type: product, quantity: qty, price: unitPrice, materialCost: matCost, materialDetails: details.join(" + ") }],
    totalCost: unitPrice * qty,
    isProductCard: true,
  };
}

function genResourceCard(rng: Rng): Omit<ResourceCard, "id"> {
  if (rng() < 0.3) return genProductPurchaseCard(rng);
  const num = randInt(rng, 1, 3);
  const resources: { type: string; quantity: number; price: number }[] = [];
  const available = Object.keys(RESOURCE_PROBS);
  const probs = Object.values(RESOURCE_PROBS);
  const port = pick(rng, PORTS as readonly string[]);
  for (let i = 0; i < num; i++) {
    if (!available.length) break;
    let r = rng(),
      acc = 0,
      chosen = available[0];
    for (let j = 0; j < available.length; j++) {
      acc += probs[j];
      if (r <= acc) {
        chosen = available[j];
        break;
      }
    }
    const idx = available.indexOf(chosen);
    available.splice(idx, 1);
    probs.splice(idx, 1);
    const qty = randInt(rng, 1, 3);
    const [min, max] = COMMODITIES[chosen].basePrice;
    const base = randInt(rng, min, max);
    const price = COMMODITIES[chosen].ports.includes(port) ? base - 1 : base + 1;
    resources.push({ type: chosen, quantity: qty, price });
  }
  const total = resources.reduce((s, r) => s + r.quantity * r.price, 0);
  return { port, resources, totalCost: total, isProductCard: false };
}

// ---------- Boon drafting (preserved verbatim, personalized per captain) ----------
export function draftBoons(state: GameState): Boon[] {
  const gs = {
    money: state.money,
    inventory: state.inventory,
    weavers: state.weavers,
    master_weavers: state.masterWeavers,
    sachet_makers: state.sachetMakers,
  };
  const weightFuncs: Record<string, () => number> = {
    silk_wind: () => (gs.inventory["Silk"] || 0) > 2 || gs.master_weavers.length > 0 ? 2.5 : 0.8,
    favorable_tides: () => 1.5,
    merchant_charm: () => (gs.money > 40 ? 2.0 : 0.5),
    artisan_inspiration: () => (gs.weavers.length + gs.master_weavers.length + gs.sachet_makers.length > 0 ? 3.0 : 0.0),
    emergency_loan: () => (gs.money < 30 ? 4.0 : 0.2),
    tax_shelter: () => 1.5,
    hemp_monopoly: () => (gs.inventory["Hemp"] || 0) < 5 || gs.weavers.length > 0 ? 2.0 : 1.0,
    master_apprentice: () => 1.5,
  };
  const available = BOONS.map((b) => [b, weightFuncs[b.id]()] as [Boon, number]).filter(([, w]) => w > 0);
  const picks: Boon[] = [];
  const pool = [...available];
  for (let i = 0; i < 3; i++) {
    if (!pool.length) break;
    const chosen = weightedPick(Math.random, pool);
    picks.push(chosen);
    pool.splice(pool.findIndex((x) => x[0].id === chosen.id), 1);
  }
  return picks;
}

// ---------- Game actions (preserved verbatim log messages) ----------
export function applyBoon(state: GameState, boon: Boon, logs: string[]) {
  state.modifierFlags = boon.modifiers;
  if (boon.modifiers.instant_gold) {
    state.money += boon.modifiers.instant_gold;
    logs.push(`💰 Boon applied: Gained ${boon.modifiers.instant_gold} Gold!`);
  }
}

export function purchaseCard(state: GameState, cardId: number, logs: string[]) {
  const card = state.resourceCards.find((c) => c.id === cardId);
  if (!card) return;
  if (state.purchasedCards.includes(card.id)) return;
  const cost = getCardFinalCost(state, card);
  if (state.money < cost) {
    logs.push(`❌ Insufficient funds! Need ${cost} Gold, Have ${state.money} Gold`);
    return;
  }
  state.money -= cost;
  state.roundCosts += cost;
  state.totalCosts += cost;
  for (const r of card.resources) state.inventory[r.type] += r.quantity!;
  state.purchasedCards.push(card.id);
  state.purchaseCount++;
  if (card.isProductCard) {
    const r = card.resources[0];
    logs.push(
      `🛒 Bought Product at ${card.port}: ${ICONS[r.type]}${r.type}×${r.quantity} (@${r.price} Gold/item, Mat Cost ${r.materialCost} Gold), Total ${cost} Gold`,
    );
    logs.push("   💡 Tip: VAT applies when selling finished products");
  } else {
    const txt = card.resources.map((r) => `${ICONS[r.type]}${r.type}×${r.quantity}(${r.price} Gold/item)`).join(" + ");
    logs.push(`🛒 Bought at ${card.port}: ${txt}, Total ${cost} Gold`);
    if (cost < card.totalCost) logs.push(`   ✨ Boon Discount Applied! Saved ${card.totalCost - cost} Gold`);
  }
  logs.push(`📊 Purchased ${state.purchaseCount} cargo batches`);
}

export function completeOrder(state: GameState, orderId: number, logs: string[]) {
  const order = state.customerCards.find((o) => o.id === orderId);
  if (!order) return;
  if (state.completedOrders.includes(order.id)) return;
  for (const r of order.resources) {
    if ((state.inventory[r.type] || 0) < r.required!) {
      logs.push(`❌ Inventory short! Need ${r.type}×${r.required}`);
      return;
    }
  }
  const hasSilk = order.resources.some((r) => ["Silk", "Brocade", "Sachet", "Cotton Clothes"].includes(r.type));
  let transport = calcTransportCost(state, order.totalItems, hasSilk);
  for (const r of order.resources) state.inventory[r.type] -= r.required!;
  let reward = order.reward;
  let totalVat = 0;
  if (order.isProductOrder) {
    const product = order.resources[0].type;
    const unitVat = calcVAT(state, product, reward / order.resources[0].required!);
    totalVat = unitVat * order.resources[0].required!;
    reward -= totalVat;
    state.vatPaid += totalVat;
    logs.push(`🧾 Product Sales VAT: ${totalVat} Gold`);
  }
  state.money -= transport;
  state.roundCosts += transport;
  state.totalCosts += transport;
  const origTransport = transport;
  if (hasModule(state, "silk_monopoly") && hasSilk) {
    reward = Math.floor(reward * 1.2);
    logs.push("👘 Silk Monopoly: +20% Reward!");
  }
  if (hasModule(state, "salvage_crane") && Math.random() < 0.3) {
    state.money += transport;
    logs.push(`♻️ Salvage Crane: Refunded ${transport} Gold transport!`);
    transport = 0;
  }
  if (hasModule(state, "tax_evasion") && Math.random() < 0.15) {
    state.money -= 20;
    logs.push("🚨 AUDIT! Tax Evasion Ledger triggered. Lost 20 Gold!");
  }
  if (transport !== origTransport) {
    const diff = origTransport - transport;
    state.money += diff;
    state.roundCosts -= diff;
    state.totalCosts -= diff;
  }
  state.money += reward;
  state.roundRevenue += reward;
  state.totalRevenue += reward;
  state.score += Math.floor(reward - transport);
  state.completedOrders.push(order.id);
  state.orderCount++;
  const txt = order.resources.map((r) => `${ICONS[r.type]}${r.type}×${r.required}`).join(" + ");
  logs.push(`📦 Completed Order at ${order.demandPort}: ${txt}`);
  logs.push(`   💰 Reward: ${reward} Gold - ⚓ Freight: ${transport} Gold = 📊 Net Profit: ${reward - transport} Gold`);
  logs.push(`📊 Completed ${state.orderCount} transactions`);
}

export function hireWorker(state: GameState, type: string, logs: string[]) {
  const wage = getHireCost(state, type);
  if (state.money < wage) {
    logs.push("❌ Insufficient funds to hire workers!");
    return;
  }
  const names: Record<string, string> = { weaver: "Weaver", master: "Master Weaver", sachet_maker: "Sachet Maker" };
  const icons: Record<string, string> = { weaver: "👩‍🔧", master: "👩‍🎨", sachet_maker: "🌸" };
  const list = type === "weaver" ? state.weavers : type === "master" ? state.masterWeavers : state.sachetMakers;
  list.push({ task: null, progress: 0, producedCount: 0, isSkilled: false });
  logs.push(`${icons[type]} Hired a ${names[type]}! Wage: ${wage} Gold / Round (paid at round end)`);
}

export function fireWorker(state: GameState, type: string, idx: number, logs: string[]) {
  const list = type === "weaver" ? state.weavers : type === "master" ? state.masterWeavers : state.sachetMakers;
  const wage = WAGES[type];
  const names: Record<string, string> = { weaver: "Weaver", master: "Master Weaver", sachet_maker: "Sachet Maker" };
  if (idx < 0 || idx >= list.length) return;
  if (state.money < wage) {
    logs.push(`❌ Insufficient funds for ${names[type]}'s severance: ${wage} Gold`);
    return;
  }
  state.money -= wage;
  const worker = list.splice(idx, 1)[0];
  logs.push(`💔 Dismissed a ${names[type]}. Severance: ${wage} Gold`);
  if (worker.task) logs.push(`  This worker was making: ${worker.task}`);
}

export function assignTask(state: GameState, type: string, task: string, logs: string[]) {
  const list = type === "weaver" ? state.weavers : type === "master" ? state.masterWeavers : state.sachetMakers;
  const recipe = RECIPES[task];
  for (const worker of list) {
    if (worker.task === null) {
      let can = true;
      for (const [m, a] of Object.entries(recipe.materials))
        if ((state.inventory[m] || 0) < a) {
          can = false;
          break;
        }
      if (!can) {
        logs.push(`❌ Material shortage to produce ${task}!`);
        return;
      }
      for (const [m, a] of Object.entries(recipe.materials)) state.inventory[m] -= a;
      worker.task = task;
      worker.progress = 0;
      const matTxt = Object.entries(recipe.materials)
        .map(([m, a]) => `${ICONS[m]}${m}×${a}`)
        .join(" + ");
      logs.push(`📋 Assigned: Produce ${ICONS[task]}${task} (Req: ${matTxt})`);
      return;
    }
  }
  logs.push("❌ All workers are already assigned tasks!");
}

export function processProduction(state: GameState, logs: string[]) {
  const bonus = state.modifierFlags.worker_bonus_production || 0;
  const allLists: { list: GameState["weavers"]; name: string; type: string }[] = [
    { list: state.weavers, name: "Weaver", type: "weaver" },
    { list: state.masterWeavers, name: "Master", type: "master" },
    { list: state.sachetMakers, name: "Maker", type: "sachet_maker" },
  ];
  for (const { list, name } of allLists) {
    for (const w of list) {
      if (w.task) {
        let base = w.isSkilled ? 2 : 1;
        let amt = base + bonus;
        if (hasModule(state, "artisans_workshop")) amt += 1;
        state.inventory[w.task] = (state.inventory[w.task] || 0) + amt;
        w.producedCount = (w.producedCount || 0) + amt;
        if (amt > base) logs.push(`✅ Skilled ${name} finished ${amt}× ${ICONS[w.task]}${w.task}! (Boon Bonus)`);
        else if (w.isSkilled) logs.push(`✅ Skilled ${name} finished 2× ${ICONS[w.task]}${w.task}!`);
        else logs.push(`✅ ${name} finished ${ICONS[w.task]}${w.task}!`);
        if (w.producedCount >= 2 && !w.isSkilled) {
          w.isSkilled = true;
          logs.push(`⭐ ${name} Promotion! Can now produce 2 items per round!`);
        }
        w.task = null;
        w.progress = 0;
      }
    }
  }
}

export function payWages(state: GameState, logs: string[]): true | "bankruptcy" {
  let total = 0;
  const countWorkers = (list: GameState["weavers"], type: string) => {
    let w = 0;
    for (const _ of list) {
      let wage = WAGES[type];
      if (hasModule(state, "artisans_workshop")) wage = Math.floor(wage * 1.2);
      w += wage;
    }
    return w;
  };
  const ww = countWorkers(state.weavers, "weaver");
  const mw = countWorkers(state.masterWeavers, "master");
  const sw = countWorkers(state.sachetMakers, "sachet_maker");
  total = ww + mw + sw;
  if (total === 0) return true;
  if (state.money >= total) {
    state.money -= total;
    state.workerWages += total;
    state.roundCosts += total;
    if (ww > 0) logs.push(`💰 Paid wages for ${state.weavers.length} Weavers: ${ww} Gold`);
    if (mw > 0) logs.push(`💰 Paid wages for ${state.masterWeavers.length} Masters: ${mw} Gold`);
    if (sw > 0) logs.push(`💰 Paid wages for ${state.sachetMakers.length} Makers: ${sw} Gold`);
    return true;
  }
  logs.push(`⚠️ Insufficient funds! Needed: ${total} Gold, Have: ${state.money} Gold`);
  logs.push("💥 Could not pay wages, workers strike...");
  logs.push("💥 Reputation collapsed, forced bankruptcy!");
  return "bankruptcy";
}

export function payMaintenance(state: GameState, logs: string[]): true | "bankruptcy" {
  const cost = state.fixedCost + state.maintenancePenalty;
  if (state.money >= cost) {
    state.money -= cost;
    state.maintenanceCosts += cost;
    state.roundCosts += cost;
    state.totalCosts += cost;
    logs.push(`💸 Paid Ship Maintenance Fee: ${cost} Gold`);
    return true;
  }
  if (state.money > 0) {
    const paid = state.money;
    state.money = 0;
    state.maintenanceCosts += paid;
    state.roundCosts += paid;
    state.totalCosts += paid;
    logs.push(`⚠️ Forced payment of ${paid} Gold (Needed ${cost} Gold)`);
    logs.push("⚠️ Funds depleted! Cannot continue sailing...");
    return "bankruptcy";
  }
  return "bankruptcy";
}

export function endRound(state: GameState, logs: string[]) {
  logs.push(`\n📊=== Round ${state.currentRound} Settlement ===`);
  logs.push(`💰 Revenue this round: ${state.roundRevenue} Gold`);
  const totalCost = state.roundCosts + state.maintenanceCosts + state.workerWages;
  logs.push(`💸 Total Cost this round: ${totalCost} Gold`);
  logs.push(`   🔧 Maintenance: ${state.maintenanceCosts} Gold`);
  logs.push(`   📦 Materials: ${state.materialCosts} Gold`);
  logs.push(`   👥 Wages: ${state.workerWages} Gold`);
  const preTax = state.roundRevenue - totalCost;
  logs.push(`📈 Pre-tax Profit: ${preTax} Gold`);
  const tax = calcIncomeTax(state, preTax);
  if (tax > 0) {
    state.money -= tax;
    state.incomeTaxPaid += tax;
    const rate = (state.modifierFlags.income_tax_override || 0.1) * 100;
    logs.push(`🏛️ Income Tax Paid (${rate.toFixed(0)}%): ${tax} Gold`);
  } else logs.push("🏛️ No profit, no income tax due");
  if (state.vatPaid > 0) logs.push(`🧾 VAT Paid this round: ${state.vatPaid} Gold`);

  state.modifierFlags = {};
  state.phase2DemandTags = [];
  state.revealedIntel = [];
  state.intelOrderUsed = false;
  state.roundRevenue = 0;
  state.roundCosts = 0;
  state.maintenanceCosts = 0;
  state.materialCosts = 0;
  state.workerWages = 0;
  state.currentRound++;
  if (state.currentRound > state.maxRounds) {
    settleOutstandingDebts(state, logs);
    endGame(state, logs);
    return;
  }
  logs.push(`\n🔄=== Preparing for Round ${state.currentRound} ===`);
  state.phase = 0;
  state.purchaseCount = 0;
  state.orderCount = 0;
  state.resourceCards = [];
  state.customerCards = [];
  state.purchasedCards = [];
  state.completedOrders = [];
  startBoonDrafting(state, logs);
}

export function purchaseIntel(state: GameState, logs: string[]) {
  if (!state.phase2DemandTags.length) {
    logs.push("🔮 The Broker has no more whispers...");
    return;
  }
  if (state.money < state.intelCost) {
    logs.push(`❌ Need ${state.intelCost} Gold for a rumor`);
    return;
  }
  const count = hasModule(state, "brokers_network") ? 2 : 1;
  for (let i = 0; i < count; i++) {
    if (!state.phase2DemandTags.length) break;
    const item = state.phase2DemandTags[Math.floor(Math.random() * state.phase2DemandTags.length)];
    state.phase2DemandTags.splice(state.phase2DemandTags.indexOf(item), 1);
    const port = PORTS[Math.floor(Math.random() * PORTS.length)];
    state.revealedIntel.push({ item, port });
    logs.push(`🗣️ Broker's Whisper: 'Word from ${port}: High demand for ${item}!'`);
    state.money -= state.intelCost;
  }
}

export function upgradeShip(state: GameState, logs: string[]) {
  if (state.shipLevel >= 3) return;
  const cost = state.shipUpgradeCost[state.shipLevel] + state.shipUpgradePenalty;
  if (state.money < cost) {
    logs.push(`❌ Need ${cost} Gold to upgrade the ship`);
    return;
  }
  state.money -= cost;
  state.shipLevel++;
  logs.push(`🎉 Ship Upgraded to Level ${state.shipLevel}! +1 Module Slot, +5 Discount`);
}

export function equipModule(state: GameState, mod: Module, swapIdx: number | null, logs: string[]) {
  if (swapIdx !== null) {
    const old = state.equippedModules[swapIdx];
    if (old.id === "bulk_hauler") state.shipUpgradePenalty -= 15;
    if (old.id === "overdrive_engine") state.maintenancePenalty -= 10;
    if (old.id === "brokers_network") state.intelCost = 5;
    state.equippedModules[swapIdx] = mod;
    logs.push(`🔄 Swapped ${old.name} for ${mod.name}!`);
  } else {
    if (state.equippedModules.length < state.shipLevel) {
      state.equippedModules.push(mod);
      logs.push(`✅ Installed ${mod.name}!`);
    } else {
      logs.push("❌ No empty slots! Must swap.");
      return;
    }
  }
  if (mod.id === "bulk_hauler") state.shipUpgradePenalty += 15;
  if (mod.id === "overdrive_engine") state.maintenancePenalty += 10;
  if (mod.id === "brokers_network") state.intelCost = 2;
}

// ---------- Phase management ----------
// The start of every round (see endRound, the initial "room:started" call,
// and snapToCheckpoint's "5" case), so this is also the one place that
// resets the once-per-round swap allowances and rolls a fresh, fixed boon
// pool. Module choices are reset here too (by clearing _draftChoices back
// to "not yet rolled") even though they're drafted later in the round, in
// Phase 4, since this is the only point guaranteed to run exactly once per
// round regardless of how a captain reaches it.
export function startBoonDrafting(state: GameState, logs: string[]) {
  state.phase = 5;
  state.boonSwapUsed = false;
  state.moduleSwapUsed = false;
  state._draftChoices = undefined;
  state.boonChoices = draftBoons(state);
  state.pirateAttackResolved = false;
  state.escortHired = false;
  logs.push("\n🧭=== The Navigator's Compass ===");
  logs.push("Choose a Boon to bend the rules of the upcoming voyage...");
}

// Rerolls the current boon pool for 10 Gold, once per round. The fee (and
// the cap) exist so a captain can correct for genuinely bad luck without
// being able to free-reroll until the pool happens to contain whatever
// they want, see the matching swapModuleChoices below for the no-cost
// equivalent on the module side, where the scarcity is the equippable
// slots rather than a gold sink.
export function swapBoonChoices(state: GameState, logs: string[]) {
  if (state.boonSwapUsed) {
    logs.push("❌ You've already swapped your boon choices this round");
    return;
  }
  if (state.money < 10) {
    logs.push("❌ Need 10 Gold to swap boon choices");
    return;
  }
  state.money -= 10;
  state.boonChoices = draftBoons(state);
  state.boonSwapUsed = true;
  logs.push("🔄 Swapped Boon Choices for 10 Gold");
}

export function selectBoon(state: GameState, ctx: GameContext, boonId: string, logs: string[]) {
  const boon = BOONS.find((b) => b.id === boonId);
  if (!boon) return;
  logs.push(`🧭 Boon Locked In: ${boon.icon} ${boon.name}`);
  applyBoon(state, boon, logs);
  state.boonChoices = [];
  startPhase1(state, ctx, logs);
}

export function startPhase1(state: GameState, ctx: GameContext, logs: string[]) {
  state.phase = 1;
  state.purchaseCount = 0;
  state.purchasedCards = [];
  state.phase2DemandTags = [];
  // [ONLINE] Deterministic intel pool per (room, round).
  const intelRng = createRng(`${ctx.seedBase}:R${state.currentRound}:intel`);
  const allItems = [...RESOURCES, ...PRODUCTS];
  for (let i = 0; i < 5; i++) {
    let t = pick(intelRng, allItems as readonly string[]);
    if (!state.phase2DemandTags.includes(t)) state.phase2DemandTags.push(t);
  }
  state.revealedIntel = [];
  state.intelOrderUsed = false;
  logs.push(`\n⚓=== Round ${state.currentRound} - Phase 1: Port Purchase ===`);
  logs.push(`💰 Current Funds: ${state.money} Gold`);
  // [ONLINE] Deterministic port market per (room, round).
  const marketRng = createRng(`${ctx.seedBase}:R${state.currentRound}:market`);
  state.resourceCards = [];
  for (let i = 0; i < 5; i++) {
    state.resourceCards.push({ id: i, ...genResourceCard(marketRng) });
  }
}

export function completePhase1(state: GameState, logs: string[]) {
  if (state.purchaseCount === 0) logs.push("⏭️ Purchasing skipped");
  else logs.push(`✅ Purchasing ended, bought ${state.purchaseCount} batches`);
  state.phase = "barter";
}

// ---------- Bartering ----------
// Posting an offer escrows the offered amount immediately (deducted on the
// spot, the same way buying a card spends gold right away), so a captain
// can't post the same Hemp in two offers at once and double-spend it once
// both get accepted. Returns true on success; false (with a log line, no
// state change) if any of the four barter constraints are violated.
export function postBarterOffer(
  state: GameState,
  offerItem: string,
  offerAmount: number,
  requestItem: string,
  requestAmount: number,
  logs: string[],
): boolean {
  if (offerItem === requestItem) {
    logs.push("❌ Can't barter an item for itself");
    return false;
  }
  if (!Number.isInteger(offerAmount) || !Number.isInteger(requestAmount) || offerAmount < 1 || requestAmount < 1) {
    logs.push("❌ Barter amounts must be whole numbers of at least 1");
    return false;
  }
  const owned = getOwnedAmount(state, offerItem);
  if (offerAmount > owned) {
    logs.push(`❌ Can't offer ${offerAmount} ${offerItem}, only have ${owned}`);
    return false;
  }
  addOwnedAmount(state, offerItem, -offerAmount);
  logs.push(`🤝 Posted a barter offer: ${offerAmount} ${offerItem} for ${requestAmount} ${requestItem}`);
  return true;
}

// Returns an escrowed offer to its owner: a canceled offer, or one swept
// up unaccepted when the bartering phase ends.
export function refundBarterOffer(state: GameState, offerItem: string, offerAmount: number, logs: string[]) {
  addOwnedAmount(state, offerItem, offerAmount);
  logs.push(`↩️ Barter offer withdrawn, ${offerAmount} ${offerItem} returned`);
}

// The accepting side of a completed trade: pay the requested item, then
// receive the offered one. The offer's own amounts were already validated
// when it was posted, so the only thing left to check here is that this
// captain actually has enough of the requested item to pay it.
export function acceptBarterOffer(
  state: GameState,
  requestItem: string,
  requestAmount: number,
  offerItem: string,
  offerAmount: number,
  logs: string[],
): boolean {
  const owned = getOwnedAmount(state, requestItem);
  if (requestAmount > owned) {
    logs.push(`❌ Can't pay ${requestAmount} ${requestItem}, only have ${owned}`);
    return false;
  }
  addOwnedAmount(state, requestItem, -requestAmount);
  addOwnedAmount(state, offerItem, offerAmount);
  logs.push(`🤝 Traded ${requestAmount} ${requestItem} for ${offerAmount} ${offerItem}`);
  return true;
}

// The posting side of a completed trade: the offered item was already
// escrowed away in postBarterOffer, so all that's left is to receive
// whatever was requested in return.
export function settleBarterTrade(state: GameState, requestItem: string, requestAmount: number, logs: string[]) {
  addOwnedAmount(state, requestItem, requestAmount);
  logs.push(`🤝 Barter offer accepted, received ${requestAmount} ${requestItem}`);
}

export function completeBarterPhase(state: GameState, refunds: { item: string; amount: number }[], logs: string[]) {
  for (const r of refunds) refundBarterOffer(state, r.item, r.amount, logs);
  logs.push(refunds.length ? "✅ Bartering ended, unmatched offers returned" : "⏭️ Bartering ended");
  state.phase = "worker_mgmt";
}

export function startPhase2(state: GameState, ctx: GameContext, logs: string[]) {
  state.phase = 2;
  state.orderCount = 0;
  state.completedOrders = [];
  logs.push(`\n🤝=== Round ${state.currentRound} - Phase 2: Trade Transaction ===`);
  // [ONLINE] Deterministic trade orders per (room, round).
  const orderRng = createRng(`${ctx.seedBase}:R${state.currentRound}:orders`);
  state.customerCards = [];
  for (let i = 0; i < 5; i++) {
    state.customerCards.push({ id: i, ...genMixedOrder(state, orderRng) });
  }
}

export function completePhase2(state: GameState, logs: string[]) {
  if (state.orderCount === 0) logs.push("⏭️ Trading skipped");
  else logs.push(`✅ Trading ended, completed ${state.orderCount} trades`);
  startPhase3(state, logs);
}

export function startPhase3(state: GameState, logs: string[]) {
  state.phase = 3;
  logs.push("\n👥=== Processing Worker Production ===");
  processProduction(state, logs);
}

// Resolved once per round, right after production and before wages or
// maintenance come due, so a hit here can be exactly what tips a captain
// into needing the financial aid request below. Personal luck, the same
// as the Salvage Crane refund or the Tax Evasion audit elsewhere in this
// file: rolled client-side, never a room-wide checkpoint.
export function resolvePirateAttack(state: GameState, logs: string[]) {
  if (state.pirateAttackResolved) return;
  state.pirateAttackResolved = true;
  if (Math.random() < PIRATE_ATTACK_CHANCE) {
    const lost = state.money;
    state.money = 0;
    logs.push(`🏴‍☠️ Pirates raided your hold! Lost all ${lost} Gold.`);
  } else {
    logs.push("🌊 Clear seas. No pirates sighted this round.");
  }
}

// Guarantees safety from the roll above for a share of current Gold,
// instead of risking it. Only available before the attack resolves;
// resolving it the other way (the function above) is what closes this
// off for the round, same as resolving it here closes off that one.
export function hireEscort(state: GameState, logs: string[]) {
  if (state.pirateAttackResolved) {
    logs.push("❌ Too late, this round's waters are already resolved");
    return;
  }
  const cost = Math.floor(state.money * ESCORT_COST_RATE);
  state.money -= cost;
  state.escortHired = true;
  state.pirateAttackResolved = true;
  logs.push(`🛡️ Hired an escort for ${cost} Gold. Safe passage guaranteed this round.`);
}

// Pays wages then maintenance in one confirmed step (the financial aid
// request, if a captain needed one, has already happened by the time this
// is called), bankrupting only if either still can't be covered. Replaces
// the old split where wages were deducted the instant Phase 3 started and
// only maintenance waited for a click, since that split left no room for
// a captain to react before wages alone could force a bankruptcy.
export function finishSettlement(state: GameState, logs: string[]) {
  logs.push("\n💰=== Paying Worker Wages ===");
  const wageResult = payWages(state, logs);
  if (wageResult === "bankruptcy") {
    state.gameOver = true;
    state.phase = "bankruptcy";
    return;
  }
  logs.push(`\n🔧=== Round ${state.currentRound} - Phase 3: Ship Maintenance ===`);
  const maintResult = payMaintenance(state, logs);
  if (maintResult === "bankruptcy") {
    state.gameOver = true;
    state.phase = "bankruptcy";
    return;
  }
  startPhase4(state, logs);
}

// ---------- Financial aid between captains ----------
// A loan is real cross-player state, the same category of problem as a
// barter trade: both sides need to agree it happened, but neither side's
// Gold total is this server's to know, so it's settled the same way a
// barter trade is. Posting a request and finding one to help happen over
// the aid:* socket events (src/server/realtime.ts, src/lib/use-aid.ts);
// these four are just the local Gold/ledger half of each step.
export function receiveLoan(
  state: GameState,
  loan: { id: string; fromUserId: string; fromName: string; amount: number },
  logs: string[],
) {
  state.money += loan.amount;
  state.debts.push({ id: loan.id, counterpartyId: loan.fromUserId, counterpartyName: loan.fromName, amount: loan.amount, roundBorrowed: state.currentRound });
  logs.push(`🆘 ${loan.fromName} lent you ${loan.amount} Gold. Repay it before the voyage ends, or it's deducted automatically.`);
}

export function grantLoan(
  state: GameState,
  loan: { id: string; borrowerId: string; borrowerName: string; amount: number },
  logs: string[],
) {
  state.money -= loan.amount;
  state.loansGiven.push({ id: loan.id, counterpartyId: loan.borrowerId, counterpartyName: loan.borrowerName, amount: loan.amount, roundBorrowed: state.currentRound });
  const repGain = Math.max(1, Math.floor(loan.amount * AID_REPUTATION_PER_GOLD));
  state.score += repGain;
  logs.push(`🤝 Lent ${loan.borrowerName} ${loan.amount} Gold. Reputation +${repGain} for helping a fellow captain.`);
}

// Voluntary, captain-initiated repayment. The caller (GameRoom.tsx) reads
// the debt's amount and lender from state.debts before calling this, the
// same already-known-values pattern the Bartering panel uses for posting
// an offer, so it can relay the matching aid:repay itself right after.
export function repayLoan(state: GameState, debtId: string, logs: string[]) {
  const debt = state.debts.find((d) => d.id === debtId);
  if (!debt) return;
  if (state.money < debt.amount) {
    logs.push(`❌ Need ${debt.amount} Gold to repay ${debt.counterpartyName}, have ${state.money}`);
    return;
  }
  state.money -= debt.amount;
  state.debts = state.debts.filter((d) => d.id !== debtId);
  logs.push(`💰 Repaid ${debt.counterpartyName}: ${debt.amount} Gold`);
}

// The lender's side of either a voluntary repayment or a forced one (see
// settleOutstandingDebts below); both arrive the same way, over aid:repay.
export function receiveRepayment(state: GameState, debtId: string, amount: number, fromName: string, logs: string[]) {
  state.loansGiven = state.loansGiven.filter((l) => l.id !== debtId);
  state.money += amount;
  logs.push(`💰 ${fromName} repaid you ${amount} Gold`);
}

// Called once, at the true end of Round 8 (see endRound below), never
// before: any loan a captain hasn't already repaid by then gets forced
// through, paying whatever can be covered. Falling short of the full
// amount owed is what flags defaultedDebt for the endgame screen, rather
// than bankrupting mid-voyage, since by this point the voyage is ending
// for everyone regardless.
export function settleOutstandingDebts(state: GameState, logs: string[]) {
  if (!state.debts.length) return;
  logs.push("\n📋=== Settling Outstanding Loans ===");
  const settlements: { lenderId: string; lenderName: string; amount: number; debtId: string }[] = [];
  for (const debt of state.debts) {
    const paid = Math.min(state.money, debt.amount);
    state.money -= paid;
    if (paid > 0) settlements.push({ lenderId: debt.counterpartyId, lenderName: debt.counterpartyName, amount: paid, debtId: debt.id });
    if (paid < debt.amount) {
      state.defaultedDebt = true;
      logs.push(`⚠️ Could not fully repay ${debt.counterpartyName}: paid ${paid} of ${debt.amount} Gold owed`);
    } else {
      logs.push(`💰 Settled outstanding loan to ${debt.counterpartyName}: ${paid} Gold`);
    }
  }
  state.debts = [];
  state._pendingDebtSettlements = [...(state._pendingDebtSettlements ?? []), ...settlements];
}

export function startPhase4(state: GameState, logs: string[]) {
  state.phase = 4;
  logs.push(`\n🚢=== Round ${state.currentRound} - Phase 4: Shipyard & Modules ===`);
}

export function skipUpgrade(state: GameState, logs: string[]) {
  logs.push("⏭️ Skipped Shipyard Actions");
  endRound(state, logs);
}

export function endGame(state: GameState, logs: string[]) {
  state.gameOver = true;
  state.phase = "endgame";
  logs.push("\n" + "=".repeat(50));
  logs.push(`🎮 ${APP_NAME} - Game Over!`);
  logs.push(`💰 Final Funds: ${state.money} Gold`);
  logs.push(`🏆 Final Reputation: ${state.score}`);
  logs.push(`🧾 Total Taxes Paid: ${state.vatPaid + state.incomeTaxPaid} Gold`);
  let rating: string;
  if (state.defaultedDebt) rating = "💥 Bankrupt: Defaulted on a Loan";
  else if (state.score >= 300) rating = "👑 King of Silk Road";
  else if (state.score >= 200) rating = "🏆 Maritime Tycoon";
  else if (state.score >= 100) rating = "⭐ Successful Merchant";
  else if (state.score >= 50) rating = "👍 Qualified Trader";
  else rating = "🌊 Novice Merchant";
  logs.push(`📈 Rank: ${rating}`);
  logs.push("=".repeat(50));
}

export function restartGame(state: GameState, logs: string[]) {
  const fresh = createInitialGameState();
  Object.assign(state, fresh);
  logs.length = 0;
  showWelcome(state, logs);
}

export function showWelcome(state: GameState, logs: string[]) {
  state.phase = 0;
  logs.push("=".repeat(50));
  logs.push(`⚓ Welcome to ${APP_NAME}!`);
  logs.push("🚢 Sail across ports, build your business empire!");
  logs.push("👥 Hire artisans to craft valuable goods for higher profits!");
  logs.push("=".repeat(50));
}

export function nextPhase(state: GameState, ctx: GameContext, logs: string[]) {
  if (state.phase === 1) completePhase1(state, logs);
  // No refunds here: this generic fallback is only reached via the
  // control-bar "Next Phase" button / Ctrl+N, which a captain who has
  // actually posted a barter offer wouldn't use without first visiting the
  // Bartering phase panel itself (whose own "Done Bartering" button passes
  // the real refund list, see GamePhasePanel.tsx).
  else if (state.phase === "barter") completeBarterPhase(state, [], logs);
  else if (state.phase === "worker_mgmt") startPhase2(state, ctx, logs);
  else if (state.phase === 2) completePhase2(state, logs);
  else if (state.phase === 3) {
    if (!state.pirateAttackResolved) resolvePirateAttack(state, logs);
    else finishSettlement(state, logs);
  } else if (state.phase === 4) skipUpgrade(state, logs);
}

// ---------- Module drafting ----------
function rollModuleChoices(state: GameState): Module[] {
  const available = MODULES.filter((m) => !state.equippedModules.some((eq) => eq.id === m.id));
  const pool = available.length >= 3 ? available : MODULES;
  const picks: Module[] = [];
  const copy = [...pool];
  for (let i = 0; i < 3; i++) {
    if (!copy.length) break;
    const idx = Math.floor(Math.random() * copy.length);
    picks.push(copy.splice(idx, 1)[0]);
  }
  return picks;
}

// Only rolls a fresh pool the first time this is called for the round
// (state._draftChoices reset to undefined by startBoonDrafting above).
// Reopening the draft screen afterwards, including via the
// Back-to-Shipyard-then-Draft-again loop this whole system exists to
// close off, just reshows whatever the round already has on offer.
export function startModuleDrafting(state: GameState) {
  if (state._draftChoices === undefined) {
    state._draftChoices = rollModuleChoices(state);
  }
  state.phase = "module_draft";
}

// Rerolls the current module pool, once per round, at no cost (unlike the
// boon swap, the scarce resource here is the equippable slots themselves,
// not gold). Available whether or not the pool's already been picked from.
export function swapModuleChoices(state: GameState, logs: string[]) {
  if (state.moduleSwapUsed) {
    logs.push("❌ You've already swapped your module choices this round");
    return;
  }
  if (!state._draftChoices?.length) {
    logs.push("❌ Nothing to swap, draft your modules first");
    return;
  }
  state._draftChoices = rollModuleChoices(state);
  state.moduleSwapUsed = true;
  logs.push("🔄 Swapped Module Choices for a fresh batch");
}

export function handleModuleSelect(state: GameState, idx: number, logs: string[]) {
  const mod = state._draftChoices?.[idx];
  if (!mod) return;
  if (state.equippedModules.length < state.shipLevel) {
    equipModule(state, mod, null, logs);
    // Direct installs resolve immediately, so the pick is final: drop it
    // from the pool now. A pick that instead needs a slot freed up (the
    // module_swap branch below) isn't final until finalizeModuleSwap
    // actually confirms a slot, so it leaves the pool untouched, backing
    // out via "Back to Draft" should still show every original choice.
    state._draftChoices = state._draftChoices!.filter((m) => m.id !== mod.id);
    state.phase = 4;
  } else {
    state._newModule = mod;
    state.phase = "module_swap";
  }
}

// The confirmed half of the module_swap flow: a captain picked a drafted
// module while every slot was full and has now chosen which equipped one
// to give up for it. Only here, not at the initial pick above, does the
// chosen draft option actually leave the pool, since backing out with
// "Back to Draft" up to this point should still offer it.
export function finalizeModuleSwap(state: GameState, slotIdx: number, logs: string[]) {
  const mod = state._newModule;
  if (!mod) return;
  equipModule(state, mod, slotIdx, logs);
  state._draftChoices = (state._draftChoices ?? []).filter((m) => m.id !== mod.id);
  state._newModule = undefined;
  state.phase = 4;
}

// A captain joining a room for the first time should drop into the voyage
// wherever the room currently is rather than back at round 1, otherwise
// they'd never be able to ready up for the same checkpoint as everyone
// else (see the ready-check protocol in src/server/realtime.ts). This runs
// the same setup calls a normal transition would, just once, up front, so
// a fresh captain lands on a fully-formed phase (cards generated, etc.)
// instead of an empty one.
export function snapToCheckpoint(state: GameState, ctx: GameContext, round: number, phaseStr: string, logs: string[]): void {
  state.currentRound = round;
  switch (phaseStr) {
    case "5":
      startBoonDrafting(state, logs);
      return;
    case "1":
      startPhase1(state, ctx, logs);
      return;
    case "barter":
      state.phase = "barter";
      return;
    case "worker_mgmt":
      state.phase = "worker_mgmt";
      return;
    case "2":
      startPhase2(state, ctx, logs);
      return;
    case "3":
      startPhase3(state, logs);
      return;
    case "4":
      startPhase4(state, logs);
      return;
    default:
      return;
  }
}

// Human-readable label for the current phase (for the multiplayer status
// panel and the player detail popup). Takes just the two fields it needs
// rather than a full GameState so it can also describe the lighter-weight
// snapshot used for someone else's detail popup.
export function phaseLabel(state: { phase: GameState["phase"]; currentRound: GameState["currentRound"] }): string {
  switch (state.phase) {
    case 0:
      return "In Harbor";
    case 5:
      return "Drafting Boon";
    case 1:
      return `R${state.currentRound} · Buying`;
    case "barter":
      return `R${state.currentRound} · Bartering`;
    case "worker_mgmt":
      return `R${state.currentRound} · Crew`;
    case 2:
      return `R${state.currentRound} · Trading`;
    case 3:
      return `R${state.currentRound} · Settling`;
    case 4:
      return `R${state.currentRound} · Shipyard`;
    case "module_draft":
      return "Drafting Module";
    case "module_swap":
      return "Swapping Module";
    case "bankruptcy":
      return "Bankrupt";
    case "endgame":
      return "Voyage Complete";
    default:
      return "Sailing";
  }
}
