# PortMasters 2 Parallel Release

A browser based multiplayer trading game set on the maritime Silk Road. Captains gather in a shared harbor, and once at least two of them are in the room the host sets sail. Everyone then plays the same voyage in lockstep: draft a boon, buy at port, barter with the other captains, put artisans to work, fill trade orders, settle wages and pirates, refit at the shipyard. Whoever ends the voyage with the highest Reputation is crowned Sea Master.

## Quick start

```bash
npm install      # installs and generates the Prisma client
npm run db:push  # creates the SQLite tables
npm run dev      # http://localhost:2232
```

Register a captain and look around. To try the multiplayer side, open a second browser or a private window rather than a second tab, since tabs in the same browser share one cookie jar and one session.

Two things surprise people first: the port is 2232, not 3000, and there is no separate backend to start. `server.ts` is the whole app.

## What this project is, and what it is not

Three separate codebases carry the PortMasters 2 name. This is the third, and it is not a fork of either of the others.

| Project                                                                        | What it is                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PortMasters2](https://github.com/LostInHustle/PortMasters2)                   | The original successor. A Python WebSocket server with an HTML and JavaScript client, accounts stored in JSON. Two captains per game.                                                                                            |
| [PortMasters2-ReactApp](https://github.com/LostInHustle/PortMasters2-ReactApp) | A full TypeScript rebuild of that game as an npm workspaces monorepo: a Node WebSocket backend with a React 19 and Vite frontend. Same rules, new engine. Two captains per game.                                                 |
| **This repo**                                                                  | A separate attempt at taking the original single player game online, started by Joe Zhou and Aaron Zhu. One Next.js process serves the site, the API and the realtime layer. A harbor holds as many captains as want to sail it. |

All three descend from the same single player prototype, kept unmodified at [docs/original-single-player-game.html](docs/original-single-player-game.html) so it stays useful as a reference for the original wording, prices and balance. From that shared ancestor this project goes its own way: its own server architecture, realtime layer, database schema, difficulty tiers and progression systems. Treat it as its own thing rather than a fork that has to stay in sync with the other two.

<details>
<summary>Why some internal names still say "portmasters"</summary>

The source folder `src/components/portmasters` and a few `localStorage` keys such as `portmasters_tutorial_seen` kept their original names on purpose. Renaming the folder means rewriting every import path that touches it for no benefit, since nobody outside the codebase sees a folder name, and renaming the storage keys would pop the tutorial open again for everyone who had already dismissed it. Everywhere the name is actually visible (page title, in game banner, log messages, docs) it reads PortMasters 2 Parallel Release. The deliberate exception is `docs/original-single-player-game.html`, which is kept as an unmodified snapshot; renaming things inside it would defeat the point of keeping it.

</details>

## The game

### The shape of a round

Every round runs the same seven steps, and every captain in the room moves through them together. Nobody advances until everyone still active has readied up.

| Step                | What happens                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| Boon draft          | Draw from a fresh pool of boons that bend the rules for the coming round |
| Phase 1: Purchase   | Buy raw materials from the port market                                   |
| Barter              | Trade goods and Gold directly with the other captains                    |
| Artisan management  | Hire artisans and assign what each of them crafts                        |
| Phase 2: Orders     | Fill trade orders for Gold and Reputation                                |
| Phase 3: Settlement | Production lands, wages and maintenance come due, pirates may find you   |
| Phase 4: Shipyard   | Upgrade the ship, draft and rig modules                                  |

### Difficulty tiers

The host picks a tier when creating the room. It sets the length of the voyage, how much of the content opens up, and how hard the sea pushes back.

| Tier              | Rounds | Charters        | Pirate odds       | Renown | The pitch                                                                                                                         |
| ----------------- | ------ | --------------- | ----------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 🌤️ Fair Winds     | 8      | none            | 20%               | 1.0x   | Eight rounds on the founding trade. Room to learn the rhythm before the money runs tight.                                         |
| 🌊 Open Waters    | 12     | rounds 4 and 8  | 22% rising to 30% | 1.25x  | The charter opens twice and the market swells from six cards to ten, with pirates that bite past the midpoint.                    |
| ⛈️ Monsoon Season | 16     | rounds 6 and 11 | 28% rising to 38% | 1.6x   | Back loaded and unforgiving. The largest imperial mandates fall late, and a corrupt broker may leak your position to the pirates. |

A charter opens the next tier of goods, ports and artisans mid voyage: porcelain clay and copper ore with their potters and coppersmiths first, then spices and pearls with their perfumers and jewelers. Fair Winds never leaves the founding trade, which is what keeps the entry tier exactly the game it has always been. The full design rationale lives in [docs/DIFFICULTY_MODES_PROPOSAL.md](docs/DIFFICULTY_MODES_PROPOSAL.md).

### Harbor systems

These are the systems that make a harbor different from several people playing solo next to each other. Each one is documented in detail, with steps for confirming it actually works, in [docs/NEW_FEATURES_GUIDE.md](docs/NEW_FEATURES_GUIDE.md).

- **The Harbor Pulse** leans port prices toward whatever the whole harbor bought last round, capped at roughly twelve percent either way. Nobody announces it and nobody controls it; it is simply a consequence of what the room did together.
- **Word on the Docks** is a race. The first captain in the room to complete five trade orders in a voyage takes 25 Gold on the spot, and the whole harbor is told who won. It fires once per voyage.
- **Tidewatch Alerts** are the cooperative counterpart. Once the combined Reputation of everyone in the harbor reaches 500, every captain's purchase board gains a permanent extra cargo lot for the rest of the voyage.
- **Convoy Ventures** pool Gold toward a target by a deadline round. Fill it and every contributor gets back fifty percent more than they put in; miss the deadline and they get back half. A harbor fills exactly one venture per voyage, which cancels the rest with full refunds, and no captain may fund more than half of any target alone, so a venture cannot complete without someone else choosing to back it.
- **Backing** adds a third role to an aid loan: a captain who is neither lender nor borrower pledges Gold as a safety net. If the loan is repaid the pledge comes back whole, plus a Reputation bonus smaller than the lender's. If the borrower falls short, the pledge covers the gap up to its own size and no further, so it narrows the lender's risk without erasing it.
- **Direct barter offers** can be addressed to one named captain instead of the whole room. Nobody else sees the offer or can accept it.

### What carries across voyages

A voyage resets everything inside it. Three things survive:

- **Renown.** Reputation earned on a voyage converts to Renown XP, scaled by the tier's multiplier. Levels run from Deckhand to Silk Road Sovereign and buy a small starting Gold bonus of 3 per level, capped at +60 against a starting stake of 90 to 100, so an experienced captain begins a little ahead without trivializing the early rounds.
- **Merits.** Nine one time badges for firsts and milestones, three of them only reachable on the rougher tiers. They carry bragging rights and nothing else, so the list can grow without touching the voyage economy.
- **Daily check in.** A seven day cycle of Renown XP rewards (20, 30, 40, 50, 60, 80, then 150) tied to the account rather than any room.

## How the pieces fit together

**One process, one port.** [server.ts](server.ts) creates a single HTTP server, hands it to Next.js for the site and the API routes, and attaches Socket.IO to that same server for presence, chat and turn synchronization. There is no separate backend service and no separate realtime server. Port 2232 was chosen so the whole app fits through a single ngrok tunnel.

**One SQLite file**, read and written directly by that same process. No database server to install, no pool to configure.

**The server does not run the game rules.** Every client runs the same deterministic simulation in [src/lib/game/engine.ts](src/lib/game/engine.ts), seeded off the room id, so every captain sees identical markets and orders without the server computing anything. [src/server/realtime.ts](src/server/realtime.ts) does something much narrower: it tracks who has readied up for the round and phase the room is sitting at, and tells everyone to advance once the active players have all readied. It also owns the host only transitions that are not part of that vote (starting and restarting a voyage) and the harbor systems above, which are genuinely shared state and therefore genuinely the server's business.

That split is the single most useful thing to know before changing anything: ask which side owns the behavior before you touch it.

## Tech stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4 with shadcn/ui components (new-york style) on Radix primitives, plus framer-motion for phase transitions, lucide-react for icons, sonner for toasts and next-themes for dark mode
- Prisma 7 backed by SQLite through the `@prisma/adapter-better-sqlite3` driver adapter (Prisma 7's default client engine ships no query engine binary, see [Database and Prisma](#database-and-prisma))
- Socket.IO, wired into a custom server rather than the default Next.js one
- Zod for request validation on the API routes
- tsx to run the TypeScript server directly in both development and production, with no separate compile step for the server

Tailwind v4 is configured entirely in CSS. The theme lives in the `@theme` block in [src/app/globals.css](src/app/globals.css); there is no `tailwind.config.ts`.

## Project layout

| Path                                     | What lives there                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server.ts`                              | The entry point. Everything starts here.                                                                                                                                                                                                                                                                                                   |
| `src/app`                                | App Router tree. The single page UI is `page.tsx`; REST endpoints are under `src/app/api` (auth, rooms, game state, legacy, check in, direct messages).                                                                                                                                                                                    |
| `src/components/portmasters`             | The game's own UI: auth screen, lobby, game room shell, chat and member panels.                                                                                                                                                                                                                                                            |
| `src/components/portmasters/game`        | The room's panels: status sidebar, control bar, log, modals, price tooltips.                                                                                                                                                                                                                                                               |
| `src/components/portmasters/game/phases` | One module per phase screen, from `Welcome` through `Endgame`, dispatched by `GamePhasePanel`.                                                                                                                                                                                                                                             |
| `src/components/ui`                      | shadcn generated primitives. Treat as generated code.                                                                                                                                                                                                                                                                                      |
| `src/lib`                                | `auth.ts` and `api-auth.ts` for passwords and sessions, `db.ts` for the Prisma singleton, `rooms.ts` for what leaving a room means, `api.ts` for the typed fetch wrapper, `realtime.ts` for the client Socket.IO singleton, and the `use-*.ts` hooks (phase sync, game session and autosave, barter, aid, backing, convoy, notifications). |
| `src/lib/game`                           | The simulation and its rules: `engine.ts`, `constants.ts`, `types.ts`, `rng.ts` for seeded randomness, `difficulty.ts` and `pools.ts` for tiers and what they unlock, `glossary.ts`, and one module per persistent or harbor system (`legacy.ts`, `merits.ts`, `checkin.ts`, `harborPulse.ts`, `convoy.ts`, `backing.ts`).                 |
| `src/server/realtime.ts`                 | Server side Socket.IO: presence, room channels, the ready check protocol, host only actions, harbor systems.                                                                                                                                                                                                                               |
| `prisma/schema.prisma`                   | The data model: users, sessions, rooms, membership, per player game state, captain legacy and merits, convoy ventures, messages. `prisma/migrations` holds the history.                                                                                                                                                                    |
| `prisma.config.ts`                       | Where the Prisma CLI reads its connection string. Prisma 7 moved this out of the schema file.                                                                                                                                                                                                                                              |
| `generated/prisma`                       | Generated client output. Gitignored, rebuilt by `prisma generate`.                                                                                                                                                                                                                                                                         |
| `scripts/tests`                          | The test suite, plain `tsx` scripts with no runner.                                                                                                                                                                                                                                                                                        |
| `docs/`                                  | Deployment guide, harbor feature guide, design proposals, and the original single player snapshot.                                                                                                                                                                                                                                         |

## Development

You need Node 20.19 or newer (`package.json` sets that as the floor; this was built against Node 22) and npm. Stick with npm: there is one `package-lock.json` checked in and no other lockfile.

`npm install` runs `prisma generate` through the `postinstall` script. If that gets skipped, nothing touching the database will work.

Then run `npm run db:push` once. It is tempting to skip and assume the database will sort itself out, and it half will: SQLite creates an empty file the moment something opens it, but that file has no tables. The app will start, the homepage will load, and registering an account will fail with "no such table: main.User".

### Scripts

| Script                | What it does                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`         | `tsx watch server.ts`. Site, API and realtime in one process, restarting on server side changes.                                       |
| `npm run build`       | `prisma generate` then `next build`.                                                                                                   |
| `npm run start`       | Applies pending migrations with `prisma migrate deploy`, then serves the production build. Does not build for you.                     |
| `npm run lint`        | ESLint through the flat config in `eslint.config.mjs`.                                                                                 |
| `npm test`            | The whole suite, six files in sequence.                                                                                                |
| `npm run db:push`     | Syncs the schema straight to the database without recording a migration. Fastest way to a working local database.                      |
| `npm run db:migrate`  | `prisma migrate dev`. The right tool once you have actually changed `schema.prisma` and want the change recorded. Prompts for a name.  |
| `npm run db:generate` | Regenerates the client into `generated/prisma` without touching the database.                                                          |
| `npm run db:reset`    | `prisma migrate reset`. Genuinely destructive: drops the database and rebuilds from migrations.                                        |
| `npm run db:clean`    | Wipes test rooms, memberships, saved states and messages, leaving an empty lobby. Takes `--keep-users` to spare accounts and sessions. |

### Tests

```bash
npm test              # all six suites
npm run test:unit     # pure game rules
npm run test:effects  # audit that every boon and module effect actually fires
npm run test:integration   # a full voyage end to end
npm run test:harbor        # harbor pulse, word on the docks, tidewatch
npm run test:convoy        # convoy venture math and its exploit guards
npm run test:backing       # backing resolution, escrow and payout
```

They are plain `tsx` scripts sharing a small harness, with no test runner, no database and no live server. Everything they touch is pure logic that imports neither Prisma nor React, which is exactly why the Gold math for convoy and backing was pulled out of the socket closures in `src/server/realtime.ts` and into their own modules: a regression there now shows up in a fast deterministic test instead of only in a live room.

### Running the production build locally

```bash
npm run build
npm run start
```

`start` does not build for you. Run the two together, or you will serve whatever build happens to be sitting on disk from last time.

On Windows, `start` sets `NODE_ENV=production` inline, which is a Unix shell convention. It works in bash, zsh and on Railway, but fails in plain `cmd.exe` or PowerShell. Use WSL or Git Bash, or set the variable separately.

## Environment variables

One variable matters locally, and it is already committed in `.env`:

```
DATABASE_URL=file:./prisma/dev.db
```

That file is committed on purpose. It holds no secret, just a relative path, so there was no reason to make every clone recreate it.

The path is worth understanding. Under Prisma 6 and earlier, a relative `file:` path resolved against `prisma/schema.prisma`'s own directory, so `file:./dev.db` landed in `prisma/`. Prisma 7 moved the connection string to `prisma.config.ts` at the repository root, and relative paths now resolve against that file's directory instead. Hence the explicit `prisma/` above. If a stray `dev.db` ever appears at the repository root, something pointed `DATABASE_URL` at a bare `file:./dev.db`; fix the value rather than moving the file, or it will reappear. This matters beyond tidiness: `.gitignore` only excludes `*.db` inside `prisma/`, so a root level `dev.db` can be committed by accident.

`PORT` is optional and only matters for deployment. `server.ts` falls back to 2232. Railway sets it automatically.

## Database and Prisma

`db:push` and `db:migrate` are not interchangeable. Use `db:push` to get a local database working; use `db:migrate` once you have changed the schema and want that change recorded under `prisma/migrations`. Reach for `db:reset` only when you actually want a clean slate, since it deletes everything in your local `dev.db`.

Prisma 7 does not ship a query engine binary for `prisma-client-js` the way Prisma 6 did. The client talks to SQLite through a driver adapter, which is why [src/lib/db.ts](src/lib/db.ts) builds a `PrismaBetterSqlite3` adapter and passes it to `new PrismaClient({ adapter })` rather than calling the constructor bare. If you upgrade Prisma, move `prisma` and `@prisma/client` together, and remember that `datasource.url` belongs in `prisma.config.ts` now; Prisma 7 refuses to start if it is still in `schema.prisma`.

## Deploying

Railway has what it needs through `railway.json`: `npm install && npm run build` to build, `npm run start` to run. Point a new Railway project at this repository and it should work.

The one manual step is storage. Railway wipes the filesystem on every deploy, so the SQLite file has to live on a volume. Add a volume to the service and set `DATABASE_URL` to a path on it, for example `file:/data/prod.db`. Schema changes roll out on their own after that, since `npm run start` runs `prisma migrate deploy` before booting.

To skip volumes entirely, `prisma/schema.prisma` can swap its provider from `sqlite` to `postgresql` and point at a managed instance. Nothing else about how the app runs changes. The fuller walkthrough is in [docs/deployment.md](docs/deployment.md).

## Troubleshooting

**"No such table" right after setup.** The database file exists but the schema was never applied. Run `npm run db:push`.

**Imports from `generated/prisma` fail to resolve.** That folder is generated and gitignored, and it is easy to lose by deleting `node_modules` or reinstalling with lifecycle scripts skipped. `npm run db:generate` rebuilds it.

**`PrismaClientConstructorValidationError` about engine type "client" needing an adapter.** `prisma` and `@prisma/client` have drifted onto different majors, or the generator moved to Prisma 7's client engine without the rest following. See [Database and Prisma](#database-and-prisma).

**The build fails on `globals.css` with "Cannot find module '../lightningcss.linux-x64-gnu.node'".** Sneaky, because it builds fine locally and only fails in CI. Tailwind v4's CSS engine ships a separate native binary per platform, and `package-lock.json` needs a resolved entry for every platform's variant for that to work anywhere other than where the lockfile was generated. Regenerate from a truly clean state, since `npm install` on top of an existing `node_modules` will report "up to date" and change nothing:

```bash
rm -rf node_modules package-lock.json && npm install
grep -c '"node_modules/lightningcss-' package-lock.json   # expect 11, not 1
```

**`EADDRINUSE` on 2232.** Usually a previous `npm run dev` that never shut down. `lsof -i :2232` will find it.

**A Turbopack panic such as "Next.js package not found" or "Failed to write app endpoint".** The `.next` cache stores absolute paths and has gone stale relative to where the project now lives, which happens whenever the folder is copied, moved or synced. Stop the dev server, delete `.next`, start again.

**Running `next dev` or `next start` directly.** You get a working website with silently broken multiplayer: Socket.IO is attached inside `server.ts`, which the Next.js CLI never runs, so presence, chat and room synchronization quietly do nothing. Always go through the npm scripts.

**Two accounts, wrong one logged in.** The session cookie is scoped to the origin and shared across every tab in a browser, so the second login overwrites the first. Use two browsers, or one normal and one private window.

**"Start Voyage" does nothing.** A room needs at least two captains. A solo room is not allowed to set sail, since synchronized phases are the entire point.

**A captain who refreshed seems to linger.** Closing a tab does not free the seat immediately. There is a thirty second grace period so a refresh or a flaky connection does not cost someone their spot.

**Restarting feels like a big hammer.** It is, deliberately. Only the host can do it, it asks for confirmation, and it resets every captain in the room back to round one with Gold, cargo, workers and upgrades wiped. It also reopens the room so captains who could not join mid voyage can join again. That reopening is the real point: `Room.started` is what the join routes check, and for a while nothing in the codebase ever set it back to false, so a restarted room rejected every new captain forever.

**Tunneling through something other than ngrok.** `next.config.ts` only allowlists ngrok domains in `allowedDevOrigins`. Add yours or the dev server will refuse cross origin requests for its own `/_next` assets.

## Working on this codebase

The restart bug above is the best case study this codebase has, and the pattern matters more than the fix.

**Find out which side owns the behavior before you touch anything.** Every captain runs an identical engine, so a gameplay bug looks like it must live in `engine.ts` and a multiplayer bug in `realtime.ts`. The restart bug lived in neither: no code anywhere ever called the thing that would have fixed it. Before changing a function, ask what is supposed to call it and whether anything actually does.

**Look for state that only ever moves one way.** One `db.room.update` set `Room.started` to true and nothing ever set it back. Whenever a report sounds like "X used to work and now it is stuck", grep for every place a flag is written, not just read, and check the writers cover every transition the product needs, including the ones that undo an earlier one.

**Do not trust that a button does what its label says.** The old restart button meant a full reset in single player and a local no-op in multiplayer. The join routes were already correct; the fix was giving the button the server side counterpart its label had always implied.

**Gate new server actions the way the existing ones are gated.** The restart handler is deliberately shaped almost identically to `room:start` right above it: same auth check, same host only check, same guard against double firing, same broadcast then checkpoint shape. That consistency is what lets the next person read one handler and understand the rest.

**Keep real money math out of socket closures.** Anything deciding Gold or Reputation belongs in a pure module under `src/lib/game` with a test, the way `convoy.ts`, `backing.ts` and `harborPulse.ts` were pulled out of `realtime.ts`. Logic nested inside `attachRealtime` cannot be imported, cannot be tested, and can only be exercised against a live server and a live database.

**Verify multiplayer fixes with more than one client.** A bug like the restart one is invisible with a single tab open. Two browser profiles work, but scripting the REST and Socket.IO calls against the running dev server is faster than choreographing windows by hand every time.

**"It builds on my machine" proves nothing, and this codebase has already proven that once.** The lightningcss lockfile issue passed every local check because everything local ran on the one platform whose binaries made it into `node_modules`. When a change touches dependencies, the lockfile, or anything platform specific, build for the deploy target before trusting it:

```bash
docker run --rm --platform linux/amd64 -v "$(pwd):/work" -w /work node:22-slim \
  bash -c "npm ci && npm run build"
```
