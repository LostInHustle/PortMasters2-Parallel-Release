// =====================================================================
// PortMasters 2: reset the development database to a pristine state.
//
// Usage:
//   npx tsx scripts/reset-db.ts         , wipe everything
//   npx tsx scripts/reset-db.ts --keep-users, keep User + Session rows
//
// This deletes every test room, test account, stale membership, saved
// game-state blob, and chat message from the local SQLite database.
//
// After running this, the next `npm run dev` starts with a completely
// empty lobby, no old test rooms, no orphaned memberships from past
// sessions, no leftover game states pointing at deleted rooms.
// =====================================================================

// Must load .env before importing anything that reads DATABASE_URL.
try { process.loadEnvFile() } catch {}

import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  const keepUsers = process.argv.includes("--keep-users");

  console.log("🧹 PortMasters 2 · Database Reset");
  console.log("─".repeat(40));

  // Delete order matters due to foreign keys (though SQLite cascades).
  console.log("  Deleting GameState rows…");
  const gs = await db.gameState.deleteMany();
  console.log(`    ${gs.count} game-state blob(s) removed`);

  console.log("  Deleting Message rows…");
  const msgs = await db.message.deleteMany();
  console.log(`    ${msgs.count} chat message(s) removed`);

  console.log("  Deleting RoomMember rows…");
  const rm = await db.roomMember.deleteMany();
  console.log(`    ${rm.count} membership(s) removed`);

  console.log("  Deleting Room rows…");
  const rooms = await db.room.deleteMany();
  console.log(`    ${rooms.count} room(s) removed`);

  if (!keepUsers) {
    console.log("  Deleting Session rows…");
    const sess = await db.session.deleteMany();
    console.log(`    ${sess.count} session(s) removed`);

    console.log("  Deleting User rows…");
    const users = await db.user.deleteMany();
    console.log(`    ${users.count} user account(s) removed`);
  } else {
    console.log("  ⏭  Skipping User + Session tables (--keep-users)");
  }

  console.log("─".repeat(40));
  console.log("✅ Database is clean. Start the app with `npm run dev`.");
}

main()
  .catch((err) => {
    console.error("❌ Reset failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
