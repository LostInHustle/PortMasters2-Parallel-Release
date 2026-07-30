# The Harbor Manifest: eighteen systems for PortMasters 2 Parallel Release

Recovered from an artifact that lived only in a scratch directory and a session transcript, and committed here so it survives. This is the design source for every numbered feature in [NEW_FEATURES_GUIDE.md](NEW_FEATURES_GUIDE.md), which documents only the ones already playable. When the two disagree about what exists, the guide is right about status and this file is right about intent.

Every claim in the original about what the project contained was checked against this repository's source rather than assumed, and every file path and function name it references existed at the time of writing. Some have since moved, so treat paths as a starting point rather than gospel.

## Status at a glance

| #   | Entry                   | Group                                 | Effort                                                  | Status    |
| --- | ----------------------- | ------------------------------------- | ------------------------------------------------------- | --------- |
| 01  | The Harbor Pulse        | I. Market rhythm                      | moderate                                                | Shipped   |
| 02  | Word on the Docks       | I. Market rhythm                      | light to moderate                                       | Shipped   |
| 03  | Tidewatch Alerts        | I. Market rhythm                      | moderate                                                | Shipped   |
| 04  | Convoy Ventures         | II. The peer economy                  | substantial                                             | Shipped   |
| 05  | Backing                 | II. The peer economy                  | moderate                                                | Shipped   |
| 06  | Partial Sight           | II. The peer economy                  | moderate                                                | Not built |
| 07  | Bequest Routing         | II. The peer economy                  | light                                                   | Not built |
| 08  | Trading Houses          | III. Identity and the long game       | moderate, needs a balance session                       | Not built |
| 09  | House Rally             | III. Identity and the long game       | light, once entry eight exists                          | Not built |
| 10  | Ages of the Ledger      | III. Identity and the long game       | moderate                                                | Not built |
| 11  | Captain's Rival         | III. Identity and the long game       | moderate                                                | Not built |
| 12  | Voyage Chronicle        | III. Identity and the long game       | light to moderate                                       | Not built |
| 13  | Ledger Integrity Pass   | IV. Trust and safety                  | moderate, do this before entries eight, ten, and eleven | Not built |
| 14  | Harbor Watch            | IV. Trust and safety                  | light                                                   | Not built |
| 15  | Bilingual Harbor        | V. Getting more captains to the table | substantial                                             | Dropped   |
| 16  | Colorblind Safe Palette | V. Getting more captains to the table | light                                                   | Not built |
| 17  | Quick Start Match       | V. Getting more captains to the table | moderate                                                | Not built |
| 18  | Fleet Ticker            | VI. Reading the room                  | light                                                   | Not built |

Entry 15, Bilingual Harbor, is **dropped, not pending**. English and Chinese localization was built in full and then removed at the project owner's request. Do not treat it as outstanding work.

## I. Market rhythm

### 01. The Harbor Pulse

_The market remembers what the room just did to it._

New mechanism. Effort: moderate. **Shipped.**

**The situation today.** Every captain's port market is generated from a seed built out of the room id, that captain's own user id, the current voyage epoch, and the round number, inside `genResourceCard` in `src/lib/game/engine.ts`. Two captains in the same harbor see different prices for the same goods on the same round, on purpose, and nothing about what one captain buys ever changes what any other captain sees. The market is private and self contained.

**What we add.** At the moment Phase 1 closes each round, every client already knows exactly what it bought, broken down by good. Relay a single small tally of that, summed across the whole room, once per round, the same way the server already relays a room wide barter board and aid board. At the start of the next round's Phase 1, fold that tally into the price roll `genResourceCard` already runs: a good the room leaned into heavily last round tightens and gets a little pricier, a good nobody touched softens. The effect is a lean, not a shove, and it never overrides the underlying seeded roll, only nudges it.

**Why this fits.** A captain who wants to profit from the pulse has to pay attention to what the rest of the harbor is doing, not to a hidden die roll nobody could ever see coming. That is a genuinely different kind of attention, and it only makes sense in a game where a room of real people already share a table, which is exactly what this game already is.

**System notes.** One new small object relayed by `src/server/realtime.ts` at the top of each round's Phase 1 transition, read by every client's `genResourceCard` call as one more multiplier, alongside the ones already applied there for Boons and modules.

### 02. Word on the Docks

_The room's biggest moment happens to whoever gets there first, not on a fixed round number._

