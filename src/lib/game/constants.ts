// =====================================================================
// PortMasters 2 Parallel Release: Lords of the Silk Road
// Game constants. Balance, descriptions, and overall wording are carried
// over verbatim from the original PortMasters build this project branches
// from; only the project's own name has been updated where it appears in
// this text, to match the rebrand (see README.md).
// =====================================================================

// Single source of truth for the project's display name. Every screen,
// log line, and metadata tag that shows the game's name should pull from
// this constant rather than hardcoding the string, so a future rebrand
// only has to happen in one place.
export const APP_NAME = "PortMasters 2 Parallel Release";

export const ICONS: Record<string, string> = {
  Gold: "💰",
  Hemp: "🧶",
  Silk: "👘",
  Tea: "🍵",
  "Linen Clothes": "👔",
  "Cotton Clothes": "👕",
  Brocade: "👗",
  Sachet: "🌸",
};

export const COLORS: Record<string, string> = {
  Gold: "#D4A017",
  Hemp: "#8B7355",
  Silk: "#DC143C",
  Tea: "#228B22",
  "Linen Clothes": "#D2691E",
  "Cotton Clothes": "#4169E1",
  Brocade: "#8B008B",
  Sachet: "#FF1493",
};

export const RESOURCES = ["Hemp", "Silk", "Tea"] as const;
export const PRODUCTS = ["Linen Clothes", "Cotton Clothes", "Brocade", "Sachet"] as const;
// Anything a captain can put up for barter: Gold plus every raw material
// and finished good. Kept separate from RESOURCES/PRODUCTS (rather than
// folding Gold into one of those) so the existing buying/inventory
// listings that iterate those two arrays don't suddenly pick up Gold.
export const BARTER_ITEMS = ["Gold", ...RESOURCES, ...PRODUCTS] as const;
export const PORTS = [
  "Quanzhou Port",
  "Guangzhou Port",
  "Ningbo Port",
  "Yangzhou Port",
  "Hangzhou Port",
] as const;

export const RECIPES: Record<string, { materials: Record<string, number>; value: number; worker_type: string }> = {
  "Linen Clothes": { materials: { Hemp: 2 }, value: 15, worker_type: "weaver" },
  "Cotton Clothes": { materials: { Hemp: 2, Silk: 1 }, value: 35, worker_type: "weaver" },
  Brocade: { materials: { Silk: 3 }, value: 60, worker_type: "master" },
  Sachet: { materials: { Silk: 1, Tea: 2 }, value: 80, worker_type: "sachet_maker" },
};

export const COMMODITIES: Record<string, { ports: string[]; basePrice: [number, number] }> = {
  Hemp: { ports: ["Quanzhou Port", "Ningbo Port"], basePrice: [3, 6] },
  Silk: { ports: ["Hangzhou Port", "Yangzhou Port"], basePrice: [6, 10] },
  Tea: { ports: ["Guangzhou Port", "Quanzhou Port"], basePrice: [10, 14] },
};

export const PRODUCT_PRICES: Record<string, [number, number]> = {
  "Linen Clothes": [30, 42],
  "Cotton Clothes": [50, 65],
  Brocade: [70, 90],
  Sachet: [95, 120],
};

export const RESOURCE_PROBS: Record<string, number> = { Hemp: 0.4, Silk: 0.35, Tea: 0.25 };
export const WAGES: Record<string, number> = { weaver: 8, master: 12, sachet_maker: 20 };

// Phase 3, resolved once per round before the wages-and-maintenance
// settlement: the odds of losing every Gold on hand to pirates, and the
// cost (a share of current Gold) of hiring an escort to guarantee safety
// instead of risking the roll.
export const PIRATE_ATTACK_CHANCE = 0.2;
export const ESCORT_COST_RATE = 0.1;

// Reputation a captain gains for lending Gold to another captain short on
// funds, scaled to the amount so a token loan doesn't pay the same as
// bailing someone out completely. Floored at 1 so even a small loan is
// worth something.
export const AID_REPUTATION_PER_GOLD = 1 / 5;

export type Boon = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  modifiers: Record<string, number>;
};

