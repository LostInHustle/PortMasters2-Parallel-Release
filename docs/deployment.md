# Running and deploying PortMasters 2 Parallel Release

The app runs as a single process. Next.js, which provides both the website and its API routes, and the Socket.IO realtime layer, which handles presence, chat, and live game status, share the same HTTP server and the same port defined in `server.ts`. There is nothing else to run beside it: no reverse proxy, no second service, and no separate database server.

The database is a single SQLite file that this one process reads and writes directly.

## Running it locally

```bash
npm install
npm run db:push
npm run dev
```

Running `npm install` also generates the Prisma client. `npm run db:push` creates the SQLite schema once; without it, `npm run dev` still starts, but the empty database has no tables and registration fails with "no such table". The app, including the website and the realtime layer, is then available at `http://localhost:2232`.

If you want to share your local instance, for example through ngrok, point it to the same port:

```bash
ngrok http 2232
```

## Deploying to Railway

A `railway.json` file at the repository root already instructs Railway how to build and start the app, so a new project pointed at this repository should work immediately. It runs:

| Phase | Command                        |
| ----- | ------------------------------ |
| Build | `npm install && npm run build` |
| Start | `npm run start`                |

Railway assigns the public `PORT` automatically. `server.ts` reads it from the environment, so you do not need to set one.

### Persisting the database

Railway’s filesystem is cleared on every deploy, so the SQLite file must live on a Railway volume in order to survive redeployments.

1. In the Railway service, add a volume, for example mounted at `/data`.
2. Set `DATABASE_URL=file:/data/prod.db` on the service.
3. Deploy. `npm run start` runs `prisma migrate deploy` before starting the server (see `package.json`), so the tables are created automatically the first time the app boots against that volume, no manual step required.

### Opening the Harbor Office

The admin console at `/admin` stays closed until the service has an `ADMIN_KEY` variable. Set it on the Railway service alongside `DATABASE_URL`, using something long and random, then sign in to the deployed game with the account that should run the harbor, open `/admin`, and present the key. That account becomes the one admin, permanently, and can appoint moderators from there. Choose the account with care: the seat is claimed exactly once, and after that the key opens nothing for anyone, the admin included. The key is never written to the database, so rotating it is just changing the variable and redeploying. If the admin account is ever lost, the seat is released only by hand, by clearing that account's `role` column in the database, after which the key works exactly once more.

### Picking up a schema change

Schema changes are committed as migrations under `prisma/migrations/` (`npm run db:migrate` locally to generate one). `prisma migrate deploy` runs automatically on every boot via the `start` script and only applies migrations that have not run yet, so a deploy never replays history. There is nothing extra to run by hand in production.

Postgres is not a drop in substitute. Prisma 7 connects through a driver adapter, and `src/lib/db.ts` builds `@prisma/adapter-better-sqlite3` directly. Moving to Postgres means changing the datasource provider, installing and wiring a Postgres adapter in that file, and regenerating the client; that path is not covered by the test suite. Use the volume above for a supported deployment.