New mechanism. Effort: light to moderate. **Shipped.**

**The situation today.** Open Waters and Monsoon Season already schedule Imperial Mandates, large guaranteed orders that appear on a fixed round every single voyage, defined per tier in `src/lib/game/difficulty.ts`. Those stay exactly as they are. This adds a second, different kind of peak moment alongside them, not instead of them.

**What we add.** A milestone reached through ordinary play, being first in the room to complete three trade orders in one voyage, say, or first to clear a chosen profit total. The check runs on every client alongside the order completion logic already in `engine.ts`. The first client to detect a crossing reports it to the server, which arbitrates exactly the way it already arbitrates who wins a race to accept the same barter offer, first report wins, every later report is quietly ignored. The winner is announced to the whole room over the same `room:system` channel already used for Merit and Renown announcements, and gets first pick of a small reward before the rest of the table can even react.

**Why this fits.** Which round it lands on and who wins it depends entirely on how this specific table plays this specific voyage, so no two harbors experience it on the same round or see the same captain win it. That unpredictability is only possible because real captains are racing each other in a shared room, something a script reading a difficulty table can never reproduce no matter how it is tuned.

**System notes.** Reuses the exact arbitration pattern already proven in the barter board's accept race, and the exact broadcast channel already used for Merit and Renown system messages, so the amount of genuinely new server code stays small.

### 03. Tidewatch Alerts

_A strong room earns a moment, never a different game._

Reworked idea. Effort: moderate. **Shipped.**

**The situation today.** Nothing currently reacts to how well a room is doing together, only to how well one captain is doing individually.

**What we add.** Once per voyage, if the room's combined current Reputation, the same score already tracked on every `GameState` and already summed for other purposes inside the phase advance flow in `src/server/realtime.ts`, crosses a threshold scaled to the difficulty tier the host already chose, every captain's board gets one additional bonus card for the remainder of that round only, framed in the log as the harbor taking notice of a bustling crew. It never changes round count, never changes which tier's mandate schedule or raid odds apply, and never fires more than once per voyage, so it reads as a flourish a strong table earns, not a second difficulty system quietly overruling the host's first one.

**Why this fits.** It keeps the part of the source page's Widening Chart idea worth keeping, a room's own performance should be able to shape what happens next, while dropping the part that could not coexist with the difficulty system already shipped, as explained in full above.

**System notes.** One threshold check added to the same per round summed score calculation `src/server/realtime.ts` already performs, gated behind a per voyage flag on the room's in memory checkpoint so it can only fire once.

## II. The peer economy

### 04. Convoy Ventures

_An order too big for one hold becomes a shared bet on the room._

New mechanism. Effort: substantial. **Shipped.**

**The situation today.** Nothing today lets more than two captains combine toward the same trade goal at once. Every existing tool, barter, loans, Broker's Favor, tops out at two captains.

**What we add.** A captain posts a Convoy Venture, an order sized larger than any single hold could fill alone, open for other captains to buy into with gold or goods before a deadline round. If the venture fills in time, the reward splits by how much each captain actually contributed. If the deadline passes unfilled, every stake only returns in part, so joining one is a real bet on the room finishing it together, not a favor with no downside.

**Why this fits.** It gives the peer economy this game already leads on a fourth register entirely, pooled stakes rather than one to one trades, something neither this project nor the sibling codebase the source audit compared it against has ever attempted.

**System notes.** A new record scoped to a room and voyage, contributions tracked the same way `loansGiven` already tracks lending in `src/lib/game/types.ts`, settlement resolved deterministically at the deadline round inside `engine.ts`, announced over the existing `room:system` channel. This is the single largest addition on this entire list, and the only one that introduces a genuinely new table to the schema.

### 05. Backing

_Trust becomes something a captain can actually spend._

New mechanism. Effort: moderate. **Shipped.**

**The situation today.** The loan system already tracks exactly who owes what to whom, on both the borrower's `debts` list and the lender's `loansGiven` list, defined in `src/lib/game/types.ts`. That data is pure bookkeeping today. It never changes how any captain treats any other captain.

**What we add.** A third captain, one who already has an established lending history with the borrower, can co sign part of an outstanding loan, splitting the risk of default between the co signer and the original lender. If the loan goes unpaid, both absorb a share instead of one captain absorbing all of it.

