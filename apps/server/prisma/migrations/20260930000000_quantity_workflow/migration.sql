-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "specification" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (length(trim("name")) > 0 AND length(trim("unit")) > 0)
);

-- CreateTable
CREATE TABLE "ProcurementRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serialNumber" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "handler" TEXT NOT NULL,
    "requestDate" TEXT NOT NULL,
    "note" TEXT,
    "sourceTaskId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcurementRequest_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "ImportTask" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProcurementLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "specification" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL,
    "quantityUnits" BIGINT NOT NULL,
    "cancelledUnits" BIGINT NOT NULL DEFAULT 0,
    "orderedUnits" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,
    CONSTRAINT "ProcurementLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProcurementRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProcurementLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("quantityUnits" > 0 AND "orderedUnits" >= 0 AND "cancelledUnits" >= 0 AND "orderedUnits" + "cancelledUnits" <= "quantityUnits")
);

-- CreateTable
CREATE TABLE "BusinessDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "supplierId" INTEGER,
    "supplierName" TEXT,
    "department" TEXT,
    "source" TEXT,
    "returnMode" TEXT,
    "note" TEXT,
    "totalAmountUnits" BIGINT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "invoiceIssued" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "voidDate" TEXT,
    "voidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessDocument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("kind" IN ('PURCHASE','RECEIPT','STOCK_IN','DISTRIBUTION','SUPPLIER_RETURN','EMPLOYEE_RETURN','PURCHASE_CANCEL','REQUEST_CANCEL','ADJUSTMENT')),
    CHECK ("status" IN ('POSTED','VOIDED')),
    CHECK ("paymentStatus" IN ('UNPAID','PAID','REIMBURSED'))
);

-- CreateTable
CREATE TABLE "BusinessLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentId" INTEGER NOT NULL,
    "requestLineId" INTEGER,
    "sourceLineId" INTEGER,
    "productId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "specification" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL,
    "quantityUnits" BIGINT NOT NULL,
    "unitPriceUnits" BIGINT,
    "amountUnits" BIGINT,
    "purchaseReductionAmountUnits" BIGINT,
    "receivedUnits" BIGINT NOT NULL DEFAULT 0,
    "cancelledUnits" BIGINT NOT NULL DEFAULT 0,
    "purchaseLink" TEXT,
    "recipient" TEXT,
    "location" TEXT,
    "reason" TEXT,
    CONSTRAINT "BusinessLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BusinessDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BusinessLine_requestLineId_fkey" FOREIGN KEY ("requestLineId") REFERENCES "ProcurementLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BusinessLine_sourceLineId_fkey" FOREIGN KEY ("sourceLineId") REFERENCES "BusinessLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BusinessLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("quantityUnits" > 0 AND "receivedUnits" >= 0 AND "cancelledUnits" >= 0 AND "receivedUnits" + "cancelledUnits" <= "quantityUnits"),
    CHECK ("unitPriceUnits" IS NULL OR "unitPriceUnits" >= 0),
    CHECK ("amountUnits" IS NULL OR "amountUnits" >= 0)
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "originLineId" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "quantityUnits" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "StockBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockBalance_originLineId_fkey" FOREIGN KEY ("originLineId") REFERENCES "BusinessLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("quantityUnits" >= 0),
    CHECK ("location" IN ('RECEIVING','STOCK'))
);

-- CreateTable
CREATE TABLE "StockEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "businessLineId" INTEGER NOT NULL,
    "originLineId" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "quantityUnits" BIGINT NOT NULL,
    "date" TEXT NOT NULL,
    "reversalOfId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockEntry_businessLineId_fkey" FOREIGN KEY ("businessLineId") REFERENCES "BusinessLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockEntry_originLineId_fkey" FOREIGN KEY ("originLineId") REFERENCES "BusinessLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("quantityUnits" <> 0),
    CHECK ("location" IN ('RECEIVING','STOCK'))
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Attachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "itemId" INTEGER,
    "distributionId" INTEGER,
    "procurementRequestId" INTEGER,
    "businessDocumentId" INTEGER,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "Distribution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_procurementRequestId_fkey" FOREIGN KEY ("procurementRequestId") REFERENCES "ProcurementRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Attachment_businessDocumentId_fkey" FOREIGN KEY ("businessDocumentId") REFERENCES "BusinessDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Attachment" ("createdAt", "distributionId", "filename", "id", "itemId", "kind", "mimeType", "sizeBytes", "storagePath") SELECT "createdAt", "distributionId", "filename", "id", "itemId", "kind", "mimeType", "sizeBytes", "storagePath" FROM "Attachment";
DROP TABLE "Attachment";
ALTER TABLE "new_Attachment" RENAME TO "Attachment";
CREATE INDEX "Attachment_itemId_idx" ON "Attachment"("itemId");
CREATE INDEX "Attachment_distributionId_idx" ON "Attachment"("distributionId");
CREATE INDEX "Attachment_procurementRequestId_idx" ON "Attachment"("procurementRequestId");
CREATE INDEX "Attachment_businessDocumentId_idx" ON "Attachment"("businessDocumentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_name_specification_unit_key" ON "CatalogProduct"("name", "specification", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementRequest_sourceTaskId_key" ON "ProcurementRequest"("sourceTaskId");

-- CreateIndex
CREATE INDEX "ProcurementRequest_requestDate_idx" ON "ProcurementRequest"("requestDate");

-- CreateIndex
CREATE INDEX "ProcurementRequest_serialNumber_idx" ON "ProcurementRequest"("serialNumber");

-- CreateIndex
CREATE INDEX "ProcurementLine_productId_idx" ON "ProcurementLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementLine_requestId_lineNumber_key" ON "ProcurementLine"("requestId", "lineNumber");

-- CreateIndex
CREATE INDEX "BusinessDocument_kind_status_date_idx" ON "BusinessDocument"("kind", "status", "date");

-- CreateIndex
CREATE INDEX "BusinessDocument_supplierId_idx" ON "BusinessDocument"("supplierId");

-- CreateIndex
CREATE INDEX "BusinessLine_requestLineId_idx" ON "BusinessLine"("requestLineId");

-- CreateIndex
CREATE INDEX "BusinessLine_sourceLineId_idx" ON "BusinessLine"("sourceLineId");

-- CreateIndex
CREATE INDEX "BusinessLine_documentId_idx" ON "BusinessLine"("documentId");

-- CreateIndex
CREATE INDEX "StockBalance_productId_location_idx" ON "StockBalance"("productId", "location");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_productId_originLineId_location_key" ON "StockBalance"("productId", "originLineId", "location");

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_reversalOfId_key" ON "StockEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "StockEntry_productId_date_idx" ON "StockEntry"("productId", "date");

-- CreateIndex
CREATE INDEX "StockEntry_originLineId_location_idx" ON "StockEntry"("originLineId", "location");

-- CreateIndex
CREATE INDEX "StockEntry_businessLineId_idx" ON "StockEntry"("businessLineId");
