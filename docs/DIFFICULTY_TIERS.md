# Difficulty tiers: design record

Status: shipped. Fair Winds, Open Waters and Monsoon Season are all playable, and the host picks one when creating a room.

This is the record of how the three tiers were designed and how they were built, kept because the reasoning behind the numbers is not visible in the numbers. It began as a proposal to add two harder levels to a game that shipped exactly one, by rebuilding the essence of the original PortMasters 2 three level design around this project's own multiplayer and persistence systems. Where the built version departed from the proposal, this document says so; where the proposal is still open, it says that too. The code is the source of truth for every value below: `src/lib/game/difficulty.ts` holds the tier table, and the tests in `scripts/tests/unit.game.ts` and `scripts/tests/integration.voyage.ts` pin it.

---

## 1. How the original three levels worked

The original PortMasters 2 (the `ReactPM2` build, a faithful TypeScript port of the Python `server.py` original) ships Easy (8 rounds), Standard (12 rounds) and Hard (16 rounds), defined in one data record and threaded through the engine by a thin selector layer:

```ts
export const DIFFICULTIES = {
  easy: {
    rounds: 8,
    tierUnlock: {},
    brokerCorruption: false,
    pirateLoss: ["medium"],
    mandates: { 3: 0, 6: 1, 8: 2 },
  },
  standard: {
    rounds: 12,
    tierUnlock: { 1: 4, 2: 8 },
    brokerCorruption: false,
    pirateLoss: ["medium", "above_medium"],
    mandates: { 3: 0, 7: 1, 12: 2 },
  },
  hard: {
    rounds: 16,
    tierUnlock: { 1: 6, 2: 10 },
    brokerCorruption: true,
    pirateLoss: ["above_medium", "high"],
    mandates: { 6: 0, 12: 1, 16: 2 },
  },
};
```

Five independent dials, each derived by a pure helper rather than hardcoded into the round loop:

**Voyage length.** 8, 12, 16. The single most consequential dial: a longer voyage compounds every economic decision, widens the planning horizon, and raises the score ceiling.

**Content breadth over time.** A content library split into three tiers, with `tierUnlock` mapping a tier to the round its charter opens:

| Pool                    | Tier 0 (always)                | Tier 1                     | Tier 2                     |
| ----------------------- | ------------------------------ | -------------------------- | -------------------------- |
| Resources               | Hemp, Silk, Tea                | Porcelain Clay, Copper Ore | Spices, Pearls             |
| Products                | Linen, Cotton, Brocade, Sachet | Bronze Mirror, Celadon     | Foreign Balm, Pearl String |
| Ports                   | 5 domestic                     | Fuzhou, Goryeo             | Srivijaya, Dashi           |
| Artisans                | weaver, master, sachet maker   | coppersmith, potter        | perfumer, jeweler          |
| Boons, Modules, Monsoon | tier 0 set                     | tier 1 set                 | tier 2 set                 |

Easy never leaves tier 0. Standard opens tier 1 at round 4 and tier 2 at round 8. Hard keeps the first five rounds relaxed, then opens tier 1 at round 6 and tier 2 at round 10. Breadth also grows the market hand: 5 cards, then 8, then 11 as tiers open, and each opening is announced by a Silk Road Charter banner.

**Risk severity.** Pirate raids take a fraction of a captain's gold: 15 percent, 25 percent or 40 percent, flat on Easy, stepping up at the voyage midpoint on the other two.

**Adversity.** Hard only: a corrupt broker can tip off pirates, adding to the raid probability on a 30 percent roll.

**Imperial pressure.** An Emperor's Mandate is a large scheduled order. Easy fires small ones early (rounds 3, 6, 8); Hard back loads the largest (rounds 6, 12, 16).

Distilled: Easy is short, narrow, gentle and legible, a teaching tier. Standard is the full trade opening progressively across a brisker voyage, with risk that bites past the midpoint. Hard is long, back loaded and adversarial. The three escalation axes are length, breadth over time, and risk plus adversity, punctuated by imperial pressure.

---

## 2. What this project had before tiers, and why a literal port was the wrong move

Before this work the Parallel Release shipped one unnamed mode, and that mode was the original's Easy tier feature for feature: 8 rounds, Hemp, Silk and Tea, four products, five ports, three artisans, a flat 20 percent raid chance, and no unlocks, mandates or corrupt brokers. Two facts shaped the design.

First, the Parallel Release had authored only the tier 0 content. A literal reproduction of Standard and Hard meant writing a whole content library and put the carefully preserved economy at risk, so the proposal expressed breadth purely as card density. That is the one place the build went further than the plan: the tiered goods, ports, artisans, boons and modules were authored after all (see `src/lib/game/pools.ts` and the `TIER0`, `TIER1`, `TIER2` pools in `src/lib/game/constants.ts`), so a charter now opens real content as well as a busier board.

Second, the Parallel Release's real strengths are systems the original never had: a synchronized multiplayer harbor, persistent progression (Renown, crowns, merits, the daily check in), bartering and aid between captains. So the tiers were built to lean on those rather than on a content port: a harder voyage advances the permanent Captain's Legacy faster, unlocks its own merits, and pushes mandates that are sized to need bartering and aid to fill.

