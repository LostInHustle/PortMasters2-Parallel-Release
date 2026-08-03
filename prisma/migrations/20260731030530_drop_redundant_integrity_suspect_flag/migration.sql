/*
  Warnings:

  - You are about to drop the column `integritySuspect` on the `GameState` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GameState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "integritySeverity" TEXT,
    "integrityNote" TEXT,
    CONSTRAINT "GameState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameState_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GameState" ("data", "id", "integrityNote", "integritySeverity", "roomId", "updatedAt", "userId") SELECT "data", "id", "integrityNote", "integritySeverity", "roomId", "updatedAt", "userId" FROM "GameState";
DROP TABLE "GameState";
ALTER TABLE "new_GameState" RENAME TO "GameState";
CREATE INDEX "GameState_userId_idx" ON "GameState"("userId");
CREATE INDEX "GameState_roomId_idx" ON "GameState"("roomId");
CREATE UNIQUE INDEX "GameState_userId_roomId_key" ON "GameState"("userId", "roomId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
