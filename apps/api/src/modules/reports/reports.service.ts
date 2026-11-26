import { Injectable } from '@nestjs/common';
import { IsDateString, IsOptional } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { euro, isoDay, toCsv } from './csv';

export class ReportRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

const TYPE_LABEL = {
  QUOTE: 'Angebot',
  INVOICE: 'Rechnung',
  CREDIT_NOTE: 'Gutschrift',
} as const;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private range(query: ReportRangeDto) {
    return {
      ...(query.from && { gte: new Date(query.from) }),
      ...(query.to && { lte: new Date(query.to) }),
    };
  }

  /** Outgoing invoices and credit notes (issued only), for the tax advisor. */
  async salesLedgerCsv(organizationId: string, query: ReportRangeDto) {
    const documents = await this.prisma.salesDocument.findMany({
      where: {
        organizationId,
        type: { in: ['INVOICE', 'CREDIT_NOTE'] },
        status: { in: ['SENT', 'PAID', 'CANCELLED'] },
        number: { not: { startsWith: 'ENTWURF-' } },
        issueDate: this.range(query),
      },
      include: { customer: { select: { name: true, customerNumber: true } } },
      orderBy: [{ issueDate: 'asc' }, { number: 'asc' }],
    });
    return toCsv(
      [
        'Belegdatum',
        'Belegnummer',
        'Art',
        'Kundennr.',
        'Kunde',
        'Netto',
        'USt',
        'Brutto',
        'Status',
        'Bezahlt am',
        'Zahlungsziel',
      ],
      documents.map((document) => {
        // Credit notes reduce revenue, so they are exported with a minus sign.
        const sign = document.type === 'CREDIT_NOTE' ? -1 : 1;
        return [
          isoDay(document.issueDate),
          document.number,
          TYPE_LABEL[document.type],
          document.customer.customerNumber,
          document.customer.name,
          euro(sign * document.netCents),
          euro(sign * document.vatCents),
          euro(sign * document.grossCents),
          document.status,
          isoDay(document.paidAt),
          isoDay(document.dueDate),
        ];
      }),
    );
  }

  async purchaseLedgerCsv(organizationId: string, query: ReportRangeDto) {
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: { organizationId, issueDate: this.range(query) },
      include: { supplier: { select: { name: true, supplierNumber: true } } },
      orderBy: [{ issueDate: 'asc' }, { invoiceNumber: 'asc' }],
    });
    return toCsv(
      [
        'Rechnungsdatum',
        'Rechnungsnummer',
        'Lieferantennr.',
        'Lieferant',
        'Netto',
        'USt',
        'Brutto',
        'Status',
        'Bezahlt am',
        'Fällig am',
      ],
      invoices.map((invoice) => [
        isoDay(invoice.issueDate),
        invoice.invoiceNumber,
        invoice.supplier.supplierNumber,
        invoice.supplier.name,
        euro(invoice.netCents),
        euro(invoice.vatCents),
        euro(invoice.grossCents),
        invoice.status,
        isoDay(invoice.paidAt),
        isoDay(invoice.dueDate),
      ]),
    );
  }

  /** Revenue, costs and margin per project. Net amounts, cents. */
  async projectProfitability(organizationId: string, query: ReportRangeDto) {
    const dateFilter = this.range(query);
    const hasRange = Object.keys(dateFilter).length > 0;

    const [sales, purchases, time, projects] = await Promise.all([
      this.prisma.salesDocument.groupBy({
        by: ['projectId', 'type'],
        where: {
          organizationId,
          projectId: { not: null },
          type: { in: ['INVOICE', 'CREDIT_NOTE'] },
          status: { in: ['SENT', 'PAID'] },
          ...(hasRange && { issueDate: dateFilter }),
        },
        _sum: { netCents: true },
      }),
      this.prisma.purchaseOrder.groupBy({
        by: ['projectId'],
        where: {
          organizationId,
          projectId: { not: null },
          status: { in: ['ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED'] },
          ...(hasRange && { orderDate: dateFilter }),
        },
        _sum: { netCents: true },
      }),
      this.prisma.timeEntry.groupBy({
        by: ['projectId'],
        where: {
          organizationId,
          projectId: { not: null },
          ...(hasRange && { workDate: dateFilter }),
        },
        _sum: { minutes: true },
      }),
      this.prisma.project.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          projectNumber: true,
          customer: { select: { name: true } },
        },
      }),
    ]);

    const byProject = new Map<
      string,
      {
        invoicedNetCents: number;
        creditedNetCents: number;
        purchaseNetCents: number;
        minutes: number;
      }
    >();
    const entry = (id: string) =>
      byProject.get(id) ??
      byProject
        .set(id, {
          invoicedNetCents: 0,
          creditedNetCents: 0,
          purchaseNetCents: 0,
          minutes: 0,
        })
        .get(id)!;

    for (const row of purchases) {
      if (row.projectId) {
        entry(row.projectId).purchaseNetCents += row._sum.netCents ?? 0;
      }
    }

    for (const row of sales) {
      if (!row.projectId) continue;
      const target = entry(row.projectId);
      if (row.type === 'INVOICE')
        target.invoicedNetCents += row._sum.netCents ?? 0;
      else target.creditedNetCents += row._sum.netCents ?? 0;
    }
    for (const row of time) {
      if (row.projectId) entry(row.projectId).minutes += row._sum.minutes ?? 0;
    }

    return projects
      .filter((project) => byProject.has(project.id))
      .map((project) => {
        const data = byProject.get(project.id)!;
        return {
          projectId: project.id,
          name: project.name,
          projectNumber: project.projectNumber,
          customerName: project.customer.name,
          revenueNetCents: data.invoicedNetCents - data.creditedNetCents,
          purchaseNetCents: data.purchaseNetCents,
          marginNetCents:
            data.invoicedNetCents -
            data.creditedNetCents -
            data.purchaseNetCents,
          invoicedNetCents: data.invoicedNetCents,
          creditedNetCents: data.creditedNetCents,
          hours: Math.round((data.minutes / 60) * 100) / 100,
        };
      })
      .sort((a, b) => b.revenueNetCents - a.revenueNetCents);
  }

  async topCustomers(organizationId: string, query: ReportRangeDto) {
    const dateFilter = this.range(query);
    const rows = await this.prisma.salesDocument.groupBy({
      by: ['customerId', 'type'],
      where: {
        organizationId,
        type: { in: ['INVOICE', 'CREDIT_NOTE'] },
        status: { in: ['SENT', 'PAID'] },
        ...(Object.keys(dateFilter).length > 0 && { issueDate: dateFilter }),
      },
      _sum: { netCents: true },
    });
    const totals = new Map<string, number>();
    for (const row of rows) {
      const sign = row.type === 'CREDIT_NOTE' ? -1 : 1;
      totals.set(
        row.customerId,
        (totals.get(row.customerId) ?? 0) + sign * (row._sum.netCents ?? 0),
      );
    }
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const customers = await this.prisma.customer.findMany({
      where: { organizationId, id: { in: top.map(([id]) => id) } },
      select: { id: true, name: true },
    });
    const names = new Map(
      customers.map((customer) => [customer.id, customer.name]),
    );
    return top.map(([customerId, revenueNetCents]) => ({
      customerId,
      name: names.get(customerId) ?? '–',
      revenueNetCents,
    }));
  }
}
