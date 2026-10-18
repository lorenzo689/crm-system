-- CreateEnum
CREATE TYPE "AiProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiProposalSource" AS ENUM ('CHAT', 'AGENT');

-- CreateTable
CREATE TABLE "ai_proposals" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "source" "AiProposalSource" NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "payload" JSONB NOT NULL,
    "status" "AiProposalStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "dedupeKey" TEXT,
    "requestedById" UUID,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_proposals_organizationId_status_createdAt_idx" ON "ai_proposals"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_proposals_organizationId_dedupeKey_key" ON "ai_proposals"("organizationId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
