# Difficulty Modes for PortMasters 2 Parallel Release

## A root level, production ready implementation proposal

Author: Engine and Systems
Status: Proposal for review
Scope: Add two additional difficulty levels to the Parallel Release, alongside the current single mode, by extracting the essence of the original PortMasters 2 three tier design and rebuilding it around the Parallel Release's own multiplayer and persistence strengths.

---

## 0. Executive summary

The original PortMasters 2 (the `ReactPM2` build, itself a faithful TypeScript port of the Python `server.py` original) ships three difficulty levels: Easy (8 rounds), Standard (12 rounds), and Hard (16 rounds). They are defined in one data record and threaded through the engine by a thin selector layer. The Parallel Release currently ships exactly one unnamed mode, and that mode is, feature for feature, the Easy tier: 8 rounds, the founding trio of Hemp, Silk, and Tea, four starter products, five ports, three artisan types, a flat pirate risk, and no content unlocks, imperial mandates, or corrupt brokers.

This proposal does three things:

1. It names the current mode and reframes it as the calibrated entry tier.
2. It adds two new difficulty levels that reproduce the *essence* of Standard and Hard, not by porting the original's large tier 1 and tier 2 content library (which the Parallel Release never authored), but by expressing that essence through the levers the Parallel Release already has, plus a small set of high identity new systems.
3. It leans difficulty into the Parallel Release's real differentiators: the synchronized multiplayer harbor, the persistent Captain's Legacy and Merits, and the social economy of bartering and financial aid.

The result is a data driven difficulty framework that is fully backward compatible, ships in de risked phases, and leaves a clean seam for a future full content pack.

---

## 1. How the original three levels actually work

Everything below is drawn from `ReactPM2/packages/shared/src/data/difficulties.ts`, `ReactPM2/apps/server/src/game/difficultyRules.ts`, `poolSelectors.ts`, `pirateHazard.ts`, and the tiered content data files. The original defines the whole difficulty surface in a single record:

```ts
export const DIFFICULTIES = {
  easy:     { rounds: 8,  tierUnlock: {},            brokerCorruption: false, pirateLoss: ['medium'],                mandates: { 3:0, 6:1, 8:2 } },
  standard: { rounds: 12, tierUnlock: { 1:4, 2:8 },  brokerCorruption: false, pirateLoss: ['medium','above_medium'], mandates: { 3:0, 7:1, 12:2 } },
  hard:     { rounds: 16, tierUnlock: { 1:6, 2:10 }, brokerCorruption: true,  pirateLoss: ['above_medium','high'],   mandates: { 6:0, 12:1, 16:2 } },
};
```

Five independent dials are encoded here, and every one of them is derived by a pure helper function rather than hardcoded into the round loop:

### 1.1 Voyage length (`rounds`)

8, 12, 16. This is the single most consequential dial. A longer voyage compounds every economic decision, widens the planning horizon, and raises the score ceiling. `difficultyRounds()` returns it; the engine ends the game when `currentRound` passes it.

### 1.2 Content breadth over time (`tierUnlock`)

The original carries a content library split into three tiers. `tierUnlock` maps a content tier to the round it joins the live pools:

|Pool|Tier 0 (always)|Tier 1|Tier 2|
|---|---|---|---|
|Resources|Hemp, Silk, Tea|Porcelain Clay, Copper Ore|Spices, Pearls|
|Products|Linen, Cotton, Brocade, Sachet|Bronze Mirror, Celadon|Foreign Balm, Pearl String|
|Ports|5 domestic|Fuzhou, Goryeo|Srivijaya, Dashi|
|Artisans|weaver, master, sachet maker|coppersmith, potter|perfumer, jeweler|
|Boons, Modules, Monsoon|tier 0 set|tier 1 set|tier 2 set|

`unlocked()` accumulates the pools as rounds pass the thresholds. Easy never leaves tier 0, so its market stays small and legible. Standard opens tier 1 at round 4 and tier 2 at round 8. Hard keeps the first five rounds relaxed, then opens tier 1 at round 6 and tier 2 at round 10.

