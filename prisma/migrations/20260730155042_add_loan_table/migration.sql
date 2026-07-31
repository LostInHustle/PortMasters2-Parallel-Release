-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "voyageEpoch" INTEGER NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "borrowerName" TEXT NOT NULL,
    "lenderId" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "backerId" TEXT,
    "backerName" TEXT,
    "backedAmount" INTEGER,
    "redirectToUserId" TEXT,
    "redirectToName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Loan_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Loan_roomId_voyageEpoch_idx" ON "Loan"("roomId", "voyageEpoch");
