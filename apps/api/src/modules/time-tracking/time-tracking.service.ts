import { AccessService } from '../access/access.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SalesDocumentsService } from '../sales-documents/sales-documents.service';

export class CreateTimeEntryDto {
  @IsDateString()
  workDate!: string;

  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsBoolean()
  billable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  hourlyRateCents?: number;
}

export class TimeEntryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  /** "true" = only billable entries that are not invoiced yet. */
  @IsOptional()
  @IsString()
  unbilled?: string;
}

export class InvoiceTimeEntriesDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

const MAX_INVOICE_LINES = 200;

const include = {
  user: { select: { id: true, displayName: true } },
  project: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
};

@Injectable()
export class TimeTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesDocuments: SalesDocumentsService,
    private readonly access: AccessService,
  ) {}

  list(organizationId: string, query: TimeEntryQueryDto) {
    return this.prisma.timeEntry.findMany({
      where: {
        organizationId,
        ...(query.userId && { userId: query.userId }),
        ...(query.projectId && { projectId: query.projectId }),
        ...((query.from || query.to) && {
          workDate: {
            ...(query.from && { gte: new Date(query.from) }),
            ...(query.to && { lte: new Date(query.to) }),
          },
        }),
        ...(query.unbilled === 'true' && {
          billable: true,
          billedDocumentId: null,
        }),
      },
      include,
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateTimeEntryDto,
  ) {
    let customerId = dto.customerId;
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, organizationId },
        select: { customerId: true },
      });
      if (!project) throw new BadRequestException('Project not found');
      await this.access.assertProjectWritable(dto.projectId, userId);
      customerId = project.customerId;
    } else if (customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { id: true },
      });
      if (!customer) throw new BadRequestException('Customer not found');
    }

    const hourlyRateCents =
      dto.hourlyRateCents ?? (await this.defaultRate(organizationId));
    return this.prisma.timeEntry.create({
      data: {
        organizationId,
        userId,
        customerId,
        projectId: dto.projectId,
        workDate: new Date(dto.workDate),
        minutes: dto.minutes,
        description: dto.description.trim(),
        billable: dto.billable ?? true,
        hourlyRateCents,
      },
      include,
    });
  }

  async remove(id: string, organizationId: string, userId: string) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id, organizationId },
    });
    if (!entry) throw new NotFoundException('Time entry not found');
    if (entry.userId !== userId) {
      throw new BadRequestException(
        'Nur eigene Zeiteinträge können gelöscht werden',
      );
    }
    if (entry.billedDocumentId) {
      throw new BadRequestException(
        'Bereits abgerechnete Zeiten können nicht gelöscht werden',
      );
    }
    await this.prisma.timeEntry.delete({ where: { id } });
    return { deleted: true };
  }

  async summary(organizationId: string, query: TimeEntryQueryDto) {
    const where = {
      organizationId,
      ...((query.from || query.to) && {
        workDate: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      }),
    };
    const [byProject, unbilled] = await Promise.all([
      this.prisma.timeEntry.groupBy({
        by: ['projectId'],
        where,
        _sum: { minutes: true },
      }),
      this.prisma.timeEntry.findMany({
        where: { ...where, billable: true, billedDocumentId: null },
        select: { minutes: true, hourlyRateCents: true },
      }),
    ]);
    const projects = await this.prisma.project.findMany({
      where: {
        organizationId,
        id: {
          in: byProject.map((row) => row.projectId).filter(Boolean) as string[],
        },
      },
      select: { id: true, name: true },
    });
    const names = new Map(
      projects.map((project) => [project.id, project.name]),
    );
    return {
      byProject: byProject.map((row) => ({
        projectId: row.projectId,
        name: row.projectId
          ? (names.get(row.projectId) ?? '–')
          : 'Ohne Projekt',
        minutes: row._sum.minutes ?? 0,
      })),
      unbilledMinutes: unbilled.reduce((sum, row) => sum + row.minutes, 0),
      unbilledValueCents: unbilled.reduce(
        (sum, row) =>
          sum + Math.round((row.minutes / 60) * row.hourlyRateCents),
        0,
      ),
    };
  }

  /** Turns unbilled billable entries of a customer into an invoice draft. */
  async invoiceEntries(
    organizationId: string,
    actorUserId: string,
    dto: InvoiceTimeEntriesDto,
  ) {
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organizationId,
        customerId: dto.customerId,
        billable: true,
        billedDocumentId: null,
        ...(dto.projectId && { projectId: dto.projectId }),
        ...((dto.from || dto.to) && {
          workDate: {
            ...(dto.from && { gte: new Date(dto.from) }),
            ...(dto.to && { lte: new Date(dto.to) }),
          },
        }),
      },
      include: { user: { select: { displayName: true } } },
      orderBy: { workDate: 'asc' },
      take: MAX_INVOICE_LINES + 1,
    });
    // Billing marks every entry as invoiced, so the caller must be allowed to
    // write to each affected project (VIEWER is read-only).
    for (const projectId of new Set(entries.map((entry) => entry.projectId))) {
      await this.access.assertProjectWritable(projectId, actorUserId);
    }
    if (entries.length === 0) {
      throw new BadRequestException('Keine abrechenbaren Zeiten gefunden');
    }
    if (entries.length > MAX_INVOICE_LINES) {
      throw new BadRequestException(
        `Mehr als ${MAX_INVOICE_LINES} Einträge: bitte den Zeitraum einschränken`,
      );
    }

    const fmt = new Intl.DateTimeFormat('de-DE');
    const today = new Date().toISOString().slice(0, 10);
    const invoice = await this.salesDocuments.create(
      organizationId,
      actorUserId,
      {
        type: 'INVOICE',
        customerId: dto.customerId,
        projectId: dto.projectId,
        issueDate: today,
        headerText: 'Abrechnung der geleisteten Arbeitszeit.',
        items: entries.map((entry) => ({
          description: `${fmt.format(entry.workDate)} ${entry.user.displayName}: ${entry.description}`,
          quantity: Math.round((entry.minutes / 60) * 100) / 100,
          unit: 'Std',
          unitPriceCents: entry.hourlyRateCents,
          vatRateBp: 1900,
        })),
      },
    );

    await this.prisma.timeEntry.updateMany({
      where: {
        id: { in: entries.map((entry) => entry.id) },
        billedDocumentId: null,
      },
      data: { billedDocumentId: invoice.id },
    });
    return invoice;
  }

  private async defaultRate(organizationId: string) {
    const profile = await this.prisma.companyProfile.findUnique({
      where: { organizationId },
      select: { defaultHourlyRateCents: true },
    });
    return profile?.defaultHourlyRateCents ?? 0;
  }
}