export const BOONS: Boon[] = [
  { id: "silk_wind", name: "Silk Winds", icon: "🌬️", desc: "Transport cost for Silk & Silk products is halved this round.", modifiers: { transport_silk_discount: 0.5 } },
  { id: "favorable_tides", name: "Favorable Tides", icon: "🌊", desc: "Base transport cost reduced by 4 Gold this round.", modifiers: { transport_flat_discount: 4 } },
  { id: "merchant_charm", name: "Merchant's Charm", icon: "✨", desc: "15% discount on all port purchases this round.", modifiers: { purchase_discount: 0.15 } },
  { id: "artisan_inspiration", name: "Artisan's Inspiration", icon: "🔨", desc: "All workers produce +1 extra item this round.", modifiers: { worker_bonus_production: 1 } },
  { id: "emergency_loan", name: "Emergency Loan", icon: "💰", desc: "Gain 40 Gold immediately. No strings attached.", modifiers: { instant_gold: 40 } },
  { id: "tax_shelter", name: "Tax Shelter", icon: "📜", desc: "Income tax rate reduced to 5% this round.", modifiers: { income_tax_override: 0.05 } },
  { id: "hemp_monopoly", name: "Hemp Monopoly", icon: "🧶", desc: "Hemp purchase prices reduced by 2 Gold per unit.", modifiers: { hemp_price_reduction: 2 } },
  { id: "master_apprentice", name: "Master's Apprentice", icon: "🎓", desc: "Hiring workers costs 50% less this round.", modifiers: { hire_discount: 0.5 } },
];

export type Module = { id: string; name: string; icon: string; desc: string };

export const MODULES: Module[] = [
  { id: "smugglers_hold", name: "Smuggler's Hold", icon: "🏴‍☠️", desc: "Purchase costs -15%. Income Tax +20%." },
  { id: "bulk_hauler", name: "Bulk Hauler Rigging", icon: "🏗️", desc: "Transport cost -1 per item. Ship upgrades cost +15 Gold." },
  { id: "artisans_workshop", name: "Artisan's Workshop", icon: "🛠️", desc: "Workers produce +1 item. Wages +20%." },
  { id: "tax_evasion", name: "Tax Evasion Ledger", icon: "📕", desc: "Income Tax & VAT halved. 15% chance to lose 20 Gold on order complete (Audit)." },
  { id: "silk_monopoly", name: "Silk Road Monopoly", icon: "👘", desc: "Silk transport cost is 0. Silk product orders yield +20% reward." },
  { id: "brokers_network", name: "Broker's Network", icon: "🕵️", desc: "Intel costs 2 Gold. Reveals 2 rumors per purchase." },
  { id: "salvage_crane", name: "Salvage Crane", icon: "♻️", desc: "30% chance to refund transport cost on order complete." },
  { id: "overdrive_engine", name: "Overdrive Engine", icon: "⚙️", desc: "Transport cost -5 Gold. Maintenance +10 Gold." },
];

// Max rounds per game (a "voyage" set). The starting fixed cost, ship
// upgrade cost ladder, and intel cost live directly on the initial
// GameState (see createInitialGameState in ./types.ts) instead of as
// constants here, since nothing else needs to reference them separately.
export const MAX_ROUNDS = 8;

// How many cards the port market (startPhase1) and the trade board
// (startPhase2) each roll per round, in src/lib/game/engine.ts. Kept as
// two separate constants, not one shared count, since the two boards are
// free to diverge in a future balance pass even though they start equal.
export const PURCHASE_CARD_COUNT = 6;
export const ORDER_CARD_COUNT = 6;

// Broker's Favor: a Renown-gated, once-per-voyage skill a captain invokes in
// Phase 2 to summon one extra guaranteed trade order for a chosen quantity of
// a good they are already holding, so a hold full of otherwise unsellable
// stock still has a buyer. Unlocks at Renown Level 5 (the Trade Officer
// tier, see src/lib/game/legacy.ts). A captain may ask for any quantity up
// to their full hold; the Broker's commission (see brokersFavorCommission in
// engine.ts) is a saturating curve rather than a flat rate, so net payout
// approaches this cap but can never exceed it, no matter how large the ask.
export const BROKERS_FAVOR_UNLOCK_LEVEL = 5;
export const BROKERS_FAVOR_PAYOUT_CAP = 200;

