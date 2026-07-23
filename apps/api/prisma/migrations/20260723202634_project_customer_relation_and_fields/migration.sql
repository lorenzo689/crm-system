-- CreateEnum
CREATE TYPE "ProjectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- DropForeignKey
ALTER TABLE "project_customers" DROP CONSTRAINT "project_customers_customerId_fkey";

-- DropForeignKey
ALTER TABLE "project_customers" DROP CONSTRAINT "project_customers_projectId_fkey";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "customerId" UUID NOT NULL,
ADD COLUMN     "priority" "ProjectPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "projectNumber" TEXT NOT NULL;

-- DropTable
DROP TABLE "project_customers";

-- CreateIndex
CREATE INDEX "projects_customerId_idx" ON "projects"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organizationId_projectNumber_key" ON "projects"("organizationId", "projectNumber");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
