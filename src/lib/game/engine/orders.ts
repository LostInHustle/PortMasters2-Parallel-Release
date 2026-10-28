// =====================================================================
// Phase 2, the trade manifest: the orders a captain can fill, what
// filling one actually pays, and the two ways an order can be conjured
// outside the ordinary draw (an Imperial Mandate, or calling in the
// Broker's Favor).
//
// completeOrder is the largest function in the engine and is deliberately
// left whole. Its steps are strictly ordered and the order is the
// behaviour: VAT comes off the original reward before any percentage
// bonus is applied to what remains, freight is charged before the Salvage
// Crane can refund it, and the Broker's commission is taken last of all.
// A past bug came from reordering exactly this sequence and paying every
// crane refund out twice, which is why the cost ledger true up in the
// middle carries the comment it does. Splitting it into tidy helpers
// would make that ordering implicit rather than obvious, so it stays as
// one readable top to bottom settlement.
//
// The order generators come from ./market: Phase 1 and Phase 2 draw from
// the same seeded deck, so there is exactly one implementation of them.
// =====================================================================
import {
  BROKERS_FAVOR_UNLOCK_LEVEL,
  ICONS,
  PRODUCTS,
  PRODUCTS_TIER1,
  PRODUCTS_TIER2,
  RESOURCES,
  RESOURCES_TIER1,
  WORD_ON_THE_DOCKS_REWARD,
  WORD_ON_THE_DOCKS_THRESHOLD,
} from "../constants";
import {
  MANDATE_TEMPLATES,
  difficultyConfig,
  mandateIndexFor,
  marketCountsFor,
} from "../difficulty";
import { unlockedPorts } from "../pools";
import { createRng, type Rng } from "../rng";
import type { GameContext, GameState } from "../types";
import { hasModule } from "./core";
import {
  genMixedOrder,
  genProductOrder,
  genRawOrder,
  poolsFor,
} from "./market";
import { brokersFavorCommission, calcTransportCost, calcVAT } from "./pricing";

// Each charter lane buff names its own goods. Keeping them as separate sets
// stops one broad "charter good" test from making the three buffs pay each
// other's orders.
const KILN_AND_FORGE_GOODS = new Set<string>(PRODUCTS_TIER1);
const BUREAU_GOODS = new Set<string>([...RESOURCES_TIER1, ...PRODUCTS_TIER1]);
const EXOTIC_GOODS = new Set<string>(PRODUCTS_TIER2);