The pirate model is the one deliberate departure from the original's essence. Here a raid takes every coin, which is already maximum severity, so the tiers escalate the raid chance and add the midpoint step rather than escalating a loss fraction. "Pirates take everything" stays intact; "risk bites harder past the midpoint" is reproduced on the chance axis instead.

---

## 3. The three tiers as built

| Tier                  | Name           | Icon | Maps to  | One line                                        |
| --------------------- | -------------- | ---- | -------- | ----------------------------------------------- |
| 1 (the original mode) | Fair Winds     | 🌤️   | Easy     | A gentle passage for new captains.              |
| 2                     | Open Waters    | 🌊   | Standard | The full trade opens as the harbor grows busy.  |
| 3                     | Monsoon Season | ⛈️   | Hard     | A long, adversarial haul for seasoned captains. |

Every dial is a field of `DifficultyConfig` in `src/lib/game/difficulty.ts`, never a branch in the engine. Current values:

| Field                                    | Fair Winds   | Open Waters                    | Monsoon Season                                          |
| ---------------------------------------- | ------------ | ------------------------------ | ------------------------------------------------------- |
| `rounds`                                 | 8            | 12                             | 16                                                      |
| `startingGold`                           | 100          | 100                            | 90                                                      |
| `maintenance`                            | 15           | 18                             | 22                                                      |
| Cards on each board at the start         | 6            | 6                              | 6                                                       |
| `tierUnlock` (content tier: round)       | none         | 1: round 4, 2: round 8         | 1: round 6, 2: round 11                                 |
| `cardsPerTier` (extra cards per opening) | none         | +2, +2                         | +2, +3                                                  |
| Card counts across the voyage            | 6 all voyage | 6, then 8, then 10             | 6, then 8, then 11                                      |
| `pirateChance` (first half / second)     | 0.20 flat    | 0.22 / 0.30                    | 0.28 / 0.38                                             |
| `escortCostRate`                         | 0.10         | 0.12                           | 0.15                                                    |
| Corrupt broker                           | off          | off                            | on: 0.30 chance per rumor, +0.08 raid risk once a round |
| `mandates` (round: template)             | none         | 4: small, 8: medium, 12: large | 6: medium, 12: large, 16: large                         |
| `renownXpMultiplier`                     | 1.0          | 1.25                           | 1.6                                                     |
| Difficulty merits                        | none         | Open Water Captain             | Storm Sovereign, Eye of the Storm                       |

Fair Winds is the game exactly as it played before tiers existed. Its values used to be flat constants; moving them into the tier table changed nothing for that mode, and `scripts/tests/integration.voyage.ts` keeps a suite of "fair_winds identity guarantees" so that stays true.

**Mandate templates**, fixed data with no randomness so every captain in a room is dealt the identical commission, and exempt from VAT as an imperial levy rather than a taxed sale:

| Template | Port     | Demand                                   | Reward |
| -------- | -------- | ---------------------------------------- | ------ |
| small    | Quanzhou | Silk x4, Tea x3                          | 135    |
| medium   | Yangzhou | Brocade x2, Sachet x1                    | 260    |
| large    | Hangzhou | Cotton Clothes x2, Brocade x2, Sachet x2 | 420    |

**The corrupt broker** keeps the broker's core promise on every tier: the rumor always comes through and is always true. What Monsoon adds is a 30 percent roll on each rumor purchase that leaks the captain's position, raising that round's raid chance by 0.08, set once per round rather than stacking, and announced plainly in the log rather than hidden. `purchaseIntel` in `src/lib/game/engine/orders.ts` rolls it and sets a transient `brokerTippedPirates` flag; `resolvePirateAttack` in `src/lib/game/engine/pirates.ts` reads it; the flag resets each round with the other per round flags in `startBoonDrafting`.

**The merits** live in `src/lib/game/merits.ts`: Open Water Captain for finishing an Open Waters voyage solvent, Storm Sovereign for a Sea Master crown on Monsoon, Eye of the Storm for finishing Monsoon with 200 or more Reputation. Merits carry no gameplay power, so this list can grow with zero economy risk.

---

## 4. Where it lives

Difficulty is a room property. The host picks it when creating the room, it is stored on `Room.difficulty`, and every captain in the harbor resolves the same tier. There is no way to change it afterwards; a different tier means a new room.