// =====================================================================
// Tutorial steps, preserved verbatim from the original game.
// =====================================================================
export const TUTORIAL_STEPS: { title: string; content: string }[] = [
  {
    title: "⚓ Welcome aboard",
    content: `<p>${APP_NAME} puts you on the ancient Silk Road. Eight voyages, limited gold, and a lot of merchants trying to outmaneuver you at every port.</p>
<p>The rules are easy to pick up, but money is tight early on and a string of bad calls compounds quickly. This covers the four things that catch new players out most.</p>
<p style="color:#777;font-size:13px">Two minutes to read. Saves a lot of frustrated restarts.</p>`,
  },
  {
    title: "🏆 What you're playing for",
    content: `<p>After eight voyages, the player with the highest score wins the title of <strong>Sea Master</strong>. Score comes from trade profits and fulfilled orders.</p>
<p>One rule overrides everything else: <strong>do not go bankrupt</strong>. Hit zero gold and the game ends immediately. There is no coming back from it.</p>
<p>Starting gold is <strong>100</strong>. That is enough to get going, but not enough to be careless with.</p>`,
  },
  {
    title: "🔄 How a voyage works",
    content: `<p>Each of the eight voyages runs through four core phases in order, with a quick bartering window right after buying:</p>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0">
  <div style="background:#E8F5E9;border-radius:6px;padding:10px;border-left:3px solid #4CAF50"><strong>1️⃣ Buy</strong><br><span style="font-size:12px;color:#444">Stock up at port markets</span></div>
  <div style="background:#FFF8E1;border-radius:6px;padding:10px;border-left:3px solid #FFA000"><strong>🤝 Barter</strong><br><span style="font-size:12px;color:#444">Swap goods with other captains</span></div>
  <div style="background:#E3F2FD;border-radius:6px;padding:10px;border-left:3px solid #2196F3"><strong>2️⃣ Trade</strong><br><span style="font-size:12px;color:#444">Sell to waiting buyers</span></div>
  <div style="background:#FFF3CD;border-radius:6px;padding:10px;border-left:3px solid #FFC107"><strong>3️⃣ Settle</strong><br><span style="font-size:12px;color:#444">Production lands, bills come due</span></div>
  <div style="background:#FCE4EC;border-radius:6px;padding:10px;border-left:3px solid #E91E63"><strong>4️⃣ Upgrade</strong><br><span style="font-size:12px;color:#444">Improve your ship</span></div>
</div>
<p style="font-size:12px;color:#666;margin:4px 0 0"><kbd style="background:#eee;border:1px solid #ccc;padding:1px 6px;border-radius:3px">Ctrl+N</kbd> moves you between phases without clicking.</p>`,
  },
  {
    title: "🏪 Phase 1: Buying",
    content: `<p>The port market has Hemp, Silk, and Tea at prices that shift every voyage. Buy now, barter if you need to, then sell in Phase 2. That is the core loop.</p>
<p>One thing worth knowing about: the <strong>Broker</strong>. Pay a small fee for a demand rumor and a specific trade order is <em>guaranteed</em> to appear when Phase 2 opens. Useful when you have stocked a particular good and want to make sure a buyer shows up.</p>
<div style="background:#FFF8DC;border:1px solid #FFA000;border-radius:6px;padding:9px;font-size:13px;margin-top:10px;line-height:1.5">
  💡 For the first two or three voyages, stick to raw materials. They sell the same voyage you buy them. No waiting and no risk.
</div>`,
  },
  {
    title: "🤝 Bartering",
    content: `<p>Right after buying, there's a short window where captains can trade directly with each other instead of through the market. Post an offer, like Hemp you don't need for Silk you do, and any other captain in the harbor can take it with one click.</p>
<p>It is the easiest way to recover from a bad draw. All Tea and no Silk, with a Sachet order already on the board? Someone else in the harbor has probably drawn the opposite problem.</p>
<div style="background:#FFF8DC;border:1px solid #FFA000;border-radius:6px;padding:9px;font-size:13px;margin-top:10px;line-height:1.5">
  A few ground rules: you can't offer an item for itself, both amounts have to be whole numbers of at least one, and you can never offer more than you currently have. The moment you post an offer, that amount is set aside until someone takes it or you cancel it.
</div>
<p style="font-size:13px;color:#333;margin-top:8px">Nobody has to barter. If nothing on the board interests you, or nobody is offering anything, just move on to the next phase.</p>`,
  },
  {
    title: "📋 Phase 2: Filling orders",
    content: `<p>Trade orders appear and you match your cargo to them. Each one shows the goods needed, the reward, and the shipping fee. Your take is whatever is left after fees and tax.</p>
<p>You can fill as many orders as your cargo allows in a single phase.</p>
<div style="background:#E3F2FD;border:1px solid #2196F3;border-radius:6px;padding:9px;font-size:13px;margin-top:10px;line-height:1.5">
  📌 <strong>Finished goods</strong> (Fabric, Silk Garment, Sachet) pay two to three times more than raw materials. The catch is they need artisans, and artisans take a full voyage to deliver. That is covered next.
</div>`,
  },
  {
    title: "⚠️ The artisan trap",
    content: `<p>Artisans turn raw materials into high-value finished goods and collect wages at each Phase 3. That part is simple. What catches most new players is this:</p>
<div style="background:#C62828;color:#fff;border-radius:6px;padding:12px;margin:12px 0;text-align:center;font-size:14px;font-weight:bold;line-height:1.7">
  Assign a task this voyage.<br>The goods are ready next voyage, not this one.
</div>
<p style="font-size:13px;color:#333;line-height:1.6">Weavers (8g), Master Weavers (12g), and Sachet Makers (20g) all charge wages <strong>every voyage</strong>, even when idle. Only hire once you have enough gold to cover at least two rounds of wages alongside your other bills.</p>`,
  },
  {
    title: "🏴‍☠️ Pirates at Phase 3",
    content: `<p>Before the bills below come due each voyage, there's a 20% chance pirates find your ship and take every coin you're carrying.</p>
<p>You get one choice before that roll happens: hire an escort for 10% of your current Gold and sail through guaranteed safe, or set sail anyway and keep the Gold if the pirates don't show.</p>
<div style="background:#FFF8DC;border:1px solid #FFA000;border-radius:6px;padding:9px;font-size:13px;margin-top:10px;line-height:1.5">
  💡 The escort costs a share of whatever you're carrying that round, so it's cheapest exactly when you have the least to protect. Often worth it once your funds are already thin.
</div>`,
  },
  {
    title: "💸 Phase 3: Settlement",
    content: `<p>Once the pirates are dealt with, two bills come due:</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0">
  <div style="background:#E3F2FD;border-radius:6px;padding:10px;text-align:center">
    <div style="font-size:22px;margin-bottom:4px">🔧</div>
    <strong>Ship Maintenance</strong><br>
    <span style="font-size:12px;color:#444">15 Gold, every voyage, fixed</span>
  </div>
  <div style="background:#FCE4EC;border-radius:6px;padding:10px;text-align:center">
    <div style="font-size:22px;margin-bottom:4px">👥</div>
    <strong>Artisan Wages</strong><br>
    <span style="font-size:12px;color:#444">8 to 20 Gold per person per voyage</span>
  </div>
</div>
<p style="font-size:13px;color:#333">The <strong>Round-End Obligations</strong> panel in the sidebar shows exactly what is owed. Check it before spending anything.</p>
<p style="font-size:13px;color:#333">Coming up short isn't the end on its own. Right there on the settlement screen, you can ask another captain in the harbor for a loan, and they can send it to you on the spot if they've got the Gold to spare. Just repay it before the voyage's last round ends, or it comes out of your funds automatically and goes straight to them.</p>`,
  },
  {
    title: "🚢 You are ready",
    content: `<p>Keep these points in mind as you play:</p>
<ul style="padding-left:18px;line-height:2.1;font-size:14px">
  <li>Start with raw material orders. Fast money, no complications.</li>
  <li>Always keep at least <strong>30 Gold above</strong> what Phase 3 will cost you.</li>
  <li>Hire artisans only when you can cover <strong>two full voyages of wages</strong>.</li>
  <li>Phase 4 ship upgrades compound quickly. Do not skip them.</li>
  <li>Caught short by pirates or a bad round? Ask the harbor for a loan before you assume the voyage is over.</li>
  <li>Every voyage's final Reputation becomes Renown on your account, forever, win or lose. Check your Captain's Legacy any time from the Lobby.</li>
  <li><kbd style="background:#eee;border:1px solid #ccc;padding:1px 6px;border-radius:3px">Ctrl+S</kbd> saves your run &nbsp;·&nbsp; <kbd style="background:#eee;border:1px solid #ccc;padding:1px 6px;border-radius:3px">F1</kbd> opens the full guide.</li>
</ul>
<div style="background:#E8F5E9;border:2px solid #4CAF50;border-radius:8px;padding:12px;text-align:center;margin-top:14px">
  <strong style="font-size:15px">Good winds and good margins, Captain. ⚓</strong>
</div>`,
  },
];

