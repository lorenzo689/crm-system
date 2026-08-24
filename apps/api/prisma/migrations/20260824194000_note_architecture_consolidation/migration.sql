-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('GENERAL', 'PHONE', 'MEETING', 'INTERNAL', 'DECISION');

-- DropForeignKey
ALTER TABLE "customer_notes" DROP CONSTRAINT "customer_notes_authorId_fkey";

-- DropForeignKey
ALTER TABLE "customer_notes" DROP CONSTRAINT "customer_notes_customerId_fkey";

-- DropIndex
DROP INDEX "notes_taskId_idx";

-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "customerId" UUID,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "type" "NoteType" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "projectId" DROP NOT NULL;

-- DropTable
DROP TABLE "customer_notes";

-- CreateIndex
CREATE INDEX "notes_customerId_createdAt_idx" ON "notes"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "notes_taskId_createdAt_idx" ON "notes"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "notes_customerId_archivedAt_idx" ON "notes"("customerId", "archivedAt");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
