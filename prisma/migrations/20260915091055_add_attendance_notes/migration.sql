-- CreateTable
CREATE TABLE "AttendanceNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AttendanceNote_date_idx" ON "AttendanceNote"("date");

-- CreateIndex
CREATE INDEX "AttendanceNote_name_idx" ON "AttendanceNote"("name");