**Why this fits.** The sibling codebase this game gets compared against has no lending system at all, so there was never anything there to react to. This grows directly out of loan history this project already records and has not yet made socially meaningful.

**System notes.** One additional small record splitting an existing debt entry between two lenders, built on top of the `aid:*` socket events already wired in `src/server/realtime.ts` and `src/lib/use-aid.ts`.

### 06. Partial Sight

_A trusted partner sees a blur, not a wall and not a full ledger._

New mechanism. Effort: moderate.

**The situation today.** A captain's cargo hold is fully visible to themselves and completely invisible to everyone else, with one exception: any captain can already open another captain's detail popup for a live, exact view, but only once that other captain has gone bankrupt or reached the endgame screen. While a voyage is still in progress, there is no middle ground between total privacy and nothing at all.

**What we add.** A trusted partner, defined the same way Backing above defines trust, gets a rough, rounded read of what a captain is carrying while their voyage is still ongoing, a banded range rather than an exact count, computed entirely on the viewing client's own side rather than requested from anywhere, so it needs no new server trust boundary at all.

**Why this fits.** Real trading depends on imperfect information, knowing roughly what someone is holding without knowing exactly, and neither this project nor the sibling codebase it gets compared against currently has any version of that during active play.

**System notes.** A pure client side rounding function applied to inventory numbers the viewing client has no way to see today, gated behind the same trust threshold Backing establishes.

### 07. Bequest Routing

_A bankrupt captain still gets to decide where their gold goes next._

Extends a shipped feature. Effort: light.

**The situation today.** The bankruptcy screen already shows a captain every loan still owed to them, under the heading Silent Partner, and that gold already lands the moment each borrower repays, exactly as described in the correction above. What it does not do yet is give the bankrupt captain any choice in the matter. The gold simply accumulates on an account with no voyage left to spend it in.

**What we add.** At the moment bankruptcy is reached, a captain with open loans still owed to them can designate one still active captain in the same room to receive future repayments instead, turning an inert number into one more decision the room can see a bankrupt captain still making.

**Why this fits.** It respects what already shipped instead of redoing it, and answers the one real gap the shipped version leaves open: gold that currently has nowhere useful to go once its original owner is out of the voyage.

**System notes.** One redirect field added to the existing loan record, checked at the same repayment settlement point `src/server/realtime.ts` already runs when a debt is repaid.

## III. Identity and the long game

### 08. Trading Houses

_A second identity to argue about, separate from the Renown grind._

New mechanism. Effort: moderate, needs a balance session.

**The situation today.** There is no identity a captain picks and carries that has nothing to do with their own personal score. Every account level system this project has is a single achievement axis.

**What we add.** At any point before a voyage, a captain pledges to one of three Trading Houses, each carrying one small, distinct passive perk, one house hires its first artisan free every voyage, one banks extra cargo capacity, one trades a little more pirate risk for cheaper wages, plus its own separate House Standing counter that has nothing to do with Renown.

**Why this fits.** This is the one idea on this list that does not answer anything in the sibling codebase, because that codebase has no faction concept at all to react to. It instead extends an instinct this project has already proven works on its own, Renown, into a second, parallel track built for identity rather than achievement.

**System notes.** A `house` field and a `houseStanding` counter added to `CaptainLegacy`, the passive folded into `modifierFlags` exactly the way a Boon or a module already injects a modifier inside `createInitialGameState`, no new mechanism required. This is the one idea with no existing number inside this project to calibrate its perks against, since Renown's own balance was tuned gradually over several releases, so it is flagged for its own dedicated balance session before any line of it is built.

### 09. House Rally

_A room where friends share a pledge notices it._

New mechanism. Effort: light, once entry eight exists.

**The situation today.** Nothing yet, since this depends entirely on Trading Houses existing first.

**What we add.** When a majority of the captains in one room share the same House pledge, a small flavor banner appears at the top of the harbor for that voyage, and everyone in that majority earns a small bonus tick toward their House Standing at voyage end. Nothing about round count, market, or difficulty changes, only the standing gain.

**Why this fits.** It gives a real returning friend group a reason to coordinate their pledge on purpose before a session, the same way a group might agree on a shared team color before a match, which only means anything in a game built around small, known groups gathering by invitation, exactly as this one already is.

**System notes.** A majority check run once when the host starts the voyage, alongside the difficulty read already happening at that moment in `src/server/realtime.ts`, and a bonus multiplier applied to the House Standing write that already happens at voyage conclusion.

