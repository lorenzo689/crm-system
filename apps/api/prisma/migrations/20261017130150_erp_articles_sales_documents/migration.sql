-- CreateEnum
CREATE TYPE "SalesDocumentType" AS ENUM ('QUOTE', 'INVOICE');

-- CreateEnum
CREATE TYPE "SalesDocumentStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'PAID', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'QUOTE_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'QUOTE_STATUS_CHANGED';
ALTER TYPE "ActivityType" ADD VALUE 'INVOICE_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'INVOICE_STATUS_CHANGED';

-- DropIndex
DROP INDEX "customers_name_trgm_idx";

-- DropIndex
DROP INDEX "document_versions_extractedText_trgm_idx";

-- DropIndex
DROP INDEX "document_versions_fileName_trgm_idx";

-- DropIndex
DROP INDEX "documents_title_trgm_idx";

-- DropIndex
DROP INDEX "organization_members_userId_idx";

-- DropIndex
DROP INDEX "projects_name_trgm_idx";

-- DropIndex
DROP INDEX "projects_projectNumber_trgm_idx";

-- DropIndex
DROP INDEX "tasks_organizationId_archivedAt_idx";

-- DropIndex
DROP INDEX "tasks_title_trgm_idx";

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "articleNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'Stk',
    "unitPriceCents" INTEGER NOT NULL,
    "vatRateBp" INTEGER NOT NULL DEFAULT 1900,
    "trackStock" BOOLEAN NOT NULL DEFAULT false,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "organizationId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("organizationId","key")
);

-- CreateTable
CREATE TABLE "sales_documents" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "SalesDocumentType" NOT NULL,
    "number" TEXT NOT NULL,
    "status" "SalesDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" UUID NOT NULL,
    "projectId" UUID,
    "sourceQuoteId" UUID,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE,
    "headerText" TEXT,
    "footerText" TEXT,
    "netCents" INTEGER NOT NULL DEFAULT 0,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "sales_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_document_items" (
    "id" UUID NOT NULL,
    "salesDocumentId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "articleId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Stk',
    "unitPriceCents" INTEGER NOT NULL,
    "vatRateBp" INTEGER NOT NULL DEFAULT 1900,
    "netCents" INTEGER NOT NULL,

    CONSTRAINT "sales_document_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "articles_organizationId_archivedAt_idx" ON "articles"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "articles_organizationId_name_idx" ON "articles"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "articles_organizationId_articleNumber_key" ON "articles"("organizationId", "articleNumber");

-- CreateIndex
CREATE INDEX "sales_documents_organizationId_type_status_idx" ON "sales_documents"("organizationId", "type", "status");

-- CreateIndex
CREATE INDEX "sales_documents_organizationId_type_issueDate_idx" ON "sales_documents"("organizationId", "type", "issueDate");

-- CreateIndex
CREATE INDEX "sales_documents_customerId_idx" ON "sales_documents"("customerId");

-- CreateIndex
CREATE INDEX "sales_documents_projectId_idx" ON "sales_documents"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_documents_organizationId_number_key" ON "sales_documents"("organizationId", "number");

-- CreateIndex
CREATE INDEX "sales_document_items_articleId_idx" ON "sales_document_items"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_document_items_salesDocumentId_position_key" ON "sales_document_items"("salesDocumentId", "position");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_sourceQuoteId_fkey" FOREIGN KEY ("sourceQuoteId") REFERENCES "sales_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_document_items" ADD CONSTRAINT "sales_document_items_salesDocumentId_fkey" FOREIGN KEY ("salesDocumentId") REFERENCES "sales_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_document_items" ADD CONSTRAINT "sales_document_items_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