// =====================================================================
// Guide and tips text, preserved verbatim.
// =====================================================================
export const GUIDE_TEXT = `⚓ ${APP_NAME}: Rules

🚢 Objective:
Travel 8 voyages, accumulate wealth and reputation!

📦 Goods System:
Raw Materials: Hemp(3-6💰), Silk(6-10💰), Tea(10-14💰)
Finished Goods: Linen Clothes(30-42💰), Cotton Clothes(50-65💰),
Brocade(70-90💰), Sachet(95-120💰)

👥 Worker System:
• Weaver (8 Gold/Round): Makes Linen or Cotton Clothes
• Master (12 Gold/Round): Makes Linen, Cotton or Brocade
• Sachet Maker (20 Gold/Round): Makes Sachets

🧾 Tax System:
• VAT: 5% on finished product profit margin
• Income Tax: 10% on voyage net profit

🔮 Broker's Whisper:
• Phase 1: Click "Broker's Rumor Board" to open the window
• Spend 5 Gold to buy a "rumor" about Phase 2 demand
• Revealed intel guarantees matching orders will appear

🤝 Bartering:
• Right after Phase 1, before Phase 2 opens: trade directly with the other captains in your harbor
• Post what you have and what you want for it; anyone can accept it with one click
• An offer can't be an item for itself, and both amounts must be whole numbers of at least 1
• You can never offer more than you currently own, it's set aside the moment you post, and returned to you if you cancel or nobody takes it

🔧 Ship Modules (NEW!):
• Phase 4: Upgrade your ship to unlock Module Slots
• Draft powerful modules to create unique synergies
• Swap modules to adapt to your current run!

🏴‍☠️ Pirates and Escorts:
• Phase 3, before the bills below: 20% chance of losing every Gold coin you're carrying
• Hire an escort for 10% of your current Gold to guarantee safe passage instead
• The choice has to be made before that round's pirates are rolled for

🆘 Financial Aid:
• Can't cover this round's wages or maintenance? Ask the harbor for a loan, right on the settlement screen
• Any captain with enough Gold can lend it to you on the spot; it's in your hands immediately
• Repay it any time before the voyage's last round ends, or it's taken from your funds automatically and handed to your lender
• Still short when the voyage finishes? That unpaid loan is what bankrupts you, not the round it was borrowed in
• Lending Gold raises your own reputation, scaled to how much you lent

Captain's Legacy:
• Every voyage's final Reputation becomes Renown XP on your account the moment the voyage ends, win or lose
• Renown is permanent: it survives a restart and carries into every future voyage, in any harbor, unlike Gold, cargo, and ship level
• Each Renown level grants a small Gold bonus at the start of your next fresh voyage
• Whoever ends a voyage with the highest Reputation among everyone who reached the endgame screen is crowned Sea Master
• Check your current Renown level, title, and Sea Master crowns any time from the Lobby

🌊 Voyage Phases:
1. Port Purchase: buy resources at ports (plus Broker rumors)
   ↳ Bartering window opens right after, before Trade Transaction
2. Trade Transaction: complete orders
3. Settlement: pirates may strike first, then wages and maintenance come due (ask for a loan if you're short)
4. Upgrade: improve ships and install modules

⌨️ Shortcuts:
• Ctrl+S: Save Game
• Ctrl+N: Next Phase
• Ctrl+H: Manage Workers
• Ctrl+R: Restart
• F1: Instructions

⚓ Bon Voyage and Good Luck!`;

