-- CreateTable
CREATE TABLE "CustomerAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerKey" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "businessGroup" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "targetRevenue" REAL NOT NULL DEFAULT 0,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerAssignment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAssignment_customerKey_key" ON "CustomerAssignment"("customerKey");

-- CreateIndex
CREATE INDEX "CustomerAssignment_saleId_idx" ON "CustomerAssignment"("saleId");

