/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,customerNumber]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `customerNumber` to the `customers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "customerNumber" TEXT NOT NULL,
ADD COLUMN     "website" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customers_organizationId_customerNumber_key" ON "customers"("organizationId", "customerNumber");
