import { PrismaClient } from "../../generated/prisma";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// The adapter below needs DATABASE_URL the moment this module loads, which
// can happen before Next's own .env loading has run when it's reached
// through the custom server's import graph (server.ts -> realtime.ts ->
// here) rather than through Next's request handling. Loading it directly
// removes the dependency on that ordering. In production (Railway)
// DATABASE_URL is already set in the environment and there's no .env file
// to load, so a missing file here is expected and not an error.
try {
  process.loadEnvFile();
} catch {}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma 7's "client" engine (the default for prisma-client-js now, see
// prisma/schema.prisma) has no bundled query engine binary; it talks to
// the database through a driver adapter instead. better-sqlite3 is
// Prisma's own adapter for plain file-based SQLite, the same database
// this project already uses, so the actual connection (and DATABASE_URL)
// stay the same as before, just plugged in through this adapter rather
// than left for the client to resolve a binary engine on its own.
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["query"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// The exact user columns that are safe to hand to another captain, as a
// Prisma `select` fragment. Every route and socket handler that includes a
// user alongside something else (a room's members, a chat message's sender,
// a room's host) needs precisely this set, and each used to spell it out
// again: eighteen copies of the same four lines, so adding a public field
// meant finding all eighteen.
//
// It lives here, beside the client, rather than next to `publicUser` in
// api-auth.ts, because api-auth.ts imports `next/headers` at module scope.
// That is fine inside a request scoped API route but not from the custom
// socket server in src/server/realtime.ts, which runs outside any request
// (and is exactly why realtime.ts keeps its own small `publicUser` copy).
// db.ts is the one database module both sides already import safely.
export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarHue: true,
} as const;