Crucially, breadth also grows the *market hand size*: `phaseOptionCount = 5 + 3 * unlockedTier`, so the number of market cards on offer climbs 5, then 8, then 11 as tiers open. Easy sits at 5 all voyage; Hard reaches 11. A wider hand means a busier, denser, more competitive market.

Each tier opening is announced by a "Silk Road Charter" banner (`charterEvent()`, `CHARTER_EVENTS`): a piece of flavor that tells the harbor a new class of goods, ports, and artisans has arrived.

### 1.3 Risk severity (`pirateLoss`)

Pirate raids take a *fraction* of a captain's gold. The tier ladder is `medium = 0.15`, `above_medium = 0.25`, `high = 0.40`. The `pirateLoss` field is either one tier (a flat toll) or two (a step up at the voyage midpoint). Easy is a flat 15 percent. Standard steps 15 to 25 percent past the midpoint. Hard steps 25 to 40 percent. `pirateLossPct(difficulty, round, maxRounds)` computes it, switching tier at `floor(maxRounds / 2)`.

### 1.4 Adversarial systems (`brokerCorruption`)

Hard only. A corrupt broker can tip off pirates: with `BROKER_CORRUPTION_CHANCE = 0.3`, an extra `BROKER_CORRUPTION_RISK = 0.2` is added to the raid probability. This turns the broker, normally a pure convenience, into a double edged tool on the hardest tier.

### 1.5 Imperial pressure (`mandates`)

An Emperor's Mandate is a large scheduled order. `mandates` maps a round to an index into `EMPEROR_MANDATE_TEMPLATES` (three templates ordered small to large: rewards 135, 260, 420, with correspondingly larger material demands). Easy fires small mandates early (rounds 3, 6, 8). Hard back loads the largest ones (rounds 6, 12, 16). `emperorMandateSize()` returns the scheduled index, and the round loop injects the mandate order first when Phase 2 opens.

### 1.6 Environmental variance (Monsoon)

A parallel weather system (tier gated like everything else) resyncs each round, shifting port rewards, purchase prices, and pirate risk. It is not keyed on the difficulty record directly, but its pool is tier gated, so higher difficulties see richer weather.

### The essence, distilled

* Easy is short, narrow, gentle, and legible: a teaching tier.
* Standard is the full trade opening progressively across a brisker voyage, with risk that begins to bite past the midpoint, and no adversarial systems.
* Hard is long, back loaded, and adversarial: the richest content, the fiercest competition for cargo and coin, corrupt brokers, the largest mandates, and the steepest raids, rewarding long term planning over reflex.

The three escalation axes are: **length**, **breadth over time**, and **risk plus adversity**, punctuated by **imperial pressure**.

---

## 2. Where the Parallel Release stands today, and why a literal port is the wrong move

The Parallel Release (`PortMasters2-Parallel-Release`) is a different animal from `ReactPM2`. It is a Next.js plus Prisma plus Socket.IO application built around a real time multiplayer harbor, not a single player React client. Its current single mode maps one to one onto the original Easy tier:

|Dimension|Parallel Release today|Original Easy|
|---|---|---|
|Rounds (`MAX_ROUNDS`)|8|8|
|Resources|Hemp, Silk, Tea|same|
|Products|Linen, Cotton, Brocade, Sachet|same|
|Ports|5|5|
|Artisans|weaver, master, sachet maker|same|
|Content tiers|none authored|tier 0 only|
|Pirate model|20 percent chance to lose **all** gold; escort 10 percent|15 percent **partial** loss|
|Mandates, corruption, monsoon|none|mandates only|

Two facts drive the whole design decision:

1. **The Parallel Release only ever authored the tier 0 content set.** There is no Porcelain Clay, no Fuzhou port, no coppersmith, no tier 1 or tier 2 boons, modules, or weather. A literal reproduction of Standard and Hard would require authoring an entire content library (new resources, recipes, price tables, worker types, VAT math, icons, tutorial rewrites) and would put the carefully preserved verbatim economy at risk.

