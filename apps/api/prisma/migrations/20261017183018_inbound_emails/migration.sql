-- CreateEnum
CREATE TYPE "InboundEmailStatus" AS ENUM ('NEW', 'DONE', 'IGNORED');

-- CreateTable
CREATE TABLE "inbound_emails" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "subject" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "customerId" UUID,
    "status" "InboundEmailStatus" NOT NULL DEFAULT 'NEW',
    "category" TEXT,
    "aiSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbound_emails_organizationId_status_receivedAt_idx" ON "inbound_emails"("organizationId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "inbound_emails_customerId_idx" ON "inbound_emails"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_emails_organizationId_messageId_key" ON "inbound_emails"("organizationId", "messageId");

-- AddForeignKey
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
