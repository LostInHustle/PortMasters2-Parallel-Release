-- CreateTable
CREATE TABLE "CaptainMerit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "meritId" TEXT NOT NULL,
    "earnedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaptainMerit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CaptainLegacy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "renownLevel" INTEGER NOT NULL DEFAULT 1,
    "renownXP" INTEGER NOT NULL DEFAULT 0,
    "voyagesCompleted" INTEGER NOT NULL DEFAULT 0,
    "seaMasterCrowns" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "consecutiveSolventVoyages" INTEGER NOT NULL DEFAULT 0,
    "checkInCount" INTEGER NOT NULL DEFAULT 0,
    "lastCheckInDate" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaptainLegacy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CaptainLegacy" ("bestScore", "checkInCount", "id", "lastCheckInDate", "renownLevel", "renownXP", "seaMasterCrowns", "updatedAt", "userId", "voyagesCompleted") SELECT "bestScore", "checkInCount", "id", "lastCheckInDate", "renownLevel", "renownXP", "seaMasterCrowns", "updatedAt", "userId", "voyagesCompleted" FROM "CaptainLegacy";
DROP TABLE "CaptainLegacy";
ALTER TABLE "new_CaptainLegacy" RENAME TO "CaptainLegacy";
CREATE UNIQUE INDEX "CaptainLegacy_userId_key" ON "CaptainLegacy"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CaptainMerit_userId_idx" ON "CaptainMerit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CaptainMerit_userId_meritId_key" ON "CaptainMerit"("userId", "meritId");