export function completeOrder(
  state: GameState,
  orderId: number,
  logs: string[],
) {
  const order = state.customerCards.find((o) => o.id === orderId);
  if (!order) return;
  if (state.completedOrders.includes(order.id)) return;
  for (const r of order.resources) {
    if ((state.inventory[r.type] || 0) < r.required!) {
      logs.push(`❌ Inventory short! Need ${r.type}×${r.required}`);
      return;
    }
  }
  const hasSilk = order.resources.some((r) =>
    ["Silk", "Brocade", "Sachet", "Cotton Clothes"].includes(r.type),
  );
  let transport = calcTransportCost(state, order.totalItems, hasSilk);
  for (const r of order.resources) state.inventory[r.type] -= r.required!;
  let reward = order.reward;
  let totalVat = 0;
  if (order.isProductOrder) {
    const product = order.resources[0].type;
    const unitVat = calcVAT(
      state,
      product,
      reward / order.resources[0].required!,
    );
    totalVat = unitVat * order.resources[0].required!;
    reward -= totalVat;
    state.vatPaid += totalVat;
    logs.push(`🧾 Product Sales VAT: ${totalVat} Gold`);
  }
  // Fleet of Treasures discount applied before money moves, so the captain
  // is never charged the pre discount freight.
  if (
    hasModule(state, "fleet_of_treasures") &&
    ["Foreign Balm", "Pearl String"].some((g) =>
      order.resources.some((r) => r.type === g),
    )
  ) {
    const t2items = order.resources
      .filter((r) => ["Foreign Balm", "Pearl String"].includes(r.type))
      .reduce((s, r) => s + (r.required ?? 0), 0);
    transport = Math.max(0, transport - t2items * 3);
    if (t2items > 0)
      logs.push(`⛵ Fleet of Treasures: −${t2items * 3}g freight`);
  }
  state.money -= transport;
  state.roundCosts += transport;
  state.totalCosts += transport;
  const origTransport = transport;
  if (hasModule(state, "silk_monopoly") && hasSilk) {
    reward = Math.floor(reward * 1.2);
    logs.push("👘 Silk Monopoly: +20% Reward!");
  }
  // Charter lane payouts. Each buff only pays for the goods its own
  // description names: Kiln and Forge Guild for the two tier1 finished
  // goods, the Maritime Bureau Token for tier1 raw and finished goods, and
  // Exotic Treasures for the two tier2 finished goods. A single broad
  // "charter good" check used to make all three overlap.
  const hasKilnGood = order.resources.some((r) =>
    KILN_AND_FORGE_GOODS.has(r.type),
  );
  const hasBureauGood = order.resources.some((r) => BUREAU_GOODS.has(r.type));
  const hasExoticGood = order.resources.some((r) => EXOTIC_GOODS.has(r.type));
  // Added as `reward + floor(reward * pct)` rather than `floor(reward * (1 +
  // pct))`: the latter loses a coin to floating point on common rates (100 *
  // 1.15 is 114.999... in binary), so a stated 15% quietly paid 14%.
  if (hasKilnGood && state.modifierFlags.charter_order_bonus) {
    const pct = state.modifierFlags.charter_order_bonus;
    reward += Math.floor(reward * pct);
    logs.push(`🏮 Kiln and Forge Guild: +${Math.round(pct * 100)}% Reward!`);
  }
  if (hasBureauGood && hasModule(state, "bureau_token")) {
    reward += Math.floor(reward * 0.1);
    logs.push("🎫 Maritime Bureau Token: +10% Reward!");
  }
  if (hasExoticGood && state.modifierFlags.exotic_order_bonus) {
    const pct = state.modifierFlags.exotic_order_bonus;
    reward += Math.floor(reward * pct);
    logs.push(`💎 Exotic Treasures: +${Math.round(pct * 100)}% Reward!`);
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
    // Only the Salvage Crane above can move `transport`, and it has already
    // handed the Gold back. This trues up the cost ledger so the round's
    // freight total reflects the refund; it used to credit state.money a
    // second time here as well, paying every crane refund out twice.
    const diff = origTransport - transport;
    state.roundCosts -= diff;
    state.totalCosts -= diff;
  }
  // Broker's Favor commission: the Broker takes a cut of the order's
  // reward (see brokersFavorCommission), so the captain's own money,
  // revenue, and score all reflect the amount net of the commission.
  if (order.isBrokerFavor) {
    const commission = brokersFavorCommission(order.reward);
    reward -= commission;
    const pct =
      order.reward > 0 ? Math.round((commission / order.reward) * 100) : 0;
    logs.push(`🤝 Broker's Commission (${pct}%): ${commission} Gold`);
  }
  state.money += reward;
  state.roundRevenue += reward;
  state.totalRevenue += reward;
  state.score += Math.floor(reward - transport);
  state.completedOrders.push(order.id);
  state.orderCount++;
  state.totalOrdersCompleted++;
  const txt = order.resources
    .map((r) => `${ICONS[r.type]}${r.type}×${r.required}`)
    .join(" + ");
  logs.push(`📦 Completed Order at ${order.demandPort}: ${txt}`);
  logs.push(
    `   💰 Reward: ${reward} Gold · ⚓ Freight: ${transport} Gold = 📊 Net Profit: ${reward - transport} Gold`,
  );
  logs.push(`📊 Completed ${state.orderCount} transactions`);
  // [MANIFEST 02: Word on the Docks] Fires exactly once per voyage, the
  // instant this captain's own running total crosses the threshold, whether
  // or not they actually turn out to be first in the room. The React layer
  // (see GameRoom.tsx) relays this as a claim to the server, which is the
  // one place that actually knows whether anyone else beat them to it.
  if (state.totalOrdersCompleted === WORD_ON_THE_DOCKS_THRESHOLD) {
    state._pendingDocksClaim = { total: state.totalOrdersCompleted };
  }
}

// [MANIFEST 02: Word on the Docks] Applied only on the one client the
// server confirmed actually won the race (see the docks:won listener in
// GameRoom.tsx); every other client that also crossed the threshold just
// never receives this call, so a losing claim costs nothing and needs no
// rollback.
export function claimWordOnTheDocksReward(state: GameState, logs: string[]) {
  state.money += WORD_ON_THE_DOCKS_REWARD;
  logs.push(
    `📣 Word on the Docks: you were first to complete ${WORD_ON_THE_DOCKS_THRESHOLD} trade orders this voyage! +${WORD_ON_THE_DOCKS_REWARD} Gold`,
  );
}

