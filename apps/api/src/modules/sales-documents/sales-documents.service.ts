import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Prisma,
  SalesDocumentStatus,
  SalesDocumentType,
} from '../../../generated/prisma/client';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import {
  CreateCreditNoteDto,
  CreatePaymentDto,
  CreateSalesDocumentDto,
  ListSalesDocumentsQueryDto,
  SendSalesDocumentDto,
  SalesDocumentItemDto,
  UpdateSalesDocumentDto,
} from './dto/sales-document.dto';
import { missingEInvoiceData, renderXRechnung } from './e-invoice';
import { documentTitle, renderSalesDocumentPdf } from './sales-pdf';
import { calculateTotals } from './sales-totals';

const ALLOWED_TRANSITIONS: Record<
  SalesDocumentType,
  Partial<Record<SalesDocumentStatus, SalesDocumentStatus[]>>
> = {
  QUOTE: {
    DRAFT: ['SENT', 'CANCELLED'],
    SENT: ['ACCEPTED', 'DECLINED', 'CANCELLED'],
  },
  INVOICE: {
    DRAFT: ['SENT', 'CANCELLED'],
    SENT: ['PAID', 'CANCELLED'],
  },
  CREDIT_NOTE: {
    DRAFT: ['SENT', 'CANCELLED'],
  },
};

const NUMBER_PREFIX: Record<SalesDocumentType, string> = {
  QUOTE: 'AN',
  INVOICE: 'RE',
  CREDIT_NOTE: 'GS',
};

const TYPE_LABEL: Record<SalesDocumentType, string> = {
  QUOTE: 'Angebot',
  INVOICE: 'Rechnung',
  CREDIT_NOTE: 'Gutschrift',
};

const DEFAULT_PAYMENT_TERM_DAYS = 14;
const MAX_DUNNING_LEVEL = 3;

const listInclude = {
  customer: { select: { id: true, name: true, customerNumber: true } },
  project: { select: { id: true, name: true, projectNumber: true } },
} satisfies Prisma.SalesDocumentInclude;

const detailInclude = {
  ...listInclude,
  items: { orderBy: { position: 'asc' } },
  payments: { orderBy: { paidAt: 'asc' } },
  sourceQuote: { select: { id: true, number: true } },
  creditedInvoice: { select: { id: true, number: true } },
  creditNotes: {
    select: { id: true, number: true, status: true, grossCents: true },
  },
  invoices: { select: { id: true, number: true, status: true } },
} satisfies Prisma.SalesDocumentInclude;