### 10. Ages of the Ledger

_The three peer economy tools take turns in the spotlight._

Reworked idea. Effort: moderate.

**The situation today.** Lending, bartering, and Broker's Favor all reward a captain identically no matter when they use them. There is no sense that the harbor's own mood shifts over the weeks a returning captain keeps playing.

**What we add.** A rotating multi week emphasis: an Age of the Lender that pays extra Renown for backing another captain's loan, an Age of the Trader that sweetens barter outcomes slightly, an Age of the Broker that cuts the cost of Broker's Favor, one active at a time, rotating on a fixed schedule.

**Why this fits.** The rotation only means anything because those three distinct peer economy tools already exist here and nowhere in the sibling codebase, so rotating emphasis between them is specific to what this project already built, not a generic season reset borrowed from somewhere else.

**System notes.** The source page that first proposed this claimed it would need a new kind of background job this project's architecture does not have. That claim does not hold up under a direct read of the code: `server.ts` already runs one long lived Node process for as long as the app is up, the same process already handling every socket event, so a plain interval check comparing the current date against a stored age start date, run from inside that same process, is enough. No separate scheduler infrastructure needs to be introduced.

### 11. Captain's Rival

_The friend you keep sailing against gets a scoreboard of their own._

New mechanism. Effort: moderate.

**The situation today.** `CaptainLegacy` tracks a captain's own history in complete isolation from every other captain. There is no record anywhere of which specific captains have shared a room before, or who came out ahead when they did.

**What we add.** A small account level counter, incremented whenever two specific captains finish a voyage in the same room, tracking how many times they have sailed together and who has out scored whom more often. Shown as a compact head to head line on the Captain's Legacy card, but only ever between two captains currently in the same room together, so it surfaces exactly when it is relevant and stays invisible otherwise.

**Why this fits.** This game is built for small groups who already know each other and keep coming back, exactly as laid out in the audience section above. A running record of a specific rivalry between two specific people is worth more here than a global leaderboard would ever be, since the entire point of a global leaderboard, comparing yourself to strangers, is not how this game's own onboarding expects anyone to play it.

**System notes.** One new small table keyed on an unordered pair of user ids, written at the same voyage conclusion checkpoint in `src/server/realtime.ts` that already writes Renown, Merits, and `statsByDifficulty` for everyone finishing at once.

### 12. Voyage Chronicle

_A voyage becomes a short story a captain can read again later, not just a score._

New mechanism. Effort: light to moderate.

**The situation today.** Once a voyage ends, its only remaining trace is a handful of numbers folded into `CaptainLegacy`: Renown gained, whether the captain was crowned, whether they went bankrupt. The voyage itself, the specific trades, the specific close calls, leaves nothing behind to look back on.

**What we add.** An opt in short recap, generated the moment a voyage concludes, built from a few real numbers already available at that moment: peak Reputation reached, the single largest trade completed, how many times the captain lent or borrowed gold. Saved to the account and viewable later from the Lobby, alongside Captain's Legacy.

**Why this fits.** Daily Check In already gives a returning captain a reason to open the Lobby every day. This gives that same daily visit something to actually read once they are there, turning a habit built purely around a reward counter into one that also has something narrative behind it.

**System notes.** A pure text template function, similar in spirit to the difficulty aware tutorial and guide text already generated in `src/lib/game/constants.ts`, fed by fields already computed at the voyage conclusion checkpoint, stored as one more field alongside the account's other persistent records.

## IV. Trust and safety

### 13. Ledger Integrity Pass

_The one save endpoint that currently trusts a client completely gets one narrow guard._

New validation logic. Effort: moderate, do this before entries eight, ten, and eleven.

**The situation today.** Reading `src/app/api/game/state/route.ts` directly confirms the source page's claim: `PUT /api/game/state` validates that the request has the right shape, a room id string and a data object, using Zod, but it never checks whether the actual values inside that data object are plausible given what was saved last time. A captain's browser computes their own gold, score, and inventory, and the server currently writes back whatever arrives without comparing it to anything.

**What we add.** At that same save endpoint, compare the incoming save against the last known good one, and flag, rather than silently accept, any change larger than the largest change a single round could plausibly produce, in gold, in score, in anything that eventually feeds Renown. This adds one check to an endpoint that already exists. It does not rewrite the endpoint or the trust model the rest of the game is built on.