2. **The Parallel Release's real strengths are systems the original does not have:** a synchronized multiplayer room, persistent cross voyage progression (Captain's Legacy: Renown XP, levels, titles, starting gold bonus; Sea Master crowns; solvent voyage streaks), account wide Captain's Merits, Daily Check In, cross player bartering, and financial aid loans between captains, plus the Renown gated Broker's Favor.

The user brief is explicit: extract the *essence* of the two levels and rebuild them "with the unique flavor of the Parallel Release's vibe and strengths." So the recommendation is a hybrid: build the original's data driven framework exactly, but express the two new tiers through dials on the existing economy plus a few identity defining new systems, and wire difficulty into the persistence layer so it matters across weeks of play. The full content library is explicitly out of scope for this proposal, and the framework is designed so it can be dropped in later without rework.

---

## 3. The three tiers, named and specified

### 3.1 Naming

|Tier|Name|Icon|Maps to|One line|
|---|---|---|---|---|
|1 (current, renamed)|Fair Winds|🌤️|Easy|A gentle passage for new captains.|
|2 (new)|Open Waters|🌊|Standard|The full trade opens as the harbor grows busy.|
|3 (new)|Monsoon Season|⛈️|Hard|A long, adversarial haul for seasoned captains.|

Alternatives considered: tier 2 "Trade Winds" or "Silk Passage"; tier 3 "Storm Season", "Typhoon Run", or "The Long Haul". Names are display only and live in the config, so they are trivial to retune.

### 3.2 The `DifficultyConfig` table

Every dial below is a config field, not a hardcoded branch. Recommended launch values:

|Field|Fair Winds|Open Waters|Monsoon Season|
|---|---|---|---|
|`rounds`|8|12|16|
|`startingGold`|100|100|90|
|`maintenance` (fixedCost)|15|18|22|
|`incomeTaxRate`|0.10|0.10|0.12|
|Market cards base (purchase / order)|6 / 6|6 / 6|6 / 6|
|Charter growth (round: +cards)|none|r4:+2, r8:+2|r6:+2, r11:+3|
|Resulting card counts across voyage|6 all voyage|6, then 8, then 10|6, then 8, then 11|
|Pirate chance (first half / second half)|0.20 flat|0.22 / 0.30|0.28 / 0.38|
|Pirate model|wipe all|wipe all|wipe all|
|Escort cost rate|0.10|0.12|0.15|
|Broker corruption|off|off|on (0.30 chance a rumor is corrupt)|
|Imperial mandates (rounds)|3, 6|4, 8, 12|6, 12, 16|
|Mandate sizes (template index)|0, 1|0, 1, 2|1, 2, 2|
|Renown XP multiplier|1.0|1.25|1.6|
|Difficulty merits|none|Open Water Captain|Storm Sovereign, Eye of the Storm|

### 3.3 How each dial maps the original's essence onto Parallel Release systems

**Length.** Identical to the original: 8, 12, 16. This is the cleanest, highest impact lever and needs no new content. It flows directly into `maxRounds` on each captain's state.

**Breadth over time (charter growth).** The Parallel Release has no new goods to unlock, so "the market widens" is reproduced by scaling the number of market and order cards across the voyage, mirroring the original `phaseOptionCount = 5 + 3 * tier` curve. Monsoon reaches 11 cards exactly as Hard reaches an 11 card hand. The charter rounds fire a flavor banner in the log ("The Silk Road Charter opens: the harbor grows busy"), preserving the announcement beat even without new item classes. More cards means more opportunity density and, in a shared room, more competition for the same buyers. This same `charterUnlocks` schedule is the seam a future real content pack plugs into: instead of "plus 2 cards," a tier opening would inject new resources and ports.

**Risk.** The Parallel Release's pirate mechanic is all or nothing (lose every coin), which is already maximum severity, so escalating the *loss fraction* the way the original does is not available. Instead we escalate the *probability* and add a midpoint step up, exactly mirroring the original's two tier `pirateLoss` structure but on the chance axis rather than the severity axis. Escort cost rises in tandem, so the safety valve gets pricier as the seas get rougher. This keeps the Parallel Release's signature "pirates take everything" identity intact while reproducing the "risk bites harder past the midpoint" essence.

