-- CreateTable
CREATE TABLE "ZaloSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ZaloOrderNotice" (
    "orderId" TEXT NOT NULL PRIMARY KEY,
    "customerKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