// Broker's Favor: the Renown gated, once per voyage skill (see the flag on
// GameState and BROKERS_FAVOR_UNLOCK_LEVEL). Appends one extra standard trade
// order for a chosen quantity of a good this captain is currently holding,
// so a hold full of otherwise unsellable stock still has a guaranteed buyer.
// Like the paid Broker's Whisper guarantee in startPhase2, it draws with
// this captain's own Math.random and only appends to their own
// customerCards, so it can never shift the shared, room wide market anyone
// else sees. Quantity is capped at the captain's own hold rather than the
// usual 1-3/2-5 order range, since brokersFavorCommission (see
// completeOrder) is what keeps an oversized ask from paying out too much,
// not a quantity limit.
export function callBrokersFavor(
  state: GameState,
  item: string,
  quantity: number,
  logs: string[],
) {
  if (state.phase !== 2) return;
  if (state.renownLevel < BROKERS_FAVOR_UNLOCK_LEVEL) {
    logs.push(
      `❌ Broker's Favor unlocks at Renown Level ${BROKERS_FAVOR_UNLOCK_LEVEL}`,
    );
    return;
  }
  if (state.brokersFavorUsed) {
    logs.push("❌ You've already called in a Broker's Favor this voyage");
    return;
  }
  const isRaw = (RESOURCES as readonly string[]).includes(item);
  const isProduct = (PRODUCTS as readonly string[]).includes(item);
  if (!isRaw && !isProduct) {
    logs.push(`❌ The Broker can't find a buyer for ${item}`);
    return;
  }
  const held = state.inventory[item] || 0;
  if (held <= 0) {
    logs.push(`❌ You have no ${item} in the hold for the Broker to sell`);
    return;
  }
  const qty = Math.floor(quantity);
  if (!Number.isFinite(qty) || qty < 1 || qty > held) {
    logs.push(`❌ Choose between 1 and ${held} ${item} for the Broker to sell`);
    return;
  }
  const localRng: Rng = Math.random;
  const order = isRaw
    ? genRawOrder(localRng, poolsFor(state), item, qty)
    : genProductOrder(localRng, poolsFor(state), item, qty);
  const nextId =
    state.customerCards.reduce((m, c) => Math.max(m, c.id), -1) + 1;
  state.customerCards.push({ id: nextId, ...order, isBrokerFavor: true });
  state.brokersFavorUsed = true;
  const txt = order.resources
    .map((r) => `${ICONS[r.type]}${r.type}×${r.required}`)
    .join(" + ");
  logs.push(
    `🤝 Broker's Favor called in: a buyer at ${order.demandPort} now wants ${txt}. The bigger the ask, the bigger the Broker's cut.`,
  );
}

function revealBrokerRumor(state: GameState, logs: string[]): boolean {
  if (!state.phase2DemandTags.length) return false;
  const item =
    state.phase2DemandTags[
      Math.floor(Math.random() * state.phase2DemandTags.length)
    ];
  state.phase2DemandTags.splice(state.phase2DemandTags.indexOf(item), 1);
  const openPorts = unlockedPorts(state.difficulty, state.currentRound);
  const port = openPorts[Math.floor(Math.random() * openPorts.length)];
  state.revealedIntel.push({ item, port });
  logs.push(
    `🗣️ Broker's Whisper: 'Word from ${port}: High demand for ${item}!'`,
  );
  // [DIFFICULTY] Corrupt broker (Monsoon only). The rumor above is always
  // delivered and always true, on every tier: the intel guarantee is never
  // touched. What a corrupt broker does instead is also sell word of this
  // hold to the pirates, raising the round's raid chance once. Announced
  // plainly here rather than hidden, so the captain can price the risk.
  const cfg = difficultyConfig(state.difficulty);
  if (
    cfg.brokerCorruption &&
    !state.brokerTippedPirates &&
    Math.random() < cfg.brokerCorruptionChance
  ) {
    state.brokerTippedPirates = true;
    logs.push(
      `🕵️ That broker was corrupt. The word is good, but your position leaked: raid risk is up ${Math.round(cfg.brokerCorruptionRisk * 100)} points this round.`,
    );
  }
  return true;
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
  // Broker's Network adds a second paid reveal. Ocean Interpreter adds a
  // rumor that is genuinely free, so it still arrives when only one paid
  // rumor can be afforded. Each paid reveal is checked against the purse
  // on its own; Broker's Network used to deduct twice after one check and
  // could drive a captain's money below zero.
  const paidCount = hasModule(state, "brokers_network") ? 2 : 1;
  for (let i = 0; i < paidCount; i++) {
    if (state.money < state.intelCost) {
      logs.push(`❌ Need ${state.intelCost} Gold for another rumor`);
      break;
    }
    if (!revealBrokerRumor(state, logs)) break;
    state.money -= state.intelCost;
  }
  if (hasModule(state, "ocean_relay")) revealBrokerRumor(state, logs);
}

