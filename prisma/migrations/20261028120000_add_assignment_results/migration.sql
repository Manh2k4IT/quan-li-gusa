-- CreateTable
CREATE TABLE "AssignmentResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerKey" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "businessGroup" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "saleName" TEXT NOT NULL,
    "targetRevenue" REAL NOT NULL,
    "achievedRevenue" REAL NOT NULL,
    "achievedOrders" INTEGER NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "reached" BOOLEAN NOT NULL,
    "outcome" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AssignmentResult_saleId_idx" ON "AssignmentResult"("saleId");

-- CreateIndex
CREATE INDEX "AssignmentResult_periodEnd_idx" ON "AssignmentResult"("periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentResult_customerKey_saleId_periodStart_periodEnd_key" ON "AssignmentResult"("customerKey", "saleId", "periodStart", "periodEnd");
