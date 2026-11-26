import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BankTransactionStatus,
  Prisma,
  SupplierInvoiceStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SalesDocumentsService } from '../sales-documents/sales-documents.service';
import { parseBankCsv } from './bank-csv';
import { suggestMatch } from './matching';

export class CreateSupplierInvoiceDto {
  @IsUUID()
  supplierId!: string;

  @IsString()
  @MaxLength(100)
  invoiceNumber!: string;

  @IsDateString()
  issueDate!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  netCents!: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  vatCents!: number;

  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class SupplierInvoiceStatusDto {
  @IsEnum(SupplierInvoiceStatus)
  status!: SupplierInvoiceStatus;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class ImportBankCsvDto {
  @IsString()
  @MaxLength(2_000_000)
  csv!: string;
}

export class MatchTransactionDto {
  @IsOptional()
  @IsUUID()
  salesDocumentId?: string;

  @IsOptional()
  @IsUUID()
  supplierInvoiceId?: string;
}

export class ListTransactionsQueryDto {
  @IsOptional()
  @IsEnum(BankTransactionStatus)
  status?: BankTransactionStatus;
}

const supplierInvoiceInclude = {
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.SupplierInvoiceInclude;

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly salesDocuments: SalesDocumentsService,
  ) {}

  // ---- Supplier invoices (accounts payable) ----

  listSupplierInvoices(organizationId: string, status?: SupplierInvoiceStatus) {
    return this.prisma.supplierInvoice.findMany({
      where: { organizationId, ...(status && { status }) },
      include: supplierInvoiceInclude,
      orderBy: [{ dueDate: 'asc' }, { issueDate: 'desc' }],
      take: 500,
    });
  }

  async createSupplierInvoice(
    organizationId: string,
    dto: CreateSupplierInvoiceDto,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, organizationId },
      select: { id: true },
    });
    if (!supplier) throw new BadRequestException('Supplier not found');
    if (dto.purchaseOrderId) {
      const order = await this.prisma.purchaseOrder.findFirst({
        where: { id: dto.purchaseOrderId, organizationId },
        select: { id: true },
      });
      if (!order) throw new BadRequestException('Purchase order not found');
    }

    try {
      return await this.prisma.supplierInvoice.create({
        data: {
          organizationId,
          supplierId: dto.supplierId,
          purchaseOrderId: dto.purchaseOrderId,
          invoiceNumber: dto.invoiceNumber.trim(),
          issueDate: new Date(dto.issueDate),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          netCents: dto.netCents,
          vatCents: dto.vatCents,
          grossCents: dto.netCents + dto.vatCents,
          notes: dto.notes,
        },
        include: supplierInvoiceInclude,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Diese Rechnungsnummer ist für den Lieferanten schon erfasst',
        );
      }
      throw error;
    }
  }

  async setSupplierInvoiceStatus(
    id: string,
    organizationId: string,
    dto: SupplierInvoiceStatusDto,
  ) {
    const invoice = await this.prisma.supplierInvoice.findFirst({
      where: { id, organizationId },
    });
    if (!invoice) throw new NotFoundException('Supplier invoice not found');
    return this.prisma.supplierInvoice.update({
      where: { id },
      data: {
        status: dto.status,
        paidAt:
          dto.status === 'PAID'
            ? new Date(dto.paidAt ?? new Date().toISOString().slice(0, 10))
            : null,
      },
      include: supplierInvoiceInclude,
    });
  }

  async payablesSummary(organizationId: string) {
    const now = new Date();
    const [open, overdue] = await Promise.all([
      this.prisma.supplierInvoice.aggregate({
        where: { organizationId, status: 'OPEN' },
        _sum: { grossCents: true },
        _count: true,
      }),
      this.prisma.supplierInvoice.aggregate({
        where: { organizationId, status: 'OPEN', dueDate: { lt: now } },
        _sum: { grossCents: true },
        _count: true,
      }),
    ]);
    return {
      open: { count: open._count, grossCents: open._sum.grossCents ?? 0 },
      overdue: {
        count: overdue._count,
        grossCents: overdue._sum.grossCents ?? 0,
      },
    };
  }

  // ---- Bank statements ----

  async importCsv(organizationId: string, csv: string) {
    const { transactions, skipped } = parseBankCsv(csv);
    if (transactions.length === 0) {
      throw new BadRequestException(
        'Keine Buchungen erkannt. Erwartet werden Spalten wie Buchungstag, Betrag, Verwendungszweck.',
      );
    }

    const rows = transactions.map((tx) => ({
      organizationId,
      bookingDate: tx.bookingDate,
      amountCents: tx.amountCents,
      counterparty: tx.counterparty,
      purpose: tx.purpose,
      importHash: createHash('sha256')
        .update(
          [
            tx.bookingDate.toISOString().slice(0, 10),
            tx.amountCents,
            tx.counterparty ?? '',
            tx.purpose ?? '',
          ].join('|'),
        )
        .digest('hex'),
    }));
    // Identical rows inside one file (e.g. two equal payments on a day) must
    // survive, so duplicates are numbered before the unique hash check.
    const seen = new Map<string, number>();
    for (const row of rows) {
      const occurrence = (seen.get(row.importHash) ?? 0) + 1;
      seen.set(row.importHash, occurrence);
      if (occurrence > 1) {
        row.importHash = `${row.importHash}#${occurrence}`;
      }
    }

    const result = await this.prisma.bankTransaction.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return {
      imported: result.count,
      duplicates: rows.length - result.count,
      skipped,
    };
  }

  async listTransactions(
    organizationId: string,
    status: BankTransactionStatus | undefined,
  ) {
    const transactions = await this.prisma.bankTransaction.findMany({
      where: { organizationId, ...(status && { status }) },
      include: {
        salesDocument: { select: { id: true, number: true } },
        supplierInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            supplier: { select: { name: true } },
          },
        },
      },
      orderBy: { bookingDate: 'desc' },
      take: 500,
    });

    const unmatched = transactions.filter((tx) => tx.status === 'UNMATCHED');
    if (unmatched.length === 0) {
      return transactions.map((tx) => ({ ...tx, suggestion: null }));
    }
    const { invoices, supplierInvoices } =
      await this.openDocuments(organizationId);
    return transactions.map((tx) => ({
      ...tx,
      suggestion:
        tx.status === 'UNMATCHED'
          ? suggestMatch(tx, invoices, supplierInvoices)
          : null,
    }));
  }

  async matchTransaction(
    id: string,
    organizationId: string,
    actorUserId: string,
    dto: MatchTransactionDto,
  ) {
    const tx = await this.prisma.bankTransaction.findFirst({
      where: { id, organizationId },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.status !== 'UNMATCHED') {
      throw new BadRequestException(`Transaction is already ${tx.status}`);
    }
    if (Boolean(dto.salesDocumentId) === Boolean(dto.supplierInvoiceId)) {
      throw new BadRequestException(
        'Exactly one of salesDocumentId or supplierInvoiceId is required',
      );
    }

    if (dto.salesDocumentId) {
      if (tx.amountCents <= 0) {
        throw new BadRequestException(
          'Only incoming payments can pay an invoice',
        );
      }
      // Claim the transaction before booking so a double click books once.
      const claimed = await this.prisma.bankTransaction.updateMany({
        where: { id, status: 'UNMATCHED' },
        data: { status: 'MATCHED', salesDocumentId: dto.salesDocumentId },
      });
      if (claimed.count === 0) throw new ConflictException('Already matched');
      try {
        await this.salesDocuments.addPayment(
          dto.salesDocumentId,
          organizationId,
          actorUserId,
          {
            amountCents: tx.amountCents,
            paidAt: tx.bookingDate.toISOString().slice(0, 10),
            method: 'Überweisung',
            note: tx.purpose?.slice(0, 500),
          },
        );
      } catch (error) {
        await this.prisma.bankTransaction.update({
          where: { id },
          data: { status: 'UNMATCHED', salesDocumentId: null },
        });
        throw error;
      }
    } else {
      if (tx.amountCents >= 0) {
        throw new BadRequestException(
          'Only outgoing payments can pay a supplier invoice',
        );
      }
      const invoice = await this.prisma.supplierInvoice.findFirst({
        where: { id: dto.supplierInvoiceId, organizationId },
      });
      if (!invoice) throw new NotFoundException('Supplier invoice not found');
      await this.prisma.$transaction([
        this.prisma.supplierInvoice.update({
          where: { id: invoice.id },
          data: { status: 'PAID', paidAt: tx.bookingDate },
        }),
        this.prisma.bankTransaction.update({
          where: { id },
          data: { status: 'MATCHED', supplierInvoiceId: invoice.id },
        }),
      ]);
    }
    return this.prisma.bankTransaction.findUniqueOrThrow({ where: { id } });
  }

  async ignoreTransaction(id: string, organizationId: string) {
    const result = await this.prisma.bankTransaction.updateMany({
      where: { id, organizationId, status: 'UNMATCHED' },
      data: { status: 'IGNORED' },
    });
    if (result.count === 0) {
      throw new NotFoundException('Open transaction not found');
    }
    return { ignored: true };
  }

  /** Books every transaction whose number AND amount match exactly (HIGH). */
  async autoMatch(organizationId: string, actorUserId: string) {
    const transactions = await this.prisma.bankTransaction.findMany({
      where: { organizationId, status: 'UNMATCHED' },
      take: 500,
    });
    const { invoices, supplierInvoices } =
      await this.openDocuments(organizationId);

    let matched = 0;
    for (const tx of transactions) {
      const suggestion = suggestMatch(tx, invoices, supplierInvoices);
      if (suggestion?.confidence !== 'HIGH') continue;
      try {
        await this.matchTransaction(
          tx.id,
          organizationId,
          actorUserId,
          suggestion.kind === 'INVOICE'
            ? { salesDocumentId: suggestion.id }
            : { supplierInvoiceId: suggestion.id },
        );
        matched++;
        // The document is settled now; keep it from matching a second payment.
        const index = invoices.findIndex(
          (invoice) => invoice.id === suggestion.id,
        );
        if (index >= 0) invoices.splice(index, 1);
      } catch (error) {
        this.logger.warn(
          `Auto-match for ${tx.id} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { matched, checked: transactions.length };
  }

  private async openDocuments(organizationId: string) {
    const [invoiceRows, supplierRows] = await Promise.all([
      this.prisma.salesDocument.findMany({
        where: { organizationId, type: 'INVOICE', status: 'SENT' },
        select: {
          id: true,
          number: true,
          grossCents: true,
          paidCents: true,
          creditedCents: true,
          customer: { select: { name: true } },
        },
        take: 1000,
      }),
      this.prisma.supplierInvoice.findMany({
        where: { organizationId, status: 'OPEN' },
        select: {
          id: true,
          invoiceNumber: true,
          grossCents: true,
          supplier: { select: { name: true } },
        },
        take: 1000,
      }),
    ]);
    return {
      invoices: invoiceRows.map((row) => ({
        id: row.id,
        number: row.number,
        outstandingCents: row.grossCents - row.paidCents - row.creditedCents,
        customerName: row.customer.name,
      })),
      supplierInvoices: supplierRows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        grossCents: row.grossCents,
        supplierName: row.supplier.name,
      })),
    };
  }
}
