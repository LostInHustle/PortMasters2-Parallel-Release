// =====================================================================
// PortMasters 2 Parallel Release: game state types
// =====================================================================
import { MAX_ROUNDS, type Boon, type Module } from "./constants";

export type Phase =
  | 0 // welcome
  | 1 // port purchase
  | 2 // trade orders
  | 3 // maintenance / settlement
  | 4 // shipyard
  | 5 // boon drafting
  | "barter"
  | "worker_mgmt"
  | "module_draft"
  | "module_swap"
  | "bankruptcy"
  | "endgame";

export type ResourceRef = { type: string; required?: number; quantity?: number; price?: number; materialCost?: number; materialDetails?: string };

export type ResourceCard = {
  id: number;
  port: string;
  resources: ResourceRef[];
  totalCost: number;
  isProductCard: boolean;
};

export type OrderCard = {
  id: number;
  demandPort: string;
  resources: ResourceRef[];
  reward: number;
  totalItems: number;
  isProductOrder: boolean;
  // Set only on the extra order a captain conjures with Broker's Favor (see
  // callBrokersFavor in engine.ts). completeOrder reads it to take the
  // Broker's commission off this order's reward; every other order leaves it
  // undefined and is unaffected.
  isBrokerFavor?: boolean;
};

export type IntelItem = { item: string; port: string };

export type Worker = { task: string | null; progress: number; producedCount: number; isSkilled: boolean };

// A loan between two captains. The same shape is used on both sides: the
// borrower's `debts` list and the lender's `loansGiven` list each hold one
// of these per outstanding loan, kept in sync through the aid:* socket
// events (see src/lib/use-aid.ts) rather than any shared server record,
// the same trust model bartering already uses for cross-player state.
export type Loan = {
  id: string;
  counterpartyId: string;
  counterpartyName: string;
  amount: number;
  roundBorrowed: number;
};

export type GameState = {
  inventory: Record<string, number>;
  money: number;
  score: number;
  currentRound: number;
  maxRounds: number;
  // The room's voyage epoch (see Room.voyageEpoch in prisma/schema.prisma),
  // stamped onto this state when the voyage is created and folded into the
  // deterministic seed so a restart (which bumps the epoch) rerolls every
  // captain's market, orders, and Broker intel into a brand-new voyage.
  voyageEpoch: number;
  totalRevenue: number;
  totalCosts: number;
  materialCosts: number;
  workerWages: number;
  maintenanceCosts: number;
  vatPaid: number;
  incomeTaxPaid: number;
  roundRevenue: number;
  roundCosts: number;
  weavers: Worker[];
  masterWeavers: Worker[];
  sachetMakers: Worker[];
  fixedCost: number;
  shipLevel: number;
  shipUpgradeCost: number[];
  shipUpgradePenalty: number;
  maintenancePenalty: number;
  phase: Phase;
  resourceCards: ResourceCard[];
  customerCards: OrderCard[];
  purchasedCards: number[];
  completedOrders: number[];
  purchaseCount: number;
  orderCount: number;
  gameOver: boolean;
  modifierFlags: Record<string, number>;
  phase2DemandTags: string[];
  revealedIntel: IntelItem[];
  intelCost: number;
  // The captain's persistent Renown level (see src/lib/game/legacy.ts),
  // copied onto the voyage state so the engine can gate Renown-locked skills
  // like Broker's Favor without reaching back into account data. Personal to
  // each captain, exactly like money, so it never touches the shared room
  // seed. Refreshed from the captain's legacy on every load / restart.
  renownLevel: number;
  // Broker's Favor is a once-per-voyage skill (unlocks at Renown Level 5, see
  // BROKERS_FAVOR_UNLOCK_LEVEL). Flipped true the moment it is used and reset
  // only by starting a fresh voyage (createInitialGameState / restartGame),
  // never in endRound, which is what keeps it to one use per game rather than
  // one per round.
  brokersFavorUsed: boolean;
  equippedModules: Module[];
  // Each round's boon and module draft pools, fixed once rolled (see
  // startBoonDrafting / startModuleDrafting in engine.ts) so reopening the
  // draft screen, backing out, or reloading the page never re-rolls them.
  // The only way to get a new pool mid-round is the corresponding swap
  // action below, each capped at one use per round.
  boonChoices: Boon[];
  boonSwapUsed: boolean;
  _draftChoices?: Module[];
  moduleSwapUsed: boolean;
  _newModule?: Module;
  // Reset every round in startBoonDrafting, same as boonSwapUsed/
  // moduleSwapUsed above. Resolved once per round, in Phase 3, before the
  // wages-and-maintenance settlement: either a 20% chance of losing every
  // Gold on hand, or a guaranteed-safe escort for 10% of it.
  pirateAttackResolved: boolean;
  escortHired: boolean;
  // Loans currently owed to other captains (debts) and by other captains
  // to this one (loansGiven). Settled voluntarily at any time, or forced
  // at the end of Round 8 (see settleOutstandingDebts in engine.ts).
  debts: Loan[];
  loansGiven: Loan[];
  // Set only by settleOutstandingDebts, when a forced repayment at the end
  // of Round 8 still couldn't fully cover what was owed. Drives the
  // endgame screen's outcome instead of the normal merchant rank.
  defaultedDebt: boolean;
  // Transient: a signal for the React layer to relay over the aid:repay
  // socket event and then clear, since the pure engine functions that
  // populate it (settleOutstandingDebts) have no way to call socket.emit
  // themselves. Same convention as _draftChoices/_newModule above.
  _pendingDebtSettlements?: { lenderId: string; lenderName: string; amount: number; debtId: string }[];
};

