# PortMasters 2 Parallel Release

PortMasters 2 Parallel Release is a browser based multiplayer trading game set on the ancient Silk Road. Players register a captain, gather in a shared harbor with other captains, and once at least two people are in the room the host can set sail. From there everyone plays through eight synchronized voyages: buying goods at port, filling trade orders, paying wages and maintenance, upgrading their ship, and occasionally drafting a boon or a ship module that changes how their run plays out. Whoever ends the eighth voyage with the highest score wins the title of Sea Master.

## What this project actually is

This is worth spelling out clearly, because the name is easy to confuse with two other things that already exist: **PortMasters2** and **PortMasters2-ReactApp**. This project is neither of those. It's a separate codebase, started by Joe Zhou and Aaron Zhu as a parallel branch off the original PortMasters game, built to try a different approach to taking that single player game online rather than to extend either of the existing PortMasters2 efforts. It shares a common ancestor with them (the original single player prototype, kept for reference at [docs/original-single-player-game.html](docs/original-single-player-game.html)) but from there it goes its own way: its own server architecture, its own realtime layer, its own database schema. Treat it as its own thing, not as a fork that needs to stay in sync with the other two.

Because of that lineage, you'll still find the occasional internal reference to the original name in places that are pure implementation detail rather than anything a player or visitor sees: the source folder `src/components/portmasters`, and a couple of `localStorage` keys like `portmasters_tutorial_seen`. Those weren't renamed on purpose. Renaming a source folder means updating every import path that touches it for no actual benefit, since nobody outside the codebase ever sees a folder name, and renaming the `localStorage` keys would just make the tutorial pop up again for anyone who'd already seen it, for the same lack of benefit. Anywhere the name is actually visible, in the page title, the in game banner, log messages, code comments describing what a file is for, the docs, all of that now says PortMasters 2 Parallel Release. The one deliberate exception is [docs/original-single-player-game.html](docs/original-single-player-game.html) itself, which is kept as an unmodified snapshot of the original game on purpose, specifically so it stays useful as a reference for the original wording, prices, and balance. Renaming things inside that file would defeat the point of keeping it around.

## How the pieces fit together

The thing that trips people up first is that there is no separate backend service and no separate realtime server. [server.ts](server.ts) is the one and only entry point. It creates a single HTTP server, hands it to Next.js to serve the website and the API routes, and attaches Socket.IO to that same server for presence, chat, and turn synchronization. One process, one port. Locally that port is 2232, chosen specifically so the whole app can go through a single ngrok tunnel if you ever want to share your local instance with someone else.

The database is a single SQLite file read and written directly by that same process. There's no separate database server to install, no connection pool to configure, nothing else to bring up alongside it.

The other detail worth understanding before you touch the code: the server doesn't actually run the game rules. Every client runs the same deterministic simulation in [src/lib/game/engine.ts](src/lib/game/engine.ts), seeded off the room id, so every captain in a room sees identical markets and orders without the server needing to compute anything. What the server (specifically [src/server/realtime.ts](src/server/realtime.ts)) does is much narrower: it tracks who has clicked "ready" for the round and phase the room is currently sitting at, and once everyone who's still active has readied up, it tells every client to advance. It also owns a handful of one-shot, host-only transitions that aren't part of that vote at all: starting the voyage, and restarting it. Both of those are covered in more detail below, since the second one used to be broken in a way that's worth understanding even now that it's fixed.

## Tech stack

