-- CreateTable
CREATE TABLE "ConvoyVenture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "voyageEpoch" INTEGER NOT NULL,
    "posterId" TEXT NOT NULL,
    "posterName" TEXT NOT NULL,
    "targetGold" INTEGER NOT NULL,
    "deadlineRound" INTEGER NOT NULL,
    "payoutMultiplier" REAL NOT NULL DEFAULT 1.5,
    "contributions" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "ConvoyVenture_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ConvoyVenture_roomId_voyageEpoch_idx" ON "ConvoyVenture"("roomId", "voyageEpoch");
