/*
  Warnings:

  - You are about to drop the `customer_contacts` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `customerId` to the `contacts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "customer_contacts" DROP CONSTRAINT "customer_contacts_contactId_fkey";

-- DropForeignKey
ALTER TABLE "customer_contacts" DROP CONSTRAINT "customer_contacts_customerId_fkey";

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "customerId" UUID NOT NULL;

-- DropTable
DROP TABLE "customer_contacts";

-- CreateIndex
CREATE INDEX "contacts_customerId_idx" ON "contacts"("customerId");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