export const TIPS_TEXT = `⚓ Avoiding Bankruptcy Strategies:

💰 Financial Management:
1. Always maintain reserve funds for expenses
2. Maintenance + Wages are fixed rounds costs
3. Calculate total expenditure before buying

👥 Worker Management:
1. Weaver Wage: ${WAGES.weaver} Gold / Round
2. Master Wage: ${WAGES.master} Gold / Round
3. Maker Wage: ${WAGES.sachet_maker} Gold / Round
4. Hire only as needed

🔮 Broker's Whisper Strategy:
1. Buy rumors early if you have spare gold
2. Hoard revealed items to guarantee Phase 2 profits
3. Balance intel purchases with other investments

🛒 Buying Strategy:
1. Reserve funds for maintenance+wages first
2. Select high value-for-money goods
3. Prioritize port specialties + revealed intel

🔄 Bartering Strategy:
1. Trade away surplus raw materials for the one you're actually short on
2. A modest Gold offer can secure a needed item faster than waiting on next voyage's market
3. Cancel an offer that's sitting unclaimed if you'd rather keep the material yourself

🤝 Trading Strategy:
1. Prioritize highest profit orders
2. Consider freight impact on margins
3. Finished orders yield high profit but incur VAT

⚠️ Risk Control:
1. Calculate fixed round costs: Maintenance + Wages
2. Keep funds consistently > fixed costs
3. Avoid over-expansion cash flow issues

🏴‍☠️ Pirates and Escorts:
1. The escort fee scales with your own Gold, so it's relatively cheap exactly when you're poor and the stakes are also low
2. Hire one when you're carrying enough Gold that losing it would actually hurt
3. Sailing without one is a fair bet when you have little to lose anyway

🆘 Borrowing and Lending:
1. Repay a loan as soon as you can afford it, instead of waiting for it to be deducted automatically at Round 8
2. Lending Gold raises your own reputation, so helping a captain who can clearly repay you is rarely a bad trade
3. Watch how much you've lent out across the voyage; it's still your Gold until it's actually repaid

💾 Save game progress frequently with Ctrl+S!`;