| Piece                                              | Where                                                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The tier table and the pure selectors              | `src/lib/game/difficulty.ts`: `normalizeDifficulty`, `roundsFor`, `pirateChanceFor`, `escortRateFor`, `marketCountsFor`, `unlockedTierFor`, `mandateIndexFor`, `renownMultiplierFor` |
| Tiered content and what is unlocked this round     | The `TIER0`, `TIER1`, `TIER2` pools in `src/lib/game/constants.ts`, joined to the schedule by `src/lib/game/pools.ts`                                                                |
| The room column                                    | `Room.difficulty` in `prisma/schema.prisma`, defaulting to `fair_winds` so every room made before tiers existed kept the mode it had                                                 |
| Per captain state                                  | `GameState.difficulty`, set by `createInitialGameState` in `src/lib/game/types.ts`, which derives starting Gold, `maxRounds` and the maintenance fee from it                         |
| Card counts and the charter banner                 | `startPhase1` in `src/lib/game/engine/market.ts`                                                                                                                                     |
| Mandate injection                                  | `startPhase2` in `src/lib/game/engine/orders.ts`                                                                                                                                     |
| Raid odds, escort fee, the corrupt broker          | `src/lib/game/engine/pirates.ts` and `purchaseIntel` in `src/lib/game/engine/orders.ts`                                                                                              |
| Restart keeping the tier                           | `restartGame` in `src/lib/game/engine/lifecycle.ts`                                                                                                                                  |
| Renown multiplier and difficulty merits at the end | `maybeConcludeVoyage` in `src/server/realtime.ts`, with the per tier crown and best score split written to `CaptainLegacy.statsByDifficulty`                                         |
| Picking a tier                                     | The three way toggle in the create room form in `src/components/portmasters/Lobby.tsx`, plus the tier chip on every room card                                                        |
| Seeing the tier in play                            | The chip beside the round counter in `GameStatusPanel`, the tier aware Settlement copy, and the per tier row on the Captain's Legacy card                                            |
| Tier aware player copy                             | `tutorialSteps`, `guideText` and `tipsText` in `src/lib/game/constants.ts`, generated from the tier so voyage length, raid odds and mandate rounds never drift from the engine       |

Loading a saved voyage refreshes `state.difficulty` from the room, the same way `renownLevel` is refreshed, so a save can never carry a tier the room does not have.

---

## 5. Correctness and multiplayer safety

The one invariant that cannot bend: every captain in a room resolves the same difficulty. If two captains disagreed about `maxRounds`, the shared conclusion, which fires only when every member reaches the endgame or bankruptcy, could stall or crown the wrong captain. Three things enforce it:

1. The tier lives on the `Room` row, the server's source of truth, and is never chosen per captain.
2. Every load refreshes `state.difficulty` from the room, so a stale save cannot carry a wrong tier.
3. A restart bumps `voyageEpoch` and wipes every saved `GameState`, so no captain can straddle two voyages.

Determinism holds because everything the tier decides (card counts, raid chance, the mandate schedule, which content is open) is a pure function of the tier and the round, and both are identical across the room. The per captain seed varies only the draw, never the rules, so each captain keeps their own market while the room stays coherent.

---

## 6. How it shipped, and what is still open

The work went out in slices, each one shippable on its own: the framework with Fair Winds alone under its new name (no gameplay change, verified against the old constants), then Open Waters with the lobby toggle, then Monsoon Season with the corrupt broker and the three merits, then the tier aware copy and the charter banner. The flat constants the tiers replaced (`MAX_ROUNDS`, `PIRATE_ATTACK_CHANCE`, `ESCORT_COST_RATE`, `PURCHASE_CARD_COUNT`, `ORDER_CARD_COUNT`) are gone; the tier table is their only source now.

Two things from the proposal were not built. The lobby was meant to show a soft nudge on the harder tiers recommending a fuller harbor; it does not, and the start gate stays at two captains for every tier. Telemetry for a data informed balance pass (bankruptcy rate, average final Reputation, escort uptake, mandate fill rate per tier) was never added.

Still open: the balance itself. Open Waters and Monsoon have been played but not tuned against real data, and the mandate rewards and second half raid odds are the values most likely to move once they are.

---

## 7. Decisions

1. Round counts stay at the original 8, 12 and 16.
2. Monsoon keeps the all or nothing pirate identity; difficulty escalates raid chance with a midpoint step, never the loss fraction.
3. The tier is the host's alone, chosen once at creation.
4. The Sea Master crown logic is unchanged, since the tier is room uniform and the crown is a within room award. Crowns and best score are also recorded per tier on the account, so a future leaderboard is three boards, one per tier, rather than one weighted list; cross tier prestige rides on the Renown multiplier and the difficulty merits.
5. The minimum headcount stays at two for every tier. Mandate quantities are tuned to be meetable by a two captain harbor through barter and aid.

---

## 8. Risks

| Risk                                                              | Mitigation                                                                                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monsoon becomes brutally swingy (38 percent wipe plus corruption) | Midpoint gating keeps the first half calmer; escort and financial aid are the release valves; a partial loss knob stays in reserve if playtests demand it. |
| Multiplayer desync if the tier is not uniform                     | Room sourced tier, refreshed on load, saves wiped on restart (section 5).                                                                                  |
| Balance drift between the config and the UI copy                  | One source of truth in `difficulty.ts`; every chip, banner and tutorial line reads the same record, so numbers and prose cannot diverge.                   |
| Players not understanding what a tier changes                     | A tagline and summary on the create room toggle, a tier chip in the lobby and in play, and tutorial text generated from the tier itself.                   |