export function startPhase2(
  state: GameState,
  ctx: GameContext,
  logs: string[],
) {
  state.phase = 2;
  state.orderCount = 0;
  state.completedOrders = [];
  logs.push(
    `\n🤝=== Round ${state.currentRound} · Phase 2: Trade Transaction ===`,
  );
  // [ONLINE] Deterministic trade orders per (room, round): every captain
  // in the room independently derives the identical base set of
  // orders here, since this loop never reads anything captain specific.
  const orderRng = createRng(
    `${ctx.seedBase}:V${state.voyageEpoch}:R${state.currentRound}:orders`,
  );
  state.customerCards = [];
  const orderPools = poolsFor(state);
  // [DIFFICULTY] Same widening as the port market above, applied to the trade
  // board, so both boards grow together as a tier's charter opens.
  const orderCount = marketCountsFor(
    state.difficulty,
    state.currentRound,
  ).order;
  for (let i = 0; i < orderCount; i++) {
    state.customerCards.push({ id: i, ...genMixedOrder(orderRng, orderPools) });
  }
  const extraOrders = state.modifierFlags.extra_order ?? 0;
  for (let i = 0; i < extraOrders; i++) {
    const nextId = orderCount + i;
    state.customerCards.push({
      id: nextId,
      ...genMixedOrder(orderRng, orderPools),
    });
    logs.push("🛍️ Merchants Converge: One extra order appeared.");
  }
  // Broker's Whisper guarantee, applied after the shared draw above and
  // entirely with this captain's own randomness, so it can never nudge
  // what anyone else in the room sees. Each rumor this captain revealed
  // (see purchaseIntel) owns exactly one order card: it overwrites one
  // distinct slot with a matching order at the port the Broker named, then
  // records that card's id on the rumor. The id, not the item name, is what
  // the trade manifest uses, so another order that happens to want the
  // same good is never marked as guaranteed. Previously a single
  // `intelOrderUsed` flag capped this at one guarantee per round no matter
  // how many rumors a captain had revealed, and the board highlighted every
  // matching order instead of the one the rumor actually created.
  for (const intel of state.revealedIntel) intel.orderId = undefined;
  const guaranteedCount = Math.min(
    state.revealedIntel.length,
    state.customerCards.length,
  );
  for (let i = 0; i < guaranteedCount; i++) {
    const intel = state.revealedIntel[i];
    const card = state.customerCards[i];
    const localRng: Rng = Math.random;
    const guaranteed = (RESOURCES as readonly string[]).includes(intel.item)
      ? genRawOrder(localRng, orderPools, intel.item)
      : genProductOrder(localRng, orderPools, intel.item);
    state.customerCards[i] = {
      id: card.id,
      ...guaranteed,
      demandPort: intel.port,
    };
    intel.orderId = card.id;
  }
  // [DIFFICULTY] Imperial mandate: on the rounds this tier schedules one, the
  // Emperor commissions a single large order. Fixed template data with no rng,
  // appended after the shared draw, so every captain in the room is dealt the
  // identical mandate and nobody's seeded market shifts. Flagged
  // isProductOrder: false, since an imperial levy is never charged VAT.
  const mandateIdx = mandateIndexFor(state.difficulty, state.currentRound);
  const mandate =
    mandateIdx === undefined ? undefined : MANDATE_TEMPLATES[mandateIdx];
  if (mandate) {
    const nextId =
      state.customerCards.reduce((m, c) => Math.max(m, c.id), -1) + 1;
    // Placed first rather than appended. It is the round's headline commission
    // and should read that way regardless of how wide the charter has grown
    // the board. Inserted after the intel guarantee loop above, which writes
    // by index, so it cannot be overwritten; card identity stays on `id`, so
    // position carries presentation only and no logic depends on it.
    state.customerCards.unshift({
      id: nextId,
      demandPort: mandate.port,
      resources: mandate.resources.map((r) => ({
        type: r.type,
        required: r.required,
      })),
      reward: mandate.reward,
      totalItems: mandate.resources.reduce((s, r) => s + r.required, 0),
      isProductOrder: false,
      isMandate: true,
    });
    const need = mandate.resources
      .map((r) => `${ICONS[r.type]}${r.type}×${r.required}`)
      .join(" + ");
    logs.push(
      `📜 Imperial Mandate at ${mandate.port}: ${need} for ${mandate.reward} Gold. The Emperor's commission is exempt from VAT.`,
    );
  }
}

// True only for the exact Phase 2 card a revealed rumor overwrote. Matching
// on the demanded item alone would light up every order that shares the good,
// which made one rumor look like it had guaranteed several orders.
export function isGuaranteedOrder(state: GameState, orderId: number): boolean {
  return state.revealedIntel.some((intel) => intel.orderId === orderId);
}
