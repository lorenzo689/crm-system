import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AiProposalSource,
  AiProposalStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { TasksService } from '../tasks/tasks.service';
import {
  CreateSalesDocumentDto,
  SendSalesDocumentDto,
} from '../sales-documents/dto/sales-document.dto';
import { SalesDocumentsService } from '../sales-documents/sales-documents.service';
import { CreatePurchaseOrderDto } from '../purchasing/purchasing.dto';
import { PurchasingService } from '../purchasing/purchasing.service';
import { CreateReservationDto, RentalService } from '../rental/rental.service';
import { CreateCreditNoteDto } from '../sales-documents/dto/sales-document.dto';
import {
  InvoiceTimeEntriesDto,
  TimeTrackingService,
} from '../time-tracking/time-tracking.service';

export const PROPOSAL_KINDS = [
  'CREATE_TASK',
  'CREATE_QUOTE',
  'CREATE_PURCHASE_ORDER',
  'ESCALATE_DUNNING',
  'SEND_DOCUMENT',
  'CREATE_RESERVATION',
  'CREATE_CREDIT_NOTE',
  'INVOICE_TIME',
] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export type NewProposal = {
  organizationId: string;
  source: AiProposalSource;
  kind: ProposalKind;
  title: string;
  summary?: string;
  payload: Record<string, unknown>;
  requestedById?: string;
  dedupeKey?: string;
};

@Injectable()
export class AiProposalsService {
  private readonly logger = new Logger(AiProposalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly salesDocumentsService: SalesDocumentsService,
    private readonly purchasingService: PurchasingService,
    private readonly rentalService: RentalService,
    private readonly timeTrackingService: TimeTrackingService,
  ) {}

