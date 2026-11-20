import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  BackgroundJobsService,
  JobLeaseLostError,
  type JobContext,
} from '../../common/jobs/background-jobs.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiProposalsService } from './ai-proposals.service';

const QUOTE_FOLLOW_UP_AFTER_DAYS = 7;
const DUNNING_INTERVAL_DAYS = 7;
const MAX_DUNNING_LEVEL = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function isoWeek(date: Date) {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const yearStart = Date.UTC(target.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((target.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${target.getUTCFullYear()}-W${week}`;
}

/**
 * Rule-based background agent. It only ever creates proposals, so a person
 * confirms every action; deterministic rules keep it free of API cost.
 */
@Injectable()
export class AiAgentsService {
  private readonly logger = new Logger(AiAgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proposals: AiProposalsService,
    private readonly jobs?: BackgroundJobsService,
  ) {}

  @Cron('0 6 * * *', { name: 'ai-agents' })
  async runScheduledJob() {
    await this.jobs?.run('ai-agents', (context) => this.runScheduled(context));
  }

  async runScheduled(context?: JobContext) {
    const organizations = await this.prisma.organization.findMany({
      where: { archivedAt: null },
      select: { id: true },
    });
    for (const { id } of organizations) {
      // Proposals are idempotent (unique dedupeKey), so stopping between two
      // organizations is safe; the next run continues.
      context?.assertLeaseHeld();
      try {
        const created = await this.runForOrganization(id);
        this.logger.log(`Agent run for ${id}: ${created} new proposals`);
      } catch (error) {
        if (error instanceof JobLeaseLostError) throw error;
        this.logger.error(
          `Agent run failed for ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async runForOrganization(organizationId: string) {
    const counts = await Promise.all([
      this.proposeDunning(organizationId),
      this.proposeQuoteFollowUps(organizationId),
      this.proposeRestocking(organizationId),
      this.proposeSupplierInvoicePayments(organizationId),
      this.proposeTimeBilling(organizationId),
    ]);
    return counts.reduce((sum, count) => sum + count, 0);
  }

  /** Open supplier invoices that are overdue or due within three days. */
  private async proposeSupplierInvoicePayments(organizationId: string) {
    const horizon = new Date(Date.now() + 3 * DAY_MS);
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: {
        organizationId,
        status: 'OPEN',
        dueDate: { lte: horizon },
      },
      select: {
        id: true,
        invoiceNumber: true,
        grossCents: true,
        dueDate: true,
        supplier: { select: { name: true } },
      },
      take: 100,
    });

    let created = 0;
    for (const invoice of invoices) {
      const overdue = invoice.dueDate !== null && invoice.dueDate < new Date();
      const proposal = await this.proposals.create({
        organizationId,
        source: 'AGENT',
        kind: 'CREATE_TASK',
        title: `Eingangsrechnung ${invoice.supplier.name} ${invoice.invoiceNumber} bezahlen`,
        summary: `${(invoice.grossCents / 100).toFixed(2)} EUR, ${overdue ? 'überfällig' : 'bald fällig'} (${invoice.dueDate?.toISOString().slice(0, 10)}).`,
        payload: {
          title: `${invoice.supplier.name}: Rechnung ${invoice.invoiceNumber} bezahlen`,
          priority: overdue ? 'HIGH' : 'MEDIUM',
          dueAt: invoice.dueDate?.toISOString().slice(0, 10),
        },
        dedupeKey: `payable:${invoice.id}`,
      });
      if (proposal) created++;
    }
    return created;
  }

  /** Customers with billable time older than 14 days that was never invoiced. */
  private async proposeTimeBilling(organizationId: string) {
    const cutoff = new Date(Date.now() - 14 * DAY_MS);
    const rows = await this.prisma.timeEntry.groupBy({
      by: ['customerId'],
      where: {
        organizationId,
        billable: true,
        billedDocumentId: null,
        customerId: { not: null },
        workDate: { lt: cutoff },
      },
      _sum: { minutes: true },
    });
    if (rows.length === 0) return 0;

    const customers = await this.prisma.customer.findMany({
      where: {
        organizationId,
        id: { in: rows.map((row) => row.customerId as string) },
      },
      select: { id: true, name: true },
    });
    const names = new Map(
      customers.map((customer) => [customer.id, customer.name]),
    );

    const week = isoWeek(new Date());
    let created = 0;
    for (const row of rows) {
      const customerId = row.customerId as string;
      const minutes = row._sum.minutes ?? 0;
      const proposal = await this.proposals.create({
        organizationId,
        source: 'AGENT',
        kind: 'INVOICE_TIME',
        title: `Zeiten von ${names.get(customerId) ?? 'Kunde'} abrechnen`,
        summary: `${(minutes / 60).toFixed(1)} Stunden warten seit über 14 Tagen auf die Abrechnung.`,
        payload: { customerId },
        dedupeKey: `time-billing:${customerId}:${week}`,
      });
      if (proposal) created++;
    }
    return created;
  }

  private async proposeDunning(organizationId: string) {
    const now = new Date();
    const invoices = await this.prisma.salesDocument.findMany({
      where: {
        organizationId,
        type: 'INVOICE',
        status: 'SENT',
        dueDate: { lt: now },
        dunningLevel: { lt: MAX_DUNNING_LEVEL },
        OR: [
          { lastDunnedAt: null },
          {
            lastDunnedAt: {
              lt: new Date(now.getTime() - DUNNING_INTERVAL_DAYS * DAY_MS),
            },
          },
        ],
      },
      select: {
        id: true,
        number: true,
        dunningLevel: true,
        grossCents: true,
        paidCents: true,
        customer: { select: { name: true } },
      },
      take: 100,
    });

    let created = 0;
    for (const invoice of invoices) {
      const open = ((invoice.grossCents - invoice.paidCents) / 100).toFixed(2);
      const proposal = await this.proposals.create({
        organizationId,
        source: 'AGENT',
        kind: 'ESCALATE_DUNNING',
        title: `Mahnstufe ${invoice.dunningLevel + 1} für ${invoice.number}`,
        summary: `${invoice.customer.name}: ${open} EUR überfällig`,
        payload: { salesDocumentId: invoice.id },
        dedupeKey: `dunning:${invoice.id}:${invoice.dunningLevel + 1}`,
      });
      if (proposal) created++;
    }
    return created;
  }

  private async proposeQuoteFollowUps(organizationId: string) {
    const cutoff = new Date(Date.now() - QUOTE_FOLLOW_UP_AFTER_DAYS * DAY_MS);
    const quotes = await this.prisma.salesDocument.findMany({
      where: {
        organizationId,
        type: 'QUOTE',
        status: 'SENT',
        issueDate: { lt: cutoff },
      },
      select: {
        id: true,
        number: true,
        grossCents: true,
        customer: { select: { name: true } },
      },
      take: 100,
    });

    const dueAt = new Date(Date.now() + DAY_MS).toISOString().slice(0, 10);
    let created = 0;
    for (const quote of quotes) {
      const proposal = await this.proposals.create({
        organizationId,
        source: 'AGENT',
        kind: 'CREATE_TASK',
        title: `Angebot ${quote.number} nachfassen`,
        summary: `${quote.customer.name} hat seit über ${QUOTE_FOLLOW_UP_AFTER_DAYS} Tagen nicht geantwortet (${(quote.grossCents / 100).toFixed(2)} EUR brutto).`,
        payload: {
          title: `Angebot ${quote.number} bei ${quote.customer.name} nachfassen`,
          priority: 'MEDIUM',
          dueAt,
        },
        dedupeKey: `quote-followup:${quote.id}`,
      });
      if (proposal) created++;
    }
    return created;
  }

  private async proposeRestocking(organizationId: string) {
    const articles = await this.prisma.$queryRaw<
      {
        id: string;
        articleNumber: string;
        name: string;
        stockQuantity: number;
        minStock: number;
      }[]
    >`
      SELECT id, "articleNumber", name, "stockQuantity", "minStock"
      FROM articles
      WHERE "organizationId" = ${organizationId}::uuid
        AND "archivedAt" IS NULL
        AND "trackStock" = true
        AND "stockQuantity" <= "minStock"
      LIMIT 100
    `;

    const week = isoWeek(new Date());
    const dueAt = new Date(Date.now() + 2 * DAY_MS).toISOString().slice(0, 10);
    let created = 0;
    for (const article of articles) {
      const proposal = await this.proposals.create({
        organizationId,
        source: 'AGENT',
        kind: 'CREATE_TASK',
        title: `Nachbestellen: ${article.name}`,
        summary: `Bestand ${article.stockQuantity} (Mindestbestand ${article.minStock}), Artikel ${article.articleNumber}.`,
        payload: {
          title: `${article.name} nachbestellen (Bestand ${article.stockQuantity})`,
          priority: 'HIGH',
          dueAt,
        },
        dedupeKey: `restock:${article.id}:${week}`,
      });
      if (proposal) created++;
    }
    return created;
  }
}