export type GameContext = {
  // Per-captain deterministic seed identity, "roomId:userId" (see
  // src/lib/use-game-session.ts). Combined with the per-voyage epoch on
  // GameState, this gives every captain their own market, orders, and Broker
  // intel, reproducible on reload but different from every other captain and
  // rerolled whenever the host restarts the voyage.
  seedBase: string;
};

// startingGoldBonus comes from the captain's persistent Renown level (see
// src/lib/game/legacy.ts and use-game-session.ts's START_FRESH handling)
// so a captain with a long track record starts every fresh voyage a
// little ahead, never behind. Defaults to 0 for any caller that doesn't
// know the captain's Renown yet, so every existing call site keeps
// working unchanged.
// renownLevel defaults to 1 (Broker's Favor locked) for any caller that
// doesn't know the captain's Renown yet, mirroring startingGoldBonus above,
// so every existing call site keeps working unchanged.
// voyageEpoch defaults to 0 (the room's first voyage) for the same reason;
// callers that know the room's current epoch pass it so a fresh voyage is
// seeded distinctly from the ones before it.
export function createInitialGameState(startingGoldBonus: number = 0, renownLevel: number = 1, voyageEpoch: number = 0): GameState {
  return {
    inventory: { Hemp: 8, Silk: 5, Tea: 3, "Linen Clothes": 0, "Cotton Clothes": 0, Brocade: 0, Sachet: 0 },
    money: 100 + startingGoldBonus,
    renownLevel,
    brokersFavorUsed: false,
    voyageEpoch,
    score: 0,
    currentRound: 1,
    maxRounds: MAX_ROUNDS,
    totalRevenue: 0,
    totalCosts: 0,
    materialCosts: 0,
    workerWages: 0,
    maintenanceCosts: 0,
    vatPaid: 0,
    incomeTaxPaid: 0,
    roundRevenue: 0,
    roundCosts: 0,
    weavers: [],
    masterWeavers: [],
    sachetMakers: [],
    fixedCost: 15,
    shipLevel: 0,
    shipUpgradeCost: [15, 25, 40],
    shipUpgradePenalty: 0,
    maintenancePenalty: 0,
    phase: 0,
    resourceCards: [],
    customerCards: [],
    purchasedCards: [],
    completedOrders: [],
    purchaseCount: 0,
    orderCount: 0,
    gameOver: false,
    modifierFlags: {},
    phase2DemandTags: [],
    revealedIntel: [],
    intelCost: 5,
    equippedModules: [],
    boonChoices: [],
    boonSwapUsed: false,
    moduleSwapUsed: false,
    pirateAttackResolved: false,
    escortHired: false,
    debts: [],
    loansGiven: [],
    defaultedDebt: false,
  };
}