  /** Returns null when a proposal with the same dedupe key already exists. */
  async create(input: NewProposal) {
    try {
      return await this.prisma.aiProposal.create({
        data: {
          ...input,
          payload: input.payload as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        input.dedupeKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  list(organizationId: string, status?: AiProposalStatus) {
    return this.prisma.aiProposal.findMany({
      where: { organizationId, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async pendingCount(organizationId: string) {
    return this.prisma.aiProposal.count({
      where: { organizationId, status: 'PENDING' },
    });
  }

  async reject(id: string, organizationId: string, userId: string) {
    const claimed = await this.prisma.aiProposal.updateMany({
      where: { id, organizationId, status: 'PENDING' },
      data: { status: 'REJECTED', decidedById: userId, decidedAt: new Date() },
    });
    if (claimed.count === 0) await this.assertExistsPending(id, organizationId);
    return this.prisma.aiProposal.findUniqueOrThrow({ where: { id } });
  }

  async approve(id: string, organizationId: string, userId: string) {
    // Claiming first makes a double click or two tabs execute the action once.
    const claimed = await this.prisma.aiProposal.updateMany({
      where: { id, organizationId, status: 'PENDING' },
      data: { status: 'APPROVED', decidedById: userId, decidedAt: new Date() },
    });
    if (claimed.count === 0) await this.assertExistsPending(id, organizationId);

    const proposal = await this.prisma.aiProposal.findUniqueOrThrow({
      where: { id },
    });

    try {
      const result = await this.execute(
        proposal.kind as ProposalKind,
        proposal.payload,
        organizationId,
        userId,
      );
      return await this.prisma.aiProposal.update({
        where: { id },
        data: { result: result as Prisma.InputJsonValue },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Proposal ${id} failed: ${message}`);
      return this.prisma.aiProposal.update({
        where: { id },
        data: { status: 'FAILED', error: message.slice(0, 1000) },
      });
    }
  }

  private async assertExistsPending(id: string, organizationId: string) {
    const existing = await this.prisma.aiProposal.findFirst({
      where: { id, organizationId },
      select: { status: true },
    });
    if (!existing) throw new NotFoundException('Proposal not found');
    throw new BadRequestException(`Proposal is already ${existing.status}`);
  }

  private async execute(
    kind: ProposalKind,
    payload: Prisma.JsonValue,
    organizationId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    switch (kind) {
      case 'CREATE_TASK': {
        const dto = await this.validated(CreateTaskDto, payload);
        const task = await this.tasksService.create(
          organizationId,
          userId,
          dto,
        );
        return { entity: 'task', id: task.id, href: `/tasks?open=${task.id}` };
      }
      case 'CREATE_QUOTE': {
        const dto = await this.validated(CreateSalesDocumentDto, {
          ...(payload as object),
          type: 'QUOTE',
        });
        const quote = await this.salesDocumentsService.create(
          organizationId,
          userId,
          dto,
        );
        return {
          entity: 'quote',
          id: quote.id,
          href: `/sales/${quote.id}`,
        };
      }
      case 'CREATE_PURCHASE_ORDER': {
        const dto = await this.validated(CreatePurchaseOrderDto, payload);
        const order = await this.purchasingService.createOrder(
          organizationId,
          userId,
          dto,
        );
        return {
          entity: 'purchase-order',
          id: order.id,
          href: '/purchase-orders',
        };
      }
      case 'ESCALATE_DUNNING': {
        const { salesDocumentId } = payload as { salesDocumentId?: string };
        if (!salesDocumentId) throw new BadRequestException('Missing invoice');
        const invoice = await this.salesDocumentsService.escalateDunning(
          salesDocumentId,
          organizationId,
          userId,
        );
        return {
          entity: 'invoice',
          id: invoice.id,
          href: `/sales/${invoice.id}`,
          dunningLevel: invoice.dunningLevel,
        };
      }
      case 'CREATE_RESERVATION': {
        const dto = await this.validated(CreateReservationDto, payload);
        const reservation = await this.rentalService.create(
          organizationId,
          userId,
          dto,
        );
        return { entity: 'reservation', id: reservation.id, href: '/rental' };
      }
      case 'CREATE_CREDIT_NOTE': {
        const { salesDocumentId, ...rest } = payload as {
          salesDocumentId?: string;
        } & Record<string, unknown>;
        if (!salesDocumentId) throw new BadRequestException('Missing invoice');
        const dto = await this.validated(CreateCreditNoteDto, rest);
        const note = await this.salesDocumentsService.createCreditNote(
          salesDocumentId,
          organizationId,
          userId,
          dto,
        );
        return {
          entity: 'credit-note',
          id: note.id,
          href: `/sales/${note.id}`,
        };
      }
      case 'INVOICE_TIME': {
        const dto = await this.validated(InvoiceTimeEntriesDto, payload);
        const invoice = await this.timeTrackingService.invoiceEntries(
          organizationId,
          userId,
          dto,
        );
        return {
          entity: 'invoice',
          id: invoice.id,
          href: `/sales/${invoice.id}`,
        };
      }
      case 'SEND_DOCUMENT': {
        const { salesDocumentId, ...mail } = payload as {
          salesDocumentId?: string;
        } & Record<string, unknown>;
        if (!salesDocumentId) throw new BadRequestException('Missing document');
        const dto = await this.validated(SendSalesDocumentDto, mail);
        const sent = await this.salesDocumentsService.sendByEmail(
          salesDocumentId,
          organizationId,
          userId,
          dto,
        );
        return {
          entity: sent.type === 'QUOTE' ? 'quote' : 'invoice',
          id: sent.id,
          href: `/sales/${sent.id}`,
          sentTo: dto.to,
        };
      }
      default:
        throw new BadRequestException(`Unknown proposal kind ${String(kind)}`);
    }
  }

  /** Proposal payloads come from a model, so they get the same validation as API input. */
  private async validated<T extends object>(
    cls: new () => T,
    payload: unknown,
  ): Promise<T> {
    const instance = plainToInstance(cls, payload);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      throw new BadRequestException(
        errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; '),
      );
    }
    return instance;
  }
}
