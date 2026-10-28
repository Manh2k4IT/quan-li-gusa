-- AlterTable
ALTER TABLE "SalesAssignment" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manager';
ALTER TABLE "SalesAssignment" ADD COLUMN "target" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SalesAssignment" ADD COLUMN "dueDate" TEXT;
ALTER TABLE "SalesAssignment" ADD COLUMN "report" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SalesAssignment" ADD COLUMN "reportedAt" DATETIME;
ALTER TABLE "SalesAssignment" ADD COLUMN "feedback" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SalesAssignment" ADD COLUMN "reviewedAt" DATETIME;

-- Plans already waiting for review held the sale's report in "note"; move it to "report".
UPDATE "SalesAssignment" SET "report" = "note", "note" = '' WHERE "status" IN ('Chờ xác nhận', 'Đã duyệt', 'Không duyệt', 'Đã hoàn thành') AND "note" <> '';