- Next.js 16 (App Router) with React 19 and TypeScript
- Tailwind CSS v4 with shadcn/ui components (new-york style) built on Radix primitives
- Prisma 7 as the ORM, backed by SQLite through the `@prisma/adapter-better-sqlite3` driver adapter (Prisma 7's default client engine has no bundled query engine binary; see the database section below)
- Socket.IO for the realtime layer, wired into a custom server instead of the default Next.js dev/production server
- Zod for request validation on the API routes
- tsx to run the TypeScript server directly, in both development and production, with no separate compile step for the server itself

## Project layout

A quick map of where things live:

- `server.ts` is the entry point described above. Everything starts here.
- `src/app` is the Next.js App Router tree: the single page UI lives in `page.tsx`, and the REST endpoints live under `src/app/api` (auth, rooms, game state, direct messages).
- `src/components/portmasters` holds the game's own UI: the auth screen, the lobby, the game room shell, chat and member panels, and a `game` subfolder with the phase specific panels (purchasing, trading, the status sidebar, modals, and so on). As noted above, the folder name itself is a leftover from before the rename and was left alone on purpose.
- `src/components/ui` holds the shadcn generated primitives (button, dialog, tabs, etc). Treat these as generated code rather than something to hand edit heavily.
- `src/lib` is where the actual logic lives: `auth.ts` and `api-auth.ts` handle password hashing and sessions, `db.ts` is the Prisma client singleton, `rooms.ts` centralizes what "leaving a room" means, `api.ts` is a typed fetch wrapper the UI calls into, `realtime.ts` is the client side Socket.IO singleton, `use-phase-sync.ts` is the client half of the ready-check protocol (also where starting and restarting a voyage are triggered from), `use-game-session.ts` owns the actual per-player game state and autosave, and `game/` contains the simulation itself (`engine.ts`, `constants.ts`, `types.ts`, `rng.ts` for the seeded randomness, and `glossary.ts`).
- `src/server/realtime.ts` is the server side Socket.IO wiring described above: presence, room channels, the ready-check protocol, and the host-only start/restart actions.
- `prisma/schema.prisma` defines the data model: users, sessions, rooms, room membership, per player game state, and chat messages. `prisma/migrations` holds the actual migration history.
- `prisma.config.ts`, at the repository root, is where the Prisma CLI (migrate, db push, studio) gets its database connection string from. Prisma 7 moved this out of the schema file itself; see the database section below for why that matters for where the SQLite file actually ends up.
- `generated/prisma` is where the Prisma client gets generated to. This project points Prisma at a custom output folder instead of the usual `node_modules/@prisma/client`, so the import path stays stable no matter where it's imported from. It's gitignored and gets rebuilt by `prisma generate`.
- `docs/deployment.md` covers running and deploying in more detail than this file does, particularly around Railway and persisting the SQLite file across deploys.

## Before you start

You'll need a reasonably current Node (Node 20 or newer is a safe bet; this was built and tested against Node 22) and npm. Stick with npm rather than yarn or pnpm here. There's a `package-lock.json` checked in and no other lockfile, so mixing package managers will just leave you with a lockfile that doesn't match what's actually installed.

## Running it locally, step by step

1. Get the code onto your machine and open a terminal in the project root.

2. Install dependencies:

   ```
   npm install
   ```

   This also triggers `prisma generate` automatically through the `postinstall` script, which writes the Prisma client into `generated/prisma`. If that step gets skipped for any reason (more on that below), nothing that touches the database will work.

3. Set up the database. The schema and a real migration history already exist under `prisma/migrations`, so the cleanest way to create the tables is:

   ```
   npm run db:push
   ```

   It's tempting to skip this and assume the database will sort itself out the first time the app touches it. It mostly will, but only halfway: SQLite happily creates an empty file the first time something tries to open it, but that empty file has no tables in it yet. If you skip this step, the app will start up and the homepage will load fine, right up until you try to register an account, at which point you'll get a Prisma error along the lines of "no such table: main.User". Running `db:push` once up front avoids that entirely.

4. Start the dev server:

   ```
   npm run dev
   ```

   This runs `tsx watch server.ts`, so the same process serves the website, the API, and the realtime layer, and restarts itself whenever server side files change. Once it logs that it's ready, the app is at `http://localhost:2232`. Note that it's not port 3000, since this app deliberately doesn't use the default Next.js port.

5. Register a captain and have a look around. To actually test the multiplayer side of things, see the note about testing with two accounts further down, since it catches almost everyone the first time.

If you ever want to share your local instance with someone else, point a tunnel at the same port, for example `ngrok http 2232`. The `allowedDevOrigins` setting in `next.config.ts` already allowlists ngrok's domains so the dev server doesn't block its own asset requests when accessed through a tunnel.

## Running it the way it runs in production

The `start` script does not build anything for you, it just runs the already built app:

```
npm run build
npm run start
```

`build` runs `prisma generate` again (harmless if it's already up to date) and then `next build`. `start` sets `NODE_ENV=production` and runs the same `server.ts` entry point, except this time Next serves the production build instead of running its dev server. If you only ever ran `npm run dev` and then try `npm run start` without building first, you'll either get errors about missing build artifacts or you'll end up serving a stale build from whenever `build` was last run, so always build immediately before you start when you're testing the production path locally.

One thing to flag if you're on Windows: the `start` script sets `NODE_ENV=production` inline (`NODE_ENV=production tsx server.ts`), which is a Unix shell convention. It works fine in bash, zsh, and on Railway, but it will fail in a plain Windows `cmd.exe` or PowerShell session. WSL or Git Bash sidesteps this; otherwise you'd need to set the environment variable separately before running the command.

## Environment variables

There's exactly one environment variable this project cares about locally, and it's already checked into `.env`:

```
DATABASE_URL=file:./prisma/dev.db
```

That file is committed on purpose. It doesn't hold any secret, just a relative path to a local SQLite file, so there was no reason to make every new clone recreate it by hand. The one thing worth knowing about that path is what it's relative *to*. With Prisma 6 and earlier, a relative `file:` path in `DATABASE_URL` was resolved against `prisma/schema.prisma`'s own directory, so `file:./dev.db` would land at `prisma/dev.db` without you needing to say `prisma/` yourself. Prisma 7 changed that: the connection string now lives in `prisma.config.ts` at the repository root instead of in the schema file (see the database section below), and a relative path resolves against that file's directory, the project root, instead. The `.env` value above spells out `prisma/dev.db` explicitly for exactly that reason. If you ever see a stray `dev.db` show up at the repository root instead of inside `prisma/`, it means something pointed `DATABASE_URL` at a bare `file:./dev.db` again; fix the value rather than moving the file, since the same plain `file:./dev.db` would just reappear at the root again next time something writes to it. It's also worth knowing that a root-level `dev.db` would not be caught by `.gitignore`, which only excludes `*.db` files inside `prisma/`, so getting this path wrong risks accidentally committing a real local database.

`PORT` is optional and only matters for deployment. `server.ts` reads `process.env.PORT` and falls back to 2232 if it isn't set. Railway sets this automatically, so you don't need to set it yourself in that environment.

## The database and the Prisma scripts

A few scripts in `package.json` deal with the database, and they're not interchangeable:

- `npm run db:push` syncs the schema straight to the database without recording a migration. It's the quickest way to get a working database locally and is what's used in the steps above.
- `npm run db:migrate` runs `prisma migrate dev`, which is the right tool when you've actually changed `schema.prisma` and want to record that change as a new migration file under `prisma/migrations`. It will prompt you for a migration name.
- `npm run db:generate` just regenerates the Prisma client into `generated/prisma` without touching the database. You'd run this if that folder ever goes missing or gets out of sync with the schema.
- `npm run db:reset` runs `prisma migrate reset`, which drops the database and rebuilds it from the migration history. It is genuinely destructive: it deletes everything currently in your local `dev.db`. Don't reach for this out of habit when something looks wrong; reach for it only when you actually want a clean slate.

## Restarting a voyage

The host can restart a room's voyage at any time from the "Restart" button in the main control bar, or from the same button on the endgame screen once a voyage has run its course. Only the host can do it, the same as starting the voyage in the first place, and it asks for confirmation before going through with it, because of what it actually does: every captain currently in the room, not just the host, gets reset back to round one, with their gold, cargo, workers, and ship upgrades all wiped. The room itself reopens, so captains who couldn't join mid voyage can join again.

That reopening is the important part, and it's worth understanding why, because it used to be broken. A room has a `started` flag in the database that the join routes check before letting a new captain in; that's what stops someone slipping into a voyage that's already three rounds in. The flag flips to true the moment the host starts the voyage. The bug was that nothing ever flipped it back. The only restart that existed at the time was a leftover from the single player original: it reset the clicking player's own local game state and nothing else, with no server round trip at all. It didn't touch the `started` flag, didn't tell anyone else in the room anything had happened, and had no way to. So a host could restart, the screen would look like a fresh game, and the room would still reject every new captain trying to join it with "this voyage has already set sail," forever, because nothing had actually told the room it was open again.

The fix was to make restarting an actual server side action instead of a purely local one: a `room:restart` socket event, host only, gated the same way `room:start` is, that flips `started` back to false, resets the room's round and phase, clears out every member's saved game state, and broadcasts to every connected client to reset their own local copy too. The join routes themselves didn't need to change at all, since they were already checking `started` correctly. The bug was entirely that nothing ever reset that flag, not that the check was wrong.

## Common issues and how to deal with them

A handful of problems come up often enough that they're worth knowing about ahead of time, rather than debugging from scratch each time.

**"No such table" errors right after a fresh setup.** This means the database file exists but the schema was never applied to it. Run `npm run db:push` (or `npm run db:migrate` if you'd rather go through the migration history) and try again.

**Errors about the Prisma client, or imports from `generated/prisma` failing to resolve.** That folder is generated, not checked into git, and it's easy to end up without it: deleting `node_modules` and reinstalling with a flag that skips lifecycle scripts, or just deleting the folder by hand while cleaning up, will leave it missing. `npm run db:generate` rebuilds it without needing to touch anything else.

**`PrismaClientConstructorValidationError`, something about engine type "client" needing an adapter.** This means `@prisma/client` and the `prisma` CLI have drifted onto different major versions, or the generator switched to Prisma 7's default client engine without the rest of the setup following along. Prisma 7 doesn't ship a query engine binary for `prisma-client-js` the way Prisma 6 and earlier did; the client talks to the database through a driver adapter instead, which is why `src/lib/db.ts` constructs a `PrismaBetterSqlite3` adapter and passes it into `new PrismaClient({ adapter })` rather than calling that constructor bare. If you're upgrading Prisma yourself, `prisma` and `@prisma/client` need to move together, and `prisma.config.ts` (not `schema.prisma`) is where the CLI's own connection string lives now; Prisma 7 will refuse to start if `datasource.url` is still set inside `schema.prisma`.

**A production build fails deep into `npm run build`, specifically while processing `globals.css`, with something like "Cannot find module '../lightningcss.linux-x64-gnu.node'."** This one is sneaky because it can build fine on your own machine and only fail on Railway or in CI. Tailwind v4's CSS engine (`lightningcss`, and `@tailwindcss/oxide`) ships a separate native binary package per platform, and npm is only supposed to install the one matching whatever machine is running the install. The catch is that `package-lock.json` needs a fully resolved entry for *every* platform's variant for that to work anywhere other than wherever the lockfile was first generated; if it's missing those entries (which can happen silently, from an old npm version or a lockfile that only ever saw one platform), `npm ci` on a different platform will simply skip the binary it needs with no warning until something tries to actually load it at build time. If you hit this, regenerate the lockfile from a truly clean state, not just `npm install` on top of an existing `node_modules` (which will report "up to date" and change nothing): `rm -rf node_modules package-lock.json && npm install`, then confirm with `grep -c '"node_modules/lightningcss-' package-lock.json`, which should report 11, one per supported platform, not 1.

**The dev server throws `EADDRINUSE` or otherwise refuses to start on port 2232.** Something else, usually a previous `npm run dev` that didn't shut down cleanly, is still holding that port. Find it and stop it before starting a new one. On macOS or Linux, `lsof -i :2232` will show you the process holding the port.

**A cryptic Turbopack panic, often phrased as something like "Next.js package not found" or "Failed to write app endpoint," even though the `next` package is clearly installed.** This almost always means the `.next` folder is stale relative to where the project currently lives on disk. Turbopack keeps a persistent on-disk cache there, and that cache stores absolute file paths. If you ever copy or move this project folder (cloning it to a new location, duplicating it for a parallel branch of work, syncing it through a tool that preserves build output), that cache still points at the old path and Turbopack will fail trying to resolve things through it, while the rest of the app keeps working because most requests don't depend on that cache. The fix is simple: stop the dev server, delete the `.next` folder, and start it again. Turbopack will rebuild a fresh cache rooted at the project's actual current location.

**Running `next dev` or `next start` directly instead of going through npm scripts.** Because the realtime layer is attached inside `server.ts` rather than being part of how Next.js normally boots, calling the Next.js CLI directly will give you a working website with broken multiplayer. The page will load, but presence, chat, and room synchronization will silently do nothing because Socket.IO was never attached to anything. Always go through `npm run dev` or `npm run build` plus `npm run start`.

**Testing multiplayer locally with two accounts and seeing the wrong one logged in.** The session is stored in an httpOnly cookie scoped to the origin, and a browser shares its cookie jar across every tab pointed at that origin. If you log in as one captain in one tab and then log in as a second captain in another tab of the same browser, the second login overwrites the cookie for both tabs, and the first tab will start acting as the second user the next time it makes a request. This isn't a bug in the session logic, it's just how cookies work. To actually test two captains in the same harbor, use two different browsers, or a normal window plus a private/incognito window, so each one gets its own cookie jar.

**"Start Voyage" doesn't seem to do anything, or you get an error about needing more captains.** A room needs at least two members before the host is allowed to start it. This is intentional, since the whole point of the synchronized phases is multiple people playing together; a solo room simply isn't allowed to set sail.

**Restarting feels like a big hammer.** It is, on purpose. It resets everyone in the room, not just whoever clicked it, and there's no undo. That's covered in its own section above; the short version is that anything gentler turned out to either not work or to quietly desync one captain from the rest of the room with no way back.

**A captain who refreshed or briefly lost connection seems to vanish from the room, but only after a delay.** Closing a tab doesn't immediately free that player's seat. There's a thirty second grace period before the server treats them as having actually left, specifically so a refresh or a flaky connection doesn't cost someone their spot in the room. If you're testing departures and joins quickly, that delay is expected, not a bug.

**Sharing your local instance through something other than ngrok and the dev server blocking asset requests.** `next.config.ts` only allowlists ngrok's domains in `allowedDevOrigins`. If you tunnel through something else, add that domain to the same list or you'll see the dev server refuse cross origin requests for its own `/_next` assets.

## Working on this codebase: tracing things to their actual root cause

The restart bug above is a decent case study for how problems tend to hide in this particular codebase, and it's worth internalizing the pattern rather than just the fix, because it'll come up again in some other shape.

**Find out which side of the client/server split actually owns the behavior before you touch anything.** Every captain runs an identical copy of the game engine, so it's tempting to assume a gameplay bug lives entirely in `src/lib/game/engine.ts` and a multiplayer bug lives entirely in `src/server/realtime.ts`. The restart bug lived in neither at first; it lived in the fact that no code anywhere, client or server, ever called the thing that would have fixed it. Before changing a function, ask what's supposed to call it, under what circumstances, and whether anything actually does.

**Look for state that only ever moves in one direction.** `Room.started` is the clearest example: one `db.room.update` sets it to true, and until recently nothing in the entire codebase ever set it back to false. That's a pattern worth specifically checking for whenever a bug report sounds like "X used to work, and now it's stuck." Grep for everywhere a flag gets written, not just everywhere it gets read, and see if the set of writers actually covers every transition the product needs, including the ones that undo an earlier one.

**Don't trust that a button does what its label says.** The old restart button was labeled the same single word in both single player and multiplayer, but it meant something different in each: a full reset in a game with one player, and a no-op-for-everyone-else local reset in a game with several. The fix wasn't to make the join check smarter or to special case anything in the API routes; the join routes were already correct. The fix was to make the button's actual behavior match what its label had always implied, by giving it a real server side counterpart it never had.

**When you do add a new server side action, gate it the same way similar ones are already gated, don't invent a new pattern.** The restart handler in `src/server/realtime.ts` is deliberately structured almost identically to the existing `room:start` handler right above it: same auth check, same host-only check, same in-memory guard against double firing, same broadcast-then-update-checkpoint shape. Consistency here isn't a style preference, it's what makes the next person (including a future you) able to read one handler and immediately understand the others, instead of having to independently verify each one's locking and authorization from scratch.

**Verify multiplayer fixes with more than one connected client, and script it if the UI makes that slow.** A bug like this one is invisible with a single browser tab open, since the whole point is what happens to a second captain. Two browser profiles work, but for a quick sanity check during development, it's faster to script the REST and Socket.IO calls directly against the running dev server (register two or three accounts, create a room, join it, start it, fire the action you're testing, and assert on the response) than to manually choreograph multiple browser windows every time you change a line.

**"It builds on my machine" is not evidence that it builds anywhere else, and this codebase has already proven that the hard way once.** The lightningcss/`@tailwindcss/oxide` lockfile issue described above passed every local check: `npm install` was happy, `npm run dev` worked, `npm run build` worked, because all of that ran on the one platform whose binaries actually made it into `node_modules`. The failure only existed on whatever platform Railway's build runs on, which almost nobody developing this app locally is using day to day. When a change touches dependencies, the lockfile, or anything platform-specific (native modules, binary engines, file paths that assume a particular working directory), local success doesn't tell you much. If you have Docker available, actually building inside a throwaway container for the deploy target's platform (`docker run --rm --platform linux/amd64 -v "$(pwd):/work" -w /work node:22-slim bash -c "npm ci && npm run build"`) catches this class of bug in a couple of minutes, instead of in a Railway deploy log after the fact.

## Linting

```
npm run lint
```

This runs ESLint using the Next.js flat config defined in `eslint.config.mjs`.

## Deploying

The short version: Railway already has everything it needs through `railway.json`, which tells it to run `npm install && npm run build` to build and `npm run start` to run. Point a new Railway project at this repository and it should work without further configuration.

The one thing that needs manual setup is the database. Railway's filesystem is wiped on every deploy, so the SQLite file needs to live on a volume to survive redeploys. Add a volume to the service, set `DATABASE_URL` to a path on that volume (for example `file:/data/prod.db`), deploy once, and then run the database setup against that same `DATABASE_URL` (using `railway run`, for instance) so the tables actually get created on the volume. After that first deploy, roll out future schema changes with `npx prisma migrate deploy` rather than `db:push`, since it only applies whatever migrations haven't run yet and won't touch existing rows.

If you'd rather not deal with a volume at all, `prisma/schema.prisma` can have its datasource provider swapped from `sqlite` to `postgresql` and pointed at a managed Postgres instance instead. Everything else about how the app runs stays the same either way. The full walkthrough, with a bit more detail on each step, lives in [docs/deployment.md](docs/deployment.md).