**Adversity (corrupt broker).** Monsoon only, mirroring Hard's `brokerCorruption`, and faithful to the original's core promise: the broker always delivers, and delivered intel is always true. That promise holds on every tier, Monsoon included. A corrupt broker still hands over the correct rumor with its guaranteed matching order; what it also does, on a 0.30 roll per rumor purchase, is leak the captain's position, so this round's raid chance rises by a fixed amount (0.08 at launch, set once per round rather than stacking). The leak is surfaced plainly, not hidden: a log line tells the captain the rumor came through, but word of their hold reached the pirates, so the seas are rougher this round. A conservative variant that signals the danger without printing the exact percentage is available as a copy only toggle, but the default is full disclosure. Wired through the existing `purchaseIntel` (which reveals the true rumor as always, then rolls the leak and sets the risk flag) and `resolvePirateAttack` (which reads the flag). The intel guarantee itself is never touched on any tier.

**Imperial pressure (Emperor's Mandate).** A guaranteed high value order injected on scheduled rounds, reusing the original's small, medium, large template idea with Parallel Release item names. Because the Parallel Release is multiplayer, the mandate leans on the social economy: it demands quantities a lone captain often cannot meet from their own hold, nudging players toward bartering and, when short, financial aid. Launch templates:

|Index|Size|Demand|Reward|
|---|---|---|---|
|0|small|Silk x4, Tea x3|135|
|1|medium|Brocade x2, Sachet x1|260|
|2|large|Cotton Clothes x2, Brocade x2, Sachet x2|420|

**Persistence weighting (the Parallel Release signature).** This is where difficulty earns its place in a game whose core loop is coming back over weeks. A harder voyage banks more Renown XP toward the permanent Captain's Legacy (`renownXpMultiplier`: 1.0, 1.25, 1.6), and unlocks difficulty scoped Captain's Merits (for example "Storm Sovereign" for a Sea Master crown earned on Monsoon, "Eye of the Storm" for finishing Monsoon with 200 plus reputation). Difficulty thus feeds the three persistent strands the Parallel Release already ships (Renown, crowns, merits) rather than being a throwaway per session toggle.

---

## 4. Architecture and injection points

Difficulty is a **room property**, chosen by the host at room creation and identical for every captain in that room. This is a hard correctness requirement (Section 6). The following is the complete list of touch points, in dependency order.

### 4.1 New module: `src/lib/game/difficulty.ts`

The single source of truth, modeled on the original's `difficulties.ts` plus `difficultyRules.ts` folded together:

```ts
export type Difficulty = "fair_winds" | "open_waters" | "monsoon";
export const DEFAULT_DIFFICULTY: Difficulty = "fair_winds";

export interface DifficultyConfig {
  key: Difficulty;
  name: string; badge: string; icon: string; tagline: string; summary: string;
  rounds: number;
  startingGold: number;
  maintenance: number;
  incomeTaxRate: number;
  purchaseCardsBase: number;
  orderCardsBase: number;
  charterUnlocks: Record<number, number>; // round -> extra cards added to both boards
  pirateChance: readonly [number] | readonly [number, number]; // flat, or [firstHalf, secondHalf]
  escortCostRate: number;
  brokerCorruption: boolean;
  mandates: Record<number, number>; // round -> mandate template index
  renownXpMultiplier: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = { /* Section 3.2 values */ };

export function normalizeDifficulty(v: unknown): Difficulty { /* fallback to DEFAULT */ }
export function difficultyConfig(v: unknown): DifficultyConfig { return DIFFICULTIES[normalizeDifficulty(v)]; }
export function roundsFor(d: unknown): number { return difficultyConfig(d).rounds; }
export function pirateChanceFor(d: unknown, round: number, maxRounds: number): number { /* midpoint step */ }
export function escortRateFor(d: unknown): number { return difficultyConfig(d).escortCostRate; }
export function marketCountsFor(d: unknown, round: number): { purchase: number; order: number } { /* base plus accumulated charterUnlocks */ }
export function mandateIndexFor(d: unknown, round: number): number | undefined { return difficultyConfig(d).mandates[round]; }
export function renownMultiplierFor(d: unknown): number { return difficultyConfig(d).renownXpMultiplier; }
```

Note the deliberate parallel to the original: `pirateChanceFor` reuses the exact midpoint logic of `pirateLossPct` (`round <= floor(maxRounds / 2)` selects the first tier), and `marketCountsFor` reuses the accumulation logic of `unlocked()` / `phaseOptionCount`.

The existing constants in `constants.ts` (`MAX_ROUNDS = 8`, `PIRATE_ATTACK_CHANCE = 0.2`, `ESCORT_COST_RATE = 0.1`, `PURCHASE_CARD_COUNT = 6`, `ORDER_CARD_COUNT = 6`) stay in place as the Fair Winds values and become the config defaults, so any code path not yet migrated keeps working unchanged.

### 4.2 Data model: `prisma/schema.prisma` and a new migration

Add one column to `Room`:

```prisma
model Room {
  // ...
  difficulty String @default("fair_winds")
}
```

A new migration under `prisma/migrations/` with `ALTER TABLE Room ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'fair_winds'`. Every existing room defaults to the current mode, so nothing breaks. No change to the per player `GameState` table, which is a JSON blob and absorbs the new field for free.

A second additive column on `CaptainLegacy` records the per difficulty breakdown for decision 4: `statsByDifficulty String @default("{}")`, a small JSON map of `{ [difficulty]: { crowns, bestScore } }`. A JSON column (rather than six fixed columns) keeps this open ended, so a future fourth tier needs no migration, matching how `GameState` is already a blob and how `CaptainMerit` is deliberately an open ended table. The existing top level `seaMasterCrowns` and `bestScore` columns stay untouched as the all tier totals; the JSON only adds the per tier split.

### 4.3 Game state: `src/lib/game/types.ts`

Add `difficulty: Difficulty` to `GameState`, and extend `createInitialGameState` to take it and derive from it:

```ts
export function createInitialGameState(
  startingGoldBonus = 0, renownLevel = 1, voyageEpoch = 0,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
): GameState {
  const cfg = difficultyConfig(difficulty);
  return {
    // ...
    difficulty,
    money: cfg.startingGold + startingGoldBonus,
    maxRounds: cfg.rounds,
    fixedCost: cfg.maintenance,
    // ...
  };
}
```

Every existing call site keeps compiling because `difficulty` has a default. `maxRounds` becomes difficulty derived, and because the endgame check (`currentRound > maxRounds`) already reads `maxRounds`, the longer voyages simply work.

### 4.4 Engine: `src/lib/game/engine.ts`

Five surgical edits, all reading `state.difficulty`:

* `startPhase1` (the `PURCHASE_CARD_COUNT` loop, around line 1149): use `marketCountsFor(state.difficulty, state.currentRound).purchase`. Emit the charter banner when `state.currentRound` is a `charterUnlocks` key.
* `startPhase2` (the `ORDER_CARD_COUNT` loop, around line 1285): use `marketCountsFor(...).order`. After the shared draw and the Broker's Whisper guarantee, inject the Emperor's Mandate order when `mandateIndexFor(state.difficulty, state.currentRound)` is defined.
* `resolvePirateAttack` (around line 1328): replace the flat `PIRATE_ATTACK_CHANCE` with `pirateChanceFor(state.difficulty, state.currentRound, state.maxRounds)`, plus the fixed corrupt broker bump when the once per round tip off flag is set.
* `hireEscort` (around line 1344): replace `ESCORT_COST_RATE` with `escortRateFor(state.difficulty)`.
* `purchaseIntel` (around line 1000): reveal the true rumor exactly as today, so delivery and truth are unchanged on every tier. On Monsoon, additionally roll the 0.30 corrupt broker chance; on a hit, set the once per round pirate risk flag (a new transient `brokerTippedPirates` boolean on `GameState`, reset each round in `startBoonDrafting` alongside the other per round flags) and log the leak plainly. `restartGame` (around line 1557): thread `difficulty` through so a fresh voyage keeps the room's difficulty.

Determinism note: card *counts* are a pure function of (difficulty, round), which are identical for every captain in the room, so the per captain seeded draw still produces each captain's own market while the *structure* stays consistent room wide. The mandate order and any guaranteed intel order continue to be appended with the captain's own local randomness, exactly as the existing Broker's Favor and Whisper guarantees already are, so they never perturb the shared seed.

### 4.5 Session bootstrap: `src/lib/use-game-session.ts` and `src/lib/use-phase-sync.ts`

* The `GET /api/game/state` route already returns a `checkpoint` for a fresh captain; add `difficulty` to that payload (Section 4.6) and, importantly, return it even when a saved state exists, so a load can refresh `state.difficulty` from the room the same way it already refreshes `renownLevel`. This guards against a stale difficulty on a save that predates a restart which changed it.
* `START_FRESH` and the `INIT` path pass the room difficulty into `createInitialGameState`.
* `use-phase-sync.ts` `onRestarted` passes the room difficulty into `restartGame` (the server already sends `voyageEpoch` on `room:restarted`; add `difficulty` to that broadcast).

### 4.6 API routes

* `POST /api/rooms` (`src/app/api/rooms/route.ts`): extend `CreateSchema` with `difficulty: z.enum([...]).default("fair_winds")`, persist it on create, return it. `GET /api/rooms` list: include `difficulty` per room (for the lobby badge).
* `GET /api/rooms/[id]` and the join routes: include `difficulty` in the room payload.
* `GET /api/game/state`: include `room.difficulty` in the `checkpoint` object, and add a sibling field even when a save exists.

### 4.7 Realtime: `src/server/realtime.ts`

* Room payloads (`roomMembers`, `emitRoomMembers`, the `room:join` acknowledgement, `room:restarted`) include `difficulty` so clients can render it and seed fresh state correctly.
* `room:start` and `room:restart` need no structural change: round progression is driven by each captain's own deterministic engine plus the ready check vote counter, and the server never runs game rules. It only needs to *carry* the difficulty to clients.
* `maybeConcludeVoyage` (around line 382): read the room's `difficulty`, apply `renownMultiplierFor(difficulty)` to `xpGained` before banking Renown XP, and pass `difficulty` into the merit evaluation.

### 4.8 Persistence: `src/lib/game/legacy.ts` and `src/lib/game/merits.ts`

* The XP multiplier is applied at the point of conclusion in realtime (keeping `legacy.ts` a pure, difficulty agnostic curve). The multiplier value itself lives in `difficulty.ts`.
* `merits.ts`: add new `MeritId`s and rules. `MeritEvalInput` gains a `difficulty` field; `qualifyingMerits` grants "Open Water Captain" (finish an Open Waters voyage solvent), "Storm Sovereign" (Sea Master crown on Monsoon), and "Eye of the Storm" (finish Monsoon with 200 plus reputation). Merits carry no gameplay power, so this list can grow with zero economy risk, exactly as the module header already notes.
* Crown and best score breakdown (decision 4): at conclusion, alongside the existing `seaMasterCrowns` and `bestScore` writes, `maybeConcludeVoyage` also updates the `statsByDifficulty` JSON for the room's tier (increment that tier's crown count when crowned, raise that tier's best score). The Captain's Legacy card reads it to show a per tier prestige split, and a future leaderboard reads it to build three segmented boards. The crown award itself is unchanged.

### 4.9 UI surfaces

* Lobby "Create Room" composer: a host only difficulty switch styled as an iOS style three position segmented slider (a pill track with three detents the thumb snaps to: Fair Winds, Open Waters, Monsoon Season), the same interaction feel as a low to high effort selector. The track carries an intensity gradient from calm sky blue at Fair Winds, through ocean teal at Open Waters, to storm slate at Monsoon Season, and the thumb shows the tier icon. A live summary card below the switch updates as the thumb moves, showing the tier name, tagline, and summary paragraph (mirroring the original's `DIFFICULTY_INFO`). Only the host can move the thumb; every other captain sees the same control in a read only state locked to the host's choice. The control disables the moment the voyage starts (`started` flips true), with a small lock hint, and becomes editable again only through a restart.
* Headcount nudge (decision 5): on Open Waters and Monsoon Season, the lobby shows a soft recommendation to gather a fuller harbor, since barter and aid land harder with more captains. It is advice only; the start gate stays at 2 captains for every tier.
* Lobby room list and room card: a difficulty badge chip.
* In game `GameStatusPanel` and `GamePhasePanel`: a difficulty chip beside the round counter (the round counter already reads `game.maxRounds`, so `X / 8`, `X / 12`, `X / 16` render for free). This mirrors the original's always visible `DifficultyChip`.
* Tutorial and guide text: a short note on what each mode changes.
* New log banners for charter openings and Emperor's Mandates.

---

## 5. Phased rollout

The plumbing is separable from the balance, so we ship in de risked slices. Each phase is independently shippable and reversible.

**Phase A: framework and rename (zero gameplay change).** Introduce `difficulty.ts`, the schema migration, and thread `difficulty` through every touch point in Section 4, but ship only Fair Winds with today's exact values under its new name. Every existing room defaults to Fair Winds. This proves the plumbing (room property, per captain threading, UI chip, conclusion multiplier of 1.0) with no balance surface at all. Fully backward compatible.

**Phase B: Open Waters.** Turn on the 12 round tier: charter growth to 8 then 10 cards, the pirate step up, higher escort cost, light mandates, and the 1.25 Renown multiplier. Playtest with two to four captains; tune the mandate rewards and the second half pirate chance.

**Phase C: Monsoon Season.** The 16 round tier: growth to 11 cards, the steepest raids, the corrupt broker, the largest back loaded mandates, and the difficulty merits. This is the heaviest balance lift and gets the most playtesting.

**Phase D: polish and telemetry.** Charter and mandate banners, tutorial copy, difficulty badges everywhere, and instrumentation (bankruptcy rate, average final reputation, escort uptake, mandate fill rate per difficulty) to drive a data informed balance retune.

---

## 6. Correctness, determinism, and multiplayer safety

The one non negotiable invariant: **every captain in a room must resolve the same difficulty.** If two captains disagreed on `maxRounds`, the room's shared conclusion (which fires only when every member reaches `endgame` or `bankruptcy`) could deadlock or crown incorrectly. Three mechanisms enforce the invariant:

1. Difficulty lives on the `Room` row, the server side source of truth, never chosen per captain.
2. On every load, `state.difficulty` is refreshed from the room, the same pattern already used for `renownLevel`, so a stale save cannot carry a wrong difficulty.
3. A restart that changes difficulty already bumps `voyageEpoch` and wipes every saved `GameState` (the existing `room:restart` behavior), so no captain can straddle two difficulties across a restart.

Determinism is preserved because all difficulty derived structure (card counts, pirate chance, mandate schedule) is a pure function of (difficulty, round), both of which are room uniform. The per captain seed continues to vary only the *draw*, never the *rules*, so each captain keeps their own market while the room stays coherent.

---

## 7. Test plan

Modeled on the original's `difficultyRules.test.ts`, which we can lift almost verbatim in structure.

* **Unit (`difficulty.ts`):** `normalizeDifficulty` fallback; `roundsFor` per tier; `pirateChanceFor` at the midpoint boundary (round `floor(maxRounds/2)` versus the next round) for each tier; `marketCountsFor` at and around each charter round; `mandateIndexFor` on and off scheduled rounds; `renownMultiplierFor`.
* **Engine:** `startPhase1` and `startPhase2` produce the expected card counts per (difficulty, round); `resolvePirateAttack` uses the difficulty chance (inject a deterministic RNG); a mandate order is present exactly on scheduled rounds; `restartGame` preserves difficulty and re derives `maxRounds`.
* **Integration:** a two captain room on each difficulty concludes at the correct round; a mid voyage joiner snaps to the room checkpoint with the correct `maxRounds`; a restart that changes difficulty reseeds and re locks the room; the conclusion applies the right Renown multiplier and grants difficulty merits.
* **Determinism:** the same (seed, difficulty, round) reproduces an identical card structure across reloads.

---

## 8. Risks and mitigations

|Risk|Mitigation|
|---|---|
|Monsoon becomes brutally swingy (38 percent wipe plus corruption)|Midpoint gating keeps the first half calmer; escort and financial aid are the release valves; ship behind Phase C playtesting; keep a partial loss fallback knob in reserve.|
|Multiplayer desync if difficulty is not uniform|Room sourced difficulty, refreshed on load, saves wiped on restart (Section 6).|
|Longer voyages feel repetitive without new goods|More cards plus mandates plus reward variance carry the mid game; the `charterUnlocks` schedule is the ready seam for a real content pack later.|
|Scope creep into a full content port|Explicitly out of scope; the framework is content agnostic and additive.|
|Players do not understand what a mode changes|Per mode summary cards at creation and an always visible in game chip, mirroring the original's `DIFFICULTY_INFO` and `DifficultyChip`.|
|Balance drift between the config and the UI copy|Single source of truth in `difficulty.ts`; UI reads the same record, so numbers and prose cannot diverge.|

---

## 9. Decisions

All five product questions are resolved.

1. Round counts stay at the original 8 / 12 / 16.
2. Monsoon keeps the Parallel Release all or nothing pirate identity; difficulty escalates raid *chance* (with the midpoint step up), never the loss fraction.
3. Difficulty is host only, presented as an iOS style three position segmented slider (see Section 4.9).
4. The Sea Master crown logic stays as is; it is already fair, since difficulty is room uniform and the crown is a within room award. Crowns and best score are additionally recorded broken down by difficulty on the account, and any future global leaderboard is three separate boards, one per tier, rather than one weighted list. Cross tier prestige is carried by the Renown XP multiplier and the difficulty merits. See Sections 4.2 and 4.8.
5. The minimum headcount stays at 2 for every tier. Open Waters and Monsoon show a soft lobby nudge recommending a fuller harbor, and mandate quantities are tuned to stay meetable by a two captain harbor through barter and aid. Scaling mandate size and reward to active headcount is noted as a later balance option, not a launch requirement.

---

## 10. Appendix: file change checklist

|File|Change|
|---|---|
|`src/lib/game/difficulty.ts`|New. Config record plus pure selectors.|
|`src/lib/game/constants.ts`|Keep current values as Fair Winds defaults; add mandate templates and corruption constants.|
|`src/lib/game/types.ts`|`GameState.difficulty`; `createInitialGameState` derives money, maxRounds, fixedCost from config.|
|`src/lib/game/engine.ts`|`startPhase1`, `startPhase2`, `resolvePirateAttack`, `hireEscort`, `purchaseIntel`, `restartGame`.|
|`src/lib/game/merits.ts`|New difficulty scoped merits and `MeritEvalInput.difficulty`.|
|`prisma/schema.prisma` plus migration|`Room.difficulty` column.|
|`src/app/api/rooms/route.ts`|Create schema, persist, and list difficulty.|
|`src/app/api/rooms/[id]/route.ts`, join routes|Return difficulty.|
|`src/app/api/game/state/route.ts`|Return `difficulty` in checkpoint and alongside a saved state.|
|`src/lib/use-game-session.ts`|Thread difficulty into fresh and restored state.|
|`src/lib/use-phase-sync.ts`|Thread difficulty into `restartGame` on `room:restarted`.|
|`src/server/realtime.ts`|Carry difficulty in room payloads; apply Renown multiplier and difficulty merits at conclusion.|
|`src/components/portmasters/Lobby.tsx`|Difficulty selector at creation; badge in room list.|
|`src/components/portmasters/game/GameStatusPanel.tsx`, `GamePhasePanel.tsx`|Difficulty chip.|
|Tests under a `game` test suite|Unit, engine, integration, determinism (Section 7).|
