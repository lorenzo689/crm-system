-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'PRICE_LIST';
ALTER TYPE "DocumentType" ADD VALUE 'DATASHEET';

-- AlterTable
ALTER TABLE "document_versions" ADD COLUMN     "extractedText" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
