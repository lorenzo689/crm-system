-- Sprint 3.1: one invoice per recurring template and due date, enforced by the
-- database. Additive; existing documents keep NULL (the unique index ignores NULL).
ALTER TABLE "sales_documents"
    ADD COLUMN "recurringInvoiceId" UUID,
    ADD COLUMN "recurrenceDate" DATE;

ALTER TABLE "sales_documents"
    ADD CONSTRAINT "sales_documents_recurringInvoiceId_fkey"
    FOREIGN KEY ("recurringInvoiceId") REFERENCES "recurring_invoices"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "sales_documents_recurringInvoiceId_recurrenceDate_key"
    ON "sales_documents"("recurringInvoiceId", "recurrenceDate");
