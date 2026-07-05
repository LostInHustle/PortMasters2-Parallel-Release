-- CreateTable
CREATE TABLE "CaptainLegacy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "renownLevel" INTEGER NOT NULL DEFAULT 1,
    "renownXP" INTEGER NOT NULL DEFAULT 0,
    "voyagesCompleted" INTEGER NOT NULL DEFAULT 0,
    "seaMasterCrowns" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaptainLegacy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CaptainLegacy_userId_key" ON "CaptainLegacy"("userId");
