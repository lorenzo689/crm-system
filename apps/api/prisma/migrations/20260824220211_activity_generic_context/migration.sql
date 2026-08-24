-- AlterEnum
BEGIN;
CREATE TYPE "ActivityType_new" AS ENUM ('CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'CUSTOMER_ARCHIVED', 'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_STATUS_CHANGED', 'PROJECT_ARCHIVED', 'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_COMPLETED', 'TASK_ARCHIVED', 'NOTE_CREATED');
ALTER TABLE "activities" ALTER COLUMN "type" TYPE "ActivityType_new" USING ("type"::text::"ActivityType_new");
ALTER TYPE "ActivityType" RENAME TO "ActivityType_old";
ALTER TYPE "ActivityType_new" RENAME TO "ActivityType";
DROP TYPE "public"."ActivityType_old";
COMMIT;

-- DropIndex
DROP INDEX "activities_taskId_idx";

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "customerId" UUID,
ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "activities_customerId_occurredAt_idx" ON "activities"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "activities_taskId_occurredAt_idx" ON "activities"("taskId", "occurredAt");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