**Why this fits.** This project chose, on purpose, to let every client compute its own state rather than running an authoritative server, and that choice is not being reversed here. It was a reasonable choice when the only thing at stake was one voyage's local score. It stops being reasonable the moment entries eight, ten, and eleven all start reading off account level numbers that a doctored save could inflate, which is exactly why this entry is flagged to ship before those three rather than after.

**System notes.** Confirmed directly by reading the route file before writing this proposal, rather than assumed from the source page alone, since the source page had already proven inaccurate on three other points by the time this section was reached.

### 14. Harbor Watch

_A host gets a way to quiet one voice without ending anyone's voyage._

New mechanism. Effort: light.

**The situation today.** Room chat and direct messages are both fully open with no moderation tool anywhere in the product, not even a basic mute. The only way a host currently has to deal with an unwanted message is the same restart option covered at length in this project's own README, which resets every captain in the room back to round one.

**What we add.** A host facing control, reachable from the same members panel that already lists everyone in the harbor, that mutes a specific captain's chat for the remainder of the voyage without touching their gold, cargo, ship, or progress in any way. A muted captain keeps playing normally. They simply cannot post to room chat until the voyage ends.

**Why this fits.** This is a plain gap in this project's own social surface, not a reaction to anything in the sibling codebase. A game whose entire pitch is a small group of real people talking to each other in real time needs some way to handle one disruptive person that costs less than resetting everyone else's progress, and today it has none.

**System notes.** One boolean flag per room member, checked by `src/server/realtime.ts` before relaying a chat message the same way it already checks membership before relaying one, host only, gated the same way `room:start` and `room:restart` already are.

## V. Getting more captains to the table

### 15. Bilingual Harbor

_Every screen, in Chinese as well as English, switchable per player._

New infrastructure. Effort: substantial. **Dropped.**

**The situation today.** A direct search across the entire source tree for any existing localization infrastructure, translation tables, a locale switch, anything, turns up nothing beyond a handful of unrelated matches on the word translate that turn out to be CSS transform utilities, not language handling. Every piece of player facing text, from the tutorial to the endgame screen, is written directly in English with no separation between the words and the logic around them.

**What we add.** A proper separation between what a screen says and which language it says it in, covering every player facing string this project already has, chosen per player rather than per room, so two captains in the same harbor could each read the game in their own preferred language at the same time.

**Why this fits.** The team maintaining this project also maintains a sibling repository written for a bilingual audience, so the two languages this game's own historical Silk Road setting would most obviously want to speak are already ones this team has direct experience serving elsewhere. This was mentioned only once, in a single closing note on the source page, never developed as one of its nine main ideas, which is why it gets full treatment here instead.

**System notes.** The largest lift on this list by raw surface area. Every player facing string across `constants.ts` and every component in `src/components/portmasters` needs to move behind a lookup rather than staying inline, but the actual mechanism, a language field on the account plus a lookup table, is not architecturally complex on its own.

### 16. Colorblind Safe Palette

_The exact same color coding, readable by more eyes._

New mechanism. Effort: light.

**The situation today.** `src/lib/game/constants.ts` assigns a fixed color to every good, Silk a deep crimson red, Tea a forest green, sitting close enough together on the color wheel that a red green colorblind player, roughly one in twelve men by most estimates, would have real difficulty telling them apart at a glance in the same list.

**What we add.** A second, colorblind safe color mapping for the exact same set of goods, selectable from a player's own settings, changing nothing about game rules, balance, or what any other captain sees, only how one captain's own client renders a color already being shown to them anyway.

**Why this fits.** It is a small, self contained fix to a specific, confirmed detail already sitting in the constants file, the kind of basic accessibility care that costs very little and excludes nobody who does not choose to use it.

**System notes.** One alternate lookup table shaped exactly like the existing `COLORS` constant, swapped in per player based on a settings flag. No engine or database change required at all.

### 17. Quick Start Match

_A solo captain gets dropped into an open harbor instead of having to go find one._

New mechanism. Effort: moderate.

**The situation today.** This project's own README spells out, under its own list of common issues, that starting a voyage requires at least two members and that a solo room simply is not allowed to set sail, calling that intentional. What it does not solve is the moment right before that: a single captain with no friend's room code has to browse a list of public rooms and guess which one might actually have someone else about to join, with no way to signal that they are ready to play right now.

