// =====================================================================
// PortMasters 2 Parallel Release: reset the development database.
//
// Usage:
//   npx tsx scripts/resetDb.ts                wipe everything
//   npx tsx scripts/resetDb.ts --keep-users   keep accounts, sessions,
//                                             Renown and merits
//
// Rooms, memberships, saved voyages, chat, ventures, loans and the
// moderation log go either way. Without the flag, every account goes too,
// and with it (through the schema's cascades) every session, Captain's
// Legacy row and merit. After running this, the next `npm run dev` starts
// with an empty lobby: no old test rooms, no orphaned memberships, no
// saved states pointing at rooms that no longer exist.
// =====================================================================

// Must load .env before importing anything that reads DATABASE_URL.
try {
  process.loadEnvFile();
} catch {}

import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  const keepUsers = process.argv.includes("--keep-users");

  console.log("PortMasters 2 Parallel Release: database reset");
  console.log("=".repeat(48));

  const report = (what: string, count: number) =>
    console.log(`  ${count} ${what} removed`);

  // Ventures and loans hang off rooms, so they go when the rooms do; the
  // moderation log has no relation to anything and is cleared on its own.
  report("game state blob(s)", (await db.gameState.deleteMany()).count);
  report("chat message(s)", (await db.message.deleteMany()).count);
  report("membership(s)", (await db.roomMember.deleteMany()).count);
  report("room(s)", (await db.room.deleteMany()).count);
  report(
    "moderation log entr(ies)",
    (await db.moderationLog.deleteMany()).count,
  );

  if (keepUsers) {
    console.log(
      "  Keeping accounts, sessions, Renown and merits (--keep-users)",
    );
  } else {
    report("session(s)", (await db.session.deleteMany()).count);
    report("account(s)", (await db.user.deleteMany()).count);
  }

  console.log("=".repeat(48));
  console.log("Database is clean. Start the app with `npm run dev`.");
}

main()
  .catch((err) => {
    console.error("Reset failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
