-- Add authentication fields introduced after the initial migration.
ALTER TABLE "User" ADD COLUMN "password" TEXT NOT NULL DEFAULT 'gusa123';
ALTER TABLE "User" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Chưa phân loại';

-- Add sales reporting models.
CREATE TABLE "SalesReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "salesperson" TEXT NOT NULL,
    "salespersonEmail" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "orderStatus" TEXT NOT NULL,
    "target" REAL NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "items" JSONB NOT NULL,
    "revenue" REAL NOT NULL DEFAULT 0,
    "salespersonId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesReport_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "SalesTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "SalesAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "managerId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Đang thực hiện',
    "date" TEXT NOT NULL,
    "attachmentName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesAssignment_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesTarget_category_key" ON "SalesTarget"("category");
CREATE INDEX "SalesReport_category_idx" ON "SalesReport"("category");
CREATE INDEX "SalesReport_date_idx" ON "SalesReport"("date");
CREATE INDEX "SalesReport_salespersonEmail_idx" ON "SalesReport"("salespersonEmail");
CREATE INDEX "SalesAssignment_assigneeId_idx" ON "SalesAssignment"("assigneeId");
CREATE INDEX "SalesAssignment_managerId_idx" ON "SalesAssignment"("managerId");
CREATE INDEX "ActivityLog_orgId_idx" ON "ActivityLog"("orgId");
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