**What we add.** An opt in queue button in the Lobby, sitting next to the existing public room list rather than replacing it, that automatically places a waiting solo captain into an existing open public room with space to grow, or opens a fresh one and waits, the moment a second solo captain queues up too.

**Why this fits.** It does not change anything about how a room made through a shared code already works, host invites friends, waits for them, sets sail. It only lowers the very specific friction point this project's own documentation already flags, for the one kind of captain who shows up without a group already assembled.

**System notes.** A thin queue held in memory the same way `startingRooms` and `restartingRooms` already guard against double firing in `src/server/realtime.ts`, matching two waiting captains together and routing both through the existing join flow already defined in `src/app/api/rooms/join/route.ts`.

## VI. Reading the room

### 18. Fleet Ticker

_A glance at the whole harbor, without opening six separate popups._

New interface. Effort: light.

**The situation today.** The server already tracks and broadcasts every captain's live round, phase, gold, and Reputation, cached per room in the `roomStatuses` map inside `src/server/realtime.ts` specifically so a late joiner can hydrate immediately. The only way any captain sees that data today is by opening one specific roster member's detail popup at a time, one captain, one click, one modal.

**What we add.** A compact strip, always visible in the game room shell rather than tucked behind a click, summarizing every other captain's round, phase, and headline numbers at once, built entirely from the `game:status` broadcast this project already relays for exactly this purpose.

**Why this fits.** It does not ask for a single new piece of data from anywhere. The server already computes and sends everything this needs. It only changes how much of that already flowing information is visible passively instead of requiring six separate clicks to piece together the same picture.

**System notes.** A new component reading the same `roomStatuses` feed the members panel already subscribes to. No server change required at all.

## Suggested order of work

Four waves, each assuming the ones before it are done or far enough along to satisfy its dependencies. The original table predates entries 01 through 05 shipping, so their rows are dropped here and the waves renumbered around what actually remains.

| Wave                                          | Entry                       | Effort            | Depends on                                              |
| --------------------------------------------- | --------------------------- | ----------------- | ------------------------------------------------------- |
| One, light and independent                    | 18. Fleet Ticker            | Light             | Nothing new, reads an existing broadcast                |
| One, light and independent                    | 16. Colorblind Safe Palette | Light             | Nothing new                                             |
| One, light and independent                    | 14. Harbor Watch            | Light             | Nothing new                                             |
| One, light and independent                    | 07. Bequest Routing         | Light             | The already shipped Silent Partner panel                |
| Two, moderate and mostly independent          | 13. Ledger Integrity Pass   | Moderate          | Nothing new, but should ship before 08, 10 and 11       |
| Two, moderate and mostly independent          | 17. Quick Start Match       | Moderate          | Nothing new, needs an eligibility ruling                |
| Two, moderate and mostly independent          | 12. Voyage Chronicle        | Light to moderate | Nothing new                                             |
| Three, needs a decision or a dependency first | 06. Partial Sight           | Moderate          | Entry 05's trust threshold, plus a banding numbers pass |
| Three, needs a decision or a dependency first | 08. Trading Houses          | Moderate          | A dedicated balance session, ideally 13 first           |
| Three, needs a decision or a dependency first | 09. House Rally             | Light             | Entry 08                                                |
| Three, needs a decision or a dependency first | 10. Ages of the Ledger      | Moderate          | A decided rollover cadence, ideally 13 first            |
| Three, needs a decision or a dependency first | 11. Captain's Rival         | Moderate          | Ideally 13 first                                        |

## Open questions, still unanswered

**How blurred is partial sight.** The banding needs a real numbers pass, chosen carefully, so it never quietly reveals an exact, decisive figure. Answer before entry 06 is built.

**House balance.** Entry 08 is the one idea here with no existing system inside the project to check its numbers against, since Renown's balance was tuned gradually over several releases. Worth its own session before 08, 09 or 10.

**Age cadence.** Does an Age in entry 10 last two weeks or four. That changes how the interval check is tuned, so decide before writing the check.

**Quick Start Match eligibility.** Should a room already holding three or four members still receive a solo queued captain, or only a room sitting at exactly one. Decide the exact rule before entry 17.

Two of the original six open questions are now closed. The Convoy Venture that outlives its voyage is resolved as failed at conclusion, and Bilingual Harbor's first pass no longer applies since the entry is dropped.