@Injectable()
export class SalesDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
    private readonly mailService: MailService,
  ) {}

  findAll(organizationId: string, query: ListSalesDocumentsQueryDto) {
    return this.prisma.salesDocument.findMany({
      where: {
        organizationId,
        ...(query.type && { type: query.type }),
        ...(query.status && { status: query.status }),
        ...(query.customerId && { customerId: query.customerId }),
      },
      include: listInclude,
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async findOne(id: string, organizationId: string) {
    const document = await this.prisma.salesDocument.findFirst({
      where: { id, organizationId },
      include: detailInclude,
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateSalesDocumentDto,
    options: {
      /** Create inside the caller's transaction (activity is logged by the caller afterwards). */
      tx?: Prisma.TransactionClient;
      /** Idempotency key of documents created by a recurring template. */
      recurrence?: { recurringInvoiceId: string; recurrenceDate: Date };
    } = {},
  ) {
    await this.assertReferences(organizationId, dto.customerId, dto.projectId);
    const items = await this.buildItems(organizationId, dto.items);
    const termDays = await this.paymentTermDays(organizationId);

    const created = await (options.tx ?? this.prisma).salesDocument.create({
      data: {
        organizationId,
        type: dto.type,
        number: this.draftNumber(),
        customerId: dto.customerId,
        projectId: dto.projectId,
        issueDate: new Date(dto.issueDate),
        dueDate: this.resolveDueDate(
          dto.type,
          dto.issueDate,
          termDays,
          dto.dueDate,
        ),
        headerText: dto.headerText,
        footerText: dto.footerText,
        createdById: actorUserId,
        ...(options.recurrence && {
          recurringInvoiceId: options.recurrence.recurringInvoiceId,
          recurrenceDate: options.recurrence.recurrenceDate,
        }),
        ...items.totals,
        items: { create: items.rows },
      },
      include: detailInclude,
    });

    if (!options.tx) {
      await this.logActivity(created, actorUserId, 'CREATED');
    }
    return created;
  }

  /** Activity entry for a document created with `create(..., { tx })`, after commit. */
  async logCreated(
    document: { type: SalesDocumentType; number: string; customerId: string },
    actorUserId: string,
  ) {
    await this.logActivity(document, actorUserId, 'CREATED');
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateSalesDocumentDto,
  ) {
    const existing = await this.findOne(id, organizationId);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only drafts can be edited; issued documents are immutable',
      );
    }

    const customerId = dto.customerId ?? existing.customerId;
    const projectId =
      dto.projectId === undefined ? existing.projectId : dto.projectId;
    await this.assertReferences(
      organizationId,
      customerId,
      projectId ?? undefined,
    );

    const items = dto.items
      ? await this.buildItems(organizationId, dto.items)
      : null;

    return this.prisma.$transaction(async (tx) => {
      // The DRAFT check above is not enough on its own: the document may be
      // issued in the meantime. This conditional write takes the row lock and
      // only matches a document that is still a draft (the same claim that
      // changeStatus uses), so an issued document is never edited.
      const stillDraft = await tx.salesDocument.updateMany({
        where: { id, organizationId, status: 'DRAFT' },
        data: { status: 'DRAFT' },
      });
      if (stillDraft.count === 0) {
        throw new ConflictException(
          'Der Beleg wurde zwischenzeitlich geändert. Bitte neu laden und erneut prüfen.',
        );
      }
      if (items) {
        await tx.salesDocumentItem.deleteMany({
          where: { salesDocumentId: id },
        });
      }
      return tx.salesDocument.update({
        where: { id },
        data: {
          customerId,
          projectId,
          ...(dto.issueDate && { issueDate: new Date(dto.issueDate) }),
          ...(dto.dueDate !== undefined && {
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          }),
          ...(dto.headerText !== undefined && { headerText: dto.headerText }),
          ...(dto.footerText !== undefined && { footerText: dto.footerText }),
          ...(items && {
            ...items.totals,
            items: { create: items.rows },
          }),
        },
        include: detailInclude,
      });
    });
  }

  async changeStatus(
    id: string,
    organizationId: string,
    actorUserId: string,
    status: SalesDocumentStatus,
  ) {
    const document = await this.findOne(id, organizationId);
    const allowed = ALLOWED_TRANSITIONS[document.type][document.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Status change ${document.status} -> ${status} is not allowed`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Claim the transition first: the status only changes if it is still the
      // one checked above. The UPDATE locks the row, so a concurrent request
      // for the same document waits here and then matches no row (READ
      // COMMITTED re-checks the WHERE clause after the lock is released).
      // Everything below (number, stock, credit, payment) therefore runs at
      // most once per transition and rolls back together with the claim.
      const claimed = await tx.salesDocument.updateMany({
        where: { id, organizationId, status: document.status },
        data: { status },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          'Der Beleg wurde zwischenzeitlich geändert. Bitte neu laden und erneut prüfen.',
        );
      }

      // Read the document again under the row lock: items and amounts may
      // have changed (e.g. a draft edit that committed) since the read above.
      const current = await tx.salesDocument.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });

      const data: Prisma.SalesDocumentUncheckedUpdateInput = {};

      // Numbers are assigned on issue so cancelled drafts never leave gaps.
      if (document.status === 'DRAFT' && status === 'SENT') {
        data.number = await this.nextNumber(
          tx,
          organizationId,
          document.type,
          current.issueDate,
        );
        if (document.type === 'INVOICE') {
          await this.adjustStock(tx, current.items, -1);
        }
        if (document.type === 'CREDIT_NOTE' && current.creditedInvoiceId) {
          await this.applyCreditNote(
            tx,
            current.creditedInvoiceId,
            current.grossCents,
          );
        }
      }
      if (status === 'PAID') {
        data.paidAt = new Date();
        const outstanding =
          current.grossCents - current.paidCents - current.creditedCents;
        if (outstanding > 0) {
          await tx.payment.create({
            data: {
              salesDocumentId: id,
              amountCents: outstanding,
              paidAt: new Date(),
              createdById: actorUserId,
            },
          });
          data.paidCents = current.paidCents + outstanding;
        }
      }
      if (
        document.type === 'INVOICE' &&
        document.status === 'SENT' &&
        status === 'CANCELLED'
      ) {
        await this.adjustStock(tx, current.items, 1);
      }

      return tx.salesDocument.update({
        where: { id },
        data,
        include: detailInclude,
      });
    });

    await this.logActivity(updated, actorUserId, 'STATUS', status);
    return updated;
  }

  async convertQuoteToInvoice(
    id: string,
    organizationId: string,
    actorUserId: string,
  ) {
    const quote = await this.findOne(id, organizationId);
    if (quote.type !== 'QUOTE') {
      throw new BadRequestException('Only quotes can be converted');
    }
    if (quote.status !== 'ACCEPTED') {
      throw new BadRequestException('Only accepted quotes can be converted');
    }
    if (quote.invoices.some((invoice) => invoice.status !== 'CANCELLED')) {
      throw new BadRequestException('Quote was already converted');
    }

    const today = new Date().toISOString().slice(0, 10);
    const invoice = await this.prisma.salesDocument.create({
      data: {
        organizationId,
        type: 'INVOICE',
        number: this.draftNumber(),
        customerId: quote.customerId,
        projectId: quote.projectId,
        sourceQuoteId: quote.id,
        issueDate: new Date(today),
        dueDate: this.resolveDueDate(
          'INVOICE',
          today,
          await this.paymentTermDays(organizationId),
        ),
        headerText: quote.headerText,
        footerText: quote.footerText,
        createdById: actorUserId,
        netCents: quote.netCents,
        vatCents: quote.vatCents,
        grossCents: quote.grossCents,
        items: {
          create: quote.items.map((item) => ({
            position: item.position,
            articleId: item.articleId,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPriceCents: item.unitPriceCents,
            vatRateBp: item.vatRateBp,
            netCents: item.netCents,
          })),
        },
      },
      include: detailInclude,
    });

    await this.logActivity(invoice, actorUserId, 'CREATED');
    return invoice;
  }

  async addPayment(
    id: string,
    organizationId: string,
    actorUserId: string,
    dto: CreatePaymentDto,
  ) {
    const document = await this.findOne(id, organizationId);
    if (document.type !== 'INVOICE' || document.status !== 'SENT') {
      throw new BadRequestException(
        'Payments can only be booked on issued, unpaid invoices',
      );
    }
    const outstanding =
      document.grossCents - document.paidCents - document.creditedCents;
    if (dto.amountCents > outstanding) {
      throw new BadRequestException('Payment exceeds the outstanding amount');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          salesDocumentId: id,
          amountCents: dto.amountCents,
          paidAt: new Date(dto.paidAt),
          method: dto.method,
          note: dto.note,
          createdById: actorUserId,
        },
      });
      const paidCents = document.paidCents + dto.amountCents;
      const isSettled =
        paidCents + document.creditedCents >= document.grossCents;
      return tx.salesDocument.update({
        where: { id },
        data: {
          paidCents,
          ...(isSettled && { status: 'PAID', paidAt: new Date(dto.paidAt) }),
        },
        include: detailInclude,
      });
    });

    await this.activitiesService.log({
      customerId: updated.customerId,
      actorUserId,
      type: 'PAYMENT_RECORDED',
      message: `Zahlung ${(dto.amountCents / 100).toFixed(2)} EUR zu Rechnung ${updated.number} gebucht`,
    });
    return updated;
  }

  async escalateDunning(
    id: string,
    organizationId: string,
    actorUserId: string,
  ) {
    const document = await this.findOne(id, organizationId);
    const isOverdue =
      document.dueDate !== null && document.dueDate.getTime() < Date.now();
    if (
      document.type !== 'INVOICE' ||
      document.status !== 'SENT' ||
      !isOverdue
    ) {
      throw new BadRequestException('Only overdue open invoices can be dunned');
    }
    if (document.dunningLevel >= MAX_DUNNING_LEVEL) {
      throw new BadRequestException('Highest dunning level already reached');
    }

    const updated = await this.prisma.salesDocument.update({
      where: { id },
      data: { dunningLevel: { increment: 1 }, lastDunnedAt: new Date() },
      include: detailInclude,
    });
    await this.activitiesService.log({
      customerId: updated.customerId,
      actorUserId,
      type: 'DUNNING_SENT',
      message: `Rechnung ${updated.number}: Mahnstufe ${updated.dunningLevel}`,
    });
    return updated;
  }

  async renderPdf(id: string, organizationId: string) {
    const document = await this.findOne(id, organizationId);
    const company = await this.companyForDocuments(organizationId);
    const buffer = await renderSalesDocumentPdf(document, company);
    const fileName = `${documentTitle(document).replace(/[^\w.-]+/g, '_')}.pdf`;
    return { buffer, fileName };
  }

  /** XRechnung (CII XML) for an issued invoice or credit note. */
  async renderXRechnungXml(id: string, organizationId: string) {
    const document = await this.findOne(id, organizationId);
    if (document.type === 'QUOTE') {
      throw new BadRequestException('Quotes have no e-invoice');
    }
    if (document.status === 'DRAFT') {
      throw new BadRequestException(
        'Issue the document first: drafts have no final number',
      );
    }

    const [profile, customer] = await Promise.all([
      this.prisma.companyProfile.findUnique({ where: { organizationId } }),
      this.prisma.customer.findUniqueOrThrow({
        where: { id: document.customerId },
        select: {
          name: true,
          customerNumber: true,
          addresses: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            take: 1,
            select: {
              address: {
                select: {
                  street: true,
                  postalCode: true,
                  city: true,
                  country: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const input = {
      type: document.type,
      number: document.number,
      issueDate: document.issueDate,
      dueDate: document.dueDate,
      customerNumber: customer.customerNumber,
      creditedInvoiceNumber: document.creditedInvoice?.number ?? null,
      items: document.items,
      seller: {
        name: profile?.legalName ?? 'Unbekannt',
        street: profile?.street,
        postalCode: profile?.postalCode,
        city: profile?.city,
        country: profile?.country,
        vatId: profile?.vatId,
        taxNumber: profile?.taxNumber,
        email: profile?.email,
        phone: profile?.phone,
        iban: profile?.iban,
        bic: profile?.bic,
      },
      buyer: {
        name: customer.name,
        ...(customer.addresses[0]?.address ?? {}),
      },
    };

    const missing = missingEInvoiceData(input);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Für die E-Rechnung fehlt: ${missing.join(', ')}`,
      );
    }
    return {
      xml: renderXRechnung(input),
      fileName: `${document.number.replace(/[^\w.-]+/g, '_')}_xrechnung.xml`,
    };
  }

  /** Issues a draft if necessary, then mails the PDF to the given address. */
  async sendByEmail(
    id: string,
    organizationId: string,
    actorUserId: string,
    dto: SendSalesDocumentDto,
  ) {
    if (!this.mailService.isConfigured()) {
      throw new BadRequestException('E-Mail-Versand ist nicht konfiguriert');
    }
    let document = await this.findOne(id, organizationId);
    if (document.status === 'CANCELLED') {
      throw new BadRequestException('Cancelled documents cannot be sent');
    }
    if (document.status === 'DRAFT') {
      document = await this.changeStatus(
        id,
        organizationId,
        actorUserId,
        'SENT',
      );
    }

    const company = await this.companyForDocuments(organizationId);
    const buffer = await renderSalesDocumentPdf(document, company);
    const title = documentTitle(document);
    const text =
      dto.message?.trim() ||
      `Guten Tag,\n\nanbei erhalten Sie ${title}.\n\nMit freundlichen Grüßen\n${company.legalName}`;

    await this.mailService.send({
      to: dto.to,
      subject: dto.subject?.trim() || `${title} – ${company.legalName}`,
      text,
      replyTo: company.email ?? undefined,
      attachments: [
        {
          filename: `${title.replace(/[^\w.-]+/g, '_')}.pdf`,
          content: buffer,
          contentType: 'application/pdf',
        },
      ],
    });

    await this.activitiesService.log({
      customerId: document.customerId,
      actorUserId,
      type:
        document.type === 'QUOTE'
          ? 'QUOTE_STATUS_CHANGED'
          : 'INVOICE_STATUS_CHANGED',
      message: `${title} per E-Mail an ${dto.to} gesendet`,
    });
    return document;
  }

  private async companyForDocuments(organizationId: string) {
    const profile = await this.prisma.companyProfile.findUnique({
      where: { organizationId },
    });
    if (profile) return profile;
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    });
    return { legalName: organization.name, email: null as string | null };
  }

  /** Creates a credit-note draft for (part of) an issued invoice. */
  async createCreditNote(
    invoiceId: string,
    organizationId: string,
    actorUserId: string,
    dto: CreateCreditNoteDto,
  ) {
    const invoice = await this.findOne(invoiceId, organizationId);
    if (
      invoice.type !== 'INVOICE' ||
      (invoice.status !== 'SENT' && invoice.status !== 'PAID')
    ) {
      throw new BadRequestException(
        'Credit notes can only be created for issued invoices',
      );
    }

    const byId = new Map(invoice.items.map((item) => [item.id, item]));
    const lines = dto.items
      ? dto.items.map((line) => {
          const item = byId.get(line.itemId);
          if (!item) throw new BadRequestException('Invoice item not found');
          if (line.quantity > Number(item.quantity)) {
            throw new BadRequestException(
              `Position ${item.position}: cannot credit more than invoiced`,
            );
          }
          return { item, quantity: line.quantity };
        })
      : invoice.items.map((item) => ({
          item,
          quantity: Number(item.quantity),
        }));

    const totals = calculateTotals(
      lines.map(({ item, quantity }) => ({
        quantity,
        unitPriceCents: item.unitPriceCents,
        vatRateBp: item.vatRateBp,
      })),
    );
    const alreadyCredited = invoice.creditNotes
      .filter((note) => note.status !== 'CANCELLED')
      .reduce((sum, note) => sum + note.grossCents, 0);
    if (alreadyCredited + totals.grossCents > invoice.grossCents) {
      throw new BadRequestException(
        'Credit notes would exceed the invoice amount',
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const creditNote = await this.prisma.salesDocument.create({
      data: {
        organizationId,
        type: 'CREDIT_NOTE',
        number: this.draftNumber(),
        customerId: invoice.customerId,
        projectId: invoice.projectId,
        creditedInvoiceId: invoice.id,
        issueDate: new Date(today),
        headerText: dto.reason
          ? `Gutschrift zu Rechnung ${invoice.number}: ${dto.reason}`
          : `Gutschrift zu Rechnung ${invoice.number}`,
        createdById: actorUserId,
        ...{
          netCents: totals.netCents,
          vatCents: totals.vatCents,
          grossCents: totals.grossCents,
        },
        items: {
          create: lines.map(({ item, quantity }, index) => ({
            position: index + 1,
            articleId: item.articleId,
            description: item.description,
            quantity,
            unit: item.unit,
            unitPriceCents: item.unitPriceCents,
            vatRateBp: item.vatRateBp,
            netCents: totals.lineNetCents[index],
          })),
        },
      },
      include: detailInclude,
    });

    await this.logActivity(creditNote, actorUserId, 'CREATED');
    return creditNote;
  }

  /** Reduces what the customer still owes; settles the invoice when nothing is left. */
  private async applyCreditNote(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    creditGrossCents: number,
  ) {
    const invoice = await tx.salesDocument.findUniqueOrThrow({
      where: { id: invoiceId },
      select: {
        grossCents: true,
        paidCents: true,
        creditedCents: true,
        status: true,
      },
    });
    const creditedCents = invoice.creditedCents + creditGrossCents;
    const settled = invoice.paidCents + creditedCents >= invoice.grossCents;
    await tx.salesDocument.update({
      where: { id: invoiceId },
      data: {
        creditedCents,
        ...(settled &&
          invoice.status === 'SENT' && {
            // Fully credited and never paid counts as cancelled, otherwise as paid.
            status: invoice.paidCents === 0 ? 'CANCELLED' : 'PAID',
            paidAt: new Date(),
          }),
      },
    });
  }

  async remove(id: string, organizationId: string) {
    const document = await this.findOne(id, organizationId);
    if (document.status !== 'DRAFT') {
      throw new BadRequestException('Only drafts can be deleted');
    }
    await this.prisma.salesDocument.delete({ where: { id } });
    return { deleted: true };
  }

  /** Open receivables and quote pipeline for dashboards. */
  async summary(organizationId: string) {
    const now = new Date();
    const [openInvoices, overdueInvoices, openQuotes, paidThisYear] =
      await Promise.all([
        this.prisma.salesDocument.aggregate({
          where: { organizationId, type: 'INVOICE', status: 'SENT' },
          _sum: { grossCents: true, paidCents: true, creditedCents: true },
          _count: true,
        }),
        this.prisma.salesDocument.aggregate({
          where: {
            organizationId,
            type: 'INVOICE',
            status: 'SENT',
            dueDate: { lt: now },
          },
          _sum: { grossCents: true, paidCents: true, creditedCents: true },
          _count: true,
        }),
        this.prisma.salesDocument.aggregate({
          where: { organizationId, type: 'QUOTE', status: 'SENT' },
          _sum: { grossCents: true },
          _count: true,
        }),
        this.prisma.salesDocument.aggregate({
          where: {
            organizationId,
            type: 'INVOICE',
            status: 'PAID',
            paidAt: { gte: new Date(now.getFullYear(), 0, 1) },
          },
          _sum: { grossCents: true },
        }),
      ]);

    const [revenueByMonth, lowStock] = await Promise.all([
      this.prisma.$queryRaw<{ month: Date; netCents: bigint }[]>`
        SELECT date_trunc('month', "issueDate") AS month,
               SUM("netCents") AS "netCents"
        FROM sales_documents
        WHERE "organizationId" = ${organizationId}::uuid
          AND type = 'INVOICE'
          AND status IN ('SENT', 'PAID')
          AND "issueDate" >= (date_trunc('month', now()) - interval '11 months')
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM articles
        WHERE "organizationId" = ${organizationId}::uuid
          AND "archivedAt" IS NULL
          AND "trackStock" = true
          AND "stockQuantity" <= "minStock"
      `,
    ]);

    return {
      revenueByMonth: revenueByMonth.map((row) => ({
        month: row.month.toISOString().slice(0, 7),
        netCents: Number(row.netCents),
      })),
      lowStockArticles: Number(lowStock[0]?.count ?? 0),
      openInvoices: {
        count: openInvoices._count,
        grossCents:
          (openInvoices._sum.grossCents ?? 0) -
          (openInvoices._sum.paidCents ?? 0) -
          (openInvoices._sum.creditedCents ?? 0),
      },
      overdueInvoices: {
        count: overdueInvoices._count,
        grossCents:
          (overdueInvoices._sum.grossCents ?? 0) -
          (overdueInvoices._sum.paidCents ?? 0) -
          (overdueInvoices._sum.creditedCents ?? 0),
      },
      openQuotes: {
        count: openQuotes._count,
        grossCents: openQuotes._sum.grossCents ?? 0,
      },
      paidThisYearGrossCents: paidThisYear._sum.grossCents ?? 0,
    };
  }

  private draftNumber() {
    return `ENTWURF-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private resolveDueDate(
    type: SalesDocumentType,
    issueDate: string,
    termDays: number,
    dueDate?: string,
  ) {
    if (dueDate) return new Date(dueDate);
    if (type !== 'INVOICE') return null;
    const due = new Date(issueDate);
    due.setUTCDate(due.getUTCDate() + termDays);
    return due;
  }

  private async paymentTermDays(organizationId: string) {
    const profile = await this.prisma.companyProfile.findUnique({
      where: { organizationId },
      select: { defaultPaymentTermDays: true },
    });
    return profile?.defaultPaymentTermDays ?? DEFAULT_PAYMENT_TERM_DAYS;
  }

  private async nextNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
    type: SalesDocumentType,
    issueDate: Date,
  ) {
    const year = issueDate.getUTCFullYear();
    const key = `${type}-${year}`;
    // The upsert takes a row lock, so concurrent issues get distinct values.
    const sequence = await tx.numberSequence.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: { organizationId, key, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    return `${NUMBER_PREFIX[type]}-${year}-${String(sequence.lastValue).padStart(4, '0')}`;
  }

  private async adjustStock(
    tx: Prisma.TransactionClient,
    items: { articleId: string | null; quantity: Prisma.Decimal }[],
    direction: 1 | -1,
  ) {
    for (const item of items) {
      if (!item.articleId) continue;
      const article = await tx.article.findUnique({
        where: { id: item.articleId },
        select: { trackStock: true },
      });
      if (!article?.trackStock) continue;
      await tx.article.update({
        where: { id: item.articleId },
        data: {
          stockQuantity: {
            increment: direction * Math.round(Number(item.quantity)),
          },
        },
      });
    }
  }

  private async assertReferences(
    organizationId: string,
    customerId: string,
    projectId?: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true },
    });
    if (!customer) throw new BadRequestException('Customer not found');

    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, organizationId, customerId },
        select: { id: true },
      });
      if (!project) {
        throw new BadRequestException(
          'Project not found or belongs to another customer',
        );
      }
    }
  }

  private async buildItems(
    organizationId: string,
    items: SalesDocumentItemDto[],
  ) {
    const articleIds = [
      ...new Set(items.map((item) => item.articleId).filter(Boolean)),
    ] as string[];
    if (articleIds.length > 0) {
      const count = await this.prisma.article.count({
        where: { id: { in: articleIds }, organizationId },
      });
      if (count !== articleIds.length) {
        throw new BadRequestException('Article not found');
      }
    }

    const totals = calculateTotals(items);
    const rows = items.map((item, index) => ({
      position: index + 1,
      articleId: item.articleId,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      vatRateBp: item.vatRateBp,
      netCents: totals.lineNetCents[index],
    }));

    return {
      rows,
      totals: {
        netCents: totals.netCents,
        vatCents: totals.vatCents,
        grossCents: totals.grossCents,
      },
    };
  }

  private async logActivity(
    document: { type: SalesDocumentType; number: string; customerId: string },
    actorUserId: string,
    kind: 'CREATED' | 'STATUS',
    status?: SalesDocumentStatus,
  ) {
    const label = TYPE_LABEL[document.type];
    const isQuote = document.type === 'QUOTE';
    const isCredit = document.type === 'CREDIT_NOTE';
    await this.activitiesService.log({
      customerId: document.customerId,
      actorUserId,
      type:
        kind === 'CREATED'
          ? isQuote
            ? 'QUOTE_CREATED'
            : isCredit
              ? 'CREDIT_NOTE_CREATED'
              : 'INVOICE_CREATED'
          : isQuote
            ? 'QUOTE_STATUS_CHANGED'
            : 'INVOICE_STATUS_CHANGED',
      message:
        kind === 'CREATED'
          ? `${label} ${document.number} wurde angelegt`
          : `${label} ${document.number}: Status ${status}`,
    });
  }
}
