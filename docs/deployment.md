# Running and deploying PortMasters 2 Parallel Release

The app runs as a single process. Next.js, which provides both the website and its API routes, and the Socket.IO realtime layer, which handles presence, chat, and live game status, share the same HTTP server and the same port defined in `server.ts`. There is nothing else to run beside it: no reverse proxy, no second service, and no separate database server.

The database is a single SQLite file that this one process reads and writes directly.

## Running it locally

```
npm install
npm run dev
```

That is all. Running `npm install` also generates the Prisma client, and `npm run dev` creates the SQLite file the first time the database is used. If you prefer to create it explicitly ahead of time, run `npm run db:push` once. The app, including the website and the realtime layer, is then available at `http://localhost:2232`.

If you want to share your local instance, for example through ngrok, point it to the same port:

```
ngrok http 2232
```

## Deploying to Railway

A `railway.json` file at the repository root already instructs Railway how to build and start the app, so a new project pointed at this repository should work immediately. It runs:

```
build:  npm install && npm run build
start:  npm run start
```

Railway assigns the public `PORT` automatically. `server.ts` reads it from the environment, so you do not need to set one.

### Persisting the database

Railway’s filesystem is cleared on every deploy, so the SQLite file must live on a Railway volume in order to survive redeployments.

1. In the Railway service, add a volume, for example mounted at `/data`.
2. Set `DATABASE_URL=file:/data/prod.db` on the service.
3. Deploy. `npm run start` runs `prisma migrate deploy` before starting the server (see `package.json`), so the tables are created automatically the first time the app boots against that volume, no manual step required.

### Picking up a schema change

Schema changes are committed as migrations under `prisma/migrations/` (`npm run db:migrate` locally to generate one). `prisma migrate deploy` runs automatically on every boot via the `start` script and only applies migrations that haven't run yet, so it's safe on every deploy and never modifies existing rows. There is nothing extra to run by hand in production.

If you prefer not to use a volume, you can point `DATABASE_URL` to a managed Postgres instance instead. Change the `datasource` provider in `prisma/schema.prisma` back to `"postgresql"` and run `npx prisma generate`. Everything else, including the merged server and the single port, remains the same.
